import { logger } from '@factum-il/shared';
import type { LogLevel, LogEntry } from '@factum-il/shared';
import { currentTraceId } from './correlation.js';

export interface ObservabilityLogMeta {
  documentId?: number;
  caseId?:     number;
  stage?:      string;
  [key: string]:  unknown;
}

// Wraps the shared logger to inject traceId from current async context
export const obsLogger = {
  log(level: LogLevel, message: string, meta: ObservabilityLogMeta = {}): void {
    const traceId = currentTraceId();
    logger.log(level, message, {
      ...meta,
      ...(traceId ? { operationId: traceId } : {}),
    } as Partial<Omit<LogEntry, 'timestamp' | 'level' | 'message'>>);
  },
  debug(message: string, meta?: ObservabilityLogMeta): void { this.log('DEBUG', message, meta); },
  info (message: string, meta?: ObservabilityLogMeta): void { this.log('INFO',  message, meta); },
  warn (message: string, meta?: ObservabilityLogMeta): void { this.log('WARN',  message, meta); },
  error(message: string, meta?: ObservabilityLogMeta): void { this.log('ERROR', message, meta); },
};
