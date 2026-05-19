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
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeServerConfig, clearServerConfig } from './utils/server-config-writer.js';
import { ensureAutoVacuum } from './utils/auto-vacuum.js';
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
  PipelineLogsRepository,
} from '@factum-il/database';
import { createApp } from './app.js';
import type { Repos } from './db.js';
import { startRagWorker, stopRagWorker } from './utils/rag-worker.js';
import { startBackupScheduler, stopBackupScheduler } from './utils/backup-scheduler.js';
import { startContentUpdateScheduler, stopContentUpdateScheduler } from './modules/updates/update-scheduler.js';
import { startInsolvencyNudgeScheduler, stopInsolvencyNudgeScheduler } from './utils/insolvency-nudge-scheduler.js';
import { startRetentionScheduler, stopRetentionScheduler } from './utils/retention-scheduler.js';
import { startDeadlineTracker, stopDeadlineTracker } from './utils/deadline-tracker-scheduler.js';
import { initRegistry } from './utils/legal-registry-loader.js';
import { seedDefaultAdmin } from './middleware/auth.js';
import { initLogger } from './utils/logger.js';
import { ConfigStore } from './utils/config-store.js';

initLogger();

const __dirname = dirname(fileURLToPath(import.meta.url));

const REQUESTED_PORT = Number(process.env['PORT'] ?? 3001);
const { default: getPort, portNumbers } = await import('get-port');
const PORT = await getPort({ port: portNumbers(REQUESTED_PORT, REQUESTED_PORT + 20) });
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

export const configStore = new ConfigStore(DB_PATH);
const db = new DatabaseConnection({ path: DB_PATH });
new MigrationRunner(db, MIGRATIONS_DIR).run();
ensureAutoVacuum(db);

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
  pipelineLogs:   new PipelineLogsRepository(db),
};

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

seedDefaultAdmin(repos);
initRegistry();

const server = app.listen(PORT, () => {
  void writeServerConfig({ port: PORT, pid: process.pid, ts: new Date().toISOString() });
  console.log(`Factum IL API ready — http://localhost:${PORT}`);
  startRagWorker(repos);
  startBackupScheduler(repos, DB_PATH);
  startContentUpdateScheduler(repos);
  startInsolvencyNudgeScheduler(repos);
  startRetentionScheduler(repos);
  startDeadlineTracker(repos);
});

function shutdown() {
  void clearServerConfig();
  stopRagWorker(); stopBackupScheduler(); stopContentUpdateScheduler();
  stopInsolvencyNudgeScheduler(); stopRetentionScheduler(); stopDeadlineTracker();
  server.close();
}

process.on('SIGTERM', () => { shutdown(); });
process.on('SIGINT',  () => { shutdown(); process.exit(0); });
