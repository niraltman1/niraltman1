import type { PolicyResult } from './types.js';

export function evaluateRetrieval(_query: string, _caseId: number | null): PolicyResult {
  return { decision: 'allow', reason: 'no restrictions' };
}
