import type { RequestHandler } from 'express';
import { sanitizeUrlForLog, logger } from '@legal-os/shared';

export const requestLogger: RequestHandler = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms  = Date.now() - start;
    const url = sanitizeUrlForLog(req.originalUrl);
    const corrId = (req as unknown as { correlationId?: string }).correlationId;
    logger.info(`${req.method} ${url} → ${res.statusCode} (${ms}ms)`, {
      category: 'system',
      ...(corrId ? { operationId: corrId } : {}),
    });
  });
  next();
};
