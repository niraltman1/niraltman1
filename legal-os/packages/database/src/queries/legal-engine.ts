import type { DatabaseConnection } from '../connection.js';
import type {
  RegulationTemplate,
  TemplateMilestone,
  CaseProcedure,
  CreateTemplateInput,
  CreateMilestoneInput,
} from '@legal-os/shared';

export class LegalEngineRepository {
  constructor(private readonly db: DatabaseConnection) {}

  // ─────────────────────────────────────────────
  //  Templates
  // ─────────────────────────────────────────────

  listTemplates(status?: string): RegulationTemplate[] {
    const rows = status
      ? this.db.prepare(
          `SELECT * FROM RegulationTemplates WHERE status = ? ORDER BY case_type`
        ).all(status) as Record<string, unknown>[]
      : this.db.prepare(
          `SELECT * FROM RegulationTemplates ORDER BY case_type`
        ).all() as Record<string, unknown>[];
    return rows.map((r) => this.mapTemplate(r));
  }

  findTemplateByCaseType(caseType: string): RegulationTemplate | null {
    const row = this.db.prepare(
      `SELECT * FROM RegulationTemplates WHERE case_type = ? AND status = 'active' LIMIT 1`
    ).get(caseType) as Record<string, unknown> | undefined;
    return row ? this.mapTemplate(row) : null;
  }

  findTemplateById(id: number): RegulationTemplate | null {
    const row = this.db.prepare(
      `SELECT * FROM RegulationTemplates WHERE id = ?`
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapTemplate(row) : null;
  }

  createTemplate(input: CreateTemplateInput): RegulationTemplate {
    const result = this.db.prepare(`
      INSERT INTO RegulationTemplates
        (case_type, name_he, name_en, legal_basis, source_url, source_text,
         status, ai_generated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.caseType,
      input.nameHe,
      input.nameEn      ?? null,
      input.legalBasis  ?? null,
      input.sourceUrl   ?? null,
      input.sourceText  ?? null,
      input.status      ?? 'draft',
      input.aiGenerated ? 1 : 0,
    );
    return this.findTemplateById(result.lastInsertRowid as number)!;
  }

  approveTemplate(id: number): RegulationTemplate | null {
    // Deprecate any previously active template for this case_type first
    const tpl = this.findTemplateById(id);
    if (!tpl) return null;

    this.db.prepare(`
      UPDATE RegulationTemplates SET status = 'deprecated'
      WHERE case_type = ? AND status = 'active' AND id != ?
    `).run(tpl.caseType, id);

    this.db.prepare(`
      UPDATE RegulationTemplates
      SET status = 'active', approved_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
    return this.findTemplateById(id);
  }

  deprecateTemplate(id: number): void {
    this.db.prepare(`
      UPDATE RegulationTemplates SET status = 'deprecated', updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
  }

  // ─────────────────────────────────────────────
  //  Milestones
  // ─────────────────────────────────────────────

  getMilestones(templateId: number): TemplateMilestone[] {
    const rows = this.db.prepare(`
      SELECT * FROM TemplateMilestones
      WHERE template_id = ?
      ORDER BY sequence_order ASC
    `).all(templateId) as Record<string, unknown>[];
    return rows.map((r) => this.mapMilestone(r));
  }

  replaceMilestones(templateId: number, milestones: CreateMilestoneInput[]): TemplateMilestone[] {
    this.db.prepare(`DELETE FROM TemplateMilestones WHERE template_id = ?`).run(templateId);
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i]!;
      this.db.prepare(`
        INSERT INTO TemplateMilestones
          (template_id, sequence_order, title_he, title_en, description,
           day_offset, anchor, is_mandatory, task_priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        templateId,
        i + 1,
        m.titleHe,
        m.titleEn        ?? null,
        m.description    ?? null,
        m.dayOffset      ?? null,
        m.anchor         ?? 'filing',
        m.isMandatory    !== false ? 1 : 0,
        m.taskPriority   ?? 'normal',
      );
    }
    return this.getMilestones(templateId);
  }

  // ─────────────────────────────────────────────
  //  Case Procedures
  // ─────────────────────────────────────────────

  getProcedure(caseId: number): CaseProcedure | null {
    const row = this.db.prepare(`
      SELECT cp.*, rt.name_he AS template_name, rt.case_type
      FROM CaseProcedures cp
      JOIN RegulationTemplates rt ON rt.id = cp.template_id
      WHERE cp.case_id = ?
    `).get(caseId) as Record<string, unknown> | undefined;
    return row ? this.mapProcedure(row) : null;
  }

  applyTemplate(caseId: number, templateId: number, anchorDate: string): CaseProcedure {
    // Upsert: replace existing procedure if any
    this.db.prepare(`
      INSERT INTO CaseProcedures (case_id, template_id, anchor_date)
      VALUES (?, ?, ?)
      ON CONFLICT(case_id) DO UPDATE SET
        template_id  = excluded.template_id,
        anchor_date  = excluded.anchor_date,
        status       = 'active',
        updated_at   = datetime('now')
    `).run(caseId, templateId, anchorDate);
    return this.getProcedure(caseId)!;
  }

  updateProcedure(caseId: number, updates: { anchorDate?: string; status?: string; notes?: string }): CaseProcedure | null {
    const fields: string[] = ["updated_at = datetime('now')"];
    const args: unknown[]  = [];
    if (updates.anchorDate !== undefined) { fields.push('anchor_date = ?'); args.push(updates.anchorDate); }
    if (updates.status     !== undefined) { fields.push('status = ?');      args.push(updates.status); }
    if (updates.notes      !== undefined) { fields.push('notes = ?');       args.push(updates.notes); }
    args.push(caseId);
    this.db.prepare(`UPDATE CaseProcedures SET ${fields.join(', ')} WHERE case_id = ?`).run(...args);
    return this.getProcedure(caseId);
  }

  // ─────────────────────────────────────────────
  //  Mapping
  // ─────────────────────────────────────────────

  private mapTemplate(r: Record<string, unknown>): RegulationTemplate {
    return {
      id:          r['id'] as number,
      caseType:    r['case_type'] as string,
      nameHe:      r['name_he'] as string,
      nameEn:      (r['name_en'] as string | null) ?? null,
      legalBasis:  (r['legal_basis'] as string | null) ?? null,
      sourceUrl:   (r['source_url'] as string | null) ?? null,
      sourceText:  (r['source_text'] as string | null) ?? null,
      status:      r['status'] as RegulationTemplate['status'],
      aiGenerated: (r['ai_generated'] as number) === 1,
      approvedAt:  (r['approved_at'] as string | null) ?? null,
      createdAt:   r['created_at'] as string,
      updatedAt:   r['updated_at'] as string,
    };
  }

  private mapMilestone(r: Record<string, unknown>): TemplateMilestone {
    return {
      id:            r['id'] as number,
      templateId:    r['template_id'] as number,
      sequenceOrder: r['sequence_order'] as number,
      titleHe:       r['title_he'] as string,
      titleEn:       (r['title_en'] as string | null) ?? null,
      description:   (r['description'] as string | null) ?? null,
      dayOffset:     (r['day_offset'] as number | null) ?? null,
      anchor:        r['anchor'] as TemplateMilestone['anchor'],
      isMandatory:   (r['is_mandatory'] as number) === 1,
      taskPriority:  r['task_priority'] as TemplateMilestone['taskPriority'],
      createdAt:     r['created_at'] as string,
    };
  }

  private mapProcedure(r: Record<string, unknown>): CaseProcedure {
    return {
      id:           r['id'] as number,
      caseId:       r['case_id'] as number,
      templateId:   r['template_id'] as number,
      templateName: (r['template_name'] as string | null) ?? null,
      anchorDate:   r['anchor_date'] as string,
      status:       r['status'] as CaseProcedure['status'],
      notes:        (r['notes'] as string | null) ?? null,
      createdAt:    r['created_at'] as string,
      updatedAt:    r['updated_at'] as string,
    };
  }
}
