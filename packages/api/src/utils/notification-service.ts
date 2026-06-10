/**
 * External messaging stub — in-app notifications only (policy: B3).
 *
 * WhatsApp delivery (C2) is a Phase 4 item. Until it is wired, `send()` is a
 * silent no-op. All alert content is persisted to the Notifications inbox via
 * NotificationsRepository before this method is called; the in-app record is
 * the primary delivery mechanism.
 */

export interface NotificationService {
  send(phone: string, message: string): Promise<void>;
}

class NoOpNotificationService implements NotificationService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async send(_phone: string, _message: string): Promise<void> {
    // No-op: WhatsApp delivery not yet implemented (Phase 4 C2).
  }
}

export const notificationService: NotificationService = new NoOpNotificationService();
