import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection, CommunicationsRepository, CommTemplatesRepository, CallLogsRepository, TaskRepository } from '@factum-il/database';
import { communicationsRouter } from '../communications.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE system_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, role TEXT, is_active INTEGER DEFAULT 1);
CREATE TABLE user_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, token_hash TEXT, expires_at TEXT);
CREATE TABLE Clients (id INTEGER PRIMARY KEY, name_he TEXT);
CREATE TABLE Contacts (id INTEGER PRIMARY KEY);
CREATE TABLE Cases (id INTEGER PRIMARY KEY, client_id INTEGER, status TEXT DEFAULT 'open', opened_date TEXT, case_number TEXT, title_he TEXT, court_name TEXT, case_type TEXT DEFAULT 'civil');
CREATE TABLE court_hearings (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, hearing_date TEXT);
CREATE TABLE Documents (id INTEGER PRIMARY KEY);
CREATE TABLE CommTemplates (id INTEGER PRIMARY KEY AUTOINCREMENT, name_he TEXT, body TEXT, channel TEXT, case_type TEXT, case_status TEXT, client_status TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01');
CREATE TABLE CommSecureLinks (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE, purpose TEXT, case_id INTEGER, document_id INTEGER, created_by INTEGER, expires_at TEXT, used_at TEXT, created_at TEXT DEFAULT '2026-01-01');
CREATE TABLE CaseAssignments (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, user_id INTEGER, role TEXT DEFAULT 'attorney', assigned_at TEXT DEFAULT '2026-01-01', revoked_at TEXT);
CREATE TABLE CommChannels (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, label TEXT, status TEXT DEFAULT 'disconnected', identifier TEXT, credential_ref TEXT, created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01', UNIQUE(channel));
CREATE TABLE CommContactIdentities (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_id TEXT, display_name TEXT, client_id INTEGER, contact_id INTEGER, created_at TEXT DEFAULT '2026-01-01', UNIQUE(channel, external_id));
CREATE TABLE CommConversations (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_thread_id TEXT, client_id INTEGER, case_id INTEGER, assigned_user_id INTEGER, subject TEXT, status TEXT DEFAULT 'open', last_message_at TEXT, created_at TEXT DEFAULT '2026-01-01', UNIQUE(channel, external_thread_id));
CREATE TABLE CommMessages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER, channel TEXT, direction TEXT, external_message_id TEXT, sender_identity TEXT, body TEXT, media_kind TEXT, media_ref TEXT, handled INTEGER DEFAULT 0, replied INTEGER DEFAULT 0, transcript TEXT, created_at TEXT DEFAULT '2026-01-01', sent_at TEXT);
CREATE TABLE CommEvidence (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER UNIQUE, conversation_id INTEGER, case_id INTEGER, client_id INTEGER, channel TEXT, direction TEXT, sender_identity TEXT, body TEXT, media_kind TEXT, media_ref TEXT, content_hash TEXT, message_created_at TEXT, captured_by INTEGER, is_locked INTEGER DEFAULT 1, captured_at TEXT DEFAULT '2026-01-01');
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
  let adminTok: string, attorneyTok: string;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.prepare("INSERT INTO Clients (id, name_he) VALUES (1, 'לקוח')").run();

    adminTok    = tokenFor(db, 'admin1', 'admin');
    attorneyTok = tokenFor(db, 'att1', 'attorney');

    const repos = {
      db,
      communications: new CommunicationsRepository(db),
      commTemplates:  new CommTemplatesRepository(db),
    } as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/communications', communicationsRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => db.close());

  it('rejects unauthenticated requests with 401', async () => {
    await request(app).get('/api/communications/channels').expect(401);
  });

  it('rejects channel admin endpoint for non-admin with 403 (secrets are least-privilege)', async () => {
    await request(app).get('/api/communications/channels')
      .set('Authorization', `Bearer ${attorneyTok}`).expect(403);
  });

  it('allows admin to list channels (secret values never returned)', async () => {
    const res = await request(app).get('/api/communications/channels')
      .set('Authorization', `Bearer ${adminTok}`).expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('operational reads are ungated like /cases, /documents', async () => {
    // No Authorization header — trusted local app, consistent with the rest of the API.
    await request(app).get('/api/communications/conversations').expect(200);
    await request(app).get('/api/communications/unknown').expect(200);
  });

  it('send is consent-gated (409 → 200) and audited, regardless of role gating', async () => {
    db.prepare("INSERT INTO Cases (id, client_id, status, opened_date) VALUES (5, 1, 'open', '2026-01-01')").run();
    db.prepare("INSERT INTO CommContactIdentities (channel, external_id, client_id) VALUES ('telegram','tg-1',1)").run();

    const inbound = await request(app).post('/api/communications/inbound')
      .send({ channel: 'telegram', externalId: 'tg-1', body: 'שלום' }).expect(200);
    const convId = inbound.body.data.conversationId as number;
    expect(convId).toBeGreaterThan(0);

    // No consent yet → blocked (409) — the legal control, independent of RBAC.
    await request(app).post(`/api/communications/conversations/${convId}/send`)
      .send({ body: 'נחזור אליך' }).expect(409);

    await request(app).post('/api/communications/consent')
      .send({ clientId: 1, channel: 'telegram', granted: true, source: 'intake' }).expect(200);

    const sent = await request(app).post(`/api/communications/conversations/${convId}/send`)
      .send({ body: 'נחזור אליך' }).expect(200);
    expect(sent.body.data.sent).toBe(true);

    // Every attempt is audited (send_blocked + send).
    const blocked = db.prepare("SELECT COUNT(*) c FROM CommAudit WHERE action='send_blocked'").get() as { c: number };
    const sends   = db.prepare("SELECT COUNT(*) c FROM CommAudit WHERE action='send'").get() as { c: number };
    expect(blocked.c).toBe(1);
    expect(sends.c).toBe(1);
  });

  it('validates channel on inbound (422)', async () => {
    await request(app).post('/api/communications/inbound')
      .send({ channel: 'fax', externalId: 'x' }).expect(422);
  });

  // ── Smart templates (C4) ──────────────────────────────────────────────────
  it('matches context templates and renders case variables (preview does not mint links)', async () => {
    db.prepare("UPDATE Clients SET name_he = 'דנה כהן' WHERE id = 1").run();
    db.prepare("INSERT INTO Cases (id, client_id, status, case_number, title_he, court_name, case_type) VALUES (5,1,'open','תא-2024-7','תביעה','שלום ת\"א','civil')").run();
    db.prepare("INSERT INTO CommTemplates (name_he, body, case_status) VALUES ('reminder','שלום {{client_name}}, תיק {{case_number}}','open')").run();
    db.prepare("INSERT INTO CommTemplates (name_he, body, case_status) VALUES ('closed-tpl','x','closed')").run();
    db.prepare("INSERT INTO CommTemplates (name_he, body) VALUES ('sign-tpl','חתום: {{sign_link}}')").run();

    const res = await request(app).get('/api/communications/templates/match?caseId=5').expect(200);
    const names = (res.body.data as { nameHe: string; preview: string }[]).map((t) => t.nameHe);
    expect(names).toContain('reminder');
    expect(names).not.toContain('closed-tpl');     // status mismatch
    const reminder = (res.body.data as { nameHe: string; preview: string }[]).find((t) => t.nameHe === 'reminder')!;
    expect(reminder.preview).toBe('שלום דנה כהן, תיק תא-2024-7');
    // Preview must NOT mint a real secure link.
    const minted = db.prepare('SELECT COUNT(*) c FROM CommSecureLinks').get() as { c: number };
    expect(minted.c).toBe(0);
  });

  it('render endpoint mints a real secure link for sign placeholders', async () => {
    db.prepare("INSERT INTO Cases (id, client_id, status, case_number, case_type) VALUES (5,1,'open','תא-1','civil')").run();
    const r = db.prepare("INSERT INTO CommTemplates (name_he, body) VALUES ('sign','חתום: {{sign_link}}')").run();
    const res = await request(app).post(`/api/communications/templates/${Number(r.lastInsertRowid)}/render`)
      .send({ caseId: 5 }).expect(200);
    expect(res.body.data.rendered).toContain('/secure/');
    const minted = db.prepare("SELECT COUNT(*) c FROM CommSecureLinks WHERE purpose='sign'").get() as { c: number };
    expect(minted.c).toBe(1);
  });

  // ── Evidence + transcription (C5) ──────────────────────────────────────────
  it('saves a message as a locked exhibit and lists it by case', async () => {
    db.prepare("INSERT INTO Cases (id, client_id, status) VALUES (5,1,'open')").run();
    db.prepare("INSERT INTO CommContactIdentities (channel, external_id, client_id) VALUES ('telegram','tg-1',1)").run();
    const inbound = await request(app).post('/api/communications/inbound')
      .send({ channel: 'telegram', externalId: 'tg-1', body: 'ראיה' }).expect(200);
    const convId = inbound.body.data.conversationId as number;
    const msgId = (await request(app).get(`/api/communications/conversations/${convId}`).expect(200))
      .body.data.messages[0].id as number;

    const saved = await request(app).post(`/api/communications/messages/${msgId}/save-evidence`).expect(200);
    expect(saved.body.data.contentHash).toMatch(/^[a-f0-9]{64}$/);

    const list = await request(app).get('/api/communications/evidence?caseId=5').expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('transcribe returns 409 when no local Whisper is configured', async () => {
    delete process.env['WHISPER_CMD'];
    db.prepare("INSERT INTO CommContactIdentities (channel, external_id, client_id) VALUES ('telegram','tg-1',1)").run();
    const inbound = await request(app).post('/api/communications/inbound')
      .send({ channel: 'telegram', externalId: 'tg-1', mediaKind: 'audio', mediaRef: '/tmp/v.ogg' }).expect(200);
    const convId = inbound.body.data.conversationId as number;
    const msgId = (await request(app).get(`/api/communications/conversations/${convId}`).expect(200))
      .body.data.messages[0].id as number;
    await request(app).post(`/api/communications/messages/${msgId}/transcribe`).expect(409);
  });
});

// ── Call documentation (C6) ──────────────────────────────────────────────────
describe('communicationsRouter — call documentation (C6)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let attorneyTok: string;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.exec(`
      CREATE TABLE CallLogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, case_id INTEGER,
        is_evidence INTEGER NOT NULL DEFAULT 0, direction TEXT NOT NULL DEFAULT 'inbound',
        subject TEXT, summary TEXT, occurred_at TEXT NOT NULL, duration_minutes INTEGER,
        participants TEXT, tags TEXT, created_by INTEGER,
        created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01'
      );
      CREATE TABLE Tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'normal', due_date TEXT, client_id INTEGER, case_id INTEGER,
        document_id INTEGER, source TEXT DEFAULT 'manual', created_at TEXT DEFAULT '2026-01-01',
        updated_at TEXT DEFAULT '2026-01-01'
      );
    `);
    db.prepare("INSERT INTO Clients (id, name_he) VALUES (1, 'לקוח')").run();
    db.prepare("INSERT INTO Cases (id, client_id, status) VALUES (5,1,'open')").run();
    attorneyTok = tokenFor(db, 'att1', 'attorney');

    const repos = {
      db,
      communications: new CommunicationsRepository(db),
      commTemplates:  new CommTemplatesRepository(db),
      callLogs:       new CallLogsRepository(db),
      tasks:          new TaskRepository(db),
    } as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/communications', communicationsRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => db.close());

  it('creates a call log and spins action items into linked Tasks', async () => {
    const res = await request(app).post('/api/communications/calls')
      .set('Authorization', `Bearer ${attorneyTok}`)
      .send({
        clientId: 1, caseId: 5, direction: 'outbound', subject: 'עדכון',
        summary: 'סיכום שיחה', durationMinutes: 8, tags: ['דחוף'],
        actionItems: [{ title: 'להכין תצהיר', priority: 'high' }, { title: '' }],
      }).expect(200);
    expect(res.body.data.call.id).toBeGreaterThan(0);
    expect(res.body.data.call.caseId).toBe(5);
    expect(res.body.data.taskIds).toHaveLength(1); // blank action item skipped
    const task = db.prepare('SELECT * FROM Tasks WHERE id = ?').get(res.body.data.taskIds[0]) as Record<string, unknown>;
    expect(task['title']).toBe('להכין תצהיר');
    expect(task['case_id']).toBe(5);
  });

  it('lists calls by client and by case', async () => {
    await request(app).post('/api/communications/calls').set('Authorization', `Bearer ${attorneyTok}`)
      .send({ clientId: 1, subject: 'א' }).expect(200);
    await request(app).post('/api/communications/calls').set('Authorization', `Bearer ${attorneyTok}`)
      .send({ clientId: 1, caseId: 5, subject: 'ב' }).expect(200);
    expect((await request(app).get('/api/communications/calls?clientId=1').expect(200)).body.data).toHaveLength(2);
    expect((await request(app).get('/api/communications/calls?caseId=5').expect(200)).body.data).toHaveLength(1);
  });

  it('promotes a call into the case timeline via save-evidence', async () => {
    const created = await request(app).post('/api/communications/calls')
      .set('Authorization', `Bearer ${attorneyTok}`).send({ clientId: 1, subject: 'שיחה' }).expect(200);
    const id = created.body.data.call.id as number;
    const promoted = await request(app).post(`/api/communications/calls/${id}/save-evidence`)
      .set('Authorization', `Bearer ${attorneyTok}`).send({ caseId: 5 }).expect(200);
    expect(promoted.body.data.isEvidence).toBe(true);
    expect(promoted.body.data.caseId).toBe(5);
  });

  it('transcribe-audio returns 409 when no local Whisper is configured', async () => {
    delete process.env['WHISPER_CMD'];
    await request(app).post('/api/communications/transcribe-audio')
      .set('Authorization', `Bearer ${attorneyTok}`)
      .send({ audioBase64: Buffer.from('x').toString('base64'), mimeType: 'audio/webm' }).expect(409);
  });
});
