import type { GoldenDocument, ExtractionResult, EvalMetrics, EvalFailure } from '../types.js';

// Scalar string fields that are compared directly
const SCALAR_FIELDS = [
  'caseNumber',
  'courtName',
  'judgeName',
  'documentType',
  'procedureType',
] as const;

type ScalarField = typeof SCALAR_FIELDS[number];

function normalise(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function scalarMatches(
  expected: string | null,
  actual: string | null,
): boolean {
  if (expected === null && actual === null) return true;
  if (expected === null || actual === null) return false;
  return normalise(expected) === normalise(actual);
}

// fieldPrecision: fraction of non-null result fields that match expected
function computeFieldPrecision(
  golden: GoldenDocument,
  result: ExtractionResult,
): { matched: number; total: number } {
  let matched = 0;
  let total = 0;

  for (const field of SCALAR_FIELDS) {
    const actual = result[field as ScalarField];
    if (actual !== null) {
      total++;
      if (scalarMatches(golden.expected[field as ScalarField], actual)) {
        matched++;
      }
    }
  }

  // charges: count non-empty result charges
  if (result.charges.length > 0) {
    const expectedSet = new Set(golden.expected.charges.map(normalise));
    const resultSet = new Set(result.charges.map(normalise));
    for (const charge of resultSet) {
      total++;
      if (expectedSet.has(charge)) matched++;
    }
  }

  return { matched, total };
}

// fieldRecall: fraction of non-null expected fields that are present in result
function computeFieldRecall(
  golden: GoldenDocument,
  result: ExtractionResult,
): { matched: number; total: number } {
  let matched = 0;
  let total = 0;

  for (const field of SCALAR_FIELDS) {
    const expected = golden.expected[field as ScalarField];
    if (expected !== null) {
      total++;
      if (scalarMatches(expected, result[field as ScalarField])) {
        matched++;
      }
    }
  }

  // charges recall: expected charges found in result
  if (golden.expected.charges.length > 0) {
    const resultSet = new Set(result.charges.map(normalise));
    for (const charge of golden.expected.charges) {
      total++;
      if (resultSet.has(normalise(charge))) matched++;
    }
  }

  return { matched, total };
}

// hallucination: result field is non-null AND not a substring of ocrText (case-insensitive)
function countHallucinations(
  golden: GoldenDocument,
  result: ExtractionResult,
): number {
  const ocrLower = golden.ocrText.toLowerCase();
  let count = 0;

  for (const field of SCALAR_FIELDS) {
    const actual = result[field as ScalarField];
    if (actual !== null && actual.trim() !== '') {
      if (!ocrLower.includes(actual.trim().toLowerCase())) {
        count++;
      }
    }
  }

  for (const charge of result.charges) {
    if (charge.trim() !== '' && !ocrLower.includes(charge.trim().toLowerCase())) {
      count++;
    }
  }

  return count;
}

function buildFailures(
  golden: GoldenDocument,
  result: ExtractionResult,
): EvalFailure[] {
  const failures: EvalFailure[] = [];

  for (const field of SCALAR_FIELDS) {
    const expected = golden.expected[field as ScalarField];
    const actual = result[field as ScalarField];
    if (!scalarMatches(expected, actual)) {
      failures.push({
        documentId: golden.id,
        field,
        expected,
        actual,
        reason: `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
      });
    }
  }

  // charges comparison
  if (
    JSON.stringify([...golden.expected.charges].sort()) !==
    JSON.stringify([...result.charges].sort())
  ) {
    failures.push({
      documentId: golden.id,
      field: 'charges',
      expected: golden.expected.charges,
      actual: result.charges,
      reason: `Charges mismatch`,
    });
  }

  return failures;
}

export function computeMetrics(
  golden: GoldenDocument[],
  results: ExtractionResult[],
): EvalMetrics & { failures: EvalFailure[] } {
  if (golden.length !== results.length) {
    throw new Error(
      `golden.length (${golden.length}) !== results.length (${results.length})`,
    );
  }

  let totalPrecisionMatched = 0;
  let totalPrecisionDenom = 0;
  let totalRecallMatched = 0;
  let totalRecallDenom = 0;
  let totalHallucinations = 0;
  let totalLowConfidence = 0;
  const allFailures: EvalFailure[] = [];

  for (let i = 0; i < golden.length; i++) {
    const doc = golden[i] as GoldenDocument;
    const res = results[i] as ExtractionResult;

    const p = computeFieldPrecision(doc, res);
    totalPrecisionMatched += p.matched;
    totalPrecisionDenom += p.total;

    const r = computeFieldRecall(doc, res);
    totalRecallMatched += r.matched;
    totalRecallDenom += r.total;

    totalHallucinations += countHallucinations(doc, res);

    if (res.confidence < 0.7) {
      totalLowConfidence++;
    }

    allFailures.push(...buildFailures(doc, res));
  }

  const precision =
    totalPrecisionDenom === 0 ? 1.0 : totalPrecisionMatched / totalPrecisionDenom;
  const recall =
    totalRecallDenom === 0 ? 1.0 : totalRecallMatched / totalRecallDenom;
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    precision,
    recall,
    f1,
    hallucinations: totalHallucinations,
    lowConfidence: totalLowConfidence,
    totalDocuments: golden.length,
    failures: allFailures,
  };
}
