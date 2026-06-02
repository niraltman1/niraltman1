import { logger } from '@factum-il/shared';

/**
 * Resolves a valid law (by IsraelLawID + official Name) to its Hebrew WikiSource page in
 * the "ספר החוקים הפתוח" project, and returns the rendered HTML for verbatim parsing.
 *
 * MATCHING IS DETERMINISTIC BY ID, not fuzzy by name: every law page embeds the Knesset
 * law-database id as `{{ח:מאגר|<IsraelLawID>}}` in its wikitext. We derive a candidate
 * page title from the Name, fetch it, and ACCEPT only if its מאגר id equals the law's
 * IsraelLawID. On miss we try prefixsearch alternatives, also ID-verified.
 *
 * TRANSIENT vs ABSENT: a 429/5xx/network/timeout failure (after retries) is reported as
 * `transient:true` so the caller can retry — it must NEVER be mistaken for "this law has no
 * text" (which would silently demote a real law to a metadata-only row). A genuine
 * "page does not exist" (HTTP 200 + missingtitle) is a definitive, non-transient miss.
 *
 * Build-tool only — never imported by a runtime package.
 */

const WIKI_API = 'https://he.wikisource.org/w/api.php';
const WIKI_WIKI = 'https://he.wikisource.org/wiki/';
const USER_AGENT = 'Factum-IL-corpus-builder/1.0 (+offline legal KB; one-off ingestion)';
const MAGAR_RE = /\{\{\s*ח:מאגר\s*\|\s*(\d+)/;
const MAX_ATTEMPTS = 4;

export interface WikiResolution {
  matched:    boolean;
  pageTitle?: string;
  pageUrl?:   string;
  html?:      string;     // rendered HTML (parse.text) for the verbatim parser
  magarId?:   number;
  transient?: boolean;    // unmatched due to a transient API failure — caller may retry
  reason?:    string;     // when unmatched
}

export interface ResolveOptions {
  api?:         string;
  delayMs?:     number;
  retryBaseMs?: number;   // backoff base (default 1000; tests set it low for speed)
}

/**
 * Derive a WikiSource page-title candidate from an official OData law name by dropping the
 * trailing year clause and normalising punctuation. The ספר-החוקים page titles are the law
 * name without the ", התש..-YYYY" suffix, e.g. 'חוק העונשין, התשל"ז–1977' → 'חוק העונשין'.
 */
export function candidateTitle(name: string): string {
  let s = name.trim();
  // Drop everything from the first comma (the "התש..–YYYY" / year clause).
  const comma = s.indexOf(',');
  if (comma > 0) s = s.slice(0, comma);
  // Normalise Hebrew gershayim/quotes and dash variants to their ASCII-ish forms used in titles.
  s = s.replace(/[״”“]/g, '"').replace(/[׳’‘]/g, "'").replace(/[–—־]/g, '-');
  return s.replace(/\s+/g, ' ').trim();
}

const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

type ApiResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; transient: boolean };

/**
 * One MediaWiki API GET with retry/backoff. Distinguishes a transient failure (429/5xx/
 * network/timeout, exhausted) from a definitive non-2xx. A 2xx is always `ok` — the caller
 * inspects the body to tell "page missing" (definitive) from a real result.
 */
async function apiGet(api: string, params: Record<string, string>, retryBaseMs: number): Promise<ApiResult> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params }).toString();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${api}?${qs}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal:  AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === MAX_ATTEMPTS) return { ok: false, transient: true };
        const ra = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 15_000) : retryBaseMs * 2 ** (attempt - 1));
        continue;
      }
      if (!res.ok) return { ok: false, transient: false }; // e.g. 400 bad title — definitive
      return { ok: true, body: (await res.json()) as Record<string, unknown> };
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        logger.warn(`[wiki] api error after ${MAX_ATTEMPTS} attempts: ${String(err)}`, { category: 'system' });
        return { ok: false, transient: true };
      }
      await sleep(retryBaseMs * 2 ** (attempt - 1));
    }
  }
  return { ok: false, transient: true };
}

interface ParsedPage { title: string; wikitext: string; html: string; }
type ParseResult = { page: ParsedPage } | { absent: true } | { transientError: true };

/** action=parse for one page. */
async function parsePage(api: string, page: string, retryBaseMs: number): Promise<ParseResult> {
  const r = await apiGet(api, { action: 'parse', page, prop: 'wikitext|text', redirects: '1' }, retryBaseMs);
  if (!r.ok) return r.transient ? { transientError: true } : { absent: true };
  const parse = r.body['parse'] as Record<string, unknown> | undefined;
  if (!parse) return { absent: true }; // {error: missingtitle} for a non-existent page
  const wikitext = String(((parse['wikitext'] as { '*'?: string } | string) as { '*'?: string })?.['*'] ?? parse['wikitext'] ?? '');
  const html     = String(((parse['text']     as { '*'?: string } | string) as { '*'?: string })?.['*'] ?? parse['text']     ?? '');
  return { page: { title: String(parse['title'] ?? page), wikitext, html } };
}

function magarId(wikitext: string): number | null {
  const m = wikitext.match(MAGAR_RE);
  return m ? Number(m[1]) : null;
}

async function prefixSearch(api: string, term: string, retryBaseMs: number, limit = 5): Promise<{ titles: string[]; transient: boolean }> {
  const r = await apiGet(api, { action: 'query', list: 'prefixsearch', pssearch: term, pslimit: String(limit) }, retryBaseMs);
  if (!r.ok) return { titles: [], transient: r.transient };
  const hits = (r.body['query'] as { prefixsearch?: { title: string }[] } | undefined)?.prefixsearch ?? [];
  return { titles: hits.map((h) => h.title), transient: false };
}

function pageUrl(title: string): string {
  return WIKI_WIKI + encodeURIComponent(title.replace(/ /g, '_'));
}

/**
 * Resolve one law. Tries the name-derived candidate first, then prefixsearch alternatives,
 * accepting only an ID-verified page. Never throws — returns `{matched:false}` on a definitive
 * miss, or `{matched:false, transient:true}` when only transient API failures were seen.
 */
export async function resolveLaw(
  israelLawId: number,
  name: string,
  opts: ResolveOptions = {},
): Promise<WikiResolution> {
  const api = opts.api ?? WIKI_API;
  const delayMs = opts.delayMs ?? 0;
  const retryBaseMs = opts.retryBaseMs ?? 1_000;
  const cand = candidateTitle(name);
  const tried = new Set<string>();
  let sawTransient = false;

  const tryTitle = async (title: string): Promise<WikiResolution | null> => {
    if (!title || tried.has(title)) return null;
    tried.add(title);
    const r = await parsePage(api, title, retryBaseMs);
    if (delayMs > 0) await sleep(delayMs);
    if ('transientError' in r) { sawTransient = true; return null; }
    if ('absent' in r) return null;
    const id = magarId(r.page.wikitext);
    if (id === israelLawId) {
      return { matched: true, pageTitle: r.page.title, pageUrl: pageUrl(r.page.title), html: r.page.html, magarId: id };
    }
    return null;
  };

  const direct = await tryTitle(cand);
  if (direct) return direct;

  const ps = await prefixSearch(api, cand, retryBaseMs);
  if (ps.transient) sawTransient = true;
  for (const alt of ps.titles) {
    const hit = await tryTitle(alt);
    if (hit) return hit;
  }

  return sawTransient
    ? { matched: false, transient: true, reason: `transient API failure resolving "${cand}" (מאגר ${israelLawId})` }
    : { matched: false, reason: `no ID-verified WikiSource page for "${cand}" (מאגר ${israelLawId})` };
}
