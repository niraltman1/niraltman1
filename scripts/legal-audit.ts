#!/usr/bin/env tsx
/**
 * Factum-IL legal-brain quantitative audit (CLI equivalent of GET /api/legal/audit).
 *
 * Run: tsx scripts/legal-audit.ts
 * Prints the flat audit contract as JSON and exits 0.
 *
 * DB path resolution mirrors packages/api/src/start.ts:
 *   FACTUM_IL_DB_PATH > _data/factum-il.db (dev)
 * The audit is read-only and defensive: a missing table contributes 0.
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseConnection, CorpusAuditRepository } from '@factum-il/database';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH =
  process.env['FACTUM_IL_DB_PATH'] ?? join(__dirname, '..', '_data', 'factum-il.db');

const db = new DatabaseConnection({ path: DB_PATH });
try {
  const audit = new CorpusAuditRepository(db).legalAuditContract();
  process.stdout.write(JSON.stringify(audit, null, 2) + '\n');
} finally {
  db.close();
}
