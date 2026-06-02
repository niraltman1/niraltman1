import type { VerdictInput } from '@factum-il/database';

/**
 * Maps ONE raw row of the Supreme-Court-of-Israel verdict dataset
 * (LevMuchnik/SupremeCourtOfIsrael — 44 columns) into a verbatim VerdictInput.
 *
 * VERBATIM ONLY: this never authors or paraphrases legal text — it copies the
 * dataset's `text` field as-is and lifts the accompanying metadata. A row without a
 * stable hash or without ruling text is skipped (returns null), never faked.
 */

export interface DatasetProvenance {
  sourceDataset: string;   // e.g. 'LevMuchnik/SupremeCourtOfIsrael'
  snapshotLabel: string;   // e.g. '2022'
  sourceLicense?: string;  // e.g. 'openrail'
}

/** Coerce the dataset's list-typed metadata columns into a clean string[]. */
function toStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  }
  if (typeof raw === 'string' && raw.trim() !== '') return [raw.trim()];
  return [];
}

function str(raw: unknown): string | null {
  if (typeof raw === 'string') { const t = raw.trim(); return t === '' ? null : t; }
  if (typeof raw === 'number') return String(raw);
  return null;
}

function isoDate(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  // The dataset mixes ISO timestamps and free strings; keep the date part when ISO-like.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1]! : s;
}

export function rawRowToVerdict(
  row: Record<string, unknown>,
  prov: DatasetProvenance,
): VerdictInput | null {
  const docKey = str(row['document_hash']);
  const text   = typeof row['text'] === 'string' ? row['text'] : '';
  // Without a stable key or actual ruling text there is nothing verbatim to store.
  if (!docKey || text.trim() === '') return null;

  const yearRaw = row['Year'];
  const year = typeof yearRaw === 'number'
    ? yearRaw
    : (typeof yearRaw === 'string' && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null);

  return {
    docKey,
    // CaseDesc is the nicely-formatted citation (e.g. 'בג"ץ 5856/03'); fall back to the raw number.
    caseNumber:    str(row['CaseDesc']) ?? str(row['meta_case_nbr']),
    caseName:      str(row['CaseName']) ?? str(row['meta_case_nm']),
    court:         str(row['meta_court_nm']),
    verdictType:   str(row['Type']) ?? str(row['meta_verdict_ty']),
    verdictDate:   isoDate(row['VerdictDt']) ?? isoDate(row['meta_verdict_dt']),
    year,
    judges:        toStringList(row['meta_judge']),
    parties:       toStringList(row['meta_side_nm']),
    lawyers:       toStringList(row['meta_lawyer_nm']),
    verbatimText:  text,                       // EXACT — never trimmed of internal content
    sourceDataset: prov.sourceDataset,
    snapshotLabel: prov.snapshotLabel,
    sourceLicense: prov.sourceLicense ?? null,
  };
}
