/**
 * modules/communications — Business logic extracted from routes/communications.ts.
 *
 * Covers:
 *   - resolveCaseVars: multi-query template variable resolution
 *   - buildInboxSummary: per-channel unread count + urgency aggregation
 *   - heDate: Hebrew locale date formatter (shared utility)
 */

import type { DatabaseConnection } from '@factum-il/database';
import type { CommChannel } from '@factum-il/database';

// ── Environment constants ────────────────────────────────────────────────────

const LINK_BASE = process.env['COMM_LINK_BASE_URL'] ?? 'http://localhost';
const FIRM_NAME = process.env['COMM_FIRM_NAME'] ?? 'המשרד';

// ── Types ────────────────────────────────────────────────────────────────────

interface CaseVarRow {
  case_number: string;
  title_he: string;
  court_name: string | null;
  client_id: number | null;
  status: string;
  case_type: string;
}

interface SecureLinkMinter {
  createSecureLink(opts: {
    purpose: 'sign' | 'upload';
    caseId: number;
    createdBy: number | null;
    ttlHours: number;
  }): { token: string };
}

interface SummaryRow {
  channel: string;
  unread: number;
  urgency_rank: number;
}

export interface InboxChannelSummary {
  channel: string;
  unread: number;
  urgency: 'normal' | 'high' | 'critical';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format an ISO date string as a Hebrew locale date (DD/MM/YYYY).
 * Returns empty string for null/undefined; falls back to the original string on error.
 */
export function heDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ── Template variable resolution ─────────────────────────────────────────────

/**
 * Resolve the Mustache-style variable map for a given case.
 * When `mint` is true, real one-use secure links are created for
 * {{sign_link}} / {{upload_link}} placeholders; when false, placeholder
 * text is used instead (for preview purposes).
 *
 * Performs up to 3 DB queries (case row, client name, next hearing).
 */
export function resolveCaseVars(
  db: DatabaseConnection,
  commTemplates: SecureLinkMinter,
  caseId: number,
  body: string,
  userId: number | null,
  mint: boolean,
): Record<string, string> {
  const c = db.prepare(
    'SELECT case_number, title_he, court_name, client_id, status, case_type FROM Cases WHERE id = ?',
  ).get(caseId) as CaseVarRow | undefined;

  const clientName =
    c?.client_id != null
      ? (db
          .prepare('SELECT name_he FROM Clients WHERE id = ?')
          .get(c.client_id) as { name_he: string } | undefined)?.name_he
      : undefined;

  const hearing = db.prepare(
    "SELECT hearing_date FROM court_hearings WHERE case_id = ? AND hearing_date >= date('now') ORDER BY hearing_date ASC LIMIT 1",
  ).get(caseId) as { hearing_date: string } | undefined;

  const vars: Record<string, string> = {
    client_name:  clientName ?? '',
    case_number:  c?.case_number ?? '',
    case_title:   c?.title_he ?? '',
    court_name:   c?.court_name ?? '',
    next_hearing: heDate(hearing?.hearing_date ?? null),
    today:        new Date().toLocaleDateString('he-IL'),
    firm_name:    FIRM_NAME,
  };

  const wantsSign   = body.includes('{{sign_link}}');
  const wantsUpload = body.includes('{{upload_link}}');

  if (mint) {
    if (wantsSign) {
      const { token } = commTemplates.createSecureLink({ purpose: 'sign', caseId, createdBy: userId, ttlHours: 168 });
      vars['sign_link'] = `${LINK_BASE}/secure/${token}`;
    }
    if (wantsUpload) {
      const { token } = commTemplates.createSecureLink({ purpose: 'upload', caseId, createdBy: userId, ttlHours: 168 });
      vars['upload_link'] = `${LINK_BASE}/secure/${token}`;
    }
  } else {
    if (wantsSign)   vars['sign_link']   = '[קישור מאובטח לחתימה]';
    if (wantsUpload) vars['upload_link'] = '[קישור מאובטח להעלאה]';
  }

  return vars;
}

// ── Inbox summary aggregation ─────────────────────────────────────────────────

/**
 * Aggregate unread message counts and urgency per channel from CommConversations.
 * Urgency mapping: ai_urgency='urgent' → critical; 'normal' → high; else → normal.
 */
export function buildInboxSummary(db: DatabaseConnection): InboxChannelSummary[] {
  const rows = db.prepare(`
    SELECT c.channel,
           COUNT(m.id) AS unread,
           MAX(CASE WHEN m.ai_urgency = 'urgent' THEN 2 WHEN m.ai_urgency = 'normal' THEN 1 ELSE 0 END) AS urgency_rank
      FROM CommConversations c
      JOIN CommMessages m ON m.conversation_id = c.id
     WHERE c.status = 'open' AND m.handled = 0 AND m.direction = 'inbound'
     GROUP BY c.channel
  `).all() as SummaryRow[];

  return rows.map((r) => ({
    channel: r.channel as CommChannel,
    unread:  r.unread,
    urgency: (r.urgency_rank >= 2 ? 'critical' : r.urgency_rank >= 1 ? 'high' : 'normal') as InboxChannelSummary['urgency'],
  }));
}
