import type { CaseMemoryEntry, CaseMemoryKind } from './types.js';

interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): void;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
}

interface MemoryRow {
  id: number; case_id: number; kind: string; content: string;
  confidence: number; agent_name: string; trace_id: string; created_at: string;
}

function rowToEntry(r: MemoryRow): CaseMemoryEntry {
  return {
    id: r.id, caseId: r.case_id, kind: r.kind as CaseMemoryKind,
    content: r.content, confidence: r.confidence,
    agentName: r.agent_name, traceId: r.trace_id, createdAt: r.created_at,
  };
}

export function appendMemory(
  entry: Omit<CaseMemoryEntry, 'id' | 'createdAt'>,
  db: DbHandle,
): void {
  db.prepare(`
    INSERT INTO CaseMemory (case_id, kind, content, confidence, agent_name, trace_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entry.caseId, entry.kind, entry.content, entry.confidence, entry.agentName, entry.traceId);
}

export function loadMemory(
  caseId: number,
  kinds: CaseMemoryKind[],
  db: DbHandle,
): CaseMemoryEntry[] {
  if (kinds.length === 0) return [];
  const placeholders = kinds.map(() => '?').join(',');
  return (db.prepare(`
    SELECT * FROM CaseMemory
    WHERE case_id = ? AND kind IN (${placeholders})
    ORDER BY created_at DESC
    LIMIT 50
  `).all(caseId, ...kinds) as MemoryRow[]).map(rowToEntry);
}

export function pruneOldMemory(caseId: number, keepLatest: number, db: DbHandle): void {
  db.prepare(`
    DELETE FROM CaseMemory
    WHERE case_id = ? AND id NOT IN (
      SELECT id FROM CaseMemory WHERE case_id = ?
      ORDER BY created_at DESC LIMIT ?
    )
  `).run(caseId, caseId, keepLatest);
}
