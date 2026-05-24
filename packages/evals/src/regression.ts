import type { EvalMetrics } from './types.js';

export interface RegressionThresholds {
  minPrecision:       number;
  minRecall:          number;
  minF1:              number;
  maxHallucinations:  number;
  maxLowConfidence:   number;
}

export interface RegressionResult {
  passed:   boolean;
  failures: string[];  // human-readable reasons, empty if passed
}

export function checkRegression(
  metrics: EvalMetrics,
  thresholds: RegressionThresholds,
): RegressionResult {
  const failures: string[] = [];

  if (metrics.precision < thresholds.minPrecision) {
    failures.push(
      `Precision ${metrics.precision.toFixed(3)} < minimum ${thresholds.minPrecision}`,
    );
  }
  if (metrics.recall < thresholds.minRecall) {
    failures.push(
      `Recall ${metrics.recall.toFixed(3)} < minimum ${thresholds.minRecall}`,
    );
  }
  if (metrics.f1 < thresholds.minF1) {
    failures.push(`F1 ${metrics.f1.toFixed(3)} < minimum ${thresholds.minF1}`);
  }
  if (metrics.hallucinations > thresholds.maxHallucinations) {
    failures.push(
      `Hallucinations ${metrics.hallucinations} > maximum ${thresholds.maxHallucinations}`,
    );
  }
  if (metrics.lowConfidence > thresholds.maxLowConfidence) {
    failures.push(
      `Low-confidence outputs ${metrics.lowConfidence} > maximum ${thresholds.maxLowConfidence}`,
    );
  }

  return { passed: failures.length === 0, failures };
}
