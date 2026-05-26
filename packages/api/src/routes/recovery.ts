import { Router, type Request, type Response } from 'express';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Repos } from '../db.js';

/**
 * Recovery-mode API routes.
 *
 * GET  /api/recovery/status  — current safe-mode flag + subsystem states
 * GET  /api/recovery/events  — recent SystemEvents from DB
 * POST /api/recovery/event   — record a new system event (from desktop shell)
 * GET  /api/recovery/agents  — agent registry state (running / stale locks)
 * GET  /api/recovery/pipeline — pipeline queue state
 * POST /api/recovery/clear-locks — forcibly release stale agent locks
 */

const ALLOWED_SEVERITIES = new Set(['info', 'warn', 'critical']);
const STALE_THRESHOLD_MS = 10 * 60 * 1_000; // 10 minutes

export function recoveryRouter(repos: Repos): Router {
  const router = Router();

  // GET /api/recovery/status
  router.get('/status', (_req: Request, res: Response) => {
    const safeMode   = process.env['FACTUM_IL_SAFE_MODE'] === '1';
    const factumRoot = process.env['FACTUM_IL_ROOT'] ?? null;
    const dataPath   = process.env['FACTUM_IL_DATA_PATH'] ??
      path.join(os.homedir(), 'AppData', 'Local', 'FactumIL');

    res.json({
      safeMode,
      pid:             process.pid,
      uptime:          process.uptime(),
      nodeVersion:     process.versions.node,
      factumRoot,
      dataPath,
      workersDisabled: safeMode,
      ts:              new Date().toISOString(),
    });
  });

  // GET /api/recovery/events?limit=50
  router.get('/events', (req: Request, res: Response) => {
    try {
      const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
      const rows = repos.db
        .prepare(`
          SELECT event_id, occurred_at, event_type, source, severity, message, details
          FROM   SystemEvents
          ORDER  BY occurred_at DESC
          LIMIT  ?
        `)
        .all(limit) as Array<{
          event_id:   string;
          occurred_at: string;
          event_type: string;
          source:     string;
          severity:   string;
          message:    string;
          details:    string;
        }>;

      res.json({
        events: rows.map(r => ({
          ...r,
          details: (() => { try { return JSON.parse(r.details) as unknown; } catch { return {}; } })(),
        })),
        count: rows.length,
      });
    } catch {
      res.json({ events: [], count: 0, note: 'SystemEvents table not yet available' });
    }
  });

  // POST /api/recovery/event — record a system event
  router.post('/event', (req: Request, res: Response) => {
    const { event_type, source, severity, message, details } = req.body as {
      event_type?: unknown;
      source?:     unknown;
      severity?:   unknown;
      message?:    unknown;
      details?:    unknown;
    };

    if (typeof event_type !== 'string' || !event_type.trim()) {
      res.status(400).json({ error: 'event_type (string) is required' });
      return;
    }
    if (typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'message (string) is required' });
      return;
    }

    const resolvedSeverity =
      typeof severity === 'string' && ALLOWED_SEVERITIES.has(severity) ? severity : 'info';

    const id = crypto.randomUUID();
    try {
      repos.db.prepare(`
        INSERT INTO SystemEvents (event_id, occurred_at, event_type, source, severity, message, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        new Date().toISOString(),
        event_type.slice(0, 100),
        typeof source === 'string' ? source.slice(0, 50) : 'api',
        resolvedSeverity,
        message.slice(0, 1000),
        JSON.stringify(typeof details === 'object' && details !== null ? details : {}),
      );
      res.json({ ok: true, event_id: id });
    } catch {
      res.status(503).json({ ok: false, note: 'SystemEvents table not yet available' });
    }
  });

  // GET /api/recovery/agents — agent lock state for recovery visibility
  router.get('/agents', (_req: Request, res: Response) => {
    try {
      // Uses started_at (the actual column in AgentRunRegistry migration 049).
      const locks = repos.db.prepare(`
        SELECT agent_type, case_id, started_at, trace_id
        FROM   AgentRunRegistry
        WHERE  status = 'running'
        ORDER  BY started_at DESC
        LIMIT  50
      `).all() as Array<{ agent_type: string; case_id: string; started_at: string; trace_id: string }>;

      const stale = locks.filter(l => {
        const age = Date.now() - new Date(l.started_at).getTime();
        return age > STALE_THRESHOLD_MS;
      });

      res.json({ running: locks, staleCount: stale.length, stale });
    } catch {
      res.json({ running: [], staleCount: 0, stale: [] });
    }
  });

  // GET /api/recovery/pipeline — pipeline queue for recovery visibility
  router.get('/pipeline', (_req: Request, res: Response) => {
    try {
      const pending = repos.db.prepare(`
        SELECT COUNT(*) as cnt FROM queue WHERE status = 'pending'
      `).get() as { cnt: number } | undefined;

      const failed = repos.db.prepare(`
        SELECT COUNT(*) as cnt FROM queue WHERE status = 'failed'
      `).get() as { cnt: number } | undefined;

      const recentFailed = repos.db.prepare(`
        SELECT file_path, error_message, updated_at
        FROM   queue
        WHERE  status = 'failed'
        ORDER  BY updated_at DESC
        LIMIT  10
      `).all() as Array<{ file_path: string; error_message: string | null; updated_at: string }>;

      res.json({
        pending: pending?.cnt ?? 0,
        failed:  failed?.cnt  ?? 0,
        recentFailed,
      });
    } catch {
      res.json({ pending: 0, failed: 0, recentFailed: [] });
    }
  });

  // POST /api/recovery/clear-locks — forcibly release stale agent locks
  router.post('/clear-locks', (_req: Request, res: Response) => {
    try {
      const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
      const now         = new Date().toISOString();
      // Uses started_at and finished_at — the actual columns from migration 049.
      const result = repos.db.prepare(`
        UPDATE AgentRunRegistry
        SET    status = 'failed', finished_at = ?
        WHERE  status = 'running' AND started_at < ?
      `).run(now, staleCutoff) as { changes: number };

      res.json({ ok: true, clearedCount: result.changes });
    } catch {
      res.json({ ok: false, clearedCount: 0 });
    }
  });

  return router;
}
