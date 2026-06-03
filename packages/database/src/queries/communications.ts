import { createHash } from 'node:crypto';
import type { DatabaseConnection } from '../connection.js';

/**
 * Communications module (C0) — channel-agnostic message store + Smart Routing.
 *
 * Centralized firm-wide accounts: inbound messages arrive on one official channel and are
 * routed to the correct case + assigned attorney via CommContactIdentities → Clients →
 * CaseAssignments. Outbound is consent-gated (CommConsent) and fully audited (CommAudit).
 * Verbatim content is kept locally for evidence; media is referenced by a LOCAL path only.
 */

export type CommChannel = 'telegram' | 'whatsapp' | 'email' | 'phone';
export type CommDirection = 'inbound' | 'outbound';
export type ConversationStatus = 'open' | 'closed' | 'triage';

export interface CommConversation {
  id:             number;
  channel:        CommChannel;
  externalThreadId: string | null;
  clientId:       number | null;
  caseId:         number | null;
  assignedUserId: number | null;
  subject:        string | null;
  status:         ConversationStatus;
  lastMessageAt:  string | null;
  createdAt:      string;
}

export interface CommMessage {
  id:             number;
  conversationId: number;
  channel:        CommChannel;
  direction:      CommDirection;
  body:           string | null;
  mediaKind:      string | null;
  mediaRef:       string | null;
  senderIdentity: string | null;
  handled:        boolean;
  replied:        boolean;
  transcript:     string | null;
  createdAt:      string;
  sentAt:         string | null;
}

export interface CommEvidenceRow {
  id:               number;
  messageId:        number;
  caseId:           number | null;
  clientId:         number | null;
  channel:          CommChannel;
  direction:        CommDirection;
  senderIdentity:   string | null;
  body:             string | null;
  mediaKind:        string | null;
  contentHash:      string;
  messageCreatedAt: string | null;
  capturedBy:       number | null;
  capturedAt:       string;
}

export interface InboundInput {
  channel:      CommChannel;
  externalId:   string;          // sender identity on the channel
  displayName?: string;
  body?:        string;
  mediaKind?:   string;
  mediaRef?:    string;
  externalMessageId?: string;
  externalThreadId?:  string;    // defaults to externalId for 1:1 chats
}

export interface RoutingResult {
  routed:         boolean;        // true if resolved to a known client
  conversationId: number | null;
  messageId:      number | null;
  clientId:       number | null;
  caseId:         number | null;
  assignedUserId: number | null;
  status:         ConversationStatus | null;
  unknownInboxId: number | null;  // set when routing failed (unidentified sender)
  reason:         'routed' | 'triage_multiple_cases' | 'triage_no_case' | 'unknown_sender';
}

export interface SendInput {
  conversationId: number;
  userId:         number | null;
  body?:          string;
  mediaKind?:     string;
  mediaRef?:      string;
  externalMessageId?: string;
}

export type SendResult =
  | { sent: true;  messageId: number }
  | { sent: false; reason: 'no_consent'; clientId: number; channel: CommChannel };

function mapConversation(r: Record<string, unknown>): CommConversation {
  return {
    id:               r['id'] as number,
    channel:          r['channel'] as CommChannel,
    externalThreadId: (r['external_thread_id'] as string | null) ?? null,
    clientId:         (r['client_id'] as number | null) ?? null,
    caseId:           (r['case_id'] as number | null) ?? null,
    assignedUserId:   (r['assigned_user_id'] as number | null) ?? null,
    subject:          (r['subject'] as string | null) ?? null,
    status:           r['status'] as ConversationStatus,
    lastMessageAt:    (r['last_message_at'] as string | null) ?? null,
    createdAt:        r['created_at'] as string,
  };
}

function mapMessage(r: Record<string, unknown>): CommMessage {
  return {
    id:             r['id'] as number,
    conversationId: r['conversation_id'] as number,
    channel:        r['channel'] as CommChannel,
    direction:      r['direction'] as CommDirection,
    body:           (r['body'] as string | null) ?? null,
    mediaKind:      (r['media_kind'] as string | null) ?? null,
    mediaRef:       (r['media_ref'] as string | null) ?? null,
    senderIdentity: (r['sender_identity'] as string | null) ?? null,
    handled:        Number(r['handled']) === 1,
    replied:        Number(r['replied']) === 1,
    transcript:     (r['transcript'] as string | null) ?? null,
    createdAt:      r['created_at'] as string,
    sentAt:         (r['sent_at'] as string | null) ?? null,
  };
}

function mapEvidence(r: Record<string, unknown>): CommEvidenceRow {
  return {
    id:               r['id'] as number,
    messageId:        r['message_id'] as number,
    caseId:           (r['case_id'] as number | null) ?? null,
    clientId:         (r['client_id'] as number | null) ?? null,
    channel:          r['channel'] as CommChannel,
    direction:        r['direction'] as CommDirection,
    senderIdentity:   (r['sender_identity'] as string | null) ?? null,
    body:             (r['body'] as string | null) ?? null,
    mediaKind:        (r['media_kind'] as string | null) ?? null,
    contentHash:      r['content_hash'] as string,
    messageCreatedAt: (r['message_created_at'] as string | null) ?? null,
    capturedBy:       (r['captured_by'] as number | null) ?? null,
    capturedAt:       r['captured_at'] as string,
  };
}

export type ChannelStatus = 'connected' | 'disconnected' | 'error';

export interface CommChannelRow {
  id:            number;
  channel:       CommChannel;
  label:         string | null;
  status:        ChannelStatus;
  identifier:    string | null;
  hasCredential: boolean;     // never the secret itself — only whether one is configured
  updatedAt:     string;
}

export interface UnknownInboxRow {
  id:          number;
  channel:     CommChannel;
  externalId:  string;
  displayName: string | null;
  body:        string | null;
  mediaKind:   string | null;
  resolved:    boolean;
  createdAt:   string;
}

export class CommunicationsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  // ── Channels (firm-wide) ──────────────────────────────────────────────────
  /** Register or update a channel. `credentialRef` points at the encrypted secret store. */
  upsertChannel(c: {
    channel: CommChannel; label?: string; identifier?: string;
    status?: ChannelStatus; credentialRef?: string;
  }): number {
    this.db.prepare(`
      INSERT INTO CommChannels (channel, label, identifier, status, credential_ref, updated_at)
      VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(channel) DO UPDATE SET
        label          = COALESCE(excluded.label,          CommChannels.label),
        identifier     = COALESCE(excluded.identifier,     CommChannels.identifier),
        status         = COALESCE(excluded.status,         CommChannels.status),
        credential_ref = COALESCE(excluded.credential_ref, CommChannels.credential_ref),
        updated_at     = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).run(c.channel, c.label ?? null, c.identifier ?? null,
           c.status ?? 'disconnected', c.credentialRef ?? null);
    return (this.db.prepare('SELECT id FROM CommChannels WHERE channel = ?')
      .get(c.channel) as { id: number }).id;
  }

  /** List channels for the admin view — the secret is NEVER returned, only `hasCredential`. */
  listChannels(): CommChannelRow[] {
    const rows = this.db.prepare(
      'SELECT id, channel, label, status, identifier, credential_ref, updated_at FROM CommChannels ORDER BY channel',
    ).all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id:            r['id'] as number,
      channel:       r['channel'] as CommChannel,
      label:         (r['label'] as string | null) ?? null,
      status:        r['status'] as ChannelStatus,
      identifier:    (r['identifier'] as string | null) ?? null,
      hasCredential: (r['credential_ref'] as string | null) != null,
      updatedAt:     r['updated_at'] as string,
    }));
  }

  // ── Identity resolution ───────────────────────────────────────────────────
  /** Resolve a channel-specific sender identity to a client id, if known. */
  resolveClientId(channel: CommChannel, externalId: string): number | null {
    const row = this.db.prepare(
      `SELECT client_id FROM CommContactIdentities WHERE channel = ? AND external_id = ?`,
    ).get(channel, externalId) as { client_id: number | null } | undefined;
    return row?.client_id ?? null;
  }

  /** Link a channel identity to a client (and/or contact). Idempotent on (channel, external_id). */
  linkIdentity(input: {
    channel: CommChannel; externalId: string; displayName?: string;
    clientId?: number | null; contactId?: number | null;
  }): void {
    this.db.prepare(`
      INSERT INTO CommContactIdentities (channel, external_id, display_name, client_id, contact_id)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(channel, external_id) DO UPDATE SET
        display_name = COALESCE(excluded.display_name, CommContactIdentities.display_name),
        client_id    = COALESCE(excluded.client_id,    CommContactIdentities.client_id),
        contact_id   = COALESCE(excluded.contact_id,   CommContactIdentities.contact_id)
    `).run(input.channel, input.externalId, input.displayName ?? null,
           input.clientId ?? null, input.contactId ?? null);
  }

  // ── Smart Routing ─────────────────────────────────────────────────────────
  /**
   * Route an inbound message from the centralized firm account to the right
   * conversation. Resolves sender → client → active case → assigned attorney.
   * Ambiguous (multiple open cases) or unknown senders are NOT guessed: they go
   * to triage / the unknown inbox.
   */
  routeInbound(input: InboundInput): RoutingResult {
    const threadId = input.externalThreadId ?? input.externalId;
    const clientId = this.resolveClientId(input.channel, input.externalId);

    // Unknown sender → unknown inbox (C8).
    if (clientId === null) {
      const res = this.db.prepare(`
        INSERT INTO CommUnknownInbox (channel, external_id, display_name, body, media_kind, media_ref)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(input.channel, input.externalId, input.displayName ?? null,
             input.body ?? null, input.mediaKind ?? null, input.mediaRef ?? null);
      return {
        routed: false, conversationId: null, messageId: null, clientId: null,
        caseId: null, assignedUserId: null, status: null,
        unknownInboxId: Number(res.lastInsertRowid), reason: 'unknown_sender',
      };
    }

    // Active cases for this client + their active attorney assignment.
    const cases = this.db.prepare(`
      SELECT c.id AS case_id, (
        SELECT ca.user_id FROM CaseAssignments ca
         WHERE ca.case_id = c.id AND ca.revoked_at IS NULL AND ca.role = 'attorney'
         ORDER BY ca.assigned_at DESC LIMIT 1
      ) AS user_id
      FROM Cases c
      WHERE c.client_id = ? AND c.status = 'open'
      ORDER BY c.opened_date DESC, c.id DESC
    `).all(clientId) as { case_id: number; user_id: number | null }[];

    let caseId: number | null = null;
    let assignedUserId: number | null = null;
    let status: ConversationStatus = 'triage';
    let reason: RoutingResult['reason'] = 'triage_no_case';

    if (cases.length === 1) {
      caseId = cases[0]!.case_id;
      assignedUserId = cases[0]!.user_id;
      status = 'open';
      reason = 'routed';
    } else if (cases.length > 1) {
      reason = 'triage_multiple_cases';  // do not guess which case
    }

    const conversationId = this.upsertConversation({
      channel: input.channel, externalThreadId: threadId,
      clientId, caseId, assignedUserId, status,
    });

    const msgRes = this.db.prepare(`
      INSERT INTO CommMessages
        (conversation_id, channel, direction, external_message_id, sender_identity, body, media_kind, media_ref)
      VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?)
    `).run(conversationId, input.channel, input.externalMessageId ?? null,
           input.externalId, input.body ?? null, input.mediaKind ?? null, input.mediaRef ?? null);
    const messageId = Number(msgRes.lastInsertRowid);

    this.touchConversation(conversationId);
    this.audit({ conversationId, messageId, userId: null, channel: input.channel, action: 'route', detail: reason });

    return {
      routed: reason === 'routed', conversationId, messageId, clientId,
      caseId, assignedUserId, status, unknownInboxId: null, reason,
    };
  }

  /** Create or fetch a conversation by (channel, externalThreadId), updating routing fields. */
  private upsertConversation(c: {
    channel: CommChannel; externalThreadId: string;
    clientId: number | null; caseId: number | null;
    assignedUserId: number | null; status: ConversationStatus;
  }): number {
    const existing = this.db.prepare(
      `SELECT id FROM CommConversations WHERE channel = ? AND external_thread_id = ?`,
    ).get(c.channel, c.externalThreadId) as { id: number } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE CommConversations
           SET client_id        = COALESCE(?, client_id),
               case_id          = COALESCE(?, case_id),
               assigned_user_id = COALESCE(?, assigned_user_id),
               status           = ?
         WHERE id = ?
      `).run(c.clientId, c.caseId, c.assignedUserId, c.status, existing.id);
      return existing.id;
    }

    const res = this.db.prepare(`
      INSERT INTO CommConversations
        (channel, external_thread_id, client_id, case_id, assigned_user_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(c.channel, c.externalThreadId, c.clientId, c.caseId, c.assignedUserId, c.status);
    return Number(res.lastInsertRowid);
  }

  private touchConversation(conversationId: number): void {
    this.db.prepare(
      `UPDATE CommConversations SET last_message_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(conversationId);
  }

  // ── Consent ───────────────────────────────────────────────────────────────
  /** True iff the client has an active (granted, non-revoked) opt-in for the channel. */
  hasConsent(clientId: number, channel: CommChannel): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM CommConsent
       WHERE client_id = ? AND channel = ? AND granted = 1 AND revoked_at IS NULL
    `).get(clientId, channel) as { 1: number } | undefined;
    return row !== undefined;
  }

  recordConsent(clientId: number, channel: CommChannel, granted: boolean, source?: string): void {
    this.db.prepare(`
      INSERT INTO CommConsent (client_id, channel, granted, source, revoked_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(client_id, channel) DO UPDATE SET
        granted    = excluded.granted,
        source     = COALESCE(excluded.source, CommConsent.source),
        granted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        revoked_at = excluded.revoked_at
    `).run(clientId, channel, granted ? 1 : 0, source ?? null, granted ? null : new Date().toISOString());
    this.audit({
      conversationId: null, messageId: null, userId: null, channel,
      action: granted ? 'consent_grant' : 'consent_revoke', detail: `client:${clientId}`,
    });
  }

  // ── Outbound (consent-gated) ────────────────────────────────────────────────
  /**
   * Record an outbound message. Blocked unless the bound client has consented on
   * this channel. Every attempt — sent or blocked — is audited.
   */
  sendOutbound(input: SendInput): SendResult {
    const conv = this.getConversation(input.conversationId);
    if (!conv) throw new Error(`Conversation ${input.conversationId} not found`);

    if (conv.clientId !== null && !this.hasConsent(conv.clientId, conv.channel)) {
      this.audit({
        conversationId: conv.id, messageId: null, userId: input.userId,
        channel: conv.channel, action: 'send_blocked', detail: 'no_consent',
      });
      return { sent: false, reason: 'no_consent', clientId: conv.clientId, channel: conv.channel };
    }

    const res = this.db.prepare(`
      INSERT INTO CommMessages
        (conversation_id, channel, direction, external_message_id, body, media_kind, media_ref, sent_at)
      VALUES (?, ?, 'outbound', ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    `).run(conv.id, conv.channel, input.externalMessageId ?? null,
           input.body ?? null, input.mediaKind ?? null, input.mediaRef ?? null);
    const messageId = Number(res.lastInsertRowid);

    this.touchConversation(conv.id);
    this.audit({
      conversationId: conv.id, messageId, userId: input.userId,
      channel: conv.channel, action: 'send', detail: null,
    });
    return { sent: true, messageId };
  }

  // ── Reads ─────────────────────────────────────────────────────────────────
  getConversation(id: number): CommConversation | null {
    const row = this.db.prepare(`SELECT * FROM CommConversations WHERE id = ?`).get(id) as
      Record<string, unknown> | undefined;
    return row ? mapConversation(row) : null;
  }

  listConversations(filter: {
    caseId?: number; clientId?: number; userId?: number; status?: ConversationStatus;
  } = {}): CommConversation[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.caseId   !== undefined) { where.push('case_id = ?');          params.push(filter.caseId); }
    if (filter.clientId !== undefined) { where.push('client_id = ?');        params.push(filter.clientId); }
    if (filter.userId   !== undefined) { where.push('assigned_user_id = ?'); params.push(filter.userId); }
    if (filter.status   !== undefined) { where.push('status = ?');           params.push(filter.status); }
    const sql = `SELECT * FROM CommConversations
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY COALESCE(last_message_at, created_at) DESC`;
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map(mapConversation);
  }

  listMessages(conversationId: number): CommMessage[] {
    return (this.db.prepare(
      `SELECT * FROM CommMessages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC`,
    ).all(conversationId) as Record<string, unknown>[]).map(mapMessage);
  }

  markHandled(messageId: number): void {
    this.db.prepare(`UPDATE CommMessages SET handled = 1 WHERE id = ?`).run(messageId);
  }

  // ── Evidence + transcription (C5) ───────────────────────────────────────────
  /**
   * Snapshot a message as a write-protected, content-hashed exhibit bound to its case
   * (chain of custody). Idempotent per message (UNIQUE(message_id)); returns the exhibit.
   */
  saveMessageAsEvidence(messageId: number, capturedBy: number | null): CommEvidenceRow {
    const msg = this.db.prepare(`
      SELECT m.*, c.case_id AS conv_case_id, c.client_id AS conv_client_id
        FROM CommMessages m
        JOIN CommConversations c ON c.id = m.conversation_id
       WHERE m.id = ?
    `).get(messageId) as Record<string, unknown> | undefined;
    if (!msg) throw new Error(`Message ${messageId} not found`);

    // Verbatim snapshot: transcript is included so a transcribed voice note is captured too.
    const snapshot = `${String(msg['body'] ?? '')}\n${String(msg['transcript'] ?? '')}\n${String(msg['media_ref'] ?? '')}`;
    const contentHash = createHash('sha256').update(snapshot).digest('hex');

    this.db.prepare(`
      INSERT INTO CommEvidence
        (message_id, conversation_id, case_id, client_id, channel, direction, sender_identity,
         body, media_kind, media_ref, content_hash, message_created_at, captured_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id) DO NOTHING
    `).run(
      messageId, msg['conversation_id'], msg['conv_case_id'] ?? null, msg['conv_client_id'] ?? null,
      msg['channel'], msg['direction'], msg['sender_identity'],
      msg['body'] ?? null, msg['media_kind'] ?? null, msg['media_ref'] ?? null,
      contentHash, msg['created_at'] ?? null, capturedBy,
    );

    const row = this.db.prepare('SELECT * FROM CommEvidence WHERE message_id = ?').get(messageId) as Record<string, unknown>;
    this.audit({
      conversationId: Number(msg['conversation_id']), messageId, userId: capturedBy,
      channel: msg['channel'] as CommChannel, action: 'save_evidence', detail: `hash:${contentHash.slice(0, 12)}`,
    });
    return mapEvidence(row);
  }

  /** Exhibits captured for a case (locked, newest first). */
  listCaseEvidence(caseId: number): CommEvidenceRow[] {
    return (this.db.prepare(
      'SELECT * FROM CommEvidence WHERE case_id = ? ORDER BY captured_at DESC',
    ).all(caseId) as Record<string, unknown>[]).map(mapEvidence);
  }

  /** Store a (locally produced) transcript on a voice/audio message. */
  setTranscript(messageId: number, transcript: string): void {
    this.db.prepare('UPDATE CommMessages SET transcript = ? WHERE id = ?').run(transcript, messageId);
  }

  getMessage(messageId: number): CommMessage | null {
    const r = this.db.prepare('SELECT * FROM CommMessages WHERE id = ?').get(messageId) as Record<string, unknown> | undefined;
    return r ? mapMessage(r) : null;
  }

  /** Unknown-sender inbox (C8 routing target). Defaults to unresolved only. */
  listUnknownInbox(includeResolved = false): UnknownInboxRow[] {
    const sql = `SELECT id, channel, external_id, display_name, body, media_kind, resolved, created_at
                 FROM CommUnknownInbox
                 ${includeResolved ? '' : 'WHERE resolved = 0'}
                 ORDER BY created_at DESC`;
    return (this.db.prepare(sql).all() as Record<string, unknown>[]).map((r) => ({
      id:          r['id'] as number,
      channel:     r['channel'] as CommChannel,
      externalId:  r['external_id'] as string,
      displayName: (r['display_name'] as string | null) ?? null,
      body:        (r['body'] as string | null) ?? null,
      mediaKind:   (r['media_kind'] as string | null) ?? null,
      resolved:    Number(r['resolved']) === 1,
      createdAt:   r['created_at'] as string,
    }));
  }

  // ── Audit ─────────────────────────────────────────────────────────────────
  audit(a: {
    conversationId: number | null; messageId: number | null; userId: number | null;
    channel: CommChannel; action: string; detail: string | null;
  }): void {
    this.db.prepare(`
      INSERT INTO CommAudit (conversation_id, message_id, user_id, channel, action, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(a.conversationId, a.messageId, a.userId, a.channel, a.action, a.detail);
  }
}
