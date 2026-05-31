import type { DatabaseConnection } from '../connection.js';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export type NotificationKind =
  | 'statute_deadline'
  | 'task_due'
  | 'form5_gap'
  | 'queue_stuck'
  | 'overdue_tasks';

export type NotificationLinkType = 'case' | 'client' | 'document' | 'route';

export interface NotificationRow {
  readonly id:        number;
  readonly kind:      string;
  readonly severity:  NotificationSeverity;
  readonly titleHe:   string;
  readonly bodyHe:    string | null;
  readonly linkType:  string | null;
  readonly linkId:    string | null;
  readonly dedupKey:  string;
  readonly readAt:    string | null;
  readonly createdAt: string;
}

export interface UpsertNotificationInput {
  kind:      NotificationKind | string;
  severity?: NotificationSeverity;
  titleHe:   string;
  bodyHe?:   string | null;
  linkType?: NotificationLinkType | null;
  linkId?:   string | null;
  dedupKey:  string;
}

function mapRow(r: Record<string, unknown>): NotificationRow {
  return {
    id:        r['id']         as number,
    kind:      r['kind']       as string,
    severity:  r['severity']   as NotificationSeverity,
    titleHe:   r['title_he']   as string,
    bodyHe:    (r['body_he']   as string | null) ?? null,
    linkType:  (r['link_type'] as string | null) ?? null,
    linkId:    (r['link_id']   as string | null) ?? null,
    dedupKey:  r['dedup_key']  as string,
    readAt:    (r['read_at']   as string | null) ?? null,
    createdAt: r['created_at'] as string,
  };
}

export class NotificationsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Idempotent insert. Generators call this every (daily) cycle; the unique
   * dedup_key index + ON CONFLICT DO NOTHING means the same alert is recorded once.
   */
  upsert(input: UpsertNotificationInput): void {
    this.db.prepare(`
      INSERT INTO Notifications
        (kind, severity, title_he, body_he, link_type, link_id, dedup_key)
      VALUES
        (@kind, @severity, @titleHe, @bodyHe, @linkType, @linkId, @dedupKey)
      ON CONFLICT(dedup_key) DO NOTHING
    `).run({
      kind:     input.kind,
      severity: input.severity ?? 'info',
      titleHe:  input.titleHe,
      bodyHe:   input.bodyHe   ?? null,
      linkType: input.linkType ?? null,
      linkId:   input.linkId   ?? null,
      dedupKey: input.dedupKey,
    });
  }

  listRecent(limit = 50): NotificationRow[] {
    const rows = this.db.prepare(
      'SELECT * FROM Notifications ORDER BY created_at DESC LIMIT ?',
    ).all(limit) as Record<string, unknown>[];
    return rows.map(mapRow);
  }

  unreadCount(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) AS n FROM Notifications WHERE read_at IS NULL',
    ).get() as { n: number };
    return row.n;
  }

  markRead(id: number): void {
    this.db.prepare(
      "UPDATE Notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND read_at IS NULL",
    ).run(id);
  }

  markAllRead(): number {
    return (this.db.prepare(
      "UPDATE Notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE read_at IS NULL",
    ).run() as { changes: number }).changes;
  }
}
