import type { DatabaseConnection } from '../connection.js';
import type { Client, ClientCreateInput, PaginatedResult } from '@legal-os/shared';

export class ClientRepository {
  constructor(private readonly db: DatabaseConnection) {}

  // ─────────────────────────────────────────────
  //  Read
  // ─────────────────────────────────────────────

  findById(id: number): Client | null {
    const row = this.db
      .prepare('SELECT * FROM Clients WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  findByIdNumber(idNumber: string): Client | null {
    const row = this.db
      .prepare('SELECT * FROM Clients WHERE id_number = ?')
      .get(idNumber) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  list(page = 1, pageSize = 50): PaginatedResult<Client> {
    const offset = (page - 1) * pageSize;
    const rows = this.db.prepare(`
      SELECT * FROM Clients
      WHERE is_active = 1
      ORDER BY name_he ASC
      LIMIT ? OFFSET ?
    `).all(pageSize, offset) as Record<string, unknown>[];

    const { total } = this.db.prepare(
      'SELECT COUNT(*) as total FROM Clients WHERE is_active = 1'
    ).get() as { total: number };

    return { items: rows.map((r) => this.mapRow(r)), total, page, pageSize, hasNextPage: total > page * pageSize };
  }

  search(query: string, limit = 50): Client[] {
    try {
      const rows = this.db.prepare(`
        SELECT c.*
          FROM fts_clients fts
          JOIN Clients c ON c.id = fts.rowid
         WHERE fts_clients MATCH ?
           AND c.is_active = 1
         ORDER BY fts.rank
         LIMIT ?
      `).all(query, limit) as Record<string, unknown>[];
      return rows.map((r) => this.mapRow(r));
    } catch {
      return [];
    }
  }

  // ─────────────────────────────────────────────
  //  Write
  // ─────────────────────────────────────────────

  create(input: ClientCreateInput): Client {
    const result = this.db.prepare(`
      INSERT INTO Clients (name_he, name_en, id_number, id_type, phone, email, address_he, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.nameHe,
      input.nameEn       ?? null,
      input.idNumber     ?? null,
      input.idType       ?? 'personal',
      input.phone        ?? null,
      input.email        ?? null,
      input.addressHe    ?? null,
      input.notes        ?? null,
    );

    const newId = result.lastInsertRowid as number;

    // Sync FTS index
    try {
      this.db.prepare(`
        INSERT INTO fts_clients (rowid, name_he, id_number)
        VALUES (?, ?, ?)
      `).run(newId, input.nameHe, input.idNumber ?? '');
    } catch { /* FTS table may not be present in test DBs — non-fatal */ }

    return this.findById(newId)!;
  }

  update(id: number, updates: Partial<ClientCreateInput>): Client | null {
    const client = this.findById(id);
    if (!client) return null;

    const sets: string[]  = [];
    const params: unknown[] = [];

    if (updates.nameHe    !== undefined) { sets.push('name_he = ?');    params.push(updates.nameHe); }
    if (updates.nameEn    !== undefined) { sets.push('name_en = ?');    params.push(updates.nameEn); }
    if (updates.idNumber  !== undefined) { sets.push('id_number = ?');  params.push(updates.idNumber); }
    if (updates.idType    !== undefined) { sets.push('id_type = ?');    params.push(updates.idType); }
    if (updates.phone     !== undefined) { sets.push('phone = ?');      params.push(updates.phone); }
    if (updates.email     !== undefined) { sets.push('email = ?');      params.push(updates.email); }
    if (updates.addressHe !== undefined) { sets.push('address_he = ?'); params.push(updates.addressHe); }
    if (updates.notes     !== undefined) { sets.push('notes = ?');      params.push(updates.notes); }

    if (sets.length === 0) return client;
    sets.push('updated_at = datetime(\'now\')');
    params.push(id);

    this.db.prepare(`UPDATE Clients SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    // Refresh FTS
    try {
      this.db.prepare(`DELETE FROM fts_clients WHERE rowid = ?`).run(id);
      const updated = this.findById(id)!;
      this.db.prepare(`INSERT INTO fts_clients (rowid, name_he, id_number) VALUES (?, ?, ?)`)
        .run(id, updated.nameHe, updated.idNumber ?? '');
    } catch { /* non-fatal */ }

    return this.findById(id);
  }

  deactivate(id: number): void {
    this.db.prepare(`UPDATE Clients SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
  }

  // ─────────────────────────────────────────────
  //  Mapping
  // ─────────────────────────────────────────────

  private mapRow(row: Record<string, unknown>): Client {
    return {
      id:         row['id'] as number,
      externalId: (row['external_id'] as string | null) ?? null,
      nameHe:     row['name_he'] as string,
      nameEn:     (row['name_en'] as string | null) ?? null,
      idNumber:   (row['id_number'] as string | null) ?? null,
      idType:     (row['id_type'] as Client['idType']) ?? 'personal',
      phone:      (row['phone'] as string | null) ?? null,
      email:      (row['email'] as string | null) ?? null,
      addressHe:  (row['address_he'] as string | null) ?? null,
      notes:      (row['notes'] as string | null) ?? null,
      isActive:   (row['is_active'] as number) === 1,
      createdAt:  row['created_at'] as string,
      updatedAt:  row['updated_at'] as string,
    };
  }
}
