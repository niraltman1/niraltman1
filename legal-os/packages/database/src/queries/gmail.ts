import type { DatabaseConnection } from '../connection.js';

export interface GmailSyncConfig {
  id:               number;
  gmail_address:    string;
  label_filter:     string;
  encrypted_token:  string;
  token_iv:         string;
  token_tag:        string;
  last_sync_at:     string | null;
  last_message_id:  string | null;
  is_enabled:       number;
  created_at:       string;
  updated_at:       string;
}

export interface GmailSyncLog {
  id:                   number;
  sync_config_id:       number;
  synced_at:            string;
  messages_found:       number;
  attachments_ingested: number;
  errors_count:         number;
  error_summary:        string | null;
}

export interface CreateGmailConfigInput {
  gmail_address:   string;
  label_filter?:   string;
  encrypted_token: string;
  token_iv:        string;
  token_tag:       string;
}

export interface LogSyncInput {
  sync_config_id:       number;
  messages_found:       number;
  attachments_ingested: number;
  errors_count:         number;
  error_summary?:       string | null;
}

export class GmailRepository {
  constructor(private readonly db: DatabaseConnection) {}

  findConfig(id: number): GmailSyncConfig | null {
    return (this.db.prepare('SELECT * FROM GmailSyncConfig WHERE id = ?').get(id) ?? null) as GmailSyncConfig | null;
  }

  listConfigs(): GmailSyncConfig[] {
    return this.db.prepare('SELECT * FROM GmailSyncConfig ORDER BY created_at DESC').all() as GmailSyncConfig[];
  }

  createConfig(data: CreateGmailConfigInput): number {
    const res = this.db.prepare(`
      INSERT INTO GmailSyncConfig (gmail_address, label_filter, encrypted_token, token_iv, token_tag)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.gmail_address,
      data.label_filter ?? 'Legal-OS',
      data.encrypted_token,
      data.token_iv,
      data.token_tag,
    );
    return Number(res.lastInsertRowid);
  }

  updateSync(id: number, updates: Partial<Pick<GmailSyncConfig, 'last_sync_at' | 'last_message_id' | 'encrypted_token' | 'token_iv' | 'token_tag' | 'is_enabled'>>): void {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (updates.last_sync_at     !== undefined) { sets.push('last_sync_at = ?');     vals.push(updates.last_sync_at); }
    if (updates.last_message_id  !== undefined) { sets.push('last_message_id = ?');  vals.push(updates.last_message_id); }
    if (updates.encrypted_token  !== undefined) { sets.push('encrypted_token = ?');  vals.push(updates.encrypted_token); }
    if (updates.token_iv         !== undefined) { sets.push('token_iv = ?');         vals.push(updates.token_iv); }
    if (updates.token_tag        !== undefined) { sets.push('token_tag = ?');        vals.push(updates.token_tag); }
    if (updates.is_enabled       !== undefined) { sets.push('is_enabled = ?');       vals.push(updates.is_enabled); }
    if (sets.length === 0) return;
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    vals.push(id);
    this.db.prepare(`UPDATE GmailSyncConfig SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  deleteConfig(id: number): void {
    this.db.prepare('DELETE FROM GmailSyncConfig WHERE id = ?').run(id);
  }

  logSync(data: LogSyncInput): void {
    this.db.prepare(`
      INSERT INTO GmailSyncLog (sync_config_id, messages_found, attachments_ingested, errors_count, error_summary)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.sync_config_id,
      data.messages_found,
      data.attachments_ingested,
      data.errors_count,
      data.error_summary ?? null,
    );
  }

  listLogs(configId: number, limit = 10): GmailSyncLog[] {
    return this.db.prepare(
      'SELECT * FROM GmailSyncLog WHERE sync_config_id = ? ORDER BY synced_at DESC LIMIT ?',
    ).all(configId, limit) as GmailSyncLog[];
  }
}
