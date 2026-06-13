import { Router } from 'express';
import { listLoadedPlugins, loadPlugin, unloadPlugin, isValidManifest } from '@factum-il/sdk';
import { asyncHandler } from '../utils/async-handler.js';
import { ok, fail } from '../utils/response.js';

export function pluginsRouter(): Router {
  const router = Router();

  router.get('/', asyncHandler((_req, res) => {
    ok(res, { plugins: listLoadedPlugins() });
  }));

  router.post('/load', asyncHandler((req, res) => {
    const { manifest } = req.body as { manifest: unknown };
    if (!isValidManifest(manifest)) return fail(res, 'INVALID_MANIFEST', 'invalid manifest', 400);
    const loaded = loadPlugin(manifest);
    ok(res, { loaded: loaded.manifest.name });
  }));

  router.delete('/:name', asyncHandler((req, res) => {
    unloadPlugin(req.params['name']!);
    ok(res, { unloaded: req.params['name'] });
  }));

  return router;
}
