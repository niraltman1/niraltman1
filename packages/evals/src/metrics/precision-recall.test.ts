import { describe, it, expect } from 'vitest';
import { computeMetrics } from './precision-recall.js';
import type { GoldenDocument, ExtractionResult } from '../types.js';

// Two minimal golden documents for unit testing.
// ocrTexts deliberately include every expected field value so that
// correct extractions produce zero hallucinations.
const goldenDocs: GoldenDocument[] = [
  {
    id: 'test-doc-001',
    description: 'Perfect match test document',
    // ocrText includes caseNumber, courtName, documentType, procedureType, charge
    ocrText:
      'בית משפט השלום תל אביב-יפו הזמנה לדין תיק פלילי ת"פ-2024-001 עבירת גניבה',
    expected: {
      caseNumber:    'ת"פ-2024-001',
      courtName:     'בית משפט השלום תל אביב-יפו',
      judgeName:     null,
      documentType:  'הזמנה לדין',
      procedureType: 'פלילי',
      citationCount: 0,
      charges:       ['גניבה'],
    },
  },
  {
    id: 'test-doc-002',
    description: 'Wrong caseNumber test document',
    // ocrText includes the correct case number תא-2023-099 (not WRONG)
    ocrText:
      'בית משפט המחוזי חיפה כתב תביעה הליך אזרחי תא-2023-099',
    expected: {
      caseNumber:    'תא-2023-099',
      courtName:     'בית משפט המחוזי חיפה',
      judgeName:     null,
      documentType:  'כתב תביעה',
      procedureType: 'אזרחי',
      citationCount: 0,
      charges:       [],
    },
  },
];

// Result 1: perfect match for doc-001 — all values exist in ocrText
const perfectResult: ExtractionResult = {
  caseNumber:    'ת"פ-2024-001',
  courtName:     'בית משפט השלום תל אביב-יפו',
  judgeName:     null,
  documentType:  'הזמנה לדין',
  procedureType: 'פלילי',
  charges:       ['גניבה'],
  confidence:    0.95,
};

// Result 2: wrong caseNumber for doc-002 — 'תא-2023-WRONG' not in ocrText
const wrongCaseResult: ExtractionResult = {
  caseNumber:    'תא-2023-WRONG',   // wrong — not in ocrText
  courtName:     'בית משפט המחוזי חיפה',
  judgeName:     null,
  documentType:  'כתב תביעה',
  procedureType: 'אזרחי',
  charges:       [],
  confidence:    0.80,
};

describe('computeMetrics', () => {
  it('computes precision and recall correctly with one mismatch', () => {
    const metrics = computeMetrics(goldenDocs, [perfectResult, wrongCaseResult]);

    // doc-001 (perfectResult):
    //   Non-null result scalar fields: caseNumber, courtName, documentType, procedureType → 4
    //   All match → precision contribution: 4/4 = 1.0
    //   charges result: ['גניבה'] → 1 non-null → 1/1 match → precision contribution: 1/1
    //   total precision fields: 5 matched: 5
    //
    //   Non-null expected scalars: caseNumber, courtName, documentType, procedureType → 4
    //   All match → recall contribution: 4/4 = 1.0
    //   expected charges: ['גניבה'] → 1 → matched: 1
    //   total recall fields: 5 matched: 5
    //
    // doc-002 (wrongCaseResult):
    //   Non-null result scalar fields: caseNumber, courtName, documentType, procedureType → 4
    //   caseNumber doesn't match → 3/4
    //   total precision fields: 4 matched: 3
    //
    //   Non-null expected scalars: caseNumber, courtName, documentType, procedureType → 4
    //   caseNumber doesn't match → 3/4
    //   total recall fields: 4 matched: 3
    //
    // Overall precision: (5 + 3) / (5 + 4) = 8/9 ≈ 0.889
    // Overall recall: (5 + 3) / (5 + 4) = 8/9 ≈ 0.889

    expect(metrics.precision).toBeGreaterThan(0.87);
    expect(metrics.precision).toBeLessThan(0.91);
    expect(metrics.recall).toBeGreaterThan(0.87);
    expect(metrics.recall).toBeLessThan(0.91);

    // F1 = 2 * p * r / (p + r) — since p == r here, F1 == p == r
    const expectedF1 = (2 * metrics.precision * metrics.recall) / (metrics.precision + metrics.recall);
    expect(Math.abs(metrics.f1 - expectedF1)).toBeLessThan(0.01);

    expect(metrics.totalDocuments).toBe(2);
    expect(metrics.lowConfidence).toBe(0); // both >= 0.7
  });

  it('counts hallucinations: result value not found in ocrText', () => {
    // 'תא-2023-WRONG' is NOT in the ocrText of doc-002 ('תא-2023-099')
    const metrics = computeMetrics(goldenDocs, [perfectResult, wrongCaseResult]);

    // doc-001: all result fields exist in ocrText → 0 hallucinations
    // doc-002: 'תא-2023-WRONG' is not in ocrText → 1 hallucination
    expect(metrics.hallucinations).toBe(1);
  });

  it('detects low-confidence results (confidence < 0.7)', () => {
    const lowConfResult: ExtractionResult = {
      ...perfectResult,
      confidence: 0.5,
    };
    const metrics = computeMetrics(goldenDocs, [lowConfResult, wrongCaseResult]);
    expect(metrics.lowConfidence).toBe(1);
  });

  it('perfect results yield precision=1, recall=1, hallucinations=0', () => {
    // doc-002 perfect result
    const doc2Perfect: ExtractionResult = {
      caseNumber:    'תא-2023-099',
      courtName:     'בית משפט המחוזי חיפה',
      judgeName:     null,
      documentType:  'כתב תביעה',
      procedureType: 'אזרחי',
      charges:       [],
      confidence:    0.99,
    };
    const metrics = computeMetrics(goldenDocs, [perfectResult, doc2Perfect]);
    expect(metrics.precision).toBeCloseTo(1.0, 2);
    expect(metrics.recall).toBeCloseTo(1.0, 2);
    expect(metrics.hallucinations).toBe(0);
    expect(metrics.lowConfidence).toBe(0);
  });

  it('throws if golden and results lengths differ', () => {
    expect(() => computeMetrics(goldenDocs, [perfectResult])).toThrow();
  });
});
