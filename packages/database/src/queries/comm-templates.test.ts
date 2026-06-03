import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { CommTemplatesRepository } from './comm-templates.js';

const SCHEMA = `
CREATE TABLE Cases (id INTEGER PRIMARY KEY);
CREATE TABLE Documents (id INTEGER PRIMARY KEY);
CREATE TABLE system_users (id INTEGER PRIMARY KEY);
CREATE TABLE CommTemplates (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name_he TEXT, body TEXT, channel TEXT,
  case_type TEXT, case_status TEXT, client_status TEXT, is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01'
);
CREATE TABLE CommSecureLinks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE, purpose TEXT, case_id INTEGER,
  document_id INTEGER, created_by INTEGER, expires_at TEXT, used_at TEXT, created_at TEXT DEFAULT '2026-01-01'
);
`;

describe('CommTemplatesRepository.render (pure)', () => {
  it('substitutes known placeholders and tolerates spaces', () => {
    const out = CommTemplatesRepository.render('שלום {{client_name}}, תיק {{ case_number }}', {
      client_name: 'דנה', case_number: 'תא-2024-1',
    });
    expect(out).toBe('שלום דנה, תיק תא-2024-1');
  });

  it('replaces unknown/empty placeholders with — (no raw braces leak)', () => {
    const out = CommTemplatesRepository.render('דיון ב{{next_hearing}} ל{{client_name}}', { client_name: '' });
    expect(out).toBe('דיון ב— ל—');
    expect(out).not.toContain('{{');
  });
});

describe('CommTemplatesRepository — matching + secure links', () => {
  let db: DatabaseConnection;
  let repo: CommTemplatesRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.prepare("INSERT INTO CommTemplates (name_he, body, channel, case_type, case_status) VALUES ('generic','x',NULL,NULL,NULL)").run();
    db.prepare("INSERT INTO CommTemplates (name_he, body, channel, case_type, case_status) VALUES ('open-only','x',NULL,NULL,'open')").run();
    db.prepare("INSERT INTO CommTemplates (name_he, body, channel, case_type, case_status) VALUES ('civil-open','x',NULL,'civil','open')").run();
    db.prepare("INSERT INTO CommTemplates (name_he, body, channel, case_type, case_status) VALUES ('closed-only','x',NULL,NULL,'closed')").run();
    db.prepare("INSERT INTO CommTemplates (name_he, body, channel, case_type, case_status, is_active) VALUES ('inactive','x',NULL,NULL,NULL,0)").run();
    repo = new CommTemplatesRepository(db);
  });

  afterEach(() => db.close());

  it('matches wildcard + matching criteria, excludes non-matching and inactive', () => {
    const names = repo.matchTemplates({ caseType: 'civil', caseStatus: 'open' }).map((t) => t.nameHe);
    expect(names).toContain('generic');
    expect(names).toContain('open-only');
    expect(names).toContain('civil-open');
    expect(names).not.toContain('closed-only'); // case_status mismatch
    expect(names).not.toContain('inactive');    // is_active = 0
  });

  it('orders most-specific first', () => {
    const names = repo.matchTemplates({ caseType: 'civil', caseStatus: 'open' }).map((t) => t.nameHe);
    expect(names[0]).toBe('civil-open');         // specificity 2
    expect(names.indexOf('open-only')).toBeLessThan(names.indexOf('generic'));
  });

  it('a wildcard-only context still returns generic templates', () => {
    const names = repo.matchTemplates({}).map((t) => t.nameHe);
    expect(names).toContain('generic');
    expect(names).not.toContain('open-only');    // case_status pinned but context has none
  });

  it('issues a unique secure-link token with TTL', () => {
    const a = repo.createSecureLink({ purpose: 'sign', caseId: 1, ttlHours: 24 });
    const b = repo.createSecureLink({ purpose: 'upload', caseId: 1 });
    expect(a.token).not.toBe(b.token);
    expect(a.expiresAt).not.toBeNull();
    expect(b.expiresAt).toBeNull();
    const resolved = repo.resolveSecureLink(a.token);
    expect(resolved?.purpose).toBe('sign');
    expect(resolved?.caseId).toBe(1);
  });
});
