import { loadMemory } from './case-memory.js';
import { getAllPreferences } from './user-memory.js';
import type { CaseMemoryEntry } from './types.js';

interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): void;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
}

export interface AssembledContext {
  caseMemory:  CaseMemoryEntry[];
  preferences: Record<string, string>;
  summary:     string;
}

const TOKEN_BUDGET = 800;
const CHARS_PER_TOKEN = 3.5;
const CHAR_BUDGET = Math.floor(TOKEN_BUDGET * CHARS_PER_TOKEN);

export function assembleContext(
  caseId: number,
  userId: string,
  db: DbHandle,
): AssembledContext {
  const caseMemory = loadMemory(caseId, ['risk', 'reasoning', 'summary', 'entity', 'citation', 'timeline'], db);
  const preferences = getAllPreferences(userId, db);

  let chars = 0;
  const trimmed: CaseMemoryEntry[] = [];
  for (const entry of caseMemory) {
    if (chars + entry.content.length > CHAR_BUDGET) break;
    trimmed.push(entry);
    chars += entry.content.length;
  }

  const summary = trimmed
    .map(e => `[${e.kind}] ${e.content}`)
    .join('\n');

  return { caseMemory: trimmed, preferences, summary };
}
