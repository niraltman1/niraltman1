-- In-app notification inbox. Strictly additive — does not modify any existing table.
-- Rows are written by the alert generators (deadline tracker, insolvency nudge, queue).
-- dedup_key makes generator writes idempotent across their (daily) polling cycles.
--
-- kind values:     statute_deadline | task_due | form5_gap | queue_stuck | overdue_tasks
-- severity values: info | warning | critical
-- link_type values: case | client | document | route

CREATE TABLE IF NOT EXISTS Notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL,
  severity    TEXT    NOT NULL DEFAULT 'info',
  title_he    TEXT    NOT NULL,
  body_he     TEXT,
  link_type   TEXT,
  link_id     TEXT,
  dedup_key   TEXT    NOT NULL,
  read_at     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_dedup   ON Notifications(dedup_key);
CREATE        INDEX IF NOT EXISTS idx_notif_read    ON Notifications(read_at);
CREATE        INDEX IF NOT EXISTS idx_notif_created ON Notifications(created_at);
