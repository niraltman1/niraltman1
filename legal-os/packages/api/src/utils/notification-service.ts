export interface NotificationService {
  send(phone: string, message: string): Promise<void>;
}

export class ConsoleNotificationService implements NotificationService {
  async send(phone: string, message: string): Promise<void> {
    console.log(`[WhatsApp stub] → ${phone}: ${message}`);
  }
}

export const notificationService: NotificationService = new ConsoleNotificationService();
