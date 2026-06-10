import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection, GmailRepository } from '@factum-il/database';
import { gmailRouter } from '../gmail.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

vi.mock('../../modules/gmail/gmail-oauth.js', () => ({
  getAuthUrl:   vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?mock=1'),
  exchangeCode: vi.fn().mockResolvedValue({ encrypted_token: 'enc', token_iv: 'iv', token_tag: 'tag' }),
}));

vi.mock('../../modules/gmail/gmail-syncer.js', () => ({
  runGmailSync: vi.fn().mockResolvedValue({ synced: 0 }),
}));

const SCHEMA = `
CREATE TABLE GmailSyncConfig (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gmail_address TEXT, label_filter TEXT DEFAULT 'Factum IL',
  encrypted_token TEXT, token_iv TEXT, token_tag TEXT,
  last_sync_at TEXT, last_message_id TEXT, is_enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01'
);
CREATE TABLE GmailSyncLog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_config_id INTEGER, synced_at TEXT DEFAULT '2026-01-01',
  messages_found INTEGER, attachments_ingested INTEGER, errors_count INTEGER, error_summary TEXT
);
`;

function buildApp(repos: Repos): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/gmail', gmailRouter(repos));
  app.use(errorHandler);
  return app;
}

describe('gmailRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let repos: Repos;
  let prevEnabled: string | undefined;

  beforeEach(() => {
    prevEnabled = process.env['GMAIL_ENABLED'];
    process.env['GMAIL_ENABLED'] = 'true';

    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    repos = { db, gmail: new GmailRepository(db) } as unknown as Repos;
    app = buildApp(repos);
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
    if (prevEnabled === undefined) delete process.env['GMAIL_ENABLED'];
    else process.env['GMAIL_ENABLED'] = prevEnabled;
  });

  describe('POST /callback', () => {
    it('rejects a body missing required fields with 4xx', async () => {
      const res = await request(app).post('/api/gmail/callback').send({ code: 'abc123' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects unknown keys with 4xx (strict schema)', async () => {
      const res = await request(app).post('/api/gmail/callback').send({
        code: 'abc123', gmail_address: 'lawyer@example.com', extra: 'nope',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists the config', async () => {
      const res = await request(app).post('/api/gmail/callback').send({
        code: 'abc123', gmail_address: 'lawyer@example.com', label_filter: 'Cases',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.configId).toBe('number');

      const row = db.prepare('SELECT * FROM GmailSyncConfig WHERE id = ?').get(res.body.data.configId) as Record<string, unknown>;
      expect(row['gmail_address']).toBe('lawyer@example.com');
      expect(row['label_filter']).toBe('Cases');
    });
  });
});
