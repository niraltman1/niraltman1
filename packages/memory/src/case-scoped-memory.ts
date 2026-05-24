import { appendMemory, loadMemory, pruneOldMemory } from './case-memory.js';
import { assembleContext } from './context-assembler.js';
import { SessionStore } from './session-store.js';
import type { CaseMemoryEntry, CaseMemoryKind } from './types.js';
import type { AssembledContext } from './context-assembler.js';

interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): void;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
}

export interface CaseScopedMemoryHandle {
  append(entry: Omit<CaseMemoryEntry, 'id' | 'createdAt' | 'caseId'>): void;
  load(kinds: CaseMemoryKind[]): CaseMemoryEntry[];
  prune(keepLatest: number): void;
  assemble(userId: string): AssembledContext;
}

/**
 * Wraps the existing memory functions with a fixed caseId so callers
 * structurally cannot write to or read from a different case.
 */
export function createCaseScopedMemory(
  caseId: number,
  db:     DbHandle,
): CaseScopedMemoryHandle {
  return {
    append: (entry) => appendMemory({ ...entry, caseId }, db),
    load:   (kinds) => loadMemory(caseId, kinds, db),
    prune:  (keepLatest) => pruneOldMemory(caseId, keepLatest, db),
    assemble: (userId) => assembleContext(caseId, userId, db),
  };
}

/**
 * Wraps SessionStore so every key is automatically prefixed with the caseId.
 * Keys from case A are invisible to case B even if stored on the same store
 * instance, preventing cross-case session collisions.
 */
export class CaseScopedSessionStore {
  private readonly prefix: string;

  constructor(
    private readonly caseId: number,
    private readonly store:  SessionStore,
  ) {
    this.prefix = `${caseId}:`;
  }

  set<T>(key: string, value: T): void {
    this.store.set<T>(`${this.prefix}${key}`, value);
  }

  get<T>(key: string): T | undefined {
    return this.store.get<T>(`${this.prefix}${key}`);
  }

  /** Removes all keys belonging to this caseId from the underlying store. */
  clearCase(): void {
    // SessionStore exposes its internal Map via the public API only through
    // get/set/clear. We use the store's clear() only if we own the only case;
    // otherwise we rebuild by deleting prefixed keys via a temporary iteration.
    // Since SessionStore is module-internal, we access its raw map via casting.
    const raw = (this.store as unknown as { data: Map<string, unknown> }).data;
    if (raw) {
      for (const key of [...raw.keys()]) {
        if (key.startsWith(this.prefix)) raw.delete(key);
      }
    }
  }
}
