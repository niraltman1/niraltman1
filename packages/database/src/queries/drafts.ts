import type { DatabaseConnection } from '../connection.js';

export interface DraftRecord {
  id:             number;
  title:          string;
  content_json:   string | null;
  content_html:   string | null;
  matter_id:      number | null;
  client_id:      number | null;
  document_type:  string;
  status:         string;
  word_count:     number;
  parent_draft_id: number | null;
  fork_reason:    string | null;
  created_by:     string | null;
  is_active:      number;
  created_at:     string;
  updated_at:     string;
}

export interface DraftVersionRecord {
  id:             number;
  draft_id:       number;
  version_number: number;
  content_json:   string;
  content_html:   string | null;
  word_count:     number;
  change_reason:  string | null;
  is_ai_generated: number;
  ai_operation:   string | null;
  created_by:     string | null;
  created_at:     string;
}

export interface DraftCitationRecord {
  id:           number;
  draft_id:     number;
  citation_ref: string;
  entity_type:  string;
  entity_id:    number | null;
  node_id:      string | null;
  inserted_at:  string;
}

export interface EvidenceShelfItemRecord {
  id:          number;
  draft_id:    number;
  shelf_type:  string;
  title:       string;
  content_he:  string | null;
  source_ref:  string | null;
  entity_id:   number | null;
  entity_type: string | null;
  is_inserted: number;
  inserted_at: string | null;
  created_at:  string;
}

function mapDraft(r: Record<string, unknown>): DraftRecord {
  return {
    id:             r['id'] as number,
    title:          r['title'] as string,
    content_json:   (r['content_json'] as string | null) ?? null,
    content_html:   (r['content_html'] as string | null) ?? null,
    matter_id:      (r['matter_id'] as number | null) ?? null,
    client_id:      (r['client_id'] as number | null) ?? null,
    document_type:  r['document_type'] as string,
    status:         r['status'] as string,
    word_count:     r['word_count'] as number,
    parent_draft_id: (r['parent_draft_id'] as number | null) ?? null,
    fork_reason:    (r['fork_reason'] as string | null) ?? null,
    created_by:     (r['created_by'] as string | null) ?? null,
    is_active:      r['is_active'] as number,
    created_at:     r['created_at'] as string,
    updated_at:     r['updated_at'] as string,
  };
}

function mapVersion(r: Record<string, unknown>): DraftVersionRecord {
  return {
    id:             r['id'] as number,
    draft_id:       r['draft_id'] as number,
    version_number: r['version_number'] as number,
    content_json:   r['content_json'] as string,
    content_html:   (r['content_html'] as string | null) ?? null,
    word_count:     r['word_count'] as number,
    change_reason:  (r['change_reason'] as string | null) ?? null,
    is_ai_generated: r['is_ai_generated'] as number,
    ai_operation:   (r['ai_operation'] as string | null) ?? null,
    created_by:     (r['created_by'] as string | null) ?? null,
    created_at:     r['created_at'] as string,
  };
}

function mapCitation(r: Record<string, unknown>): DraftCitationRecord {
  return {
    id:           r['id'] as number,
    draft_id:     r['draft_id'] as number,
    citation_ref: r['citation_ref'] as string,
    entity_type:  r['entity_type'] as string,
    entity_id:    (r['entity_id'] as number | null) ?? null,
    node_id:      (r['node_id'] as string | null) ?? null,
    inserted_at:  r['inserted_at'] as string,
  };
}

function mapShelfItem(r: Record<string, unknown>): EvidenceShelfItemRecord {
  return {
    id:          r['id'] as number,
    draft_id:    r['draft_id'] as number,
    shelf_type:  r['shelf_type'] as string,
    title:       r['title'] as string,
    content_he:  (r['content_he'] as string | null) ?? null,
    source_ref:  (r['source_ref'] as string | null) ?? null,
    entity_id:   (r['entity_id'] as number | null) ?? null,
    entity_type: (r['entity_type'] as string | null) ?? null,
    is_inserted: r['is_inserted'] as number,
    inserted_at: (r['inserted_at'] as string | null) ?? null,
    created_at:  r['created_at'] as string,
  };
}

export class DraftsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  list(filters: { matterId?: number; clientId?: number; status?: string; isActive?: boolean } = {}): DraftRecord[] {
    const conditions: string[] = ['is_active = ?'];
    const params: unknown[]    = [filters.isActive === false ? 0 : 1];
    if (filters.matterId != null) { conditions.push('matter_id = ?'); params.push(filters.matterId); }
    if (filters.clientId != null) { conditions.push('client_id = ?'); params.push(filters.clientId); }
    if (filters.status)           { conditions.push('status = ?');    params.push(filters.status); }
    return (this.db.prepare(
      `SELECT * FROM LegalDrafts WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC`
    ).all(...params) as Record<string, unknown>[]).map(mapDraft);
  }

  get(id: number): DraftRecord | undefined {
    const r = this.db.prepare('SELECT * FROM LegalDrafts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? mapDraft(r) : undefined;
  }

  create(data: Omit<DraftRecord, 'id' | 'created_at' | 'updated_at'>): DraftRecord {
    const res = this.db.prepare(`
      INSERT INTO LegalDrafts
        (title, content_json, content_html, matter_id, client_id, document_type,
         status, word_count, parent_draft_id, fork_reason, created_by, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      data.title, data.content_json ?? null, data.content_html ?? null,
      data.matter_id ?? null, data.client_id ?? null, data.document_type,
      data.status, data.word_count, data.parent_draft_id ?? null,
      data.fork_reason ?? null, data.created_by ?? null, data.is_active,
    );
    return this.get(Number(res.lastInsertRowid))!;
  }

  update(id: number, data: Partial<Pick<DraftRecord, 'title' | 'content_json' | 'content_html' | 'word_count' | 'status'>>): DraftRecord {
    const fields: string[] = ["updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"];
    const params: unknown[] = [];
    if (data.title        !== undefined) { fields.push('title = ?');        params.push(data.title); }
    if (data.content_json !== undefined) { fields.push('content_json = ?'); params.push(data.content_json); }
    if (data.content_html !== undefined) { fields.push('content_html = ?'); params.push(data.content_html); }
    if (data.word_count   !== undefined) { fields.push('word_count = ?');   params.push(data.word_count); }
    if (data.status       !== undefined) { fields.push('status = ?');       params.push(data.status); }
    params.push(id);
    this.db.prepare(`UPDATE LegalDrafts SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.get(id)!;
  }

  archive(id: number): void {
    this.db.prepare(
      "UPDATE LegalDrafts SET is_active = 0, status = 'archived', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    ).run(id);
  }

  fork(id: number, forkReason: string | null, createdBy: string | null): DraftRecord {
    const src = this.get(id);
    if (!src) throw new Error(`Draft ${id} not found`);
    return this.create({
      title:          `${src.title} (עותק)`,
      content_json:   src.content_json,
      content_html:   src.content_html,
      matter_id:      src.matter_id,
      client_id:      src.client_id,
      document_type:  src.document_type,
      status:         'draft',
      word_count:     src.word_count,
      parent_draft_id: id,
      fork_reason:    forkReason,
      created_by:     createdBy,
      is_active:      1,
    });
  }

  // ─── Versions ──────────────────────────────────────────────────────────────

  createVersion(draftId: number, data: Omit<DraftVersionRecord, 'id' | 'created_at'>): DraftVersionRecord {
    const res = this.db.prepare(`
      INSERT INTO DraftVersions
        (draft_id, version_number, content_json, content_html, word_count,
         change_reason, is_ai_generated, ai_operation, created_by)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      draftId, data.version_number, data.content_json, data.content_html ?? null,
      data.word_count, data.change_reason ?? null,
      data.is_ai_generated, data.ai_operation ?? null, data.created_by ?? null,
    );
    return this.db.prepare('SELECT * FROM DraftVersions WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as DraftVersionRecord;
  }

  listVersions(draftId: number): DraftVersionRecord[] {
    return (this.db.prepare(
      'SELECT * FROM DraftVersions WHERE draft_id = ? ORDER BY version_number DESC'
    ).all(draftId) as Record<string, unknown>[]).map(mapVersion);
  }

  getVersion(draftId: number, versionNumber: number): DraftVersionRecord | undefined {
    const r = this.db.prepare(
      'SELECT * FROM DraftVersions WHERE draft_id = ? AND version_number = ?'
    ).get(draftId, versionNumber) as Record<string, unknown> | undefined;
    return r ? mapVersion(r) : undefined;
  }

  nextVersionNumber(draftId: number): number {
    const r = this.db.prepare(
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM DraftVersions WHERE draft_id = ?'
    ).get(draftId) as { next: number };
    return r.next;
  }

  // ─── Citations ─────────────────────────────────────────────────────────────

  addCitation(draftId: number, data: Omit<DraftCitationRecord, 'id' | 'inserted_at'>): DraftCitationRecord {
    const res = this.db.prepare(`
      INSERT INTO DraftCitations (draft_id, citation_ref, entity_type, entity_id, node_id)
      VALUES (?,?,?,?,?)
    `).run(draftId, data.citation_ref, data.entity_type, data.entity_id ?? null, data.node_id ?? null);
    return this.db.prepare('SELECT * FROM DraftCitations WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as DraftCitationRecord;
  }

  getCitations(draftId: number): DraftCitationRecord[] {
    return (this.db.prepare(
      'SELECT * FROM DraftCitations WHERE draft_id = ? ORDER BY inserted_at DESC'
    ).all(draftId) as Record<string, unknown>[]).map(mapCitation);
  }

  removeCitation(id: number): void {
    this.db.prepare('DELETE FROM DraftCitations WHERE id = ?').run(id);
  }

  // ─── Evidence Shelf ────────────────────────────────────────────────────────

  addToShelf(draftId: number, data: Omit<EvidenceShelfItemRecord, 'id' | 'inserted_at' | 'created_at'>): EvidenceShelfItemRecord {
    const res = this.db.prepare(`
      INSERT INTO EvidenceShelf
        (draft_id, shelf_type, title, content_he, source_ref, entity_id, entity_type, is_inserted)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      draftId, data.shelf_type, data.title, data.content_he ?? null,
      data.source_ref ?? null, data.entity_id ?? null, data.entity_type ?? null, 0,
    );
    return this.db.prepare('SELECT * FROM EvidenceShelf WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as EvidenceShelfItemRecord;
  }

  getShelf(draftId: number): EvidenceShelfItemRecord[] {
    return (this.db.prepare(
      'SELECT * FROM EvidenceShelf WHERE draft_id = ? ORDER BY created_at DESC'
    ).all(draftId) as Record<string, unknown>[]).map(mapShelfItem);
  }

  markInserted(shelfItemId: number): void {
    this.db.prepare(
      "UPDATE EvidenceShelf SET is_inserted = 1, inserted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    ).run(shelfItemId);
  }

  removeFromShelf(id: number): void {
    this.db.prepare('DELETE FROM EvidenceShelf WHERE id = ?').run(id);
  }

  // ─── Knowledge Graph ───────────────────────────────────────────────────────

  findDraftsUsingCitation(citationRef: string): { id: number; title: string; matter_id: number | null; created_at: string }[] {
    return (this.db.prepare(`
      SELECT DISTINCT d.id, d.title, d.matter_id, d.created_at
      FROM LegalDrafts d
      JOIN DraftCitations dc ON dc.draft_id = d.id
      WHERE dc.citation_ref = ? AND d.is_active = 1
      ORDER BY d.updated_at DESC
      LIMIT 20
    `).all(citationRef) as Record<string, unknown>[]).map((r) => ({
      id:        r['id'] as number,
      title:     r['title'] as string,
      matter_id: (r['matter_id'] as number | null) ?? null,
      created_at: r['created_at'] as string,
    }));
  }

  findDraftsUsingLegalSection(sectionKey: string): { id: number; title: string; created_at: string }[] {
    return (this.db.prepare(`
      SELECT DISTINCT d.id, d.title, d.created_at
      FROM LegalDrafts d
      JOIN EvidenceShelf es ON es.draft_id = d.id
      WHERE es.source_ref = ? AND es.shelf_type = 'legislation' AND d.is_active = 1
      ORDER BY d.updated_at DESC
      LIMIT 20
    `).all(sectionKey) as Record<string, unknown>[]).map((r) => ({
      id:         r['id'] as number,
      title:      r['title'] as string,
      created_at: r['created_at'] as string,
    }));
  }
}
