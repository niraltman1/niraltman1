import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { CommunicationsRepository } from './communications.js';

// Minimal slice of the real schema needed by routing + the C0 comm tables.
const SCHEMA = `
CREATE TABLE Clients (id INTEGER PRIMARY KEY, name_he TEXT);
CREATE TABLE Contacts (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE system_users (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE Cases (
  id INTEGER PRIMARY KEY, client_id INTEGER, status TEXT DEFAULT 'open',
  opened_date TEXT
);
CREATE TABLE CaseAssignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, user_id INTEGER,
  role TEXT DEFAULT 'attorney', assigned_at TEXT DEFAULT '2026-01-01', revoked_at TEXT
);

CREATE TABLE CommChannels (
  id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, label TEXT, status TEXT DEFAULT 'disconnected',
  identifier TEXT, credential_ref TEXT, created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01',
  UNIQUE(channel)
);
CREATE TABLE CommContactIdentities (
  id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_id TEXT, display_name TEXT,
  client_id INTEGER, contact_id INTEGER, created_at TEXT DEFAULT '2026-01-01',
  UNIQUE(channel, external_id)
);
CREATE TABLE CommConversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_thread_id TEXT,
  client_id INTEGER, case_id INTEGER, assigned_user_id INTEGER, subject TEXT,
  status TEXT DEFAULT 'open', last_message_at TEXT, created_at TEXT DEFAULT '2026-01-01',
  UNIQUE(channel, external_thread_id)
);
CREATE TABLE CommMessages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER, channel TEXT, direction TEXT,
  external_message_id TEXT, sender_identity TEXT, body TEXT, media_kind TEXT, media_ref TEXT,
  handled INTEGER DEFAULT 0, replied INTEGER DEFAULT 0, created_at TEXT DEFAULT '2026-01-01', sent_at TEXT
);
CREATE TABLE CommConsent (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER, channel TEXT, granted INTEGER DEFAULT 1,
  source TEXT, granted_at TEXT DEFAULT '2026-01-01', revoked_at TEXT, UNIQUE(client_id, channel)
);
CREATE TABLE CommAudit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER, message_id INTEGER, user_id INTEGER,
  channel TEXT, action TEXT, detail TEXT, created_at TEXT DEFAULT '2026-01-01'
);
CREATE TABLE CommUnknownInbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_id TEXT, display_name TEXT,
  body TEXT, media_kind TEXT, media_ref TEXT, resolved INTEGER DEFAULT 0,
  resolved_as TEXT, resolved_ref INTEGER, created_at TEXT DEFAULT '2026-01-01'
);
`;

describe('CommunicationsRepository (C0 — Smart Routing + consent gate)', () => {
  let db: DatabaseConnection;
  let repo: CommunicationsRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.prepare("INSERT INTO Clients (id, name_he) VALUES (1, 'ישראל ישראלי')").run();
    db.prepare("INSERT INTO system_users (id, name) VALUES (7, 'עו\"ד כהן')").run();
    repo = new CommunicationsRepository(db);
  });

  afterEach(() => db.close());

  it('routes an unknown sender to the unknown inbox (no guess)', () => {
    const r = repo.routeInbound({ channel: 'telegram', externalId: 'tg-999', body: 'שלום' });
    expect(r.routed).toBe(false);
    expect(r.reason).toBe('unknown_sender');
    expect(r.unknownInboxId).not.toBeNull();
    expect(r.conversationId).toBeNull();
    const inbox = db.prepare('SELECT COUNT(*) c FROM CommUnknownInbox').get() as { c: number };
    expect(inbox.c).toBe(1);
  });

  it('routes a known sender with one open case to that case + assigned attorney', () => {
    db.prepare("INSERT INTO Cases (id, client_id, status, opened_date) VALUES (10, 1, 'open', '2026-01-01')").run();
    db.prepare("INSERT INTO CaseAssignments (case_id, user_id, role) VALUES (10, 7, 'attorney')").run();
    repo.linkIdentity({ channel: 'telegram', externalId: 'tg-1', clientId: 1, displayName: 'ישראל' });

    const r = repo.routeInbound({ channel: 'telegram', externalId: 'tg-1', body: 'יש עדכון?' });
    expect(r.routed).toBe(true);
    expect(r.reason).toBe('routed');
    expect(r.clientId).toBe(1);
    expect(r.caseId).toBe(10);
    expect(r.assignedUserId).toBe(7);
    expect(r.status).toBe('open');

    const msgs = repo.listMessages(r.conversationId!);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.direction).toBe('inbound');
    expect(msgs[0]!.body).toBe('יש עדכון?');
  });

  it('sends ambiguous (multiple open cases) to triage without binding a case', () => {
    db.prepare("INSERT INTO Cases (id, client_id, status, opened_date) VALUES (10, 1, 'open', '2026-01-01')").run();
    db.prepare("INSERT INTO Cases (id, client_id, status, opened_date) VALUES (11, 1, 'open', '2026-02-01')").run();
    repo.linkIdentity({ channel: 'whatsapp', externalId: '+972500000001', clientId: 1 });

    const r = repo.routeInbound({ channel: 'whatsapp', externalId: '+972500000001', body: 'הי' });
    expect(r.routed).toBe(false);
    expect(r.reason).toBe('triage_multiple_cases');
    expect(r.caseId).toBeNull();
    expect(r.status).toBe('triage');
    expect(r.clientId).toBe(1);
  });

  it('reuses the same conversation for a repeat inbound on the same thread', () => {
    repo.linkIdentity({ channel: 'telegram', externalId: 'tg-1', clientId: 1 });
    const a = repo.routeInbound({ channel: 'telegram', externalId: 'tg-1', body: 'הודעה 1' });
    const b = repo.routeInbound({ channel: 'telegram', externalId: 'tg-1', body: 'הודעה 2' });
    expect(a.conversationId).toBe(b.conversationId);
    expect(repo.listMessages(a.conversationId!)).toHaveLength(2);
  });

  it('blocks outbound without consent and records send_blocked audit', () => {
    repo.linkIdentity({ channel: 'telegram', externalId: 'tg-1', clientId: 1 });
    const r = repo.routeInbound({ channel: 'telegram', externalId: 'tg-1', body: 'שלום' });

    const res = repo.sendOutbound({ conversationId: r.conversationId!, userId: 7, body: 'נחזור אליך' });
    expect(res.sent).toBe(false);
    if (!res.sent) expect(res.reason).toBe('no_consent');

    const blocked = db.prepare("SELECT COUNT(*) c FROM CommAudit WHERE action='send_blocked'").get() as { c: number };
    expect(blocked.c).toBe(1);
    // No outbound message was stored.
    const out = db.prepare("SELECT COUNT(*) c FROM CommMessages WHERE direction='outbound'").get() as { c: number };
    expect(out.c).toBe(0);
  });

  it('allows outbound once consent is granted and audits the send', () => {
    repo.linkIdentity({ channel: 'telegram', externalId: 'tg-1', clientId: 1 });
    const r = repo.routeInbound({ channel: 'telegram', externalId: 'tg-1', body: 'שלום' });
    expect(repo.hasConsent(1, 'telegram')).toBe(false);

    repo.recordConsent(1, 'telegram', true, 'intake_form');
    expect(repo.hasConsent(1, 'telegram')).toBe(true);

    const res = repo.sendOutbound({ conversationId: r.conversationId!, userId: 7, body: 'נחזור אליך' });
    expect(res.sent).toBe(true);

    const sends = db.prepare("SELECT COUNT(*) c FROM CommAudit WHERE action='send'").get() as { c: number };
    expect(sends.c).toBe(1);
    const out = repo.listMessages(r.conversationId!).filter((m) => m.direction === 'outbound');
    expect(out).toHaveLength(1);
    expect(out[0]!.body).toBe('נחזור אליך');
  });

  it('consent revocation re-blocks outbound', () => {
    repo.recordConsent(1, 'telegram', true);
    expect(repo.hasConsent(1, 'telegram')).toBe(true);
    repo.recordConsent(1, 'telegram', false);
    expect(repo.hasConsent(1, 'telegram')).toBe(false);
  });
});
