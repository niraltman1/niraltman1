import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { getStatus as getResourceStatus, setTurboMode } from '../utils/resource-controller.js';
import { seedDemo } from '../utils/seed-demo.js';
import { runVacuumProtocol } from '../utils/vacuum-protocol.js';
import { ValidationError } from '../errors/api-error.js';
import type { RagHealingService } from '../utils/rag-healing.js';

export function adminRouter(repos: Repos, healingService: RagHealingService): Router {
  const router = Router();
  const { db, backups, hardening, queue, config } = repos;

  router.get('/workers', asyncHandler((_req, res) => {
    const rows = db
      .prepare('SELECT * FROM WorkerHealth ORDER BY last_heartbeat DESC')
      .all() as Record<string, unknown>[];
    ok(res, rows);
  }));

  router.get('/watcher/events', asyncHandler((_req, res) => {
    const rows = db
      .prepare('SELECT * FROM WatcherEvents ORDER BY detected_at DESC LIMIT 200')
      .all() as Record<string, unknown>[];
    ok(res, rows);
  }));

  router.get('/backups', asyncHandler((_req, res) => {
    ok(res, backups.list());
  }));

  router.post('/backups', asyncHandler((_req, res) => {
    const snapshotId = backups.record('manual', 0, 'Manual backup via API');
    ok(res, { snapshotId }, 201);
  }));

  router.post('/repair/manifest', asyncHandler((_req, res) => {
    const report = hardening.checkIntegrity();
    ok(res, report);
  }));

  router.post('/repair/integrity', asyncHandler((_req, res) => {
    const report = hardening.checkIntegrity();
    ok(res, report);
  }));

  router.post('/repair/replay/:id', asyncHandler((req, res) => {
    const id = req.params['id']!;
    const success = queue.requeue(id);
    ok(res, { requeued: success });
  }));

  // ── Global Stats ─────────────────────────────────────────────────────────
  router.get('/stats', asyncHandler((_req, res) => {
    const one = <T>(sql: string): T => (repos.db.prepare(sql).get() as Record<string, T>)['c'] as T;
    const queueStats = repos.queue.getStats();
    const lastBackup = repos.db.prepare(
      `SELECT created_at FROM BackupSnapshots ORDER BY created_at DESC LIMIT 1`,
    ).get() as { created_at: string } | undefined;

    ok(res, {
      clients:         one<number>(`SELECT COUNT(*) AS c FROM Clients`),
      openCases:       one<number>(`SELECT COUNT(*) AS c FROM Cases WHERE status = 'open'`),
      totalCases:      one<number>(`SELECT COUNT(*) AS c FROM Cases`),
      documentsTotal:  one<number>(`SELECT COUNT(*) AS c FROM Documents`),
      documentsOcr:    one<number>(`SELECT COUNT(*) AS c FROM Documents WHERE ocr_text IS NOT NULL AND ocr_text != ''`),
      aiEnriched:      one<number>(`SELECT COUNT(*) AS c FROM Documents WHERE ai_enriched = 1`),
      tasksPending:    one<number>(`SELECT COUNT(*) AS c FROM Tasks WHERE status IN ('pending','in_progress')`),
      tasksOverdue:    one<number>(`SELECT COUNT(*) AS c FROM Tasks WHERE urgency = 'critical'`),
      evidenceItems:   one<number>(`SELECT COUNT(*) AS c FROM EvidenceItems`),
      stensTemplates:  one<number>(`SELECT COUNT(*) AS c FROM StensTemplates WHERE is_active = 1`),
      studyQuestions:  one<number>(`SELECT COUNT(*) AS c FROM StudyQuestions`),
      studyCourses:    one<number>(`SELECT COUNT(*) AS c FROM AcademicCourses`),
      trafficAlerts:   one<number>(`SELECT COUNT(*) AS c FROM TrafficCases WHERE days_remaining < 90 AND status != 'closed'`),
      backupsTotal:    one<number>(`SELECT COUNT(*) AS c FROM BackupSnapshots`),
      backupEncrypted: process.env['BACKUP_ENCRYPT'] === '1',
      queuePending:    queueStats.total,
      lastBackupAt:    lastBackup?.created_at ?? null,
    });
  }));

  // ── Demo Data Seeder ──────────────────────────────────────────────────────
  router.post('/seed-demo', asyncHandler(async (_req, res) => {
    if (process.env['NODE_ENV'] === 'production') {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not available in production' } });
      return;
    }
    const counts = await seedDemo(repos);
    ok(res, { seeded: true, counts });
  }));

  // ── Security Status ───────────────────────────────────────────────────────
  router.get('/security-status', asyncHandler(async (_req, res) => {
    const backupEncrypt = process.env['BACKUP_ENCRYPT'] === '1';
    const keySource = backupEncrypt
      ? (process.env['BACKUP_ENCRYPT_KEY'] ? 'env' : process.env['BACKUP_PASSPHRASE'] ? 'passphrase' : 'dpapi')
      : null;
    const lastRow = repos.db.prepare(
      `SELECT created_at FROM BackupSnapshots WHERE is_encrypted = 1 ORDER BY created_at DESC LIMIT 1`,
    ).get() as { created_at: string } | undefined;
    const totalEncrypted = (repos.db.prepare(
      `SELECT COUNT(*) AS c FROM BackupSnapshots WHERE is_encrypted = 1`,
    ).get() as { c: number }).c;
    ok(res, { backupEncrypt, keySource, lastEncryptedAt: lastRow?.created_at ?? null, totalEncrypted });
  }));

  // ── AI Engine Health ──────────────────────────────────────────────────────
  router.get('/ai-health', asyncHandler(async (_req, res) => {
    const model      = process.env['OLLAMA_MODEL'] ?? 'legal-brain';
    const ollamaBase = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
    let ollamaReachable = false;
    try {
      const r = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(2000) });
      ollamaReachable = r.ok;
    } catch { /* unreachable */ }
    const tier = (process.env['AI_TIER'] ?? 'unknown') as 'high' | 'standard' | 'low' | 'unknown';
    ok(res, { model, ollamaReachable, tier, isLegalBrain: model === 'legal-brain' });
  }));

  // ── Resource / Day-Night Controller ──────────────────────────────────────
  router.get('/system/resource', asyncHandler((_req, res) => {
    ok(res, getResourceStatus());
  }));

  router.post('/system/turbo', asyncHandler((req, res) => {
    const enabled = !!(req.body as { enabled?: boolean }).enabled;
    setTurboMode(enabled);
    ok(res, getResourceStatus());
  }));

  // ── Settings (org directory) ──────────────────────────────────────────────
  router.get('/settings', asyncHandler((_req, res) => {
    ok(res, config.toJSON());
  }));

  router.post('/settings', asyncHandler((req, res) => {
    const { orgDirectory } = req.body as { orgDirectory?: string };
    if (!orgDirectory || typeof orgDirectory !== 'string' || !orgDirectory.trim()) {
      throw new ValidationError('orgDirectory שדה חובה');
    }
    config.setOrgDirectory(orgDirectory.trim());
    ok(res, config.toJSON());
  }));

  // ── RAG self-heal — probes FTS5 + Ollama, auto-repairs if needed ─────────
  router.post('/repair/rag', asyncHandler(async (_req, res) => {
    const report = await healingService.runHealingCycle();
    ok(res, report);
  }));

  // ── FTS5 full reconstruct — drops and rebuilds corrupt fts_documents ─────
  router.post('/repair/fts', asyncHandler((_req, res) => {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_fts_documents_insert;
      DROP TRIGGER IF EXISTS trg_fts_documents_update;
      DROP TRIGGER IF EXISTS trg_fts_documents_delete;
      DROP TABLE  IF EXISTS fts_documents;

      CREATE VIRTUAL TABLE fts_documents USING fts5(
        filename, ocr_text, document_type, tags,
        content='Documents', content_rowid='id'
      );

      INSERT INTO fts_documents(rowid, filename, ocr_text, document_type, tags)
        SELECT id, filename, ocr_text, document_type, tags FROM Documents
        WHERE ocr_text IS NOT NULL OR filename IS NOT NULL;

      CREATE TRIGGER trg_fts_documents_insert AFTER INSERT ON Documents BEGIN
        INSERT INTO fts_documents(rowid, filename, ocr_text, document_type, tags)
        VALUES (new.id, new.filename, new.ocr_text, new.document_type, new.tags);
      END;
      CREATE TRIGGER trg_fts_documents_update AFTER UPDATE ON Documents BEGIN
        INSERT INTO fts_documents(fts_documents, rowid, filename, ocr_text, document_type, tags)
        VALUES ('delete', old.id, old.filename, old.ocr_text, old.document_type, old.tags);
        INSERT INTO fts_documents(rowid, filename, ocr_text, document_type, tags)
        VALUES (new.id, new.filename, new.ocr_text, new.document_type, new.tags);
      END;
      CREATE TRIGGER trg_fts_documents_delete AFTER DELETE ON Documents BEGIN
        INSERT INTO fts_documents(fts_documents, rowid, filename, ocr_text, document_type, tags)
        VALUES ('delete', old.id, old.filename, old.ocr_text, old.document_type, old.tags);
      END;
    `);
    ok(res, { rebuilt: true });
  }));

  // ── OCR Backfill — extract text from existing PDFs via pdftotext ──────────
  router.post('/backfill-ocr', asyncHandler(async (req, res) => {
    const { execFile } = await import('node:child_process');
    const PDFTOTEXT = process.env['PDFTOTEXT_EXE'] ?? 'C:\\poppler-24.08.0\\Library\\bin\\pdftotext.exe';
    const limit = Number((req.body as { limit?: number }).limit ?? 200);

    const rows = db.prepare(`
      SELECT id, storage_path, original_path FROM Documents
      WHERE ocr_text IS NULL AND (storage_path LIKE '%.pdf' OR original_path LIKE '%.pdf')
      ORDER BY id ASC LIMIT ?
    `).all(limit) as { id: number; storage_path: string; original_path: string }[];

    let done = 0; let failed = 0;
    for (const row of rows) {
      const filePath = row.storage_path || row.original_path;
      await new Promise<void>((resolve) => {
        execFile(PDFTOTEXT, ['-layout', '-enc', 'UTF-8', filePath, '-'],
          { timeout: 15_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
          (_err, stdout) => {
            const text = (stdout ?? '').trim();
            if (text.length > 20) {
              db.prepare(`UPDATE Documents SET ocr_text = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(text, row.id);
              done++;
            } else {
              failed++;
            }
            resolve();
          });
      });
    }
    ok(res, { processed: rows.length, extracted: done, empty: failed });
  }));

  // ── Pipeline cache reset — wipes ProcessedFiles + PipelineLogs only ─────
  router.delete('/reset-pipeline', asyncHandler((_req, res) => {
    const processedFilesCleared = repos.processedFiles.reset();
    const pipelineLogsCleared   = repos.pipelineLogs.reset();
    console.log(`[Admin] Pipeline cache reset: ${processedFilesCleared} ProcessedFiles + ${pipelineLogsCleared} PipelineLogs cleared`);
    ok(res, { processedFilesCleared, pipelineLogsCleared });
  }));

  // ── Vacuum Protocol — dry-run simulation ─────────────────────────────────
  router.post('/vacuum/simulate', asyncHandler(async (req, res) => {
    const { targetDir } = req.body as { targetDir?: string };
    const orgDir = config.orgDirectory;
    const scanDir = targetDir?.trim() || orgDir;
    if (!scanDir) throw new ValidationError('targetDir שדה חובה');

    const report = await runVacuumProtocol({
      targetDir: scanDir,
      orgDir,
      dryRun: true,
    });
    ok(res, report);
  }));

  // ── Vacuum Protocol — global apply ───────────────────────────────────────
  router.post('/vacuum/apply', asyncHandler(async (req, res) => {
    const { targetDir } = req.body as { targetDir?: string };
    const orgDir = config.orgDirectory;
    const scanDir = targetDir?.trim() || orgDir;
    if (!scanDir) throw new ValidationError('targetDir שדה חובה');

    const report = await runVacuumProtocol({
      targetDir: scanDir,
      orgDir,
      dryRun: false,
    });
    ok(res, report);
  }));

  return router;
}
