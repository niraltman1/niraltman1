import type { MemoryWriteRequest, PolicyResult } from './types.js';

export function evaluateMemoryWrite(req: MemoryWriteRequest, threshold: number): PolicyResult {
  if (req.kind === 'FACT') {
    return { decision: 'allow', reason: 'FACT writes are always allowed' };
  }

  if (req.kind === 'AI_SUMMARY') {
    if (req.confidence >= threshold) {
      return { decision: 'allow', reason: 'confidence meets threshold' };
    }
    return { decision: 'deny', reason: 'confidence below threshold' };
  }

  // AI_HYPOTHESIS
  return { decision: 'deny', reason: 'AI_HYPOTHESIS writes are never allowed' };
}
