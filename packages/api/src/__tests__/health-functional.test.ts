/**
 * health-functional.test.ts — Contract tests for GET /api/health/functional.
 *
 * Verifies the FAST functional health tier exercises the database, vector index
 * and corpus with real queries and returns a stable response shape. Embedding /
 * inference are intentionally NOT part of this tier (the desktop shell probes the
 * model directly), so this endpoint makes no network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { healthRouter } from '../routes/health.js';
import type { Repos } from '../db.js';
import type { RagHealingService } from '../utils/rag-healing.js';

// Minimal schema the functional checks touch. vec_chunks is a plain table here —
// the functional vector check only needs it to be queryable.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS LegalSources (
  id         INTEGER PRIMARY KEY,
  source_key TEXT,
  title      TEXT
);
CREATE TABLE IF NOT EXISTS vec_chunks (
  rowid INTEGER PRIMARY KEY
);
`;

const fakeHealing = {
  probeFts5:        vi.fn().mockReturnValue(true),
  getLastOllamaOkAt: vi.fn().mockReturnValue(null),
  runHealingCycle:  vi.fn(),
} as unknown as RagHealingService;

function buildApp(db: DatabaseConnection): express.Express {
  const repos = { db } as unknown as Repos;
  const app = express();
  app.use('/api/health', healthRouter(repos, ':memory:', fakeHealing));
  return app;
}

describe('GET /api/health/functional (fast tier)', () => {
  let db: DatabaseConnection;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with all data-layer checks healthy when corpus is populated', async () => {
    db.prepare("INSERT INTO LegalSources (source_key, title) VALUES ('k1', 'חוק לדוגמה')").run();

    const res = await request(buildApp(db)).get('/api/health/functional');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('vector');
    expect(res.body.checks).toHaveProperty('corpus');
    // Fast tier must NOT include the expensive embedding probe.
    expect(res.body.checks).not.toHaveProperty('embeddings');
    expect(res.body.checks.database.healthy).toBe(true);
    expect(res.body.checks.vector.healthy).toBe(true);
    expect(res.body.checks.corpus.healthy).toBe(true);
  });

  it('returns 503 when the corpus is empty (operational gate fails)', async () => {
    const res = await request(buildApp(db)).get('/api/health/functional');

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.checks.corpus.healthy).toBe(false);
  });

  it('reports the vector index as unavailable when vec_chunks is missing', async () => {
    db.exec('DROP TABLE vec_chunks');
    db.prepare("INSERT INTO LegalSources (source_key, title) VALUES ('k1', 'חוק')").run();

    const res = await request(buildApp(db)).get('/api/health/functional');

    expect(res.body.checks.vector.healthy).toBe(false);
    expect(res.status).toBe(503);
  });
});
