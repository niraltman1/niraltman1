import type { EvalReport } from '../types.js';

export function formatJsonReport(report: EvalReport): string {
  return JSON.stringify(report, null, 2);
}
