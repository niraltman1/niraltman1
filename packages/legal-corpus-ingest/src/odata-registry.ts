import { logger } from '@factum-il/shared';

/**
 * Knesset OData v3 client — the AUTHORITATIVE registry of currently-valid Israeli laws.
 *
 * Build-tool only (never imported by a runtime package). Lists KNS_IsraelLaw filtered to
 * laws in force (LawValidityDesc eq 'תקף') and yields their metadata. Full text comes from
 * Wikisource (see wiki-resolve.ts) — the OData has none.
 *
 * Verified quirks (live):
 *   - Endpoint is OData v3 (/OdataV4/ is 404). `?$format=json` returns minimal-metadata JSON.
 *   - The server hard-caps pages at 100 rows and returns `odata.nextLink`; we follow it.
 *   - Adding `$orderby` SUPPRESSES nextLink → never sort. Just chase nextLink to exhaustion.
 */

export const ODATA_BASE = 'https://knesset.gov.il/Odata/ParliamentInfo.svc';
const VALID_FILTER = "LawValidityDesc eq 'תקף'";
const SELECT_FIELDS = ['IsraelLawID', 'Name', 'IsBasicLaw', 'PublicationDate', 'ValidityStartDate', 'LastUpdatedDate'];
const USER_AGENT = 'Factum-IL-corpus-builder/1.0 (+offline legal KB; one-off ingestion)';

export interface ValidLaw {
  israelLawId:       number;
  name:              string;
  isBasicLaw:        boolean;
  publicationDate:   string | null;
  validityStartDate: string | null;
  lastUpdated:       string | null;
  year:              number | null;
}

export interface RegistryOptions {
  base?:    string;
  delayMs?: number;   // politeness pause between page fetches
}

/** Build the first page URL for the valid-laws query. Exposed for unit testing. */
export function buildRegistryUrl(base = ODATA_BASE): string {
  const params = [
    '$format=json',
    `$filter=${encodeURIComponent(VALID_FILTER)}`,
    `$select=${encodeURIComponent(SELECT_FIELDS.join(','))}`,
  ];
  return `${base}/KNS_IsraelLaw?${params.join('&')}`;
}

/** Resolve a (possibly relative) `odata.nextLink` against the base and keep JSON format. */
export function absolutizeNextLink(next: string, base = ODATA_BASE): string {
  let url = /^https?:\/\//i.test(next) ? next : `${base}/${next.replace(/^\//, '')}`;
  if (!/[?&]\$format=/.test(url)) url += (url.includes('?') ? '&' : '?') + '$format=json';
  return url;
}

function parseYear(...dates: (string | null)[]): number | null {
  for (const d of dates) {
    const m = d?.match(/^(\d{4})/);
    if (m) return Number(m[1]);
  }
  return null;
}

function mapLaw(r: Record<string, unknown>): ValidLaw {
  const publicationDate   = (r['PublicationDate']   as string | null) ?? null;
  const validityStartDate = (r['ValidityStartDate'] as string | null) ?? null;
  return {
    israelLawId:       Number(r['IsraelLawID']),
    name:              String(r['Name'] ?? '').trim(),
    isBasicLaw:        r['IsBasicLaw'] === true,
    publicationDate,
    validityStartDate,
    lastUpdated:       (r['LastUpdatedDate'] as string | null) ?? null,
    year:              parseYear(validityStartDate, publicationDate),
  };
}

const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

/** Fetch one OData JSON page with retry/backoff (2s→4s→8s) on network/429/5xx. */
async function fetchPage(url: string): Promise<Record<string, unknown>> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal:  AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} (non-retryable)`);
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await sleep(2_000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`[knesset-odata] page fetch failed after 3 attempts: ${String(lastErr)}`);
}

/**
 * Async-iterate every currently-valid law by following the server's nextLink. A page
 * fetch that exhausts retries throws (registry integrity is not negotiable — unlike a
 * single law's Wikisource lookup, which degrades to metadata-only).
 */
export async function* iterateValidLaws(opts: RegistryOptions = {}): AsyncGenerator<ValidLaw> {
  const base = opts.base ?? ODATA_BASE;
  const delayMs = opts.delayMs ?? 0;
  let url: string | null = buildRegistryUrl(base);
  let page = 0;
  while (url) {
    const body = await fetchPage(url);
    const rows = (body['value'] as Record<string, unknown>[] | undefined) ?? [];
    for (const row of rows) yield mapLaw(row);
    page += 1;
    const next = (body['odata.nextLink'] ?? body['@odata.nextLink']) as string | undefined;
    url = next ? absolutizeNextLink(next, base) : null;
    if (url && delayMs > 0) await sleep(delayMs);
  }
  logger.info(`[knesset-odata] registry iterated: ${page} page(s)`, { category: 'system' });
}

/** GET KNS_IsraelLaw/$count for the valid filter (progress/validation only). */
export async function countValidLaws(base = ODATA_BASE): Promise<number> {
  const url = `${base}/KNS_IsraelLaw/$count?$filter=${encodeURIComponent(VALID_FILTER)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Number((await res.text()).trim());
}
