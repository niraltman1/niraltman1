import type { EvalReport } from '../types.js';

export function printReport(report: EvalReport): void {
  const m = report.metrics;
  const sep = '+' + '-'.repeat(35) + '+';

  console.log(sep);
  console.log('| Eval Report                       |');
  console.log(sep);
  console.log(
    `| Precision: ${m.precision.toFixed(2).padEnd(6)} Recall: ${m.recall.toFixed(2).padEnd(10)} |`,
  );
  console.log(
    `| F1: ${m.f1.toFixed(2).padEnd(10)} Hallucinations: ${String(m.hallucinations).padEnd(4)} |`,
  );
  console.log(`| Low-confidence: ${String(m.lowConfidence).padEnd(18)} |`);
  console.log(`| Documents: ${String(m.totalDocuments).padEnd(23)} |`);
  console.log(sep);

  if (report.failures.length > 0) {
    console.log(`\nFailures (${report.failures.length}):`);
    for (const f of report.failures) {
      console.log(
        `  [${f.documentId}] field="${f.field}" expected=${JSON.stringify(f.expected)} actual=${JSON.stringify(f.actual)}`,
      );
      console.log(`    reason: ${f.reason}`);
    }
  } else {
    console.log('\nAll fields matched.');
  }
}
