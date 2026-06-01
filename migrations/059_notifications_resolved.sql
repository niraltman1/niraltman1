-- Auto-resolution for the notification inbox (§4.1.3 deferred follow-up).
-- A notification is "resolved" once its underlying condition no longer holds
-- (task completed/deleted, case closed, Form-5 filing left Pre_Filing / no gaps).
-- Resolved rows are hidden from the inbox and excluded from the unread count.
-- Strictly additive.

ALTER TABLE Notifications ADD COLUMN resolved_at TEXT;

CREATE INDEX IF NOT EXISTS idx_notif_resolved ON Notifications(resolved_at);
