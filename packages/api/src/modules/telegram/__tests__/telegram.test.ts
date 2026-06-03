import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection, CommunicationsRepository } from '@factum-il/database';
import { TelegramClient, TelegramApiError, type FetchLike } from '../telegram-client.js';
import { handleTelegramUpdate, type TelegramUpdate } from '../telegram-inbound.js';
import type { Repos } from '../../../db.js';

// ── Mock fetch helpers ────────────────────────────────────────────────────────
function jsonResponse(payload: unknown, ok = true, status = 200): FetchLike {
  return async () => ({
    ok, status,
    json: async () => payload,
    arrayBuffer: async () => new ArrayBuffer(0),
  });
}

describe('TelegramClient (mocked HTTP)', () => {
  it('getMe unwraps the {ok,result} envelope', async () => {
    const c = new TelegramClient('tok', jsonResponse({ ok: true, result: { id: 1, first_name: 'Bot', username: 'firm_bot' } }));
    const me = await c.getMe();
    expect(me.username).toBe('firm_bot');
  });

  it('sendMessage returns the message_id', async () => {
    const c = new TelegramClient('tok', jsonResponse({ ok: true, result: { message_id: 42 } }));
    expect(await c.sendMessage(123, 'שלום')).toBe(42);
  });

  it('throws TelegramApiError on ok:false', async () => {
    const c = new TelegramClient('tok', jsonResponse({ ok: false, error_code: 401, description: 'Unauthorized' }));
    await expect(c.getMe()).rejects.toBeInstanceOf(TelegramApiError);
  });

  it('passes the bot token + method in the URL', async () => {
    let calledUrl = '';
    const spy: FetchLike = async (url) => {
      calledUrl = url;
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { id: 1, first_name: 'B' } }), arrayBuffer: async () => new ArrayBuffer(0) };
    };
    await new TelegramClient('SECRET', spy).getMe();
    expect(calledUrl).toBe('https://api.telegram.org/botSECRET/getMe');
  });
});

// ── Inbound mapping → Smart Routing ─────────────────────────────────────────────
const SCHEMA = `
CREATE TABLE Clients (id INTEGER PRIMARY KEY, name_he TEXT);
CREATE TABLE Contacts (id INTEGER PRIMARY KEY);
CREATE TABLE Cases (id INTEGER PRIMARY KEY, client_id INTEGER, status TEXT DEFAULT 'open', opened_date TEXT);
CREATE TABLE CaseAssignments (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, user_id INTEGER, role TEXT DEFAULT 'attorney', assigned_at TEXT DEFAULT '2026-01-01', revoked_at TEXT);
CREATE TABLE CommContactIdentities (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_id TEXT, display_name TEXT, client_id INTEGER, contact_id INTEGER, created_at TEXT DEFAULT '2026-01-01', UNIQUE(channel, external_id));
CREATE TABLE CommConversations (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_thread_id TEXT, client_id INTEGER, case_id INTEGER, assigned_user_id INTEGER, subject TEXT, status TEXT DEFAULT 'open', last_message_at TEXT, created_at TEXT DEFAULT '2026-01-01', UNIQUE(channel, external_thread_id));
CREATE TABLE CommMessages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER, channel TEXT, direction TEXT, external_message_id TEXT, sender_identity TEXT, body TEXT, media_kind TEXT, media_ref TEXT, handled INTEGER DEFAULT 0, replied INTEGER DEFAULT 0, created_at TEXT DEFAULT '2026-01-01', sent_at TEXT);
CREATE TABLE CommConsent (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER, channel TEXT, granted INTEGER DEFAULT 1, source TEXT, granted_at TEXT DEFAULT '2026-01-01', revoked_at TEXT, UNIQUE(client_id, channel));
CREATE TABLE CommAudit (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER, message_id INTEGER, user_id INTEGER, channel TEXT, action TEXT, detail TEXT, created_at TEXT DEFAULT '2026-01-01');
CREATE TABLE CommUnknownInbox (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_id TEXT, display_name TEXT, body TEXT, media_kind TEXT, media_ref TEXT, resolved INTEGER DEFAULT 0, resolved_as TEXT, resolved_ref INTEGER, created_at TEXT DEFAULT '2026-01-01');
`;

describe('handleTelegramUpdate → routeInbound', () => {
  let db: DatabaseConnection;
  let repos: Repos;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.prepare("INSERT INTO Clients (id, name_he) VALUES (1, 'לקוח')").run();
    repos = { db, communications: new CommunicationsRepository(db) } as unknown as Repos;
  });

  afterEach(() => db.close());

  function textUpdate(fromId: number, text: string): TelegramUpdate {
    return { update_id: 1, message: { message_id: 10, chat: { id: fromId }, from: { id: fromId, first_name: 'דנה' }, text } };
  }

  it('returns null for an update with no message', () => {
    expect(handleTelegramUpdate(repos, { update_id: 9 })).toBeNull();
  });

  it('routes an unknown sender to the unknown inbox', () => {
    const r = handleTelegramUpdate(repos, textUpdate(999, 'שלום'));
    expect(r).not.toBeNull();
    expect(r!.routed).toBe(false);
    expect(r!.reason).toBe('unknown_sender');
  });

  it('routes a known sender with one open case to that case + attorney', () => {
    db.prepare("INSERT INTO Cases (id, client_id, status, opened_date) VALUES (5,1,'open','2026-01-01')").run();
    db.prepare("INSERT INTO CaseAssignments (case_id, user_id, role) VALUES (5, 7, 'attorney')").run();
    db.prepare("INSERT INTO CommContactIdentities (channel, external_id, client_id) VALUES ('telegram','555',1)").run();

    const r = handleTelegramUpdate(repos, textUpdate(555, 'יש עדכון?'));
    expect(r!.routed).toBe(true);
    expect(r!.caseId).toBe(5);
    expect(r!.assignedUserId).toBe(7);
    const msgs = repos.communications.listMessages(r!.conversationId!);
    expect(msgs[0]!.body).toBe('יש עדכון?');
    expect(msgs[0]!.senderIdentity).toBe('555');
  });

  it('maps a photo message to image media with the largest file_id', () => {
    db.prepare("INSERT INTO CommContactIdentities (channel, external_id, client_id) VALUES ('telegram','555',1)").run();
    const update: TelegramUpdate = {
      update_id: 2,
      message: {
        message_id: 11, chat: { id: 555 }, from: { id: 555, first_name: 'דנה' },
        caption: 'מצורף', photo: [{ file_id: 'small' }, { file_id: 'large' }],
      },
    };
    const r = handleTelegramUpdate(repos, update);
    const msg = repos.communications.listMessages(r!.conversationId!)[0]!;
    expect(msg.mediaKind).toBe('image');
    expect(msg.mediaRef).toBe('large');
    expect(msg.body).toBe('מצורף');
  });
});
