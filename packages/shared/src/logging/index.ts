export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
export type LogCategory = 'system' | 'ocr' | 'ai' | 'migration' | 'rollback' | 'installer' | 'startup';

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly category: LogCategory;
  readonly message: string;
  readonly operationId?: string;
  readonly agentSource?: string;
  readonly fileHash?: string;
  readonly resultState?: string;
  readonly [key: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO:  1,
  WARN:  2,
  ERROR: 3,
  FATAL: 4,
};

type LogSink = (entry: LogEntry) => void;

class Logger {
  private sinks: LogSink[] = [];
  private minLevel: LogLevel = 'INFO';

  configure(minLevel: LogLevel): void {
    this.minLevel = minLevel;
  }

  addSink(sink: LogSink): void {
    this.sinks.push(sink);
  }

  private emit(entry: LogEntry): void {
    if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[this.minLevel]) return;
    for (const sink of this.sinks) {
      sink(entry);
    }
  }

  log(
    level: LogLevel,
    message: string,
    meta: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'message'>> = {},
  ): void {
    this.emit({
      timestamp: new Date().toISOString(),
      level,
      message,
      category: 'system',
      ...meta,
    });
  }

  debug(message: string, meta?: Partial<LogEntry>): void { this.log('DEBUG', message, meta); }
  info (message: string, meta?: Partial<LogEntry>): void { this.log('INFO',  message, meta); }
  warn (message: string, meta?: Partial<LogEntry>): void { this.log('WARN',  message, meta); }
  error(message: string, meta?: Partial<LogEntry>): void { this.log('ERROR', message, meta); }
  fatal(message: string, meta?: Partial<LogEntry>): void { this.log('FATAL', message, meta); }
}

/** Singleton logger instance used throughout the application. */
export const logger = new Logger();

export { sanitizeForLog, sanitizeUrlForLog } from './sanitizer.js';
import { sanitizeForLog } from './sanitizer.js';

/** Wraps any sink so every string field in the entry is PII-redacted before forwarding. */
export function withSanitization(sink: LogSink): LogSink {
  return (entry: LogEntry) => {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(entry)) {
      sanitized[k] = typeof v === 'string' ? sanitizeForLog(v) : v;
    }
    sink(sanitized as LogEntry);
  };
}

/** Console sink that writes coloured output in development. */
export function createConsoleSink(): LogSink {
  return (entry: LogEntry) => {
    const line = `[${entry.timestamp}] [${entry.level}] [${entry.category}] ${entry.message}`;
    if (typeof console !== 'undefined') {
      switch (entry.level) {
        case 'WARN':  console.warn(line);  break;
        case 'ERROR':
        case 'FATAL': console.error(line); break;
        default:      console.log(line);
      }
    }
  };
}
