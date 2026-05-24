import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEvals } from './runner.js';
import { checkRegression } from './regression.js';
import type { RegressionThresholds } from './regression.js';
import type { ExtractionResult } from './types.js';
import { printReport } from './reporters/console-reporter.js';
import { formatJsonReport } from './reporters/json-reporter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

// Parse args
const args = process.argv.slice(2);
const baselineIdx = args.indexOf('--baseline');
const outputIdx   = args.indexOf('--output');
const baselinePath = baselineIdx >= 0
  ? resolve(args[baselineIdx + 1] ?? '')
  : resolve(packageRoot, 'baselines/v1.json');
const outputPath = outputIdx >= 0
  ? resolve(args[outputIdx + 1] ?? '')
  : null;

// Load thresholds
const thresholds: RegressionThresholds = JSON.parse(
  readFileSync(baselinePath, 'utf-8'),
) as RegressionThresholds;

// Stub extractor — no live Ollama needed
const stubExtractor = async (_ocrText: string): Promise<ExtractionResult> => ({
  caseNumber:    null,
  courtName:     null,
  judgeName:     null,
  documentType:  null,
  procedureType: null,
  charges:       [],
  confidence:    0.8,
});

// Run
const report = await runEvals(stubExtractor);

// Report
printReport(report);
if (outputPath) {
  writeFileSync(outputPath, formatJsonReport(report), 'utf-8');
  console.log(`\nJSON report written to: ${outputPath}`);
}

// Regression check
const result = checkRegression(report.metrics, thresholds);
if (!result.passed) {
  console.error('\n❌ Eval regression FAILED:');
  for (const f of result.failures) {
    console.error(`  • ${f}`);
  }
  process.exit(1);
}

console.log('\n✓ Eval regression passed');
process.exit(0);
