import { EventEmitter } from 'node:events';
import { generateUUID } from '@factum-il/shared';
import type { DatabaseConnection } from '@factum-il/database';

export type WorkerType   = 'ocr' | 'classify' | 'enrich' | 'watcher';
export type WorkerStatus = 'idle' | 'busy' | 'stopping' | 'dead';

export interface WorkerSnapshot {
  workerId:        string;
  type:            WorkerType;
  status:          WorkerStatus;
  memoryMB:        number;
  tasksCompleted:  number;
  tasksFailed:     number;
  currentTask:     string | null;
  lastHeartbeat:   Date;
  startedAt:       Date;
}

interface WorkerState {
  id:              string;
  type:            WorkerType;
  status:          WorkerStatus;
  tasksCompleted:  number;
  tasksFailed:     number;
  currentTask:     string | null;
  activeCount:     number;   // in-progress task count
  maxConcurrency:  number;
  startedAt:       Date;
  lastHeartbeat:   Date;
}

export interface SupervisorOptions {
  memoryLimitMB?:      number;    // default 512
  heartbeatIntervalMs?: number;   // default 10_000
  staleWorkerMs?:      number;    // default 60_000
}

export class WorkerSupervisor extends EventEmitter {
  private readonly db:      DatabaseConnection;
  private readonly workers: Map<string, WorkerState> = new Map();
  private readonly opts:    Required<SupervisorOptions>;
  private heartbeatTimer:   ReturnType<typeof setInterval> | null = null;

  constructor(db: DatabaseConnection, opts: SupervisorOptions = {}) {
    super();
    this.db   = db;
    this.opts = {
      memoryLimitMB:       opts.memoryLimitMB       ?? 512,
      heartbeatIntervalMs: opts.heartbeatIntervalMs ?? 10_000,
      staleWorkerMs:       opts.staleWorkerMs       ?? 60_000,
    };
    this.startHeartbeatLoop();
  }

  // ───────────────────────────────────────────────
  //  Worker lifecycle
  // ───────────────────────────────────────────────

  spawn(type: WorkerType, maxConcurrency = 1): string {
    const workerId = generateUUID();
    const now      = new Date();
    const state: WorkerState = {
      id: workerId, type, status: 'idle',
      tasksCompleted: 0, tasksFailed: 0, currentTask: null,
      activeCount: 0, maxConcurrency,
      startedAt: now, lastHeartbeat: now,
    };
    this.workers.set(workerId, state);
    this.db.prepare(`
      INSERT OR REPLACE INTO WorkerHealth
        (worker_id, worker_type, pid, status, started_at)
      VALUES (?, ?, ?, 'idle', datetime('now'))
    `).run(workerId, type, process.pid);
    this.emit('worker:spawned', { workerId, type });
    return workerId;
  }

  async run<T>(workerId: string, taskName: string, fn: () => Promise<T>): Promise<T> {
    const w = this.workers.get(workerId);
    if (!w) throw new Error(`Unknown worker: ${workerId}`);
    if (w.status === 'stopping' || w.status === 'dead') {
      throw new Error(`Worker ${workerId} is ${w.status}`);
    }
    if (w.activeCount >= w.maxConcurrency) {
      throw new Error(`Worker ${workerId} at concurrency limit ${w.maxConcurrency}`);
    }

    w.activeCount++;
    w.status      = 'busy';
    w.currentTask = taskName;
    w.lastHeartbeat = new Date();
    this.persistHeartbeat(w);

    try {
      const result = await fn();
      w.tasksCompleted++;
      this.emit('worker:task-complete', { workerId, taskName });
      return result;
    } catch (err) {
      w.tasksFailed++;
      this.emit('worker:task-failed', { workerId, taskName, error: err });
      throw err;
    } finally {
      w.activeCount--;
      if (w.activeCount === 0) {
        // Re-read from the Map: terminate() may have set status to 'stopping' during await fn()
        const latest: WorkerStatus = (this.workers.get(workerId) ?? w).status;
        w.status      = latest === 'stopping' ? 'stopping' : 'idle';
        w.currentTask = null;
      }
      w.lastHeartbeat = new Date();
      this.persistHeartbeat(w);
    }
  }

  terminate(workerId: string): void {
    const w = this.workers.get(workerId);
    if (!w) return;
    w.status = w.activeCount > 0 ? 'stopping' : 'dead';
    this.persistHeartbeat(w);
    if (w.activeCount === 0) {
      this.workers.delete(workerId);
    }
  }

  // ───────────────────────────────────────────────
  //  Health & memory
  // ───────────────────────────────────────────────

  health(): WorkerSnapshot[] {
    return [...this.workers.values()].map((w) => ({
      workerId:       w.id,
      type:           w.type,
      status:         w.status,
      memoryMB:       this.sampleMemoryMB(),
      tasksCompleted: w.tasksCompleted,
      tasksFailed:    w.tasksFailed,
      currentTask:    w.currentTask,
      lastHeartbeat:  w.lastHeartbeat,
      startedAt:      w.startedAt,
    }));
  }

  enforceMemoryBudget(): void {
    const memMB = this.sampleMemoryMB();
    if (memMB <= this.opts.memoryLimitMB) return;

    this.emit('memory:pressure', { memMB, limitMB: this.opts.memoryLimitMB });

    // Recycle idle workers over the limit
    for (const w of this.workers.values()) {
      if (w.status === 'idle') {
        this.terminate(w.id);
        this.emit('worker:recycled', { workerId: w.id, reason: 'memory' });
        if (this.sampleMemoryMB() <= this.opts.memoryLimitMB) break;
      }
    }
  }

  async gracefulShutdown(timeoutMs = 30_000): Promise<void> {
    this.stopHeartbeatLoop();
    for (const w of this.workers.values()) {
      w.status = w.activeCount > 0 ? 'stopping' : 'dead';
      this.persistHeartbeat(w);
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const busy = [...this.workers.values()].filter((w) => w.activeCount > 0);
      if (busy.length === 0) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    for (const w of this.workers.values()) {
      w.status = 'dead';
      this.persistHeartbeat(w);
    }
    this.workers.clear();
    this.emit('supervisor:shutdown');
  }

  // ───────────────────────────────────────────────
  //  Internal
  // ───────────────────────────────────────────────

  private persistHeartbeat(w: WorkerState): void {
    try {
      this.db.prepare(`
        UPDATE WorkerHealth SET
          status           = ?,
          memory_mb        = ?,
          tasks_completed  = ?,
          tasks_failed     = ?,
          current_task     = ?,
          last_heartbeat   = datetime('now'),
          updated_at       = datetime('now')
        WHERE worker_id = ?
      `).run(
        w.status, this.sampleMemoryMB(),
        w.tasksCompleted, w.tasksFailed,
        w.currentTask, w.id,
      );
    } catch { /* non-fatal */ }
  }

  private startHeartbeatLoop(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const w of this.workers.values()) {
        w.lastHeartbeat = new Date();
        this.persistHeartbeat(w);
      }
      this.enforceMemoryBudget();
      this.reapStaleWorkers();
    }, this.opts.heartbeatIntervalMs);
  }

  private stopHeartbeatLoop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private reapStaleWorkers(): void {
    const cutoff = Date.now() - this.opts.staleWorkerMs;
    for (const [id, w] of this.workers) {
      if (w.lastHeartbeat.getTime() < cutoff && w.activeCount === 0) {
        w.status = 'dead';
        this.persistHeartbeat(w);
        this.workers.delete(id);
        this.emit('worker:reaped', { workerId: id });
      }
    }
  }

  private sampleMemoryMB(): number {
    const mem = process.memoryUsage();
    return Math.round(mem.rss / (1024 * 1024) * 10) / 10;
  }
}
