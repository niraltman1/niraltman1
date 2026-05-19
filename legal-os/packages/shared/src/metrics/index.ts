import { utcNow } from '../utils/index.js';
import type { LogCategory } from '../logging/index.js';

export type MetricUnit = 'ms' | 'bytes' | 'count' | 'ratio' | 'pages';

export interface Metric {
  readonly name:        string;
  readonly value:       number;
  readonly unit:        MetricUnit;
  readonly agent:       string;
  readonly documentId?: number;
  readonly tags?:       Record<string, string | number>;
  readonly recordedAt:  string;
}

type MetricSink = (metric: Metric) => void;

/**
 * In-process metrics collector.
 * Metrics are pushed to registered sinks (e.g. SQLite, console).
 * Non-blocking – a failing sink never crashes the caller.
 */
export class MetricsCollector {
  private readonly sinks: MetricSink[] = [];

  addSink(sink: MetricSink): void {
    this.sinks.push(sink);
  }

  record(
    name: string,
    value: number,
    unit: MetricUnit,
    agent: string,
    documentId?: number,
    tags?: Record<string, string | number>,
  ): void {
    const metric: Metric = {
      name, value, unit, agent, recordedAt: utcNow(),
      ...(documentId !== undefined && { documentId }),
      ...(tags       !== undefined && { tags }),
    };
    for (const sink of this.sinks) {
      try { sink(metric); } catch { /* non-fatal */ }
    }
  }

  /**
   * Convenience: times a synchronous operation and records its duration.
   */
  time<T>(name: string, agent: string, fn: () => T, documentId?: number): T {
    const start = Date.now();
    try {
      return fn();
    } finally {
      this.record(name, Date.now() - start, 'ms', agent, documentId);
    }
  }

  /**
   * Convenience: times an async operation and records its duration.
   */
  async timeAsync<T>(name: string, agent: string, fn: () => Promise<T>, documentId?: number): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.record(name, Date.now() - start, 'ms', agent, documentId);
    }
  }
}

/** Singleton metrics collector for the application. */
export const metrics = new MetricsCollector();
