import type { DbHandle, ProceduralStep, CompletenessReport } from './types.js';

interface ChecklistRow {
  step_name:    string;
  status:       string;
  due_date:     string | null;
  completed_at: string | null;
  notes:        string | null;
  rule_id:      number | null;
}

interface RuleRow {
  id:             number;
  rule_name:      string;
  procedure_type: string;
}

function toProceduralStep(row: ChecklistRow): ProceduralStep {
  return {
    stepName:    row.step_name,
    status:      row.status as ProceduralStep['status'],
    dueDate:     row.due_date,
    completedAt: row.completed_at,
    notes:       row.notes,
    ruleId:      row.rule_id,
  };
}

export function getCaseCompleteness(caseId: number, db: DbHandle): CompletenessReport {
  const rows = db.prepare(
    `SELECT step_name, status, due_date, completed_at, notes, rule_id
       FROM ProceduralChecklist
      WHERE case_id = ?`,
  ).all(caseId) as ChecklistRow[];

  const totalSteps    = rows.length;
  const completeSteps = rows.filter(r => r.status === 'complete').length;
  const missingSteps  = rows.filter(r => r.status === 'missing').map(toProceduralStep);
  const overdueSteps  = rows.filter(r => r.status === 'overdue').map(toProceduralStep);
  const score         = totalSteps === 0 ? 0 : completeSteps / totalSteps;

  return { caseId, totalSteps, completeSteps, missingSteps, overdueSteps, score };
}

export function seedProceduralChecklist(
  caseId:        number,
  procedureType: string,
  db:            DbHandle,
): void {
  const rules = db.prepare(
    `SELECT id, rule_name, procedure_type FROM Rules_Engine WHERE procedure_type = ?`,
  ).all(procedureType) as RuleRow[];

  const insert = db.prepare(
    `INSERT OR IGNORE INTO ProceduralChecklist (case_id, rule_id, step_name, status)
     VALUES (?, ?, ?, 'pending')`,
  );

  for (const rule of rules) {
    insert.run(caseId, rule.id, rule.rule_name);
  }
}

export function markStepComplete(caseId: number, stepName: string, db: DbHandle): void {
  db.prepare(
    `UPDATE ProceduralChecklist
        SET status = 'complete',
            completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE case_id = ? AND step_name = ?`,
  ).run(caseId, stepName);
}

export function markStepMissing(caseId: number, stepName: string, db: DbHandle): void {
  db.prepare(
    `UPDATE ProceduralChecklist
        SET status = 'missing'
      WHERE case_id = ? AND step_name = ?`,
  ).run(caseId, stepName);
}
