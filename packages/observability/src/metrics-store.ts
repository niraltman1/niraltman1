import { metrics } from '@factum-il/shared';
import type { Metric } from '@factum-il/shared';

// Duck-typed interface — matches better-sqlite3 Statement shape
interface PreparedStatement {
  run(...args: (string | number | null | undefined)[]): void;
}
interface DbHandle {
  prepare(sql: string): PreparedStatement;
}

export class MetricsStore {
  private stmt: PreparedStatement | null = null;
  private batch: Metric[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly db: DbHandle) {
    this.stmt = db.prepare(`
      INSERT INTO Metrics (name, value, unit, agent, document_id, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    // Flush every 5 seconds to avoid write amplification
    this.timer = setInterval(() => this.flush(), 5_000);
    // Don't block process exit
    if (this.timer.unref) this.timer.unref();
  }

  private flush(): void {
    if (this.batch.length === 0) return;
    const toFlush = this.batch.splice(0);
    for (const m of toFlush) {
      try {
        this.stmt?.run(
          m.name,
          m.value,
          m.unit,
          m.agent,
          m.documentId ?? null,
          m.tags ? JSON.stringify(m.tags) : null,
        );
      } catch { /* non-fatal — metrics loss is acceptable */ }
    }
  }

  // Returns a MetricSink function suitable for metrics.addSink()
  sink(): (metric: Metric) => void {
    return (metric: Metric) => {
      this.batch.push(metric);
    };
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.flush();
  }
}

// Factory: creates a MetricsStore and wires its sink into the global metrics collector
export function wireMetricsStore(db: DbHandle): MetricsStore {
  const store = new MetricsStore(db);
  metrics.addSink(store.sink());
  return store;
}

export function recordWorkflowStageDuration(stage: string, durationMs: number): void {
  metrics.record('workflow_stage_duration_ms', durationMs, 'ms', 'workflow', undefined, { stage });
}

export function recordEventProcessingLag(lagMs: number): void {
  metrics.record('event_processing_lag_ms', lagMs, 'ms', 'events');
}

export function incrementMemoryRejections(): void {
  metrics.record('memory_rejections_total', 1, 'count', 'memory');
}

export function recordRetrievalCacheHit(hit: boolean): void {
  metrics.record('retrieval_cache_hit', hit ? 1 : 0, 'count', 'retrieval');
}

export function incrementAgentRacePrevented(): void {
  metrics.record('agent_race_prevented_total', 1, 'count', 'agent-core');
}

// ── Phase 4–5 metrics (pre-registered so feature code can emit on day one) ───

export function recordPatchApplyDuration(durationMs: number): void {
  metrics.record('patch_apply_duration_ms', durationMs, 'ms', 'patch-manager');
}

export function recordPatchRollbackDuration(durationMs: number): void {
  metrics.record('patch_rollback_duration_ms', durationMs, 'ms', 'patch-rollback');
}

export function recordGraphQueryDuration(durationMs: number): void {
  metrics.record('graph_query_duration_ms', durationMs, 'ms', 'graph');
}

export function recordGraphCacheHit(hit: boolean): void {
  metrics.record('graph_cache_hit_ratio', hit ? 1 : 0, 'count', 'graph');
}

export function recordSupportExportDuration(durationMs: number): void {
  metrics.record('support_export_duration_ms', durationMs, 'ms', 'support');
}

export function recordRecoveryPointVerifyDuration(durationMs: number): void {
  metrics.record('recovery_point_verify_duration_ms', durationMs, 'ms', 'patch-rollback');
}
