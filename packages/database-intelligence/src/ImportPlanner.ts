/**
 * ImportPlanner — converts a MigrationMappingReport into an ordered execution plan.
 * Preview only: plan is generated but never executed in Phase 3.
 */

import type { MigrationMappingReport, MigrationExecutionPlan, MigrationStep } from './types.js';

// Tables that must exist before others reference them
const DEPENDENCY_ORDER: Record<string, string[]> = {
  Cases:         ['Clients'],
  CourtHearings: ['Cases'],
  Files:         ['Cases', 'Clients'],
  CommMessages:  ['CommConversations'],
  CommConversations: ['Clients', 'Cases'],
  ProceduralChecklist: ['Cases', 'Rules_Engine'],
  EvidenceItems: ['Files', 'Cases'],
  LegalDrafts:   ['Cases', 'Clients'],
  AgentResults:  ['Cases'],
  Notifications: ['Cases'],
  PipelineLogs:  ['Files'],
  LegalBrainSessions: ['Cases'],
  insolvency_filings: ['Cases'],
};

export class ImportPlanner {
  plan(report: MigrationMappingReport): MigrationExecutionPlan {
    const warnings: string[] = [...report.warnings];
    const mappings  = report.mappings;
    const steps: MigrationStep[] = [];

    // Topological sort based on DEPENDENCY_ORDER
    const visited = new Set<string>();
    const ordered: typeof mappings = [];

    const visit = (m: (typeof mappings)[number]) => {
      if (visited.has(m.sourceTable)) return;
      visited.add(m.sourceTable);

      const deps = DEPENDENCY_ORDER[m.targetTable] ?? [];
      for (const dep of deps) {
        const depMapping = mappings.find((x) => x.targetTable === dep);
        if (depMapping) visit(depMapping);
      }
      ordered.push(m);
    };

    for (const m of mappings) visit(m);

    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i]!;
      const deps = DEPENDENCY_ORDER[m.targetTable] ?? [];
      const resolvedDeps = deps.filter((d) => ordered.slice(0, i).some((x) => x.targetTable === d));

      const estimatedSec = Math.max(5, Math.round((report.sourceSnapshot.totalRows / Math.max(1, mappings.length)) / 1000));

      steps.push({
        order:         i + 1,
        sourceTable:   m.sourceTable,
        targetTable:   m.targetTable,
        dependencies:  resolvedDeps,
        rollbackPoint: i % 5 === 0, // checkpoint every 5 steps
        estimatedSec,
        transforms:    m.transforms,
      });
    }

    if (report.unmappedTables.length > 0) {
      warnings.push(`${report.unmappedTables.length} table(s) have no mapping and will be skipped`);
    }

    const totalEstSec = steps.reduce((sum, s) => sum + s.estimatedSec, 0);

    return {
      generatedAt: new Date().toISOString(),
      steps,
      totalEstSec,
      warnings,
    };
  }
}
