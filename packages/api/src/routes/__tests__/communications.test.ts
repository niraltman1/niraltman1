import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection, CommunicationsRepository } from '@factum-il/database';
import { communicationsRouter } from '../communications.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE system_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, role TEXT, is_active INTEGER DEFAULT 1);
CREATE TABLE user_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, token_hash TEXT, expires_at TEXT);
CREATE TABLE Clients (id INTEGER PRIMARY KEY, name_he TEXT);
CREATE TABLE Contacts (id INTEGER PRIMARY KEY);
CREATE TABLE Cases (id INTEGER PRIMARY KEY, client_id INTEGER, status TEXT DEFAULT 'open', opened_date TEXT);
CREATE TABLE CaseAssignments (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, user_id INTEGER, role TEXT DEFAULT 'attorney', assigned_at TEXT DEFAULT '2026-01-01', revoked_at TEXT);
CREATE TABLE CommChannels (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, label TEXT, status TEXT DEFAULT 'disconnected', identifier TEXT, credential_ref TEXT, created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01', UNIQUE(channel));
CREATE TABLE CommContactIdentities (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_id TEXT, display_name TEXT, client_id INTEGER, contact_id INTEGER, created_at TEXT DEFAULT '2026-01-01', UNIQUE(channel, external_id));
CREATE TABLE CommConversations (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_thread_id TEXT, client_id INTEGER, case_id INTEGER, assigned_user_id INTEGER, subject TEXT, status TEXT DEFAULT 'open', last_message_at TEXT, created_at TEXT DEFAULT '2026-01-01', UNIQUE(channel, external_thread_id));
CREATE TABLE CommMessages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER, channel TEXT, direction TEXT, external_message_id TEXT, sender_identity TEXT, body TEXT, media_kind TEXT, media_ref TEXT, handled INTEGER DEFAULT 0, replied INTEGER DEFAULT 0, created_at TEXT DEFAULT '2026-01-01', sent_at TEXT);
CREATE TABLE CommConsent (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER, channel TEXT, granted INTEGER DEFAULT 1, source TEXT, granted_at TEXT DEFAULT '2026-01-01', revoked_at TEXT, UNIQUE(client_id, channel));
CREATE TABLE CommAudit (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER, message_id INTEGER, user_id INTEGER, channel TEXT, action TEXT, detail TEXT, created_at TEXT DEFAULT '2026-01-01');
CREATE TABLE CommUnknownInbox (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_id TEXT, display_name TEXT, body TEXT, media_kind TEXT, media_ref TEXT, resolved INTEGER DEFAULT 0, resolved_as TEXT, resolved_ref INTEGER, created_at TEXT DEFAULT '2026-01-01');
`;

function tokenFor(db: DatabaseConnection, username: string, role: string): string {
  const u = db.prepare('INSERT INTO system_users (username, role) VALUES (?, ?)').run(username, role);
  const token = `tok-${username}`;
  const hash = createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(Number(u.lastInsertRowid), hash, new Date(Date.now() + 3_600_000).toISOString());
  return token;
}

describe('communicationsRouter — RBAC + consent gate (C0)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let adminTok: string, attorneyTok: string, assistantTok: string, readonlyTok: string;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.prepare("INSERT INTO Clients (id, name_he) VALUES (1, 'לקוח')").run();

    adminTok     = tokenFor(db, 'admin1', 'admin');
    attorneyTok  = tokenFor(db, 'att1', 'attorney');
    assistantTok = tokenFor(db, 'asst1', 'assistant');
    readonlyTok  = tokenFor(db, 'ro1', 'read_only');

    const repos = { db, communications: new CommunicationsRepository(db) } as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/communications', communicationsRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => db.close());

  it('rejects unauthenticated requests with 401', async () => {
    await request(app).get('/api/communications/conversations').expect(401);
  });

  it('rejects channel admin endpoint for non-admin with 403', async () => {
    await request(app).get('/api/communications/channels')
      .set('Authorization', `Bearer ${attorneyTok}`).expect(403);
  });

  it('allows admin to list channels', async () => {
    const res = await request(app).get('/api/communications/channels')
      .set('Authorization', `Bearer ${adminTok}`).expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('lets assistant read conversations but not send', async () => {
    await request(app).get('/api/communications/conversations')
      .set('Authorization', `Bearer ${assistantTok}`).expect(200);
    await request(app).post('/api/communications/conversations/1/send')
      .set('Authorization', `Bearer ${assistantTok}`).send({ body: 'x' }).expect(403);
  });

  it('read_only cannot read conversations (403)', async () => {
    await request(app).get('/api/communications/conversations')
      .set('Authorization', `Bearer ${readonlyTok}`).expect(403);
  });

  it('attorney inbound→send is consent-gated: 409 until consent, then 200', async () => {
    // Link identity + one open case so routing binds the conversation.
    db.prepare("INSERT INTO Cases (id, client_id, status, opened_date) VALUES (5, 1, 'open', '2026-01-01')").run();
    db.prepare("INSERT INTO CommContactIdentities (channel, external_id, client_id) VALUES ('telegram','tg-1',1)").run();

    const inbound = await request(app).post('/api/communications/inbound')
      .set('Authorization', `Bearer ${attorneyTok}`)
      .send({ channel: 'telegram', externalId: 'tg-1', body: 'שלום' }).expect(200);
    const convId = inbound.body.data.conversationId as number;
    expect(convId).toBeGreaterThan(0);

    // No consent yet → blocked (409).
    await request(app).post(`/api/communications/conversations/${convId}/send`)
      .set('Authorization', `Bearer ${attorneyTok}`).send({ body: 'נחזור אליך' }).expect(409);

    // Grant consent → send succeeds.
    await request(app).post('/api/communications/consent')
      .set('Authorization', `Bearer ${attorneyTok}`)
      .send({ clientId: 1, channel: 'telegram', granted: true, source: 'intake' }).expect(200);

    const sent = await request(app).post(`/api/communications/conversations/${convId}/send`)
      .set('Authorization', `Bearer ${attorneyTok}`).send({ body: 'נחזור אליך' }).expect(200);
    expect(sent.body.data.sent).toBe(true);
  });

  it('validates channel on inbound (422)', async () => {
    await request(app).post('/api/communications/inbound')
      .set('Authorization', `Bearer ${attorneyTok}`)
      .send({ channel: 'fax', externalId: 'x' }).expect(422);
  });
});
