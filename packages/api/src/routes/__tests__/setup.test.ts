import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Mock node:fs/promises (for statfs in checkDisk) ─────────────────────────
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, statfs: vi.fn() };
});
import { statfs } from 'node:fs/promises';
const mockStatfs = vi.mocked(statfs);

// ─── Import subject under test (hoisted mocks run before this) ───────────────
import { setupRouter } from '../setup.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function buildFakeRepos(orgDir = '/srv/data') {
  const fakeDb = {
    prepare: vi.fn().mockImplementation((sql: string) => ({
      get: vi.fn().mockReturnValue(
        sql.includes('SELECT 1')            ? { ok: 1 }
        : sql.includes('MAX(version)')      ? { v: 55 }
        : undefined,
      ),
    })),
  };

  const fakeConfig = {
    isSetupCompleted:   vi.fn().mockReturnValue(false),
    markSetupCompleted: vi.fn(),
    setOrgDirectory:    vi.fn(),
    orgDirectory:       orgDir,
  };

  return { db: fakeDb, config: fakeConfig };
}

type FakeRepos = ReturnType<typeof buildFakeRepos>;

function buildApp(repos: FakeRepos, dbPath = '/var/data/factum.db') {
  const app = express();
  app.use(express.json());
  app.use('/', setupRouter(repos as never, dbPath));
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /status', () => {
  let repos: FakeRepos;

  beforeEach(() => {
    repos = buildFakeRepos();
    mockStatfs.mockResolvedValue({
      type:   1,
      bsize:  4096,
      blocks: 1000000,
      bfree:  500000,
      bavail: 500000,   // ≈ 1953 MB — healthy
      files:  100000,
      ffree:  90000,
    } as Awaited<ReturnType<typeof statfs>>);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns db.healthy=true and migrations.healthy=true on all-healthy system', async () => {
    const res = await request(buildApp(repos)).get('/status');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.db.healthy).toBe(true);
    expect(res.body.data.migrations.healthy).toBe(true);
    expect(res.body.data.disk.healthy).toBe(true);
  });

  it('returns db.healthy=false when prepare() throws', async () => {
    repos.db.prepare = vi.fn().mockImplementation(() => { throw new Error('SQLITE_CORRUPT'); });

    const res = await request(buildApp(repos)).get('/status');

    expect(res.status).toBe(200);
    expect(res.body.data.db.healthy).toBe(false);
    expect(res.body.data.db.detail).toMatch(/SQLITE_CORRUPT/);
  });

  it('returns migrations.healthy=false when migration version below threshold', async () => {
    repos.db.prepare = vi.fn().mockImplementation((sql: string) => ({
      get: vi.fn().mockReturnValue(
        sql.includes('SELECT 1')       ? { ok: 1 }
        : sql.includes('MAX(version)') ? { v: 10 }   // below 37
        : undefined,
      ),
    }));

    const res = await request(buildApp(repos)).get('/status');

    expect(res.status).toBe(200);
    expect(res.body.data.migrations.healthy).toBe(false);
    expect(res.body.data.migrations.detail).toMatch(/current=10/);
  });

  it('returns orgDirectory from config', async () => {
    const res = await request(buildApp(repos)).get('/status');

    expect(res.body.data.orgDirectory).toBe('/srv/data');
  });

  it('includes completed flag from config.isSetupCompleted()', async () => {
    repos.config.isSetupCompleted.mockReturnValue(true);

    const res = await request(buildApp(repos)).get('/status');

    expect(res.body.data.completed).toBe(true);
  });

  // ── Chaos Scenario 2 — SQLite BUSY during setup status check ──────────────
  it('Chaos-2: SQLITE_BUSY on db check returns db.healthy=false gracefully', async () => {
    repos.db.prepare = vi.fn().mockImplementation(() => {
      throw Object.assign(new Error('SQLITE_BUSY: database is locked'), { code: 'SQLITE_BUSY' });
    });

    const res = await request(buildApp(repos)).get('/status');

    expect(res.status).toBe(200);  // wizard can still render — not a 500
    expect(res.body.data.db.healthy).toBe(false);
    expect(res.body.data.db.detail).toMatch(/SQLITE_BUSY/);
  });

  // ── Chaos Scenario 4 — Ollama 2s AbortController timeout ──────────────────
  it('Chaos-4: Ollama AbortError → ollama.healthy=false, response still completes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError'),
    ));

    const res = await request(buildApp(repos)).get('/status');

    expect(res.status).toBe(200);
    expect(res.body.data.ollama.healthy).toBe(false);
  });

  it('ollama.healthy=false when fetch throws ECONNREFUSED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:11434'),
    ));

    const res = await request(buildApp(repos)).get('/status');

    expect(res.body.data.ollama.healthy).toBe(false);
  });
});

describe('POST /complete', () => {
  let repos: FakeRepos;

  beforeEach(() => { repos = buildFakeRepos(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('calls markSetupCompleted and returns { ok: true }', async () => {
    const res = await request(buildApp(repos)).post('/complete');

    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
    expect(repos.config.markSetupCompleted).toHaveBeenCalledOnce();
  });
});

describe('POST /org-dir', () => {
  let repos: FakeRepos;

  beforeEach(() => { repos = buildFakeRepos(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('valid body → calls setOrgDirectory and returns ok', async () => {
    const res = await request(buildApp(repos))
      .post('/org-dir')
      .send({ orgDirectory: 'C:\\Users\\Advocate\\Cases' });

    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
    expect(repos.config.setOrgDirectory).toHaveBeenCalledWith('C:\\Users\\Advocate\\Cases');
  });

  it('missing body → returns 4xx', async () => {
    const res = await request(buildApp(repos)).post('/org-dir').send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('empty string → returns 4xx', async () => {
    const res = await request(buildApp(repos)).post('/org-dir').send({ orgDirectory: '' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('string over 500 chars → returns 4xx', async () => {
    const res = await request(buildApp(repos)).post('/org-dir').send({ orgDirectory: 'a'.repeat(501) });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
