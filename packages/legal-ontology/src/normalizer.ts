import type { EntityKind } from './types.js';
import { normalizeCourt } from './courts.js';
import { normalizeJudge } from './judges.js';

export function normalizeEntity(kind: EntityKind, raw: string): string {
  const trimmed = raw.trim()
    .replace(/״/g, '"')
    .replace(/׳/g, "'");
  if (kind === 'Court') return normalizeCourt(trimmed);
  if (kind === 'Judge') return normalizeJudge(trimmed);
  return trimmed;
}
