import { randomBytes } from 'node:crypto';
import type { DatabaseConnection } from '../connection.js';
import type { CommChannel } from './communications.js';

/**
 * Communication smart templates (C4). Templates carry {{placeholders}} and are matched to a
 * conversation's context (Case Type × Case Status × Channel; NULL column = wildcard). Rendering
 * is a pure function over a resolved variable map. Secure links issue tokenised LOCAL URLs.
 */

export interface CommTemplate {
  id:           number;
  nameHe:       string;
  body:         string;
  channel:      CommChannel | null;
  caseType:     string | null;
  caseStatus:   string | null;
  clientStatus: 'active' | 'inactive' | null;
}

export interface TemplateContext {
  channel?:      CommChannel;
  caseType?:     string | null;
  caseStatus?:   string | null;
  clientActive?: boolean;
}

export interface SecureLinkInput {
  purpose:     'sign' | 'upload' | 'view';
  caseId?:     number | null;
  documentId?: number | null;
  createdBy?:  number | null;
  ttlHours?:   number;
}

function mapTemplate(r: Record<string, unknown>): CommTemplate {
  return {
    id:           r['id'] as number,
    nameHe:       r['name_he'] as string,
    body:         r['body'] as string,
    channel:      (r['channel'] as CommChannel | null) ?? null,
    caseType:     (r['case_type'] as string | null) ?? null,
    caseStatus:   (r['case_status'] as string | null) ?? null,
    clientStatus: (r['client_status'] as 'active' | 'inactive' | null) ?? null,
  };
}

export class CommTemplatesRepository {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Substitute {{key}} placeholders from `vars`. Unknown placeholders become '—' so raw
   * braces never reach the client. Pure — no DB access, fully unit-testable.
   */
  static render(body: string, vars: Record<string, string>): string {
    return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
      const v = vars[key];
      return v !== undefined && v !== '' ? v : '—';
    });
  }

  listTemplates(includeInactive = false, limit = 200): CommTemplate[] {
    const cap = Math.min(limit, 500);
    const sql = `SELECT * FROM CommTemplates ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY name_he LIMIT ${cap}`;
    return (this.db.prepare(sql).all() as Record<string, unknown>[]).map(mapTemplate);
  }

  getTemplate(id: number): CommTemplate | null {
    const r = this.db.prepare('SELECT * FROM CommTemplates WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? mapTemplate(r) : null;
  }

  /**
   * Templates whose non-null criteria all match the context, ordered most-specific first
   * (a template that pins case_type/status/channel ranks above a generic wildcard one).
   */
  matchTemplates(ctx: TemplateContext): CommTemplate[] {
    const clientStatus = ctx.clientActive === undefined ? null : ctx.clientActive ? 'active' : 'inactive';
    const rows = this.db.prepare(`
      SELECT *,
        ((case_type   IS NOT NULL) + (case_status IS NOT NULL)
       + (channel     IS NOT NULL) + (client_status IS NOT NULL)) AS specificity
      FROM CommTemplates
      WHERE is_active = 1
        AND (case_type     IS NULL OR case_type     = ?)
        AND (case_status   IS NULL OR case_status   = ?)
        AND (channel       IS NULL OR channel       = ?)
        AND (client_status IS NULL OR client_status = ?)
      ORDER BY specificity DESC, name_he
    `).all(
      ctx.caseType ?? null,
      ctx.caseStatus ?? null,
      ctx.channel ?? null,
      clientStatus,
    ) as Record<string, unknown>[];
    return rows.map(mapTemplate);
  }

  /** Issue a single-purpose secure link token (URL is composed by the API from base + token). */
  createSecureLink(input: SecureLinkInput): { token: string; expiresAt: string | null } {
    const token = randomBytes(24).toString('hex');
    const expiresAt = input.ttlHours
      ? new Date(Date.now() + input.ttlHours * 3_600_000).toISOString()
      : null;
    this.db.prepare(`
      INSERT INTO CommSecureLinks (token, purpose, case_id, document_id, created_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(token, input.purpose, input.caseId ?? null, input.documentId ?? null,
           input.createdBy ?? null, expiresAt);
    return { token, expiresAt };
  }

  /** Resolve a secure link token (for the local signing/upload page). */
  resolveSecureLink(token: string): {
    id: number; purpose: string; caseId: number | null; documentId: number | null;
    expiresAt: string | null; usedAt: string | null;
  } | null {
    const r = this.db.prepare(
      'SELECT id, purpose, case_id, document_id, expires_at, used_at FROM CommSecureLinks WHERE token = ?',
    ).get(token) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id:         r['id'] as number,
      purpose:    r['purpose'] as string,
      caseId:     (r['case_id'] as number | null) ?? null,
      documentId: (r['document_id'] as number | null) ?? null,
      expiresAt:  (r['expires_at'] as string | null) ?? null,
      usedAt:     (r['used_at'] as string | null) ?? null,
    };
  }
}
