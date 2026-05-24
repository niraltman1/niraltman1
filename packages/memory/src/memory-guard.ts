import { evaluateMemoryWrite } from '@factum-il/policy-engine';
import type { MemoryWriteRequest } from '@factum-il/policy-engine';
import type { CaseMemoryEntry } from './types.js';

const DEFAULT_THRESHOLD = 0.7;

function classifyMemoryKind(kind: CaseMemoryEntry['kind']): MemoryWriteRequest['kind'] {
  if (kind === 'entity') return 'FACT';
  if (kind === 'summary' || kind === 'reasoning' || kind === 'citation') return 'AI_SUMMARY';
  // 'risk' | 'timeline'
  return 'AI_HYPOTHESIS';
}

export function guardMemoryWrite(
  entry: Omit<CaseMemoryEntry, 'id' | 'createdAt'>,
  threshold?: number,
): boolean {
  const kind = classifyMemoryKind(entry.kind);
  const result = evaluateMemoryWrite(
    { kind, confidence: entry.confidence, content: entry.content },
    threshold ?? DEFAULT_THRESHOLD,
  );
  return result.decision === 'allow';
}
