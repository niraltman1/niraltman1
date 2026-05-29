export interface NotificationService {
  send(phone: string, message: string): Promise<void>;
}

export class ConsoleNotificationService implements NotificationService {
  async send(phone: string, _message: string): Promise<void> {
    console.log(`[WhatsApp stub] → ${phone.slice(0, 4)}***`);
  }
}

export const notificationService: NotificationService = new ConsoleNotificationService();
