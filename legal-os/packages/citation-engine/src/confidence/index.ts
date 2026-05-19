import type { CitationSource, CitationConfidence } from '../schemas/types.js';
import { validateCitation } from '../validators/index.js';

// Score a parsed citation on a 0.0–1.0 scale.
// Returns level and trust metadata suitable for UI display and DB storage.
export function scoreCitation(
  _raw: string,
  parsed: CitationSource | null,
): CitationConfidence {
  if (!parsed) {
    return { score: 0.0, level: 'invalid', verified: false };
  }

  const result = validateCitation(parsed);

  if (!result.valid) {
    // Hard errors — score proportional to severity
    const errCount = result.errors.length;
    const score = Math.max(0.1, 0.5 - (errCount - 1) * 0.1);
    return { score: roundScore(score), level: 'invalid', verified: false };
  }

  if (result.warnings.length > 0) {
    // Soft issues — start at 0.85, deduct per warning
    const warnCount = result.warnings.length;
    const score = Math.max(0.6, 0.85 - warnCount * 0.075);
    return { score: roundScore(score), level: 'partial', verified: false };
  }

  // Apply case-specific completeness bonuses/deductions
  if (parsed.type === 'case') {
    let score = 1.0;
    if (!parsed.publication) score -= 0.05;
    if (!parsed.date)        score -= 0.05;
    if (parsed.parties.length < 2) score -= 0.03;
    return { score: roundScore(score), level: score >= 0.9 ? 'validated' : 'partial', verified: false };
  }

  return { score: 0.9, level: 'validated', verified: false };
}

function roundScore(n: number): number {
  return Math.round(Math.min(1.0, Math.max(0.0, n)) * 100) / 100;
}
