import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection, CommunicationsRepository } from '@factum-il/database';
import { transcribeCommMessage, TranscriptionUnavailableError } from '../whisper.js';
import type { Repos } from '../../../db.js';

const SCHEMA = `
CREATE TABLE Clients (id INTEGER PRIMARY KEY);
CREATE TABLE Contacts (id INTEGER PRIMARY KEY);
CREATE TABLE Cases (id INTEGER PRIMARY KEY, client_id INTEGER, status TEXT, opened_date TEXT);
CREATE TABLE CaseAssignments (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, user_id INTEGER, role TEXT, assigned_at TEXT, revoked_at TEXT);
CREATE TABLE CommContactIdentities (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_id TEXT, display_name TEXT, client_id INTEGER, contact_id INTEGER, created_at TEXT DEFAULT '2026-01-01', UNIQUE(channel, external_id));
CREATE TABLE CommConversations (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_thread_id TEXT, client_id INTEGER, case_id INTEGER, assigned_user_id INTEGER, subject TEXT, status TEXT DEFAULT 'open', last_message_at TEXT, created_at TEXT DEFAULT '2026-01-01', UNIQUE(channel, external_thread_id));
CREATE TABLE CommMessages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER, channel TEXT, direction TEXT, external_message_id TEXT, sender_identity TEXT, body TEXT, media_kind TEXT, media_ref TEXT, handled INTEGER DEFAULT 0, replied INTEGER DEFAULT 0, transcript TEXT, created_at TEXT DEFAULT '2026-01-01', sent_at TEXT);
CREATE TABLE CommAudit (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER, message_id INTEGER, user_id INTEGER, channel TEXT, action TEXT, detail TEXT, created_at TEXT DEFAULT '2026-01-01');
CREATE TABLE CommUnknownInbox (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, external_id TEXT, display_name TEXT, body TEXT, media_kind TEXT, media_ref TEXT, resolved INTEGER DEFAULT 0, resolved_as TEXT, resolved_ref INTEGER, created_at TEXT DEFAULT '2026-01-01');
`;

describe('transcribeCommMessage (injected transcriber — no model needed)', () => {
  let db: DatabaseConnection;
  let repos: Repos;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.prepare("INSERT INTO CommContactIdentities (channel, external_id, client_id) VALUES ('telegram','tg-1',1)").run();
    repos = { db, communications: new CommunicationsRepository(db) } as unknown as Repos;
  });

  afterEach(() => db.close());

  function audioMessageId(): number {
    const r = repos.communications.routeInbound({ channel: 'telegram', externalId: 'tg-1', mediaKind: 'audio', mediaRef: '/tmp/v.ogg' });
    return repos.communications.listMessages(r.conversationId!)[0]!.id;
  }

  it('transcribes audio and persists the transcript', async () => {
    const id = audioMessageId();
    const text = await transcribeCommMessage(repos, id, async (ref) => `תומלל: ${ref}`);
    expect(text).toBe('תומלל: /tmp/v.ogg');
    expect(repos.communications.getMessage(id)!.transcript).toBe('תומלל: /tmp/v.ogg');
  });

  it('rejects a non-audio message', async () => {
    const r = repos.communications.routeInbound({ channel: 'telegram', externalId: 'tg-1', body: 'טקסט' });
    const id = repos.communications.listMessages(r.conversationId!)[0]!.id;
    await expect(transcribeCommMessage(repos, id, async () => 'x')).rejects.toBeInstanceOf(TranscriptionUnavailableError);
  });
});
