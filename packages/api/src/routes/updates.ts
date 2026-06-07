import { Router } from 'express';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok, fail } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { fetchContentBundle, applyContentBundle } from '../modules/updates/content-updater.js';
import { startUpdateFlow } from '../modules/updates/update-orchestrator.js';
import {
  VersionManifestParser, UpdateChannelManager, UpdateStateStore, restoreFromRollback,
} from '@factum-il/update-core';

const CURRENT_VERSION = process.env['FACTUM_IL_VERSION'] ?? '1.0.0';

const dataPath = process.env['FACTUM_IL_DATA_PATH']
  ?? (process.env['LOCALAPPDATA'] ? `${process.env['LOCALAPPDATA']}/FactumIL` : '');

const channelManager = new UpdateChannelManager(dataPath);
const stateStore     = new UpdateStateStore(dataPath);

const setChannelSchema = z.object({
  channel: z.enum(['beta', 'stable', 'enterprise']),
}).strict();

const logUpdateSchema = z.object({
  channel: z.enum(['security', 'content']),
  version: z.string().optional(),
  status:  z.enum(['success', 'failed', 'skipped']),
  details: z.unknown().optional(),
  error:   z.string().nullish(),
}).strict();

export function updatesRouter(repos: Repos): Router {
  const router = Router();

  router.get('/status', asyncHandler(async (_req, res) => {
    const security = repos.db.prepare(
      `SELECT * FROM UpdateLog WHERE channel = 'security' ORDER BY applied_at DESC LIMIT 5`,
    ).all() as Record<string, unknown>[];
    const content = repos.db.prepare(
      `SELECT * FROM UpdateLog WHERE channel = 'content'  ORDER BY applied_at DESC LIMIT 5`,
    ).all() as Record<string, unknown>[];
    ok(res, { security, content });
  }));

  router.post('/log', validate(logUpdateSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof logUpdateSchema>;
    repos.db.prepare(
      `INSERT INTO UpdateLog (channel, version, status, details, error) VALUES (?, ?, ?, ?, ?)`,
    ).run(
      body.channel,
      body.version  ?? null,
      body.status,
      body.details  != null ? JSON.stringify(body.details) : null,
      body.error    ?? null,
    );
    ok(res, { logged: true });
  }));

  // GET /api/updates/app-check — checks for a newer installer via the channel manifest
  router.get('/app-check', asyncHandler(async (_req, res) => {
    const channel = await channelManager.getChannel();
    const manifestUrl = UpdateChannelManager.getManifestUrl(channel);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      let manifest = null;
      try {
        const response = await fetch(manifestUrl, { signal: controller.signal });
        if (response.ok) {
          manifest = VersionManifestParser.parse(await response.json());
        }
      } finally {
        clearTimeout(timer);
      }

      if (manifest === null) {
        ok(res, { available: false, currentVersion: CURRENT_VERSION, channel, error: 'manifest unavailable' });
        return;
      }

      const comparison = VersionManifestParser.compareVersions(CURRENT_VERSION, manifest.latestVersion);
      const available  = comparison === -1;
      const mandatory  = available && VersionManifestParser.isMandatoryUpdate(manifest, CURRENT_VERSION);

      ok(res, {
        available,
        currentVersion:  CURRENT_VERSION,
        latestVersion:   manifest.latestVersion,
        channel,
        mandatory,
        releaseNotes:    available ? manifest.releaseNotes : null,
        assetUrl:        available ? manifest.assetUrl     : null,
        releaseDate:     available ? manifest.releaseDate  : null,
      });
    } catch {
      ok(res, { available: false, currentVersion: CURRENT_VERSION, channel, error: 'check failed' });
    }
  }));

  // POST /api/updates/channel — switch the update channel
  router.post('/channel', validate(setChannelSchema), asyncHandler(async (req, res) => {
    const { channel } = req.body as z.infer<typeof setChannelSchema>;
    await channelManager.setChannel(channel);
    ok(res, { channel });
  }));

  // GET /api/updates/channel — current update channel
  router.get('/channel', asyncHandler(async (_req, res) => {
    const channel = await channelManager.getChannel();
    ok(res, { channel });
  }));

  router.post('/content/trigger', asyncHandler(async (_req, res) => {
    const url = process.env['CONTENT_UPDATE_URL'];
    if (!url) {
      ok(res, { skipped: true, reason: 'CONTENT_UPDATE_URL not configured' });
      return;
    }
    const bundle = await fetchContentBundle(url);
    if (!bundle) {
      ok(res, { skipped: true, reason: 'bundle fetch failed' });
      return;
    }
    const result = await applyContentBundle(repos, bundle);
    ok(res, { version: bundle.version, ...result });
  }));

  // POST /api/updates/start — download + install via SSE progress stream
  router.post('/start', asyncHandler(async (_req, res) => {
    const state = await stateStore.read();
    if (!state.pendingManifest) {
      res.status(400).json({ success: false, error: { code: 'NO_MANIFEST', message: 'אין עדכון ממתין' } });
      return;
    }

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    function send(data: Record<string, unknown>): void {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    const dbPath = process.env['FACTUM_IL_DB_PATH'] ?? '';
    const result = await startUpdateFlow(
      state.pendingManifest,
      stateStore,
      dataPath,
      dbPath,
      {
        onProgress(p) {
          send({ type: 'progress', ...p });
        },
        onVerified(sha256) {
          send({ type: 'verified', sha256 });
        },
        onLaunching() {
          send({ type: 'launching', message: 'מפעיל מתקין...' });
        },
      },
    );

    if (!result.success) {
      send({ type: 'error', error: result.error ?? 'Update failed' });
    }

    res.end();
  }));

  // GET /api/updates/progress — polling fallback for SSE
  router.get('/progress', asyncHandler(async (_req, res) => {
    const state = await stateStore.read();
    ok(res, {
      updateInProgress: state.updateInProgress,
      pendingVersion:   state.pendingManifest?.latestVersion ?? null,
      channel:          state.channel,
    });
  }));

  // POST /api/updates/rollback — restore the pre-update database snapshot and
  // relaunch the previous version's installer (the safe undo path for a failed update)
  router.post('/rollback', asyncHandler(async (_req, res) => {
    const state  = await stateStore.read();
    const dbPath = process.env['FACTUM_IL_DB_PATH'] ?? '';

    const result = await restoreFromRollback(state.rollback, dbPath);

    if (!result.restored) {
      fail(res, 'ROLLBACK_UNAVAILABLE', result.reason ?? 'שחזור הגרסה הקודמת נכשל', 409);
      return;
    }

    await stateStore.write({ rollback: null, updateInProgress: false });
    ok(res, result);
  }));

  // POST /api/updates/abort — cancel in-progress update and delete pending installer
  router.post('/abort', asyncHandler(async (_req, res) => {
    const state = await stateStore.read();
    if (state.pendingManifest) {
      const installerPath = join(dataPath, 'updates', `installer-${state.pendingManifest.latestVersion}.exe`);
      if (existsSync(installerPath)) {
        await unlink(installerPath).catch(() => undefined);
      }
    }
    await stateStore.write({ updateInProgress: false });
    ok(res, { aborted: true });
  }));

  return router;
}
