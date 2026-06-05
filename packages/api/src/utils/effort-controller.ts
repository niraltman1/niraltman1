/**
 * Effort Controller — CPU-aware batch throttling.
 *
 * Measures real CPU utilization between work units and inserts
 * adaptive pauses when usage exceeds the configured ceiling (default 70%).
 *
 * Design:
 *  - Uses process.cpuUsage() delta between ticks for accurate per-interval measurement.
 *  - Inserts an exponential back-off pause (50ms … 2000ms) when over ceiling.
 *  - Resumes immediately when CPU drops below the resume threshold.
 *  - Wraps any async batch operation; the caller just awaits `throttle()`.
 *
 * Usage:
 *   const ctl = new EffortController({ ceilPercent: 70 });
 *   for (const item of batch) {
 *     await processItem(item);
 *     await ctl.throttle();   // ← pauses if CPU is hot
 *   }
 *   ctl.report();             // ← logs stats
 */

const DEFAULT_CEIL_PCT    = 70;   // pause above this CPU %
const RESUME_PCT          = 55;   // resume when CPU drops below this
const SAMPLE_INTERVAL_MS  = 250;  // CPU sample window
const MIN_PAUSE_MS        = 50;
const MAX_PAUSE_MS        = 2_000;
const PAUSE_BACKOFF       = 1.5;  // exponential multiplier

interface EffortOptions {
  ceilPercent?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Measures CPU % over `windowMs` milliseconds. Returns 0–100. */
async function sampleCpu(windowMs = SAMPLE_INTERVAL_MS): Promise<number> {
  const before = process.cpuUsage();
  const tBefore = Date.now();
  await sleep(windowMs);
  const after = process.cpuUsage(before);
  const elapsed = (Date.now() - tBefore) * 1_000; // µs
  const totalUsed = after.user + after.system;
  return Math.min(100, (totalUsed / elapsed) * 100);
}

export class EffortController {
  private readonly ceil: number;
  private currentPause = MIN_PAUSE_MS;
  private totalThrottledMs = 0;
  private throttleCount = 0;
  private workUnits = 0;
  private lastSampleAt = 0;

  constructor(opts: EffortOptions = {}) {
    this.ceil = opts.ceilPercent ?? DEFAULT_CEIL_PCT;
  }

  /** Call after each work unit. Inserts an adaptive pause if CPU is over ceiling. */
  async throttle(): Promise<void> {
    this.workUnits++;

    // Rate-limit CPU sampling — sampleCpu() sleeps SAMPLE_INTERVAL_MS each call,
    // so calling it per file in large batches would stall throughput. Only sample
    // once per interval wall-clock time.
    const now = Date.now();
    if (now - this.lastSampleAt < SAMPLE_INTERVAL_MS) {
      return;
    }

    const cpu = await sampleCpu();
    this.lastSampleAt = Date.now();

    if (cpu < this.ceil) {
      // Healthy — reset back-off
      this.currentPause = MIN_PAUSE_MS;
      return;
    }

    // Over ceiling — pause and wait for CPU to cool
    this.throttleCount++;
    let waited = 0;
    while (true) {
      const pause = Math.min(this.currentPause, MAX_PAUSE_MS);
      await sleep(pause);
      waited += pause;
      this.totalThrottledMs += pause;
      this.currentPause = Math.min(this.currentPause * PAUSE_BACKOFF, MAX_PAUSE_MS);

      const nowCpu = await sampleCpu();
      if (nowCpu < RESUME_PCT || waited > 10_000) break; // resume or hard cap
    }
  }

  report(): EffortReport {
    return {
      workUnits:      this.workUnits,
      throttleCount:  this.throttleCount,
      totalThrottledMs: this.totalThrottledMs,
      ceilPercent:    this.ceil,
    };
  }
}

export interface EffortReport {
  workUnits:        number;
  throttleCount:    number;
  totalThrottledMs: number;
  ceilPercent:      number;
}
