/**
 * modules/notifications — Business logic extracted from routes/notifications.ts.
 *
 * Covers:
 *   - clampLimit: validate and clamp a user-supplied limit to a safe range
 *   - buildNotificationPage: fetch recent items + unread count as a combined result
 */

import type { NotificationsRepository } from '@factum-il/database';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NotificationPage {
  items: ReturnType<NotificationsRepository['listRecent']>;
  unread: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Clamp a raw user-supplied limit value into the allowed range [1, 200].
 * Non-finite values fall back to the default of 50.
 */
export function clampLimit(raw: unknown, defaultLimit = 50): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return defaultLimit;
  return Math.min(Math.max(n, 1), 200);
}

/**
 * Fetch the most recent notifications and the current unread count in one call.
 * Keeps the route handler to a single delegating line.
 */
export function buildNotificationPage(
  notifications: NotificationsRepository,
  limit: number,
): NotificationPage {
  return {
    items:  notifications.listRecent(limit),
    unread: notifications.unreadCount(),
  };
}
