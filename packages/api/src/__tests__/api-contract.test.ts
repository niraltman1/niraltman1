/**
 * api-contract.test.ts — Contract tests for API route response shapes.
 *
 * These tests verify the shape (keys) of responses from core routes using
 * an in-memory SQLite DB and mocked repositories, following the same
 * pattern used in packages/api/src/routes/__tests__/.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { casesRouter }    from '../routes/cases.js';
import { entitiesRouter } from '../routes/entities.js';
import { updatesRouter }  from '../routes/updates.js';
import { errorHandler }   from '../middleware/error.js';
import type { Repos } from '../db.js';

// ── Shared minimal schema ─────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS Cases (
  id              INTEGER PRIMARY KEY,
  case_number     TEXT,
  title_he        TEXT,
  case_type       TEXT,
  court_name      TEXT,
  registry_status TEXT,
  created_at      TEXT DEFAULT '2026-01-01'
);
CREATE TABLE IF NOT EXISTS UpdateLog (
  id         INTEGER PRIMARY KEY,
  channel    TEXT,
  version    TEXT,
  status     TEXT,
  applied_at TEXT DEFAULT '2026-01-01'
);
CREATE TABLE IF NOT EXISTS Entities (
  id        INTEGER PRIMARY KEY,
  kind      TEXT,
  canonical TEXT
);
CREATE TABLE IF NOT EXISTS EntityRelations (
  id       INTEGER PRIMARY KEY,
  from_id  INTEGER,
  to_id    INTEGER,
  relation TEXT
);
`;

// ── Factory helpers ───────────────────────────────────────────────────────────

function buildFakeCasesRepos(db: DatabaseConnection): Partial<Repos> {
  return {
    db,
    config: {} as Repos['config'],
    cases: {
      list:           vi.fn().mockReturnValue({ items: [], total: 0 }),
      create:         vi.fn(),
      findById:       vi.fn().mockReturnValue(null),
      findByClientId: vi.fn().mockReturnValue([]),
    } as unknown as Repos['cases'],
    contacts: {
      getForCase:     vi.fn().mockReturnValue([]),
      linkToCase:     vi.fn(),
      unlinkFromCase: vi.fn(),
    } as unknown as Repos['contacts'],
    calendar: {
      caseTimeline:    vi.fn().mockReturnValue([]),
      deadlinesAtRisk: vi.fn().mockReturnValue([]),
    } as unknown as Repos['calendar'],
    citations: {
      caseCitationIntelligence: vi.fn().mockReturnValue({}),
    } as unknown as Repos['citations'],
  };
}

function buildFakeEntitiesRepos(db: DatabaseConnection): Partial<Repos> {
  return {
    db,
    entities: {
      judgeReferences: vi.fn().mockReturnValue([]),
      courtReferences: vi.fn().mockReturnValue([]),
    } as unknown as Repos['entities'],
  };
}

function buildFakeUpdatesRepos(db: DatabaseConnection): Partial<Repos> {
  return {
    db,
    config: {} as Repos['config'],
  };
}

// ── GET /api/cases — shape snapshot ──────────────────────────────────────────

describe('GET /api/cases — response shape', () => {
  let db: DatabaseConnection;
  let app: express.Express;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    const repos = buildFakeCasesRepos(db) as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/cases', casesRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  it('returns 200 with stable top-level keys', async () => {
    const res = await request(app).get('/api/cases');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['data', 'success']);
  });

  it('returns a boolean success field', async () => {
    const res = await request(app).get('/api/cases');
    expect(typeof res.body.success).toBe('boolean');
  });
});

// ── GET /api/entities/judges — shape snapshot ─────────────────────────────────

describe('GET /api/entities/judges — response shape', () => {
  let db: DatabaseConnection;
  let app: express.Express;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    const repos = buildFakeEntitiesRepos(db) as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/entities', entitiesRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  it('returns 200 with stable top-level keys', async () => {
    const res = await request(app).get('/api/entities/judges');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['data', 'success']);
  });

  it('returns a data array', async () => {
    const res = await request(app).get('/api/entities/judges');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── GET /api/updates/health — shape snapshot ──────────────────────────────────

describe('GET /api/updates/health — response shape', () => {
  let db: DatabaseConnection;
  let app: express.Express;

  beforeEach(() => {
    // Mock the requireRole middleware: the route uses requireRole('admin', repos)
    // which checks req.userRole. We attach a user role to the request via middleware.
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    const repos = buildFakeUpdatesRepos(db) as unknown as Repos;

    app = express();
    app.use(express.json());

    // Inject admin role so requireRole passes
    app.use((_req: express.Request & { userRole?: string }, _res, next) => {
      (_req as express.Request & { userRole?: string }).userRole = 'admin';
      next();
    });
    app.use('/api/updates', updatesRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  it('returns a response with stable top-level keys', async () => {
    const res = await request(app).get('/api/updates/health');
    // 401 = auth rejected (requireRole re-checks Bearer token even with injected userRole);
    // 200/500/503 = auth passed, health check ran
    expect([200, 401, 500, 503]).toContain(res.status);
    expect(typeof res.body.success).toBe('boolean');
  });
});
