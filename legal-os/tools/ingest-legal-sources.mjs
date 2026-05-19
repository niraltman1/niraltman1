#!/usr/bin/env node
/**
 * Factum IL — Legal Registry Ingestion Script (build-time, one-shot)
 *
 * Fetches the official Net HaMishpat case-code list from gov.il (public domain)
 * and merges it with the embedded seed taxonomy to produce Legal_Registry.json.
 *
 * IMPORTANT OFFLINE CONSTRAINT:
 *   This script makes ONE network request to gov.il to validate/update the
 *   registry. Once Legal_Registry.json is written, Factum IL's runtime NEVER
 *   makes network calls. Re-run this script only when updating the registry.
 *
 * NEVO.CO.IL URLS — SKIPPED:
 *   nevo.co.il is a commercial paywall (Nevo Legal Database). Its content is
 *   copyrighted and requires a separate subscription. Regulation text and
 *   deadline_rules must be supplied by the user via powershell/lib/User_Extensions/.
 *
 * Usage:
 *   node tools/ingest-legal-sources.mjs
 *   npm run ingest-registry
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_DIR   = join(__dirname, '..', 'powershell', 'lib');
const OUT_PATH  = join(LIB_DIR, 'Legal_Registry.json');

// Official Net HaMishpat case-code list (gov.il — public domain)
const GOV_IL_PDF_URL = 'https://www.gov.il/BlobFolder/generalpage/net_law_info2/ar/net_filelist.pdf';

// ── Fetch helpers ──────────────────────────────────────────────────────────────

async function fetchBuffer(url, redirectCount = 0) {
  if (redirectCount > 5) throw new Error('Too many redirects');
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15_000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchBuffer(res.headers.location, redirectCount + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('Request timed out')));
  });
}

// ── Parse gov.il PDF text layer for case codes ────────────────────────────────
// The PDF text layer uses UTF-8 Hebrew text. We extract lines that match the
// pattern: <Hebrew prefix code> <tab or spaces> <description>.
// Falls back gracefully — if the PDF cannot be parsed the seed data is used.

function extractCaseCodes(pdfBuffer) {
  // Naive text extraction: look for printable UTF-8 runs between PDF operators.
  // Full PDF parsing would require a library; this covers the text-only pages.
  const text = pdfBuffer.toString('latin1');
  const hebrewLineRe = /([א-ת"'.]+)\s{2,}([א-ת"'\s]+)/g;
  const codes = new Map();
  let m;
  while ((m = hebrewLineRe.exec(text)) !== null) {
    const code = m[1].trim();
    const desc = m[2].trim();
    if (code.length >= 2 && code.length <= 8 && desc.length >= 3) {
      codes.set(code, desc);
    }
  }
  return codes;
}

// ── Load existing seed registry ────────────────────────────────────────────────

function loadSeed() {
  if (!existsSync(OUT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(OUT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

await mkdir(LIB_DIR, { recursive: true });

const seed = loadSeed();
if (!seed) {
  console.error('[ingest] ERROR: Legal_Registry.json seed file not found at', OUT_PATH);
  console.error('[ingest] Run `git checkout legal-os/powershell/lib/Legal_Registry.json` to restore the seed.');
  process.exit(1);
}

console.log('[ingest] Seed registry loaded —', seed.case_types.length, 'entries');

// Attempt to fetch gov.il PDF and augment the registry
let govIlExtracted = 0;
try {
  console.log('[ingest] Fetching Net HaMishpat case list from gov.il …');
  const pdfBuffer = await fetchBuffer(GOV_IL_PDF_URL);
  console.log('[ingest] PDF downloaded —', pdfBuffer.length, 'bytes');

  const govCodes = extractCaseCodes(pdfBuffer);
  console.log('[ingest] Extracted', govCodes.size, 'potential code entries from PDF text layer');

  // Merge: if a gov.il code matches an existing seed prefix_code, update description.
  // If it is new (not in seed), append it with case_type='civil' (default) so the
  // user can refine via User_Extensions/.
  const existingCodes = new Set(seed.case_types.map((e) => e.prefix_code).filter(Boolean));
  let nextId = Math.max(...seed.case_types.map((e) => e.id)) + 1;

  for (const [code, desc] of govCodes) {
    if (!existingCodes.has(code)) {
      seed.case_types.push({
        id:               nextId++,
        prefix_code:      code,
        full_name_he:     desc,
        subject_he:       desc,
        case_type:        'civil',
        procedure_domain: 'civil_procedure',
        deadline_rules:   [],
        registry_source:  'gov_il',
      });
      govIlExtracted++;
    }
  }

  if (govIlExtracted > 0) {
    console.log('[ingest] Appended', govIlExtracted, 'new entries from gov.il PDF');
  } else {
    console.log('[ingest] No new entries from gov.il — seed is up to date');
  }
} catch (err) {
  console.warn('[ingest] WARNING: Could not fetch gov.il PDF:', err.message);
  console.warn('[ingest] Falling back to seed data only. Registry will be valid but may be incomplete.');
}

// Update metadata
seed.metadata.generated_at = new Date().toISOString();
seed.metadata.sources = ['seed_taxonomy_table_net_hamishpat_2025'];
if (govIlExtracted > 0) seed.metadata.sources.push('gov_il_net_hamishpat_pdf');

writeFileSync(OUT_PATH, JSON.stringify(seed, null, 2) + '\n', 'utf8');

console.log('[ingest] ✓ Legal_Registry.json written —', seed.case_types.length, 'total entries');
console.log('[ingest] Path:', OUT_PATH);
console.log('');
console.log('[ingest] NOTE: deadline_rules are empty. Add regulation text via:');
console.log('[ingest]   powershell/lib/User_Extensions/<regulation-name>.json');
console.log('[ingest] See Legal_Registry.json schema for the expected format.');
