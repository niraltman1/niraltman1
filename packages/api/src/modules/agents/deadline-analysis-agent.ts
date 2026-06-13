// Deadline Analysis Agent — missed/upcoming deadlines, risk warnings, recommended actions.
// Reads CourtHearings, Tasks, Rules_Engine. Saves to AgentResults.
// Model: BrainboxAI/law-il-E2B:Q4_K_M (mandatory — do not change).
import { runAgent } from '@factum-il/agent-core';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress, Tool } from '@factum-il/agent-core';
import { makeCaseTool, makeCaseHearingsTool, makeCaseTasksTool } from './db-tools.js';
import { persistAgentResult } from './persist-result.js';

function makeRulesEngineTool(repos: Repos, procedureType: string): Tool {
  return {
    name: 'get_procedural_rules',
    description: 'מביא כללי סדרי דין ישראליים רלוונטיים לסוג ההליך',
    execute: async () =>
      repos.db.prepare(`
        SELECT rule_name, deadline_days, deadline_basis, source_reference
          FROM Rules_Engine
         WHERE is_active = 1 AND (procedure_type = ? OR procedure_type IS NULL)
         ORDER BY deadline_days ASC
         LIMIT 20
      `).all(procedureType) as Record<string, unknown>[],
  };
}

function makeOverdueTasksTool(repos: Repos, caseId: number): Tool {
  return {
    name: 'get_overdue_tasks',
    description: 'מביא משימות באיחור לתיק זה',
    execute: async () =>
      repos.db.prepare(`
        SELECT id, title, due_date, priority, status
          FROM Tasks
         WHERE case_id = ? AND due_date < date('now') AND status NOT IN ('checked', 'cancelled')
         ORDER BY due_date ASC
      `).all(caseId) as Record<string, unknown>[],
  };
}

export async function runDeadlineAnalysis(
  repos: Repos,
  caseId: number,
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  // Fetch procedure type for rules lookup
  const caseRow = repos.db.prepare(
    'SELECT procedure_type FROM Cases WHERE id = ?',
  ).get(caseId) as { procedure_type: string | null } | undefined;
  const procedureType = caseRow?.procedure_type ?? '';

  const output = await runAgent({
    agentName: 'deadline-analysis',
    task: `נתח מועדים ולוחות זמנים בתיק זה בפורמט JSON:
{
  "overdueDeadlines": [
    {
      "title": "<תיאור>",
      "dueDate": "<YYYY-MM-DD>",
      "daysPast": <מספר>,
      "risk": "high|critical",
      "recommendedAction": "<פעולה מוצעת>"
    }
  ],
  "upcomingDeadlines": [
    {
      "title": "<תיאור>",
      "dueDate": "<YYYY-MM-DD>",
      "daysLeft": <מספר>,
      "source": "hearing|task|rule",
      "urgency": "low|medium|high|critical"
    }
  ],
  "proceduralRisks": [
    {
      "risk": "<תיאור סיכון>",
      "legalBasis": "<סעיף חוק / תקנה>",
      "severity": "low|medium|high|critical",
      "mitigation": "<המלצה>"
    }
  ],
  "nextCriticalAction": "<הפעולה הדחופה ביותר>",
  "nextCriticalDate": "<YYYY-MM-DD>",
  "overallRisk": "low|medium|high|critical",
  "confidence": <0.0–1.0>
}

בסס את הניתוח על תקנות סדר הדין האזרחי תשע"ט-2018 ועל כללי הדין הפלילי הרלוונטיים.`,
    tools: [
      makeCaseTool(repos, caseId),
      makeCaseHearingsTool(repos, caseId),
      makeCaseTasksTool(repos, caseId),
      makeRulesEngineTool(repos, procedureType),
      makeOverdueTasksTool(repos, caseId),
    ],
    caseId,
    ...(onProgress ? { onProgress } : {}),
  });

  const finalOutput: AgentOutput = { ...output, flagForReview: output.confidence < 0.7 };

  try {
    persistAgentResult(repos, finalOutput, { caseId });
  } catch { /* non-blocking */ }

  return finalOutput;
}
