/**
 * CaseLawIsraelAdapter — source adapter for the guychuk/case-law-israel dataset.
 *
 * This adapter is the ONLY place that knows the specific field names, quirks, and
 * encoding of the guychuk/case-law-israel dataset. Application code accesses only
 * the canonical LegalDocument model produced here.
 *
 * Dataset schema (per record):
 *   judgment_id    — string (dataset ID)
 *   document_text  — string (verbatim ruling text in Hebrew)
 *   court          — string (court name in Hebrew)
 *   date           — string (ISO date or YYYY)
 *   judges         — string[] or string
 *   parties        — string[] or string
 *   case_number    — string
 *   proceeding_type — string (optional)
 */

import type { LegalDocumentInput } from '@factum-il/database';

export interface SourceAdapterResult {
  documents: LegalDocumentInput[];
  validCount: number;
  rejectedCount: number;
  rejectionReasons: Record<string, number>;
}

// Court name to proceeding type mapping for Israeli courts
const COURT_PROCEEDING_MAP: Record<string, string> = {
  'בית המשפט העליון':             'CIVIL',
  'בג"ץ':                          'ADMINISTRATIVE',
  'בית משפט מחוזי':               'CIVIL',
  'בית משפט שלום':                'CIVIL',
  'בית הדין לעבודה':              'LABOR',
  'בית משפט לענייני משפחה':     'FAMILY',
  'בית משפט לעניינים מנהליים':  'ADMINISTRATIVE',
  'בית דין דתי':                  'OTHER',
};

function normalizeCourt(court: string | undefined): string | null {
  if (!court || typeof court !== 'string') return null;
  return court.trim().replace(/\s+/g, ' ') || null;
}

function normalizeDate(date: string | undefined): string | null {
  if (!date || typeof date !== 'string') return null;
  const d = date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{4}$/.test(d)) return `${d}-01-01`;
  const parts = d.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (parts) return `${parts[3]}-${String(parts[2]).padStart(2, '0')}-${String(parts[1]).padStart(2, '0')}`;
  return null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return (value as unknown[]).map(v => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        const parsed = JSON.parse(value.replace(/'/g, '"'));
        if (Array.isArray(parsed)) return parsed.map((v: unknown) => String(v).trim()).filter(Boolean);
      } catch { /* fall through */ }
    }
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function inferProceedingType(court: string | null, record: Record<string, unknown>): string | null {
  if (record['proceeding_type'] && typeof record['proceeding_type'] === 'string') {
    return record['proceeding_type'].toUpperCase();
  }
  if (!court) return null;
  for (const [k, v] of Object.entries(COURT_PROCEEDING_MAP)) {
    if (court.includes(k)) return v;
  }
  return null;
}

function inferDocumentType(record: Record<string, unknown>): string {
  const t = String(record['document_type'] ?? record['verdict_type'] ?? record['Type'] ?? '');
  if (t.includes('החלטה') || t.toLowerCase().includes('decision')) return 'DECISION';
  if (t.includes('פסק-דין') || t.includes('פסק דין') || t.toLowerCase().includes('verdict')) return 'VERDICT';
  if (t.includes('צו') || t.toLowerCase().includes('order')) return 'ORDER';
  return 'VERDICT';
}

export class CaseLawIsraelAdapter {
  readonly adapterName = 'CaseLawIsraelAdapter';

  transform(records: unknown[]): SourceAdapterResult {
    const documents: LegalDocumentInput[] = [];
    let validCount    = 0;
    let rejectedCount = 0;
    const rejectionReasons: Record<string, number> = {};

    for (const raw of records) {
      try {
        if (!raw || typeof raw !== 'object') {
          rejectedCount++;
          rejectionReasons['malformed_json'] = (rejectionReasons['malformed_json'] ?? 0) + 1;
          continue;
        }

        const record = raw as Record<string, unknown>;

        const externalId = String(
          record['judgment_id'] ?? record['doc_key'] ?? record['id'] ?? '',
        );
        const text = String(
          record['document_text'] ?? record['text'] ?? record['verbatim_text_he'] ?? '',
        ).trim();

        if (!text || text.length < 50) {
          rejectedCount++;
          rejectionReasons['text_too_short'] = (rejectionReasons['text_too_short'] ?? 0) + 1;
          continue;
        }

        const court          = normalizeCourt(record['court'] as string | undefined);
        const date           = normalizeDate(
          (record['date'] as string | undefined) ?? (record['verdict_date'] as string | undefined),
        );
        const judges         = normalizeStringArray(record['judges'] ?? record['Judges']);
        const parties        = normalizeStringArray(record['parties'] ?? record['Parties']);
        const lawyers        = normalizeStringArray(record['lawyers'] ?? record['Lawyers']);
        const caseNumber     = record['case_number'] ? String(record['case_number']).trim() : null;
        const proceedingType = inferProceedingType(court, record) as NonNullable<LegalDocumentInput['proceedingType']> | null;
        const documentType   = inferDocumentType(record) as LegalDocumentInput['documentType'];

        let year: number | null = null;
        if (date) year = parseInt(date.slice(0, 4), 10) || null;
        if (!year && record['year']) year = Number(record['year']) || null;

        const metadata: Record<string, unknown> = {};
        if (record['legal_domain'])      metadata['legal_domain']      = record['legal_domain'];
        if (record['keywords'])          metadata['keywords']           = normalizeStringArray(record['keywords']);
        if (record['decision_outcome'])  metadata['outcome']            = record['decision_outcome'];
        if (record['summary_he'])        metadata['summary_he']         = String(record['summary_he']).slice(0, 600);
        if (record['cited_legislation']) metadata['cited_legislation']  = normalizeStringArray(record['cited_legislation']);

        documents.push({
          sourceId:        0,  // placeholder — LegalSourceLoader overwrites with actual FK
          sourceType:      'CASE_LAW',
          sourceDataset:   'guychuk/case-law-israel',
          sourceVersion:   String(record['dataset_version'] ?? 'v1.0'),
          documentType,
          proceedingType,
          court,
          caseNumber,
          title:           caseNumber ?? court ?? null,
          date,
          year,
          judges,
          parties,
          lawyers,
          text,
          metadata,
          visibilityScope: 'PUBLIC',
          externalId:      externalId || null,
        });

        validCount++;
      } catch {
        rejectedCount++;
        rejectionReasons['transform_error'] = (rejectionReasons['transform_error'] ?? 0) + 1;
      }
    }

    return { documents, validCount, rejectedCount, rejectionReasons };
  }
}
