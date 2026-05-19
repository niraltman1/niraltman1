import type { DatabaseConnection } from '@legal-os/database';
import { logger } from '@legal-os/shared';

export function ensureAutoVacuum(db: DatabaseConnection): void {
  const row = db.prepare('PRAGMA auto_vacuum').get() as { auto_vacuum: number } | undefined;
  if ((row?.auto_vacuum ?? 0) === 2) return;

  const start = Date.now();
  db.prepare('PRAGMA auto_vacuum = INCREMENTAL').run();
  db.exec('VACUUM');
  logger.info(`auto_vacuum set to INCREMENTAL; full VACUUM completed in ${Date.now() - start}ms`, {
    category: 'system',
    agentSource: 'DataArchitect',
  });
}
