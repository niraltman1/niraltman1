import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Repos } from '../db.js';

const OLLAMA_BASE  = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env['OLLAMA_MODEL']    ?? 'law-il-E2B';

const FOOTER_RE = /סך\s*הכל|total|summary|סיכום|subtotal/i;

export type ExcelSourceType = 'net_hamishpat' | 'execution_office' | 'generic';

export interface ExcelImportResult {
  sessionId:    number;
  rowsTotal:    number;
  rowsImported: number;
  rowsSkipped:  number;
  rowsUpdated:  number;
  columnMap:    Record<string, string | null>;
  errors:       string[];
}

// Canonical field names the importer maps to
type CanonicalField =
  | 'case_number' | 'debtor_name' | 'creditor_name' | 'open_date'
  | 'registrar' | 'bureau_location' | 'client_name' | 'phone'
  | 'id_number' | 'status' | 'amount' | 'notes';

function cleanCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function extractSheetData(ws: XLSX.WorkSheet): string[][] {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  const merges = ws['!merges'] ?? [];

  const grid: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      row.push(cleanCell(ws[addr]?.v));
    }
    grid.push(row);
  }

  // Duplicate merged cell values down/across
  for (const merge of merges) {
    const masterAddr = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const masterVal  = cleanCell(ws[masterAddr]?.v);
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        const row = grid[r];
        if (row) row[c] = masterVal;
      }
    }
  }

  // Drop fully-empty rows and footer rows
  return grid.filter((row) => {
    const nonEmpty = row.some((v) => v !== '');
    if (!nonEmpty) return false;
    const joined = row.join(' ');
    return !FOOTER_RE.test(joined);
  });
}

async function fuzzyMapColumns(headers: string[]): Promise<Record<string, CanonicalField | null>> {
  const prompt = `אתה מוצג עם כותרות עמודות מגיליון אקסל. מפה כל עמודה לשדה הקנוני המתאים.
עמודות: ${JSON.stringify(headers)}
שדות קנוניים אפשריים: case_number, debtor_name, creditor_name, open_date, registrar, bureau_location, client_name, phone, id_number, status, amount, notes
החזר JSON בלבד — {"עמודה": "canonical_field" | null} — null אם אין התאמה.`;

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:   OLLAMA_MODEL,
        prompt,
        stream:  false,
        options: { temperature: 0.05, num_predict: 200 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error('Ollama unavailable');

    const data = await res.json() as { response?: string };
    const raw  = (data.response ?? '').trim()
      .replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(raw) as Record<string, CanonicalField | null>;
  } catch {
    return fallbackMapColumns(headers);
  }
}

// Regex-based heuristic fallback when Ollama is unavailable
function fallbackMapColumns(headers: string[]): Record<string, CanonicalField | null> {
  const HEURISTICS: Array<[RegExp, CanonicalField]> = [
    [/מספר.*תיק|case.?num|תיק/i,        'case_number'],
    [/חייב|debtor/i,                     'debtor_name'],
    [/נושה|זוכה|creditor/i,              'creditor_name'],
    [/תאריך.*פתיח|open.*date|פתיחה/i,   'open_date'],
    [/רשם|registrar/i,                   'registrar'],
    [/לשכה|bureau|משרד/i,               'bureau_location'],
    [/שם.*לקוח|client.?name|שם/i,       'client_name'],
    [/טלפון|phone|נייד/i,               'phone'],
    [/תז|ת\.ז\.|id.?num|זהות/i,        'id_number'],
    [/סטטוס|status|מצב/i,              'status'],
    [/סכום|amount|חוב/i,               'amount'],
    [/הערות|notes|remarks/i,            'notes'],
  ];
  const result: Record<string, CanonicalField | null> = {};
  for (const h of headers) {
    const match = HEURISTICS.find(([re]) => re.test(h));
    result[h] = match ? match[1] : null;
  }
  return result;
}

const DATE_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
function normalizeDate(v: string): string | null {
  const m = DATE_RE.exec(v);
  if (m) return `${m[3]!}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

export async function importExcelFile(
  repos: Repos,
  rawFilePath: string,
  sourceType: ExcelSourceType,
  filename: string,
): Promise<ExcelImportResult> {
  const filePath = resolve(rawFilePath); // normalize before any fs operation (CWE-22)
  const result: ExcelImportResult = {
    sessionId:    0,
    rowsTotal:    0,
    rowsImported: 0,
    rowsSkipped:  0,
    rowsUpdated:  0,
    columnMap:    {},
    errors:       [],
  };

  // Create session record
  const sessionRow = repos.db.prepare(`
    INSERT INTO excel_import_sessions (filename, source_type, status)
    VALUES (@filename, @sourceType, 'processing')
  `).run({ filename, sourceType });
  result.sessionId = Number(sessionRow.lastInsertRowid);

  try {
    const buf = readFileSync(filePath);
    const wb  = XLSX.read(buf, { type: 'buffer', cellDates: false });
    const ws  = wb.Sheets[wb.SheetNames[0]!];
    if (!ws) throw new Error('Spreadsheet is empty');

    const grid = extractSheetData(ws);
    if (grid.length < 2) throw new Error('No data rows found after cleaning');

    const headers = grid[0]!;
    const rows    = grid.slice(1);
    result.rowsTotal = rows.length;

    const colMap = await fuzzyMapColumns(headers);
    result.columnMap = colMap;

    const getField = (row: string[], field: CanonicalField): string | null => {
      const idx = headers.findIndex((h) => colMap[h] === field);
      return idx >= 0 ? (row[idx] || null) : null;
    };

    // Wrap entire row-iteration in a single transaction:
    // - atomic: either all rows commit or none
    // - 10–100x faster than per-row autocommit
    repos.db.transaction<void>(() => {
      for (const row of rows) {
        const caseNumber = getField(row, 'case_number');
        const idNumber   = getField(row, 'id_number');

        if (!caseNumber && !idNumber) {
          result.rowsSkipped++;
          continue;
        }

        const existingCase = caseNumber
          ? (repos.db.prepare('SELECT id, status, notes FROM Cases WHERE case_number = ? LIMIT 1')
              .get(caseNumber) as { id: number; status: string | null; notes: string | null } | undefined)
          : undefined;

        if (existingCase) {
          const newStatus = getField(row, 'status');
          const newNotes  = getField(row, 'notes');
          const updateParts: string[] = [];
          const updateParams: Record<string, unknown> = { id: existingCase.id };

          if (!existingCase.status && newStatus) {
            updateParts.push('status = @status');
            updateParams['status'] = newStatus;
          }
          if (!existingCase.notes && newNotes) {
            updateParts.push('notes = @notes');
            updateParams['notes'] = newNotes;
          }

          if (updateParts.length > 0) {
            repos.db.prepare(
              `UPDATE Cases SET ${updateParts.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id`,
            ).run(updateParams);
            result.rowsUpdated++;
          } else {
            result.rowsSkipped++;
          }
          continue;
        }

        let clientId: number | null = null;
        if (idNumber) {
          const c = repos.db.prepare('SELECT id FROM Clients WHERE id_number = ? LIMIT 1')
            .get(idNumber) as { id: number } | undefined;
          if (c) clientId = c.id;
        }

        if (!clientId) {
          const clientName = getField(row, 'client_name') ?? getField(row, 'debtor_name');
          if (clientName) {
            const ins = repos.db.prepare(`
              INSERT INTO Clients (name_he, id_number, phone, created_at, updated_at)
              VALUES (@nameHe, @idNumber, @phone,
                     strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                     strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            `).run({
              nameHe:   clientName,
              idNumber: idNumber,
              phone:    getField(row, 'phone'),
            });
            clientId = Number(ins.lastInsertRowid);
          }
        }

        if (!clientId || !caseNumber) {
          result.rowsSkipped++;
          continue;
        }

        try {
          repos.db.prepare(`
            INSERT INTO Cases (case_number, case_type, title_he, client_id, court_name,
                               opened_date, notes, created_at, updated_at)
            VALUES (@caseNumber, 'civil', @titleHe, @clientId, @courtName,
                   @openedDate, @notes,
                   strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                   strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          `).run({
            caseNumber,
            titleHe:    `תיק ${caseNumber}`,
            clientId,
            courtName:  getField(row, 'registrar') ?? getField(row, 'bureau_location'),
            openedDate: normalizeDate(getField(row, 'open_date') ?? ''),
            notes:      getField(row, 'notes'),
          });
          result.rowsImported++;
        } catch {
          result.rowsSkipped++;
        }
      }
    });

    repos.db.prepare(`
      UPDATE excel_import_sessions
      SET status = 'done', rows_total = @t, rows_imported = @i,
          rows_skipped = @s, rows_updated = @u, column_map = @cm
      WHERE id = @id
    `).run({
      id: result.sessionId, t: result.rowsTotal, i: result.rowsImported,
      s: result.rowsSkipped, u: result.rowsUpdated,
      cm: JSON.stringify(colMap),
    });
  } catch (e) {
    const msg = String(e);
    result.errors.push(msg);
    repos.db.prepare(`
      UPDATE excel_import_sessions SET status = 'failed', error_summary = @msg WHERE id = @id
    `).run({ id: result.sessionId, msg });
  }

  return result;
}
