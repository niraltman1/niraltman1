import { Router } from 'express';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middleware/validate.js';
import { ok } from '../utils/response.js';
import { NotFoundError } from '../errors/api-error.js';
import type { VacuumStatus } from '@legal-os/database';

const SCRIPTS_DIR = join(process.cwd(), 'powershell', 'scripts');

const LOCALHOST_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const startSchema = z.object({
  targetPath: z.string().min(1).max(500)
    .refine(p => /^[A-Za-z]:\\/.test(p), { message: 'targetPath must be an absolute Windows path (e.g. C:\\...)' })
    .refine(
      p => !/(\.\.|[\\/]system32[\\/]|[\\/]Windows[\\/]System|[\\/]node_modules[\\/])/i.test(p),
      { message: 'targetPath contains a blocked directory segment' },
    ),
}).strict();

const progressSchema = z.object({
  status:   z.enum(['discovery','processing_ocr','locking_evidence','indexing_ai','completed','failed']),
  progress: z.number().int().min(0).max(100),
  message:  z.string().max(500),
  logLine:  z.string().max(1000).optional(),
}).strict();

export function vacuumRouter(repos: Repos): Router {
  const router = Router();
  const { vacuum } = repos;

  router.post('/start', validate(startSchema), asyncHandler((req, res) => {
    const { targetPath } = req.body as { targetPath: string };

    const session = vacuum.create(targetPath);

    // resolve() produces an absolute path with no trailing separators.
    // shell:false means each array element is a distinct argv — spaces in
    // scriptPath or targetPath are handled by the OS, not a shell parser.
    const scriptPath = resolve(join(SCRIPTS_DIR, 'Invoke-VacuumProtocol.ps1'));
    const child = spawn(
      'powershell.exe',
      [
        '-ExecutionPolicy', 'Bypass',
        '-NonInteractive',
        '-File', scriptPath,
        '-SessionId', String(session.id),
        '-TargetPath', targetPath,
        '-ApiBase', 'http://localhost:3001',
      ],
      { detached: true, stdio: 'ignore', shell: false },
    );
    child.unref();

    ok(res, { sessionId: session.id, sessionUuid: session.sessionUuid }, 202);
  }));

  router.get('/session/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new NotFoundError('vacuum session');
    const session = vacuum.findById(id);
    if (!session) throw new NotFoundError('vacuum session');
    ok(res, session);
  }));

  router.get('/sessions', asyncHandler((_req, res) => {
    ok(res, vacuum.listRecent(20));
  }));

  // Internal-only endpoint — called by Invoke-VacuumProtocol.ps1 running on localhost
  router.post('/progress/:id', validate(progressSchema), asyncHandler((req, res) => {
    const remoteAddr = req.socket.remoteAddress ?? '';
    if (!LOCALHOST_ADDRS.has(remoteAddr)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'localhost only' } });
      return;
    }

    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new NotFoundError('vacuum session');

    const { status, progress, message, logLine } = req.body as {
      status:   VacuumStatus;
      progress: number;
      message:  string;
      logLine?: string;
    };

    if (status === 'failed') {
      vacuum.markFailed(id, message);
    } else {
      vacuum.updateProgress(id, status, progress, message, logLine ?? `${message}\n`);
    }

    ok(res, { updated: true });
  }));

  return router;
}
