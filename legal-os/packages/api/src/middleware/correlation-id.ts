import { randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';

export const correlationId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-correlation-id'];
  const id = (typeof incoming === 'string' && incoming) ? incoming : randomBytes(8).toString('hex');
  (req as unknown as Record<string, unknown>)['correlationId'] = id;
  res.setHeader('X-Correlation-Id', id);
  next();
};
