import type { DatabaseConnection } from '../connection.js';

export interface RuleRow {
  readonly id:              number;
  readonly ruleName:        string;
  readonly procedureType:   string;
  readonly description:     string | null;
  readonly deadlineDays:    number | null;
  readonly deadlineBasis:   string | null;
  readonly sourceReference: string | null;
  readonly sortOrder:       number;
  readonly isActive:        boolean;
  readonly createdAt:       string;
}

export interface ProcedureTypeSummary {
  readonly procedureType: string;
  readonly ruleCount:     number;
}

function mapRow(r: Record<string, unknown>): RuleRow {
  return {
    id:              r['id']               as number,
    ruleName:        r['rule_name']        as string,
    procedureType:   r['procedure_type']   as string,
    description:     (r['description']      as string | null) ?? null,
    deadlineDays:    r['deadline_days']    != null ? Number(r['deadline_days']) : null,
    deadlineBasis:   (r['deadline_basis']   as string | null) ?? null,
    sourceReference: (r['source_reference'] as string | null) ?? null,
    sortOrder:       Number(r['sort_order'] ?? 0),
    isActive:        Number(r['is_active'] ?? 1) === 1,
    createdAt:       r['created_at']       as string,
  };
}

/**
 * Read access to the Rules_Engine registry of Israeli procedural rules.
 * Deadlines live in the database (seeded via migration 060) so they can be reviewed
 * and corrected without code changes — never hardcode deadline logic.
 */
export class RulesEngineRepository {
  constructor(private readonly db: DatabaseConnection) {}

  /** All active rules, optionally filtered by procedure_type, in display order. */
  listAll(procedureType?: string): RuleRow[] {
    const rows = procedureType
      ? this.db.prepare(
          `SELECT * FROM Rules_Engine WHERE is_active = 1 AND procedure_type = ?
           ORDER BY procedure_type ASC, sort_order ASC, id ASC`,
        ).all(procedureType)
      : this.db.prepare(
          `SELECT * FROM Rules_Engine WHERE is_active = 1
           ORDER BY procedure_type ASC, sort_order ASC, id ASC`,
        ).all();
    return (rows as Record<string, unknown>[]).map(mapRow);
  }

  findById(id: number): RuleRow | null {
    const row = this.db.prepare(
      'SELECT * FROM Rules_Engine WHERE id = ?',
    ).get(id) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  /** Distinct procedure types with their active-rule counts, for grouping in the UI. */
  procedureTypes(): ProcedureTypeSummary[] {
    const rows = this.db.prepare(
      `SELECT procedure_type, COUNT(*) AS n FROM Rules_Engine
        WHERE is_active = 1
        GROUP BY procedure_type
        ORDER BY procedure_type ASC`,
    ).all() as Record<string, unknown>[];
    return rows.map((r) => ({
      procedureType: r['procedure_type'] as string,
      ruleCount:     Number(r['n'] ?? 0),
    }));
  }

  count(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) AS n FROM Rules_Engine WHERE is_active = 1',
    ).get() as { n: number };
    return row.n;
  }
}
