# Worker Supervisor

## Overview

The `WorkerSupervisor` manages the lifecycle, health, and resource usage of processing workers. Each worker is a logical task runner — an async function with a concurrency limit — tracked in both an in-memory registry and the `WorkerHealth` SQLite table.

## Worker Types

| Type       | Responsibility                                |
|------------|-----------------------------------------------|
| ocr        | Tesseract OCR execution + image preprocessing |
| classify   | Regex classification + type assignment        |
| enrich     | Ollama AI enrichment                          |
| watcher    | Filesystem event monitoring                   |
| supervisor | Supervisor process itself (auto-registered)   |

## TypeScript API

```typescript
const sup = new WorkerSupervisor(db, {
  memoryLimitMB:       512,     // recycle idle workers above this threshold
  heartbeatIntervalMs: 10_000,  // heartbeat + memory check interval
  staleWorkerMs:       60_000,  // reap workers with no heartbeat for this long
});

const workerId = sup.spawn('ocr', 3);  // maxConcurrency = 3

// Run a task on a specific worker
const result = await sup.run(workerId, 'extract-text', async () => {
  return ocrService.run(filePath, hash);
});

// Query health
const snapshots = sup.health();
// [{ workerId, type, status, memoryMB, tasksCompleted, tasksFailed, ... }]

// Graceful shutdown — waits for in-flight tasks, then marks all workers dead
await sup.gracefulShutdown(30_000);
```

## Events

| Event                | Payload                            |
|----------------------|------------------------------------|
| `worker:spawned`     | `{ workerId, type }`               |
| `worker:task-complete` | `{ workerId, taskName }`         |
| `worker:task-failed`   | `{ workerId, taskName, error }`  |
| `worker:recycled`    | `{ workerId, reason: 'memory' }`   |
| `worker:reaped`      | `{ workerId }` (stale heartbeat)   |
| `memory:pressure`    | `{ memMB, limitMB }`               |
| `supervisor:shutdown` | (no payload)                     |

## Memory Pressure

Every `heartbeatIntervalMs`, the supervisor:
1. Updates all heartbeat records in `WorkerHealth`
2. Samples `process.memoryUsage().rss`
3. If RSS > `memoryLimitMB`, terminates idle workers until usage drops

## Crash Recovery

On startup, call `Invoke-WorkerGarbageCollection` (PowerShell) or let the heartbeat loop automatically reap workers whose `last_heartbeat` is older than `staleWorkerMs`. Stale workers are marked `dead` in the DB and removed from the in-memory registry.

## PowerShell API

| Function                       | Description                                 |
|--------------------------------|---------------------------------------------|
| `Initialize-Supervisor`        | Set up DB, memory limit, heartbeat interval |
| `Register-Worker`              | Register a new worker instance              |
| `Update-WorkerHeartbeat`       | Update status + memory + current task       |
| `Complete-WorkerTask`          | Increment task counter, set idle            |
| `Get-WorkerHealth`             | Query all worker rows                       |
| `Watch-MemoryPressure`         | Force GC + mark idle workers for recycling  |
| `Invoke-WorkerGarbageCollection` | Reap workers with stale heartbeats       |
| `Stop-AllWorkers`              | Graceful shutdown with timeout              |
