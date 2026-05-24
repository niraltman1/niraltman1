import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createStream } from 'rotating-file-stream';
import { logger, createConsoleSink, withSanitization, type LogEntry } from '@factum-il/shared';

export function initLogger(): void {
  const level = (process.env['LOG_LEVEL'] ?? 'INFO') as Parameters<typeof logger.configure>[0];
  logger.configure(level);
  logger.addSink(withSanitization(createConsoleSink()));

  if (process.env['LOG_JSON'] === '1') {
    logger.addSink(withSanitization((entry: LogEntry) => {
      process.stdout.write(JSON.stringify(entry) + '\n');
    }));
  }

  if (process.env['NODE_ENV'] === 'production') {
    const logDir = process.env['FACTUM_IL_LOG_DIR']
      ?? join(
          process.env['LOCALAPPDATA']
            ?? join(process.env['USERPROFILE'] ?? process.env['HOME'] ?? '.', 'AppData', 'Local'),
          'FactumIL', 'logs',
        );
    mkdirSync(logDir, { recursive: true });

    const stream = createStream('app.log', {
      size:     '5M',
      maxFiles: 5,
      path:     logDir,
    });

    logger.addSink(withSanitization((entry: LogEntry) => {
      stream.write(JSON.stringify(entry) + '\n');
    }));
  }
}

export { logger };
