import { Router } from 'express';
import type { Response } from 'express';

const sseClients = new Set<Response>();

export function broadcast(event: string, data: unknown): void {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}

export function eventsRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sseClients.add(res);
    res.on('close', () => sseClients.delete(res));
  });

  return router;
}
