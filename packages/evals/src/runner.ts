import type { ExtractionResult, EvalReport } from './types.js';
import { israeliLegalDataset } from './datasets/israeli-legal.js';
import { computeMetrics } from './metrics/precision-recall.js';

export type ExtractorFn = (ocrText: string) => Promise<ExtractionResult>;

export async function runEvals(
  extractor: ExtractorFn,
  opts?: { datasetId?: string; silent?: boolean },
): Promise<EvalReport> {
  const dataset = israeliLegalDataset;
  const silent = opts?.silent ?? false;

  if (!silent) {
    process.stdout.write(
      `[evals] Running on ${dataset.length} golden documents...\n`,
    );
  }

  const results: ExtractionResult[] = [];

  for (const doc of dataset) {
    if (!silent) {
      process.stdout.write(`[evals] Extracting: ${doc.id}\n`);
    }
    const result = await extractor(doc.ocrText);
    results.push(result);
  }

  const metrics = computeMetrics(dataset, results);
  const { failures, ...evalMetrics } = metrics;

  return {
    runAt: new Date().toISOString(),
    metrics: evalMetrics,
    failures,
  };
}
