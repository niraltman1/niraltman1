import { describe, it, expect } from 'vitest';
import { rawRowToVerdict, rawGuychukRowToVerdict, type DatasetProvenance } from './transform.js';

const PROV: DatasetProvenance = {
  sourceDataset: 'LevMuchnik/SupremeCourtOfIsrael',
  snapshotLabel: '2022',
  sourceLicense: 'openrail',
};

// A real row shape from the LevMuchnik/SupremeCourtOfIsrael dataset (bg"ץ 5856/03),
// trimmed to the columns the transform reads.
const REAL_ROW: Record<string, unknown> = {
  document_hash: '0c8e0abba0504c9cc4823b0377399fdead0126d6bcfcf0e659a1b8f753e6d240',
  CaseDesc:      'בג"ץ 5856/03',
  CaseName:      "יורם יזדי נ. פרקליטות המדינה - הגב' עדנה ארבל",
  meta_court_nm: 'בג"ץ',
  Type:          'פסק-דין',
  VerdictDt:     '1920-11-23T20:00:00',
  Year:          2003,
  meta_judge:    ['דליה דורנר', 'מרים נאור', 'אסתר חיות'],
  meta_side_nm:  ['תביעה', 'הגנה'],
  meta_lawyer_nm: ['שי ניצן'],
  text:          'בבית המשפט העליון ... פסק-דין ... העתירה נדחית, אפוא ...',
  Technical:     false,
};

describe('rawRowToVerdict', () => {
  it('maps a real dataset row to a verbatim VerdictInput', () => {
    const v = rawRowToVerdict(REAL_ROW, PROV);
    expect(v).not.toBeNull();
    expect(v!.docKey).toBe(REAL_ROW['document_hash']);
    expect(v!.caseNumber).toBe('בג"ץ 5856/03');
    expect(v!.caseName).toContain('יורם יזדי');
    expect(v!.court).toBe('בג"ץ');
    expect(v!.verdictType).toBe('פסק-דין');
    expect(v!.year).toBe(2003);
    expect(v!.judges).toEqual(['דליה דורנר', 'מרים נאור', 'אסתר חיות']);
    expect(v!.lawyers).toEqual(['שי ניצן']);
    expect(v!.verbatimText).toBe(REAL_ROW['text']); // EXACT — copied, never paraphrased
    expect(v!.sourceDataset).toBe('LevMuchnik/SupremeCourtOfIsrael');
    expect(v!.snapshotLabel).toBe('2022');
  });

  it('takes only the date part of an ISO timestamp', () => {
    const v = rawRowToVerdict(REAL_ROW, PROV);
    expect(v!.verdictDate).toBe('1920-11-23');
  });

  it('skips rows without ruling text', () => {
    expect(rawRowToVerdict({ ...REAL_ROW, text: '   ' }, PROV)).toBeNull();
  });

  it('skips rows without a stable document hash', () => {
    const noHash = { ...REAL_ROW };
    delete noHash['document_hash'];
    expect(rawRowToVerdict(noHash, PROV)).toBeNull();
  });

  it('falls back to meta_case_nbr when CaseDesc is absent', () => {
    const noDesc = { ...REAL_ROW };
    delete noDesc['CaseDesc'];
    const v = rawRowToVerdict({ ...noDesc, meta_case_nbr: '5856/03' }, PROV);
    expect(v!.caseNumber).toBe('5856/03');
  });
});

const GUYCHUK_PROV: DatasetProvenance = {
  sourceDataset: 'guychuk/case-law-israel',
  snapshotLabel: '2025',
  sourceLicense: 'unspecified',
};

// Row shape from guychuk/case-law-israel (a magistrate-court judgment). court_type_label
// is an HF ClassLabel: index 3 = MAGISTRATE_COURT.
const GUYCHUK_ROW: Record<string, unknown> = {
  judgment_id:     'abc-123',
  title:           'פלוני נ. אלמוני',
  name_number:     'ת"א 12345-01-20',
  doc_create_date: '2020-03-15',
  court_type_label: 3,
  document_text:   'בית משפט השלום ... פסק הדין ... התביעה מתקבלת.',
  judges_str:      'ישראל ישראלי; דנה כהן',
};

describe('rawGuychukRowToVerdict', () => {
  it('maps an all-courts row, resolving the ClassLabel court to Hebrew', () => {
    const v = rawGuychukRowToVerdict(GUYCHUK_ROW, GUYCHUK_PROV);
    expect(v).not.toBeNull();
    expect(v!.docKey).toBe('guychuk:abc-123');     // namespaced — never collides with hashes
    expect(v!.caseNumber).toBe('ת"א 12345-01-20');
    expect(v!.caseName).toBe('פלוני נ. אלמוני');
    expect(v!.court).toBe('שלום');                  // index 3 → MAGISTRATE_COURT → שלום
    expect(v!.year).toBe(2020);
    expect(v!.judges).toEqual(['ישראל ישראלי', 'דנה כהן']);
    expect(v!.verbatimText).toBe(GUYCHUK_ROW['document_text']);
    expect(v!.sourceDataset).toBe('guychuk/case-law-israel');
    expect(v!.sourceLicense).toBe('unspecified');  // flagged for license verification
  });

  it('accepts an already-resolved string court label', () => {
    const v = rawGuychukRowToVerdict({ ...GUYCHUK_ROW, court_type_label: 'LABOR_COURT' }, GUYCHUK_PROV);
    expect(v!.court).toBe('עבודה');
  });

  it('skips rows without a judgment id or document text', () => {
    expect(rawGuychukRowToVerdict({ ...GUYCHUK_ROW, document_text: '' }, GUYCHUK_PROV)).toBeNull();
    const noId = { ...GUYCHUK_ROW };
    delete noId['judgment_id'];
    expect(rawGuychukRowToVerdict(noId, GUYCHUK_PROV)).toBeNull();
  });
});
