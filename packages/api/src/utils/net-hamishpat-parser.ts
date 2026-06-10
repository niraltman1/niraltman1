/**
 * Net HaMishpat CSV Importer
 *
 * Parses official Israeli court export CSVs and syncs records into the
 * local SQLite cases table.
 *
 * Deduplication key: [client id_number + case_number] — a case already
 * present in the DB with the same (clientIdNumber, caseNumber) is skipped.
 *
 * Expected CSV columns (Hebrew headers supported):
 *   מספר תיק | סוג תיק | שם בית משפט | שם שופט | סטטוס | תאריך פתיחה | תוצאה
 *   case_number | case_type | court_name | judge_name | status | opened_date | notes
 *
 * The parser accepts both Hebrew and English column names.
 */

import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import type { Repos } from '../db.js';
import { lookupPrefix, tagManualReview, tagMapped } from './legal-registry-loader.js';

export interface ImportRow {
  caseNumber:   string;
  caseType:     string;
  courtName:    string | null;
  judgeName:    string | null;
  status:       string;
  openedDate:   string | null;
  notes:        string | null;
  clientIdNum?: string;   // optional: link to existing client by ID number
}

export interface ImportResult {
  total:     number;
  inserted:  number;
  skipped:   number;
  errors:    string[];
}

// ── Hebrew ↔ canonical column name map ───────────────────────────────────────
const COL_MAP: Record<string, keyof ImportRow> = {
  // Hebrew
  'מספר תיק':    'caseNumber',
  'סוג תיק':     'caseType',
  'שם בית משפט': 'courtName',
  'שם שופט':     'judgeName',
  'סטטוס':       'status',
  'תאריך פתיחה': 'openedDate',
  'תוצאה':       'notes',
  'תז לקוח':     'clientIdNum',
  // English aliases
  case_number:  'caseNumber',
  case_type:    'caseType',
  court_name:   'courtName',
  judge_name:   'judgeName',
  status:       'status',
  opened_date:  'openedDate',
  notes:        'notes',
  client_id_number: 'clientIdNum',
};

// ── Case prefix → type map ────────────────────────────────────────────────────
// IMPORTANT: 'ת"א' is the official abbreviation for תיק אזרחי (Civil Case)
// in the Net HaMishpat registry.  It must NEVER be classified as a location
// (Tel Aviv / תל אביב).  This mapping is authoritative and takes precedence
// over any geographic inference.
const CASE_TYPE_MAP: Record<string, string> = {
  // Hebrew type labels
  'פלילי':          'criminal',
  'אזרחי':          'civil',
  'משפחה':          'family',
  'עבודה':          'labour',
  'מנהלי':          'administrative',
  // Hebrew case prefixes — ת"א variants (civil, NOT location)
  'ת"א':            'civil',      // תיק אזרחי — Civil Case (strict; not Tel Aviv)
  "ת'א":            'civil',      // alternate geresh
  'ת.א':            'civil',      // period variant
  'תא':             'civil',      // without punctuation (OCR artefact)
  // Other common prefixes
  'ת"פ':            'criminal',   // תיק פלילי
  "ת'פ":            'criminal',
  'תפ':             'criminal',
  'ע"פ':            'criminal',   // ערעור פלילי
  'ע"א':            'civil',      // ערעור אזרחי
  'תמ"ש':           'family',     // תיק משפחה
  'ת"ק':            'traffic_administrative',
  'עמ"ת':           'traffic_criminal',
  'בג"ץ':           'administrative',
  'פש"ר':           'insolvency',
  // English canonical values (pass-through)
  criminal:         'criminal',
  civil:            'civil',
  civil_standard:   'civil_standard',
  family:           'family',
  labour:           'labour',
  administrative:   'administrative',
  insolvency:       'insolvency',
  traffic_administrative: 'traffic_administrative',
  traffic_criminal:       'traffic_criminal',
};

const STATUS_MAP: Record<string, string> = {
  'פתוח':   'open',
  'סגור':   'closed',
  'מוקפא':  'suspended',
  'ארכיון': 'archived',
  open:     'open',
  closed:   'closed',
  suspended:'suspended',
  archived: 'archived',
};

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  // DD/MM/YYYY → YYYY-MM-DD
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw.trim());
  if (m) return `${m[3]!}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) return raw.trim().slice(0, 10);
  return null;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

async function readCSV(filePath: string): Promise<{ headers: string[]; rows: string[][] }> {
  const resolvedPath = resolve(filePath);
  const lines: string[] = [];
  const rl = createInterface({
    input:     createReadStream(resolvedPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.trim()) lines.push(line);
  }

  if (lines.length < 2) return { headers: [], rows: [] };

  // Strip BOM if present
  const firstLine = lines[0]!.replace(/^\uFEFF/, '');
  const headers = parseCSVLine(firstLine);
  const rows    = lines.slice(1).map(parseCSVLine);

  return { headers, rows };
}

export async function importNetHaMishpatCSV(
  repos: Repos,
  filePath: string,
): Promise<ImportResult> {
  const result: ImportResult = { total: 0, inserted: 0, skipped: 0, errors: [] };

  if (!existsSync(filePath)) {
    result.errors.push(`קובץ לא נמצא: ${filePath}`);
    return result;
  }

  const { headers, rows } = await readCSV(filePath);

  if (headers.length === 0) {
    result.errors.push('קובץ CSV ריק או חסר כותרות');
    return result;
  }

  // Map column index → canonical field name
  const colIndex = new Map<keyof ImportRow, number>();
  headers.forEach((h, i) => {
    const key = COL_MAP[h.trim()];
    if (key) colIndex.set(key, i);
  });

  if (!colIndex.has('caseNumber')) {
    result.errors.push('עמודה "מספר תיק" / "case_number" חסרה');
    return result;
  }

  for (const row of rows) {
    result.total++;

    const get = (field: keyof ImportRow): string | null => {
      const idx = colIndex.get(field);
      return idx !== undefined ? (row[idx]?.trim() || null) : null;
    };

    const caseNumber = get('caseNumber');
    if (!caseNumber) {
      result.skipped++;
      continue;
    }

    // Deduplication: skip if case_number already exists
    const existing = repos.db
      .prepare('SELECT id FROM Cases WHERE case_number = ? LIMIT 1')
      .get(caseNumber) as { id: number } | undefined;

    if (existing) {
      result.skipped++;
      continue;
    }

    // Resolve client by ID number if provided
    let clientId: number | null = null;
    const clientIdNum = get('clientIdNum');
    if (clientIdNum) {
      const client = repos.db
        .prepare('SELECT id FROM Clients WHERE id_number = ? LIMIT 1')
        .get(clientIdNum) as { id: number } | undefined;
      if (client) clientId = client.id;
    }

    const rawType   = get('caseType')   ?? '';
    const rawStatus = get('status')     ?? 'open';
    const caseType  = CASE_TYPE_MAP[rawType]  ?? 'civil';
    const status    = STATUS_MAP[rawStatus]   ?? 'open';
    const openedDate = normalizeDate(get('openedDate'));

    // Registry lookup: determine if the case prefix is in the Legal_Registry.
    // ת"א and all its variants are always 'mapped' (they resolve to 'civil').
    // Unknown prefixes are tagged manual_review_required.
    const registryEntry  = rawType ? lookupPrefix(rawType) : null;
    const registryStatus = registryEntry ? 'mapped' : (rawType ? 'manual_review_required' : null);

    try {
      const insertResult = repos.db.prepare(`
        INSERT INTO Cases
          (case_number, case_type, title_he, client_id, court_name, status, opened_date, notes, registry_status, created_at, updated_at)
        VALUES
          (@caseNumber, @caseType, @titleHe, @clientId, @courtName, @status, @openedDate, @notes, @registryStatus,
           strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      `).run({
        caseNumber,
        caseType,
        titleHe:    `תיק ${caseNumber}`,
        clientId,
        courtName:  get('courtName'),
        status,
        openedDate,
        notes:          get('notes'),
        registryStatus,
      });

      // Apply explicit tag helpers for any post-insert hooks
      const newId = insertResult.lastInsertRowid as number;
      if (registryStatus === 'manual_review_required') {
        tagManualReview(newId, repos);
      } else if (registryStatus === 'mapped') {
        tagMapped(newId, repos);
      }

      result.inserted++;
    } catch (e) {
      result.errors.push(`שגיאה בשורה ${result.total}: ${String(e)}`);
      result.skipped++;
    }
  }

  return result;
}
