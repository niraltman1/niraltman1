import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middleware/validate.js';
import { ok } from '../utils/response.js';
import { getStatus as getResourceStatus, setTurboMode } from '../utils/resource-controller.js';
import { seedDemo } from '../utils/seed-demo.js';
import { runVacuumProtocol } from '../utils/vacuum-protocol.js';
import { reconfigureWatchFolders, rescanFolder } from '../utils/file-ingestion.js';
import { ingestJudgmentFolder } from '../utils/judgment-library-ingestion.js';
import { existsSync, statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { ValidationError, NotFoundError } from '../errors/api-error.js';
import type { RagHealingService } from '../utils/rag-healing.js';
import { requireRole } from '../middleware/auth.js';
import {
  getSystemMode, setSystemMode,
  assignCaseAccess, revokeCaseAccess, listCaseAssignments,
} from '@factum-il/agent-core';

function parseJsonArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map(String) : []; }
  catch { return []; }
}

const watchFoldersSchema = z.object({
  folders: z.array(z.string()),
}).strict();

const rescanSchema = z.object({
  folder: z.string().min(1),
}).strict();

const turboSchema = z.object({
  enabled: z.boolean().optional(),
}).strict();

const settingsSchema = z.object({
  orgDirectory: z.string().min(1),
}).strict();

const backfillOcrSchema = z.object({
  limit: z.number().optional(),
}).strict();

const vacuumSchema = z.object({
  targetDir: z.string().optional(),
}).strict();

const systemModeSchema = z.object({
  mode: z.enum(['single', 'multi']),
}).strict();

const caseAssignmentSchema = z.object({
  caseId: z.number(),
  userId: z.number(),
  role:   z.string(),
}).strict();

export function adminRouter(repos: Repos, healingService: RagHealingService): Router {
  const router = Router();
  const { db, backups, hardening, queue, config, watcherEvents } = repos;

  router.get('/workers', asyncHandler((_req, res) => {
    const rows = db
      .prepare('SELECT * FROM WorkerHealth ORDER BY last_heartbeat DESC')
      .all() as Record<string, unknown>[];
    ok(res, rows);
  }));

  router.get('/watcher/events', asyncHandler((_req, res) => {
    ok(res, watcherEvents.recent(200));
  }));

  // ── File ingestion (Vacuum Protocol) ──────────────────────────────────────
  // Combined status: configured folders + queue stats + recent events.
  router.get('/ingestion/status', asyncHandler((_req, res) => {
    ok(res, {
      watchFolders: config.getWatchFolders(),
      stats:        watcherEvents.stats(),
      recent:       watcherEvents.recent(50),
    });
  }));

  router.get('/ingestion/folders', asyncHandler((_req, res) => {
    ok(res, config.getWatchFolders());
  }));

  // Replace the watched-folder set; validates each path is an existing directory,
  // persists to ConfigStore, and hot-reconfigures the live watcher.
  router.put('/ingestion/folders', requireRole('admin', repos), validate(watchFoldersSchema), asyncHandler((req, res) => {
    const { folders } = req.body as z.infer<typeof watchFoldersSchema>;
    for (const f of folders) {
      if (!existsSync(f) || !statSync(f).isDirectory()) {
        throw new ValidationError(`לא תיקייה תקפה: ${f}`);
      }
    }
    config.setWatchFolders(folders);
    reconfigureWatchFolders(config.getWatchFolders());
    ok(res, config.getWatchFolders());
  }));

  // Enqueue every supported file already present under a folder (one-shot bulk ingest).
  router.post('/ingestion/rescan', requireRole('admin', repos), validate(rescanSchema), asyncHandler((req, res) => {
    const { folder } = req.body as z.infer<typeof rescanSchema>;
    if (!existsSync(folder) || !statSync(folder).isDirectory()) {
      throw new ValidationError(`לא תיקייה תקפה: ${folder}`);
    }
    const enqueued = rescanFolder(repos, folder);
    ok(res, { enqueued });
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

  router.post('/system/turbo', validate(turboSchema), asyncHandler((req, res) => {
    const enabled = !!(req.body as z.infer<typeof turboSchema>).enabled;
    setTurboMode(enabled);
    ok(res, getResourceStatus());
  }));

  // ── Settings (org directory) ──────────────────────────────────────────────
  router.get('/settings', asyncHandler((_req, res) => {
    ok(res, config.toJSON());
  }));

  router.post('/settings', validate(settingsSchema), asyncHandler((req, res) => {
    const { orgDirectory } = req.body as z.infer<typeof settingsSchema>;
    if (!orgDirectory.trim()) {
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
  router.post('/backfill-ocr', validate(backfillOcrSchema), asyncHandler(async (req, res) => {
    const { execFile } = await import('node:child_process');
    const PDFTOTEXT = process.env['PDFTOTEXT_EXE'] ?? 'C:\\poppler-24.08.0\\Library\\bin\\pdftotext.exe';
    const limit = (req.body as z.infer<typeof backfillOcrSchema>).limit ?? 200;

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
  router.post('/vacuum/simulate', validate(vacuumSchema), asyncHandler(async (req, res) => {
    const { targetDir } = req.body as z.infer<typeof vacuumSchema>;
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
  router.post('/vacuum/apply', validate(vacuumSchema), asyncHandler(async (req, res) => {
    const { targetDir } = req.body as z.infer<typeof vacuumSchema>;
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

  // ── System Mode (RBAC v2) ─────────────────────────────────────────────────
  router.get('/system-mode', requireRole('admin', repos), asyncHandler((_req, res) => {
    const mode = getSystemMode(repos.db as unknown as Parameters<typeof getSystemMode>[0]);
    ok(res, { mode });
  }));

  router.post('/system-mode', requireRole('admin', repos), validate(systemModeSchema), asyncHandler((req, res) => {
    const { mode } = req.body as z.infer<typeof systemModeSchema>;
    setSystemMode(mode, repos.db as unknown as Parameters<typeof setSystemMode>[1]);
    ok(res, { mode });
  }));

  // ── Case Assignments (RBAC v2) ────────────────────────────────────────────
  router.get('/case-assignments', requireRole('admin', repos), asyncHandler((req, res) => {
    const caseId = req.query['caseId'] !== undefined ? Number(req.query['caseId']) : null;
    if (caseId !== null && isNaN(caseId)) throw new ValidationError('caseId must be a number');

    const rows = caseId !== null
      ? listCaseAssignments(caseId, repos.db as unknown as Parameters<typeof listCaseAssignments>[1])
      : (repos.db.prepare(
          `SELECT ca.id, ca.case_id as caseId, ca.user_id as userId, su.username, ca.role,
                  ca.assigned_at as assignedAt
             FROM CaseAssignments ca
             JOIN system_users su ON su.id = ca.user_id
            WHERE ca.revoked_at IS NULL
            ORDER BY ca.assigned_at DESC LIMIT 200`,
        ).all() as unknown[]);
    ok(res, { assignments: rows });
  }));

  router.post('/case-assignments', requireRole('admin', repos), validate(caseAssignmentSchema), asyncHandler((req, res) => {
    const { caseId, userId, role } = req.body as z.infer<typeof caseAssignmentSchema>;
    const me = (req as unknown as { userId?: number }).userId ?? 0;
    assignCaseAccess(caseId, userId, role, me, repos.db as unknown as Parameters<typeof assignCaseAccess>[4]);
    ok(res, { ok: true });
  }));

  router.delete('/case-assignments/:id', requireRole('admin', repos), asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const me = (req as unknown as { userId?: number }).userId ?? 0;
    const row = repos.db.prepare(
      `SELECT case_id, user_id FROM CaseAssignments WHERE id = ?`,
    ).get(id) as { case_id: number; user_id: number } | undefined;
    if (!row) throw new NotFoundError(`Assignment ${id}`);
    revokeCaseAccess(row.case_id, row.user_id, me, repos.db as unknown as Parameters<typeof revokeCaseAccess>[3]);
    ok(res, { ok: true });
  }));

  // ── Judgment Library (ספריית פסקי דין) ──────────────────────────────────────
  // Ingest court verdicts from the server-configured staging folder.
  // Path comes from JUDGMENT_STAGING_DIR env var only — not from the request body —
  // to prevent path-traversal via user-controlled input (CodeQL CWE-22).
  router.post('/judgment-library/ingest', requireRole('admin', repos), asyncHandler(async (_req, res) => {
    const stagingDir = process.env['JUDGMENT_STAGING_DIR'];
    if (!stagingDir) {
      throw new ValidationError('הגדר את משתנה הסביבה JUDGMENT_STAGING_DIR לתיקיית פסקי הדין');
    }
    const safeFolder = resolvePath(stagingDir);
    if (!existsSync(safeFolder) || !statSync(safeFolder).isDirectory()) {
      throw new ValidationError(`לא תיקייה תקפה: ${safeFolder}`);
    }
    const summary = await ingestJudgmentFolder(safeFolder, repos);
    ok(res, summary);
  }));

  // List all indexed verdicts with chunk counts and metadata.
  router.get('/judgment-library', requireRole('admin', repos), asyncHandler((_req, res) => {
    const rows = repos.db.prepare(`
      SELECT pd.id, pd.original_filename, pd.source_path, pd.procedure_type,
             pd.legal_domain, pd.legal_questions, pd.factual_summary, pd.keywords,
             pd.ingested_at, pd.document_id,
             (SELECT COUNT(*) FROM DocumentChunks dc WHERE dc.document_id = pd.document_id) AS chunk_count
      FROM PrecedentDocuments pd
      ORDER BY pd.ingested_at DESC
    `).all() as Record<string, unknown>[];
    ok(res, rows.map((r) => ({
      ...r,
      legalQuestions: parseJsonArray(r['legal_questions']),
      keywords:       parseJsonArray(r['keywords']),
    })));
  }));

  // Return the full OCR text of a specific verdict (for reading the original document).
  router.get('/judgment-library/:id/full-text', requireRole('admin', repos), asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const record = repos.precedentLibrary.getFullText(id);
    if (!record) throw new NotFoundError(`Judgment ${id}`);
    ok(res, record);
  }));

  // Remove a verdict and its chunks from the index.
  router.delete('/judgment-library/:id', requireRole('admin', repos), asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (isNaN(id)) throw new ValidationError('id must be a number');
    const deleted = repos.precedentLibrary.delete(id);
    if (!deleted) throw new NotFoundError(`Judgment ${id}`);
    ok(res, { deleted: true });
  }));

  // ── Agent Execution Journal ───────────────────────────────────────────────
  router.get('/journal', requireRole('admin', repos), asyncHandler((req, res) => {
    const q         = req.query as Record<string, string>;
    const caseId    = q['caseId']    !== undefined ? Number(q['caseId'])    : null;
    const eventType = q['eventType'] ?? null;
    const since     = q['since']     ?? null;
    const limit     = Math.min(parseInt(q['limit'] ?? '50', 10), 500);

    const rows = repos.db.prepare(
      `SELECT id, execution_id as executionId, case_id as caseId, user_id as userId,
              event_type as eventType, payload_json as payloadJson, created_at as createdAt
         FROM AgentExecutionEvents
        WHERE (? IS NULL OR case_id = ?)
          AND (? IS NULL OR event_type = ?)
          AND (? IS NULL OR created_at >= ?)
        ORDER BY created_at DESC
        LIMIT ?`,
    ).all(caseId, caseId, eventType, eventType, since, since, limit) as unknown[];

    ok(res, { events: rows, count: rows.length });
  }));

  return router;
}
