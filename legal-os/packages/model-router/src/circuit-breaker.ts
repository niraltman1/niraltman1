const FAILURE_LIMIT = 3;
const RESET_MS      = 60_000;

export class ModelCircuitBreaker {
  private failures = 0;
  private openedAt = 0;

  readonly modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  isOpen(): boolean {
    if (this.failures < FAILURE_LIMIT) return false;
    if (Date.now() - this.openedAt > RESET_MS) {
      this.failures = 0; // half-open: allow one probe
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
  }

  recordFailure(): void {
    this.failures++;
    if (this.failures >= FAILURE_LIMIT) this.openedAt = Date.now();
  }

  status(): { open: boolean; failures: number; resetAt: string | null } {
    return {
      open:     this.isOpen(),
      failures: this.failures,
      resetAt:  this.failures >= FAILURE_LIMIT
        ? new Date(this.openedAt + RESET_MS).toISOString()
        : null,
    };
  }
}
