import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { RulesEngineRepository } from './rules-engine.js';

// Mirrors migrations/060_rules_engine.sql (kept inline so the test is self-contained).
const SCHEMA = `
CREATE TABLE Rules_Engine (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_name        TEXT    NOT NULL,
  procedure_type   TEXT    NOT NULL,
  description      TEXT,
  deadline_days    INTEGER,
  deadline_basis   TEXT,
  source_reference TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(procedure_type, rule_name)
);
`;

describe('RulesEngineRepository', () => {
  let db: DatabaseConnection;
  let repo: RulesEngineRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.exec(`
      INSERT INTO Rules_Engine (rule_name, procedure_type, deadline_days, deadline_basis, source_reference, sort_order, is_active)
      VALUES
        ('כתב הגנה', 'civil', 60, 'המצאת כתב התביעה', 'תקסד"א 2018', 1, 1),
        ('סיכומים', 'civil', NULL, 'החלטת בית המשפט', 'תקסד"א 2018', 2, 1),
        ('ערעור פלילי', 'criminal', 45, 'מתן פסק הדין', 'חסד"פ 199', 1, 1),
        ('כלל מבוטל', 'civil', NULL, NULL, NULL, 9, 0);
    `);
    repo = new RulesEngineRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('lists only active rules, ordered by procedure type and sort order', () => {
    const rules = repo.listAll();
    expect(rules).toHaveLength(3);
    expect(rules.map((r) => r.ruleName)).toEqual(['כתב הגנה', 'סיכומים', 'ערעור פלילי']);
  });

  it('filters by procedure type', () => {
    const civil = repo.listAll('civil');
    expect(civil).toHaveLength(2);
    expect(civil.every((r) => r.procedureType === 'civil')).toBe(true);
  });

  it('maps deadline fields, leaving NULL deadlines null', () => {
    const [first, second] = repo.listAll('civil');
    expect(first?.deadlineDays).toBe(60);
    expect(first?.deadlineBasis).toBe('המצאת כתב התביעה');
    expect(second?.deadlineDays).toBeNull();
  });

  it('summarises procedure types with active counts', () => {
    const types = repo.procedureTypes();
    expect(types).toEqual([
      { procedureType: 'civil', ruleCount: 2 },
      { procedureType: 'criminal', ruleCount: 1 },
    ]);
  });

  it('finds a rule by id and excludes inactive from count', () => {
    const all = repo.listAll();
    const one = repo.findById(all[0]!.id);
    expect(one?.ruleName).toBe('כתב הגנה');
    expect(repo.count()).toBe(3);
    expect(repo.findById(99999)).toBeNull();
  });
});
