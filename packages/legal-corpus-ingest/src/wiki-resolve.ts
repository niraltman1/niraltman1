import { logger } from '@factum-il/shared';

/**
 * Resolves a valid law (by IsraelLawID + official Name) to its Hebrew WikiSource page in
 * the "ספר החוקים הפתוח" project, and returns the rendered HTML for verbatim parsing.
 *
 * MATCHING IS DETERMINISTIC BY ID, not fuzzy by name: every law page embeds the Knesset
 * law-database id as `{{ח:מאגר|<IsraelLawID>}}` in its wikitext. We derive a candidate
 * page title from the Name, fetch it, and ACCEPT only if its מאגר id equals the law's
 * IsraelLawID. On miss we try prefixsearch alternatives, also ID-verified. A law we cannot
 * confidently match is reported as unmatched → the caller emits a metadata-only record
 * (never fabricated text).
 *
 * Build-tool only — never imported by a runtime package.
 */

const WIKI_API = 'https://he.wikisource.org/w/api.php';
const WIKI_WIKI = 'https://he.wikisource.org/wiki/';
const USER_AGENT = 'Factum-IL-corpus-builder/1.0 (+offline legal KB; one-off ingestion)';
const MAGAR_RE = /\{\{\s*ח:מאגר\s*\|\s*(\d+)/;

export interface WikiResolution {
  matched:    boolean;
  pageTitle?: string;
  pageUrl?:   string;
  html?:      string;     // rendered HTML (parse.text) for the verbatim parser
  magarId?:   number;
  reason?:    string;     // when unmatched
}

export interface ResolveOptions {
  api?:     string;
  delayMs?: number;
}

/**
 * Derive a WikiSource page-title candidate from an official OData law name by dropping the
 * trailing year clause and normalising punctuation. The ספר-החוקים page titles are the law
 * name without the ", התש..–YYYY" suffix, e.g. 'חוק העונשין, התשל"ז–1977' → 'חוק העונשין'.
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

async function apiGet(api: string, params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params }).toString();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${api}?${qs}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal:  AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return null;
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      if (attempt === 3) { logger.warn(`[wiki] api error: ${String(err)}`, { category: 'system' }); return null; }
      await sleep(1_000 * 2 ** (attempt - 1));
    }
  }
  return null;
}

interface ParsedPage { title: string; wikitext: string; html: string; }

/** action=parse for one page; returns null on missing page / API error. */
async function parsePage(api: string, page: string): Promise<ParsedPage | null> {
  const body = await apiGet(api, { action: 'parse', page, prop: 'wikitext|text', redirects: '1' });
  const parse = body?.['parse'] as Record<string, unknown> | undefined;
  if (!parse) return null;                       // {error:...} for a missing page
  const wikitext = String(((parse['wikitext'] as { '*'?: string } | string) as { '*'?: string })?.['*'] ?? parse['wikitext'] ?? '');
  const html     = String(((parse['text']     as { '*'?: string } | string) as { '*'?: string })?.['*'] ?? parse['text']     ?? '');
  return { title: String(parse['title'] ?? page), wikitext, html };
}

function magarId(wikitext: string): number | null {
  const m = wikitext.match(MAGAR_RE);
  return m ? Number(m[1]) : null;
}

async function prefixSearch(api: string, term: string, limit = 5): Promise<string[]> {
  const body = await apiGet(api, { action: 'query', list: 'prefixsearch', pssearch: term, pslimit: String(limit) });
  const hits = (body?.['query'] as { prefixsearch?: { title: string }[] } | undefined)?.prefixsearch ?? [];
  return hits.map((h) => h.title);
}

function pageUrl(title: string): string {
  return WIKI_WIKI + encodeURIComponent(title.replace(/ /g, '_'));
}

/**
 * Resolve one law. Tries the name-derived candidate first, then prefixsearch alternatives,
 * accepting only an ID-verified page. Never throws — returns `{matched:false}` on any miss.
 */
export async function resolveLaw(
  israelLawId: number,
  name: string,
  opts: ResolveOptions = {},
): Promise<WikiResolution> {
  const api = opts.api ?? WIKI_API;
  const delayMs = opts.delayMs ?? 0;
  const cand = candidateTitle(name);
  const tried = new Set<string>();

  const tryTitle = async (title: string): Promise<WikiResolution | null> => {
    if (!title || tried.has(title)) return null;
    tried.add(title);
    const p = await parsePage(api, title);
    if (delayMs > 0) await sleep(delayMs);
    if (!p) return null;
    const id = magarId(p.wikitext);
    if (id === israelLawId) {
      return { matched: true, pageTitle: p.title, pageUrl: pageUrl(p.title), html: p.html, magarId: id };
    }
    return null;
  };

  const direct = await tryTitle(cand);
  if (direct) return direct;

  for (const alt of await prefixSearch(api, cand)) {
    const hit = await tryTitle(alt);
    if (hit) return hit;
  }

  return { matched: false, reason: `no ID-verified WikiSource page for "${cand}" (מאגר ${israelLawId})` };
}
