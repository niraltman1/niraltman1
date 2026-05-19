import type { DatabaseConnection } from '../connection.js';

export interface StensTemplate {
  id:           number;
  nameHe:       string;
  nameEn:       string | null;
  category:     string;
  formSchema:   string;  // JSON
  instructions: string | null;
  legalBasis:   string | null;
  version:      string;
  contentHash:  string | null;
  isActive:     boolean;
  lastUpdated:  string;
  createdAt:    string;
}

export interface StensSubmission {
  id:           number;
  templateId:   number;
  caseId:       number | null;
  clientId:     number | null;
  fieldValues:  string;  // JSON
  aiFilled:     boolean;
  aiConfidence: number | null;
  status:       'draft' | 'completed' | 'submitted';
  createdAt:    string;
  updatedAt:    string;
}

export interface CreateStensTemplateInput {
  nameHe:       string;
  nameEn?:      string | null;
  category?:    string;
  formSchema:   string;
  instructions?: string | null;
  legalBasis?:  string | null;
  version?:     string;
  contentHash?: string | null;
}

export interface CreateStensSubmissionInput {
  templateId:   number;
  caseId?:      number | null;
  clientId?:    number | null;
  fieldValues:  string;
  aiFilled?:    boolean;
  aiConfidence?: number | null;
}

export interface StensTemplateUpdate {
  nameHe:      string;
  category:    string;
  formSchema:  string;
  version:     string;
  contentHash: string;
}

function mapTemplate(r: Record<string, unknown>): StensTemplate {
  return {
    id:           Number(r['id']),
    nameHe:       String(r['name_he'] ?? ''),
    nameEn:       r['name_en']      != null ? String(r['name_en'])      : null,
    category:     String(r['category'] ?? 'general'),
    formSchema:   String(r['form_schema'] ?? '[]'),
    instructions: r['instructions'] != null ? String(r['instructions']) : null,
    legalBasis:   r['legal_basis']  != null ? String(r['legal_basis'])  : null,
    version:      String(r['version'] ?? '1.0'),
    contentHash:  r['content_hash'] != null ? String(r['content_hash']) : null,
    isActive:     Number(r['is_active'] ?? 1) === 1,
    lastUpdated:  String(r['last_updated'] ?? ''),
    createdAt:    String(r['created_at']   ?? ''),
  };
}

function mapSubmission(r: Record<string, unknown>): StensSubmission {
  return {
    id:           Number(r['id']),
    templateId:   Number(r['template_id']),
    caseId:       r['case_id']   != null ? Number(r['case_id'])   : null,
    clientId:     r['client_id'] != null ? Number(r['client_id']) : null,
    fieldValues:  String(r['field_values'] ?? '{}'),
    aiFilled:     Number(r['ai_filled'] ?? 0) === 1,
    aiConfidence: r['ai_confidence'] != null ? Number(r['ai_confidence']) : null,
    status:       (r['status'] ?? 'draft') as StensSubmission['status'],
    createdAt:    String(r['created_at'] ?? ''),
    updatedAt:    String(r['updated_at'] ?? ''),
  };
}

export class StensRepository {
  constructor(private readonly db: DatabaseConnection) {}

  listTemplates(category?: string): StensTemplate[] {
    if (category) {
      return (this.db.prepare(
        `SELECT * FROM StensTemplates WHERE category = ? AND is_active = 1 ORDER BY name_he`,
      ).all(category) as Record<string, unknown>[]).map(mapTemplate);
    }
    return (this.db.prepare(
      `SELECT * FROM StensTemplates WHERE is_active = 1 ORDER BY category, name_he`,
    ).all() as Record<string, unknown>[]).map(mapTemplate);
  }

  findTemplateById(id: number): StensTemplate | null {
    const row = this.db.prepare(
      `SELECT * FROM StensTemplates WHERE id = ?`,
    ).get(id) as Record<string, unknown> | undefined;
    return row ? mapTemplate(row) : null;
  }

  createTemplate(input: CreateStensTemplateInput): StensTemplate {
    const result = this.db.prepare(`
      INSERT INTO StensTemplates (name_he, name_en, category, form_schema, instructions, legal_basis, version, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.nameHe,
      input.nameEn       ?? null,
      input.category     ?? 'general',
      input.formSchema,
      input.instructions ?? null,
      input.legalBasis   ?? null,
      input.version      ?? '1.0',
      input.contentHash  ?? null,
    );
    return this.findTemplateById(Number(result.lastInsertRowid))!;
  }

  createSubmission(input: CreateStensSubmissionInput): StensSubmission {
    const result = this.db.prepare(`
      INSERT INTO StensSubmissions (template_id, case_id, client_id, field_values, ai_filled, ai_confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.templateId,
      input.caseId      ?? null,
      input.clientId    ?? null,
      input.fieldValues,
      input.aiFilled    ? 1 : 0,
      input.aiConfidence ?? null,
    );
    return this.getSubmission(Number(result.lastInsertRowid))!;
  }

  updateSubmission(id: number, fieldValues: string, status?: string): StensSubmission | null {
    this.db.prepare(`
      UPDATE StensSubmissions
      SET field_values = ?, status = COALESCE(?, status),
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?
    `).run(fieldValues, status ?? null, id);
    return this.getSubmission(id);
  }

  getSubmission(id: number): StensSubmission | null {
    const row = this.db.prepare(
      `SELECT * FROM StensSubmissions WHERE id = ?`,
    ).get(id) as Record<string, unknown> | undefined;
    return row ? mapSubmission(row) : null;
  }

  listSubmissions(filters: { caseId?: number; clientId?: number } = {}): StensSubmission[] {
    const conds: string[] = [];
    const args:  unknown[] = [];
    if (filters.caseId   != null) { conds.push('case_id = ?');   args.push(filters.caseId); }
    if (filters.clientId != null) { conds.push('client_id = ?'); args.push(filters.clientId); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    return (this.db.prepare(
      `SELECT * FROM StensSubmissions ${where} ORDER BY updated_at DESC`,
    ).all(...args) as Record<string, unknown>[]).map(mapSubmission);
  }

  applyContentUpdate(updates: StensTemplateUpdate[]): { applied: number; skipped: number } {
    let applied = 0;
    let skipped = 0;
    for (const u of updates) {
      const existing = this.db.prepare(
        `SELECT id, content_hash FROM StensTemplates WHERE name_he = ? AND category = ?`,
      ).get(u.nameHe, u.category) as { id: number; content_hash: string | null } | undefined;

      if (existing && existing.content_hash === u.contentHash) {
        skipped++;
        continue;
      }
      if (existing) {
        this.db.prepare(`
          UPDATE StensTemplates
          SET form_schema = ?, version = ?, content_hash = ?,
              last_updated = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?
        `).run(u.formSchema, u.version, u.contentHash, existing.id);
      } else {
        this.db.prepare(`
          INSERT INTO StensTemplates (name_he, category, form_schema, version, content_hash)
          VALUES (?, ?, ?, ?, ?)
        `).run(u.nameHe, u.category, u.formSchema, u.version, u.contentHash);
      }
      applied++;
    }
    return { applied, skipped };
  }
}
