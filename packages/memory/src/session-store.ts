export class SessionStore {
  private readonly data = new Map<string, unknown>();

  set<T>(key: string, value: T): void {
    this.data.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  clear(): void {
    this.data.clear();
  }
}

export const sessionStore = new SessionStore();
