import type { DatabaseConnection } from '../connection.js';

export interface LegalBrainSession {
  id:        number;
  title:     string | null;
  caseId:    number | null;
  userId:    string;
  createdAt: string;
  updatedAt: string;
}

export interface LegalBrainMessage {
  id:          number;
  sessionId:   number;
  role:        'user' | 'assistant';
  content:     string;
  sourcesJson: string | null;
  helpful:     number | null;
  createdAt:   string;
}

export interface CreateSessionInput {
  userId?: string;
  caseId?: number | null;
  title?:  string | null;
}

export interface AddMessageInput {
  sessionId:    number;
  role:         'user' | 'assistant';
  content:      string;
  sourcesJson?: string | null;
}

function mapSession(r: Record<string, unknown>): LegalBrainSession {
  return {
    id:        r['id']         as number,
    title:     (r['title']     as string | null) ?? null,
    caseId:    (r['case_id']   as number | null) ?? null,
    userId:    r['user_id']    as string,
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

function mapMessage(r: Record<string, unknown>): LegalBrainMessage {
  return {
    id:          r['id']            as number,
    sessionId:   r['session_id']    as number,
    role:        r['role']          as 'user' | 'assistant',
    content:     r['content']       as string,
    sourcesJson: (r['sources_json'] as string | null) ?? null,
    helpful:     (r['helpful']      as number | null) ?? null,
    createdAt:   r['created_at']    as string,
  };
}

export class LegalBrainSessionsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  createSession(input: CreateSessionInput = {}): LegalBrainSession {
    const res = this.db.prepare(`
      INSERT INTO LegalBrainSessions (user_id, case_id, title)
      VALUES (?, ?, ?)
    `).run(
      input.userId ?? 'default',
      input.caseId ?? null,
      input.title  ?? null,
    );
    return this.getSession(Number(res.lastInsertRowid))!;
  }

  getSession(id: number): LegalBrainSession | null {
    const r = this.db.prepare('SELECT * FROM LegalBrainSessions WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return r ? mapSession(r) : null;
  }

  listSessions(userId = 'default', limit = 50): LegalBrainSession[] {
    return (this.db.prepare(
      'SELECT * FROM LegalBrainSessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?',
    ).all(userId, limit) as Record<string, unknown>[]).map(mapSession);
  }

  deleteSession(id: number): void {
    this.db.prepare('DELETE FROM LegalBrainSessions WHERE id = ?').run(id);
  }

  updateTitle(id: number, title: string): void {
    this.db.prepare(
      "UPDATE LegalBrainSessions SET title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    ).run(title, id);
  }

  addMessage(input: AddMessageInput): LegalBrainMessage {
    const res = this.db.prepare(`
      INSERT INTO LegalBrainMessages (session_id, role, content, sources_json)
      VALUES (?, ?, ?, ?)
    `).run(
      input.sessionId,
      input.role,
      input.content,
      input.sourcesJson ?? null,
    );
    this.db.prepare(
      "UPDATE LegalBrainSessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    ).run(input.sessionId);
    return this.getMessage(Number(res.lastInsertRowid))!;
  }

  getMessage(id: number): LegalBrainMessage | null {
    const r = this.db.prepare('SELECT * FROM LegalBrainMessages WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return r ? mapMessage(r) : null;
  }

  /** Returns the last N messages for a session, ordered oldest-first (natural chat order). */
  getHistory(sessionId: number, limit = 6): LegalBrainMessage[] {
    return (this.db.prepare(`
      SELECT * FROM (
        SELECT * FROM LegalBrainMessages
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      )
      ORDER BY created_at ASC
    `).all(sessionId, limit) as Record<string, unknown>[]).map(mapMessage);
  }

  getMessages(sessionId: number): LegalBrainMessage[] {
    return (this.db.prepare(
      'SELECT * FROM LegalBrainMessages WHERE session_id = ? ORDER BY created_at ASC',
    ).all(sessionId) as Record<string, unknown>[]).map(mapMessage);
  }

  setFeedback(messageId: number, helpful: 0 | 1): void {
    this.db.prepare('UPDATE LegalBrainMessages SET helpful = ? WHERE id = ?').run(helpful, messageId);
  }
}
