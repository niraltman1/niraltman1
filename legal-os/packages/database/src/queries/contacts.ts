import type { DatabaseConnection } from '../connection.js';

export type ContactRole =
  | 'opposing_counsel' | 'prosecutor' | 'witness'
  | 'police' | 'court_clerk' | 'expert' | 'expert_witness'
  | 'investigator' | 'co_defendant' | 'family' | 'other';

export interface Contact {
  readonly id:           number;
  readonly nameHe:       string;
  readonly nameEn:       string | null;
  readonly role:         ContactRole;
  readonly phone:        string | null;
  readonly email:        string | null;
  readonly organization: string | null;
  readonly idNumber:     string | null;
  readonly notes:        string | null;
  readonly createdAt:    string;
  readonly updatedAt:    string;
}

export interface CaseContact extends Contact {
  readonly roleInCase: string | null;
  readonly addedAt:    string;
}

export interface CreateContactInput {
  nameHe:        string;
  nameEn?:       string | null;
  role?:         ContactRole;
  phone?:        string | null;
  email?:        string | null;
  organization?: string | null;
  idNumber?:     string | null;
  notes?:        string | null;
}

const NOW = () => new Date().toISOString();

function mapRow(r: Record<string, unknown>): Contact {
  return {
    id:           r['id'] as number,
    nameHe:       r['name_he'] as string,
    nameEn:       r['name_en'] as string | null,
    role:         r['role'] as ContactRole,
    phone:        r['phone'] as string | null,
    email:        r['email'] as string | null,
    organization: r['organization'] as string | null,
    idNumber:     r['id_number'] as string | null,
    notes:        r['notes'] as string | null,
    createdAt:    r['created_at'] as string,
    updatedAt:    r['updated_at'] as string,
  };
}

export class ContactsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  findById(id: number): Contact | null {
    const row = this.db
      .prepare('SELECT * FROM Contacts WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  list(limit = 100): Contact[] {
    const rows = this.db
      .prepare('SELECT * FROM Contacts ORDER BY name_he ASC LIMIT ?')
      .all(limit) as Record<string, unknown>[];
    return rows.map(mapRow);
  }

  search(query: string, limit = 30): Contact[] {
    const rows = this.db.prepare(`
      SELECT c.*
      FROM fts_contacts fts
      JOIN Contacts c ON c.id = fts.rowid
      WHERE fts_contacts MATCH ?
      ORDER BY fts.rank
      LIMIT ?
    `).all(query, limit) as Record<string, unknown>[];
    return rows.map(mapRow);
  }

  create(input: CreateContactInput): Contact {
    const now = NOW();
    const res = this.db.prepare(`
      INSERT INTO Contacts (name_he, name_en, role, phone, email, organization, id_number, notes, created_at, updated_at)
      VALUES (@nameHe, @nameEn, @role, @phone, @email, @organization, @idNumber, @notes, @now, @now)
    `).run({
      nameHe:       input.nameHe,
      nameEn:       input.nameEn       ?? null,
      role:         input.role         ?? 'other',
      phone:        input.phone        ?? null,
      email:        input.email        ?? null,
      organization: input.organization ?? null,
      idNumber:     input.idNumber     ?? null,
      notes:        input.notes        ?? null,
      now,
    }) as { lastInsertRowid: number | bigint };

    return this.findById(Number(res.lastInsertRowid))!;
  }

  update(id: number, patch: Partial<CreateContactInput>): Contact | null {
    const fields = Object.entries({
      name_he:       patch.nameHe,
      name_en:       patch.nameEn,
      role:          patch.role,
      phone:         patch.phone,
      email:         patch.email,
      organization:  patch.organization,
      id_number:     patch.idNumber,
      notes:         patch.notes,
    })
      .filter(([, v]) => v !== undefined)
      .map(([k]) => `${k} = @${k}`)
      .join(', ');

    if (!fields) return this.findById(id);

    const values: Record<string, unknown> = { id };
    if (patch.nameHe       !== undefined) values['name_he']      = patch.nameHe;
    if (patch.nameEn       !== undefined) values['name_en']      = patch.nameEn;
    if (patch.role         !== undefined) values['role']         = patch.role;
    if (patch.phone        !== undefined) values['phone']        = patch.phone;
    if (patch.email        !== undefined) values['email']        = patch.email;
    if (patch.organization !== undefined) values['organization'] = patch.organization;
    if (patch.idNumber     !== undefined) values['id_number']    = patch.idNumber;
    if (patch.notes        !== undefined) values['notes']        = patch.notes;

    this.db.prepare(`UPDATE Contacts SET ${fields}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id`).run(values);
    return this.findById(id);
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM Contacts WHERE id = ?').run(id);
  }

  // ── Case ↔ Contact links ───────────────────────────────────────────────────

  getForCase(caseId: number): CaseContact[] {
    const rows = this.db.prepare(`
      SELECT c.*, cc.role_in_case, cc.added_at
      FROM Contacts c
      JOIN CaseContacts cc ON cc.contact_id = c.id
      WHERE cc.case_id = ?
      ORDER BY cc.added_at ASC
    `).all(caseId) as Record<string, unknown>[];

    return rows.map((r) => ({
      ...mapRow(r),
      roleInCase: r['role_in_case'] as string | null,
      addedAt:    r['added_at'] as string,
    }));
  }

  linkToCase(caseId: number, contactId: number, roleInCase?: string | null): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO CaseContacts (case_id, contact_id, role_in_case)
      VALUES (@caseId, @contactId, @roleInCase)
    `).run({ caseId, contactId, roleInCase: roleInCase ?? null });
  }

  unlinkFromCase(caseId: number, contactId: number): void {
    this.db.prepare('DELETE FROM CaseContacts WHERE case_id = ? AND contact_id = ?').run(caseId, contactId);
  }

  getCasesForContact(contactId: number): { caseId: number; caseNumber: string; titleHe: string; roleInCase: string | null }[] {
    return this.db.prepare(`
      SELECT ca.id as caseId, ca.case_number, ca.title_he, cc.role_in_case
      FROM Cases ca
      JOIN CaseContacts cc ON cc.case_id = ca.id
      WHERE cc.contact_id = ?
      ORDER BY ca.opened_date DESC
    `).all(contactId) as { caseId: number; caseNumber: string; titleHe: string; roleInCase: string | null }[];
  }
}
