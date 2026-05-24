import type { DbHandle } from './types.js';

export interface FilingNode {
  stepName:  string;
  dependsOn: string[];  // stepNames this step requires first
  status:    'pending' | 'complete' | 'missing' | 'overdue';
}

// Hard-coded Israeli civil procedure filing dependencies.
const CIVIL_DEPENDENCIES: ReadonlyMap<string, readonly string[]> = new Map([
  ['כתב תביעה',           []],
  ['כתב הגנה',            ['כתב תביעה']],
  ['תצהיר עדות ראשית',    ['כתב תביעה', 'כתב הגנה']],
  ['סיכומים',             ['תצהיר עדות ראשית']],
]);

interface ChecklistStatusRow {
  step_name: string;
  status:    string;
}

export function getFilingDependencyGraph(caseId: number, db: DbHandle): FilingNode[] {
  const rows = db.prepare(
    `SELECT step_name, status FROM ProceduralChecklist WHERE case_id = ?`,
  ).all(caseId) as ChecklistStatusRow[];

  const statusMap = new Map<string, FilingNode['status']>();
  for (const row of rows) {
    statusMap.set(row.step_name, row.status as FilingNode['status']);
  }

  const nodes: FilingNode[] = [];

  for (const [stepName, deps] of CIVIL_DEPENDENCIES) {
    nodes.push({
      stepName,
      dependsOn: [...deps],
      status:    statusMap.get(stepName) ?? 'pending',
    });
  }

  return nodes;
}
