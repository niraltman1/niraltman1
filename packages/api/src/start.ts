// ── Runtime version assertion ─────────────────────────────────────────────
const _nodeMajor = Number(process.versions.node.split('.')[0]);
if (_nodeMajor < 20) {
  process.stderr.write(
    `\n[Factum IL] FATAL: Node.js >= 20 required. Detected: ${process.versions.node}\n` +
    `  Install the LTS release from https://nodejs.org and restart.\n\n`,
  );
  process.exit(1);
}

import { join, dirname } from 'node:path';
import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeServerConfig, clearServerConfig } from './utils/server-config-writer.js';
import { ensureAutoVacuum } from './utils/auto-vacuum.js';
import { MediaPipeline } from './utils/media-pipeline.js';
import { startFileIngestion, stopFileIngestion } from './utils/file-ingestion.js';
import {
  DatabaseConnection,
  MigrationRunner,
  ClientRepository,
  CaseRepository,
  DocumentRepository,
  QueueRepository,
  ActionPlanRepository,
  BackupRepository,
  SearchEngine,
  DatabaseHardening,
  TaskRepository,
  LegalEngineRepository,
  ProcessedFilesRepository,
  TrafficCasesRepository,
  ContactsRepository,
  AcademicRepository,
  EvidenceRepository,
  StensRepository,
  GmailRepository,
  VacuumRepository,
  WatcherEventsRepository,
  PipelineLogsRepository,
  NotificationsRepository,
  CalendarRepository,
  CitationsRepository,
  EntitiesRepository,
  SmartCollectionsRepository,
  CommunicationsRepository,
  CommTemplatesRepository,
  CallLogsRepository,
  AnnotationRepository,
  RulesEngineRepository,
  LegalCorpusRepository,
  PrecedentLibraryRepository,
  VerdictCorpusRepository,
  DraftsRepository,
} from '@factum-il/database';
import { createApp } from './app.js';
import type { Repos } from './db.js';
import { startRagWorker, stopRagWorker } from './utils/rag-worker.js';
import { startBackupScheduler, stopBackupScheduler } from './utils/backup-scheduler.js';
import { startContentUpdateScheduler, stopContentUpdateScheduler } from './modules/updates/update-scheduler.js';
import { UpdateStateStore, runPostUpdateHealthCheck } from '@factum-il/update-core';
import { startInsolvencyNudgeScheduler, stopInsolvencyNudgeScheduler } from './utils/insolvency-nudge-scheduler.js';
import { startRetentionScheduler, stopRetentionScheduler } from './utils/retention-scheduler.js';
import { startDeadlineTracker, stopDeadlineTracker } from './utils/deadline-tracker-scheduler.js';
import { initRegistry } from './utils/legal-registry-loader.js';
import { initLegalCorpus } from './utils/legal-corpus-loader.js';
import { seedDefaultAdmin } from './middleware/auth.js';
import { initLogger } from './utils/logger.js';
import { logger } from '@factum-il/shared';
import { ConfigStore } from './utils/config-store.js';
import { EventStore, createEventBus } from '@factum-il/events';
import { wireMetricsStore } from '@factum-il/observability';
import { configureEventBus } from './utils/activity-emitter.js';

initLogger();

// ── Early crash capture — registered before any async startup ─────────────
// _db is set once DatabaseConnection is established below; until then
// crash events are written to stderr only (DB not yet available).
let _earlyDb: DatabaseConnection | null = null;

function recordCrashEvent(origin: string, err: unknown): void {
  const msg   = err instanceof Error ? err.message       : String(err);
  const stack = err instanceof Error ? (err.stack ?? '') : '';
  try {
    _earlyDb?.prepare(`
      INSERT INTO SystemEvents (event_id, occurred_at, event_type, source, severity, message, details)
      VALUES (?, ?, 'crash', 'api', 'critical', ?, ?)
    `).run(
      crypto.randomUUID(),
      new Date().toISOString(),
      msg.slice(0, 500),
      JSON.stringify({ origin, stack: stack.slice(0, 2_000) }),
    );
  } catch { /* DB may also be broken — best effort */ }
}

process.on('uncaughtException', (err) => {
  process.stderr.write(`[Factum IL] uncaughtException: ${String(err)}\n`);
  recordCrashEvent('uncaughtException', err);
  _shutdown();
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[Factum IL] unhandledRejection: ${String(reason)}\n`);
  recordCrashEvent('unhandledRejection', reason);
  // Non-fatal — log and continue
});

// ── Main startup ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

const REQUESTED_PORT = Number(process.env['PORT'] ?? 3001);
const { default: getPort, portNumbers } = await import('get-port');
const PORT = await Promise.race([
  getPort({ port: portNumbers(REQUESTED_PORT, REQUESTED_PORT + 20) }),
  new Promise<number>((resolve) =>
    setTimeout(() => {
      logger.warn('[startup] getPort timed out after 5s — using requested port as fallback', {
        category: 'startup', agentSource: 'StartupManager',
      });
      resolve(REQUESTED_PORT);
    }, 5_000),
  ),
]);
const DB_PATH = process.env['FACTUM_IL_DB_PATH']
  ?? (process.env['NODE_ENV'] === 'production'
      ? join(
          process.env['LOCALAPPDATA'] ?? join(process.env['USERPROFILE'] ?? 'C:', 'AppData', 'Local'),
          'FactumIL', 'factum-il.db',
        )
      : join(__dirname, '..', '..', '..', '_data', 'factum-il.db'));

const MIGRATIONS_DIR = process.env['FACTUM_IL_ROOT']
  ? join(process.env['FACTUM_IL_ROOT'], 'migrations')
  : join(__dirname, '..', '..', '..', 'migrations');

mkdirSync(dirname(DB_PATH), { recursive: true });

// Remove stale SQLite rollback-journal left by a crash (WAL files are safe — leave them)
try {
  const journalPath = DB_PATH + '-journal';
  if (existsSync(journalPath)) {
    unlinkSync(journalPath);
    logger.warn('[startup] Removed stale .db-journal — previous session crashed mid-transaction');
  }
} catch { /* best effort — do not block startup */ }

export const configStore = new ConfigStore(DB_PATH);
const db = new DatabaseConnection({ path: DB_PATH });
_earlyDb = db; // crash handlers can now write to SystemEvents
new MigrationRunner(db, MIGRATIONS_DIR).run();
ensureAutoVacuum(db);

// Post-update health check: if the app just restarted after an OTA update
// (state.updateInProgress === true), verify DB integrity and required tables.
// On failure, auto-restores the pre-update snapshot and exits so the rollback
// installer can take over (CT2 self-healing per CLAUDE.md "AI steps must fail gracefully").
{
  const DATA_PATH = process.env['FACTUM_IL_DATA_PATH']
    ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const updateStateStore = new UpdateStateStore(DATA_PATH);
  const healthResult = await runPostUpdateHealthCheck(updateStateStore, db, DB_PATH);
  if (healthResult.wasApplied) {
    if (!healthResult.healthy) {
      logger.error('[startup] Post-update health check failed — rollback triggered', {
        category: 'startup', failures: healthResult.failures,
        rollbackRestored:         healthResult.rollbackResult?.restored ?? false,
        rollbackInstallerLaunched: healthResult.rollbackResult?.installerLaunched ?? false,
      });
      process.exit(1);  // installer will restart the app on the previous version
    }
  }
}

// Non-blocking notice if vec_chunks backfill may be needed
try {
  const vecReady = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='vec_chunks'`).get();
  if (vecReady) {
    const { missing } = db.prepare(`
      SELECT COUNT(*) AS missing FROM ChunkEmbeddings ce
      WHERE ce.embedding IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM vec_chunks vc WHERE vc.rowid = ce.chunk_id)
    `).get() as { missing: number };
    if (missing > 0) {
      logger.info(`[startup] ${missing} embedding(s) not in vec_chunks. Run: tsx scripts/backfill-vec-chunks.ts`);
    }
  }
} catch { /* sqlite-vec not loaded — skip silently */ }

const repos: Repos = {
  db,
  config: configStore,
  clients:    new ClientRepository(db),
  cases:      new CaseRepository(db),
  documents:  new DocumentRepository(db),
  queue:      new QueueRepository(db),
  actionPlan: new ActionPlanRepository(db),
  backups:    new BackupRepository(db),
  search:     new SearchEngine(db),
  hardening:  new DatabaseHardening(db),
  tasks:          new TaskRepository(db),
  legalEngine:    new LegalEngineRepository(db),
  processedFiles: new ProcessedFilesRepository(db),
  trafficCases:   new TrafficCasesRepository(db),
  contacts:       new ContactsRepository(db),
  academic:       new AcademicRepository(db),
  evidence:       new EvidenceRepository(db),
  stens:          new StensRepository(db),
  gmail:          new GmailRepository(db),
  vacuum:         new VacuumRepository(db),
  watcherEvents:  new WatcherEventsRepository(db),
  pipelineLogs:   new PipelineLogsRepository(db),
  notifications:  new NotificationsRepository(db),
  calendar:       new CalendarRepository(db),
  citations:      new CitationsRepository(db),
  entities:       new EntitiesRepository(db),
  smartCollections: new SmartCollectionsRepository(db),
  communications:   new CommunicationsRepository(db),
  commTemplates:    new CommTemplatesRepository(db),
  callLogs:         new CallLogsRepository(db),
  annotations:      new AnnotationRepository(db),
  rules:             new RulesEngineRepository(db),
  legalCorpus:       new LegalCorpusRepository(db),
  precedentLibrary:  new PrecedentLibraryRepository(db),
  verdictCorpus:     new VerdictCorpusRepository(db),
  drafts:            new DraftsRepository(db),
};

// Release stale agent locks left over from a previous crash or restart.
// Any agent that was status='running' when the process died can never
// self-recover, so we mark them failed immediately on startup.
try {
  repos.db.prepare(`
    UPDATE AgentRunRegistry
    SET    status = 'failed', finished_at = ?
    WHERE  status = 'running'
  `).run(new Date().toISOString());
} catch { /* Table may not exist before migration 049 — safe to ignore */ }

// Clear WorkflowIdempotencyLog locks older than 2 hours — orphaned after a crash.
try {
  repos.db.prepare(
    "DELETE FROM WorkflowIdempotencyLog WHERE acquired_at < datetime('now', '-2 hours')"
  ).run();
} catch { /* Table may not have acquired_at column before migration 055 */ }

// Prune SystemEvents older than 90 days to prevent unbounded table growth.
try {
  repos.db.prepare(
    "DELETE FROM SystemEvents WHERE occurred_at < datetime('now', '-90 days')"
  ).run();
} catch { /* Table may not exist before migration 054 */ }

const app = createApp(repos, DB_PATH);

if (process.env['NODE_ENV'] === 'production') {
  const { default: express } = await import('express');
  const distPath = join(__dirname, '..', '..', 'dashboard', 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(distPath, 'index.html'));
    }
  });
}

// Only seed admin if no users exist yet (avoids re-seeding on every restart).
const _adminCount = (repos.db.prepare('SELECT COUNT(*) as n FROM system_users').get() as { n: number }).n;
if (_adminCount === 0) seedDefaultAdmin(repos);
initRegistry();
// Load the bundled, offline legislation corpus into the DB on first run (idempotent,
// graceful if the artifact is absent). No network — reads a static JSONL only.
await initLegalCorpus(repos);

// Wire infrastructure spine — metrics persistence + domain event bus
// repos.db (DatabaseConnection) satisfies the duck-typed DbHandle in both packages
const _dbHandle = repos.db as unknown as {
  prepare: (sql: string) => { run: (...a: unknown[]) => void; get: (...a: unknown[]) => unknown; all: (...a: unknown[]) => unknown[] };
  transaction: <T>(fn: () => T) => T;
};
wireMetricsStore(_dbHandle);
const eventBus = createEventBus(new EventStore(_dbHandle));
configureEventBus(eventBus);

// Safe-mode: when FACTUM_IL_SAFE_MODE=1 all background workers are skipped.
// Set by ApiHostService (C#) before spawning the API process in recovery mode.
const SAFE_MODE = process.env['FACTUM_IL_SAFE_MODE'] === '1';

const server = app.listen(PORT, () => {
  void writeServerConfig({ port: PORT, pid: process.pid, ts: new Date().toISOString(), safeMode: SAFE_MODE });
  logger.info(`Factum IL API ready — http://localhost:${PORT}${SAFE_MODE ? ' [SAFE MODE]' : ''}`);
  if (!SAFE_MODE) {
    startRagWorker(repos, eventBus);
    startBackupScheduler(repos, DB_PATH);
    startContentUpdateScheduler(repos);
    startInsolvencyNudgeScheduler(repos);
    startRetentionScheduler(repos);
    startDeadlineTracker(repos);
    // File-ingestion: watch configured folders → durable WatcherEvents queue → media pipeline.
    const ingestPipeline = new MediaPipeline(
      repos.processedFiles, repos.documents, repos.evidence,
      repos.clients, repos.cases, repos.pipelineLogs, repos.contacts,
    );
    startFileIngestion(repos, ingestPipeline, configStore.getWatchFolders());
  } else {
    logger.warn('[Factum IL] Safe mode active — background workers disabled');
  }
});

function _shutdown() {
  void clearServerConfig();
  stopRagWorker(); stopBackupScheduler(); stopContentUpdateScheduler();
  stopInsolvencyNudgeScheduler(); stopRetentionScheduler(); stopDeadlineTracker();
  stopFileIngestion();
  try { server.close(); } catch { /* server may not have started yet */ }
}

process.on('SIGTERM', () => { _shutdown(); });
process.on('SIGINT',  () => { _shutdown(); process.exit(0); });
