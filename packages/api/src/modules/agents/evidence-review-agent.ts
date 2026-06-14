// Evidence Review Agent — identifies inconsistencies, chronology gaps, and missing documents.
// Saves to AgentResults. Always flagForReview=true.
// Model: BrainboxAI/law-il-E2B:Q4_K_M (mandatory — do not change).
import { runAgent } from '@factum-il/agent-core';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress, Tool } from '@factum-il/agent-core';
import {
  makeCaseTool, makeCaseDocumentsTool, makeCaseEvidenceTool,
} from './db-tools.js';
import { persistAgentResult } from './persist-result.js';

function makeDocumentInsightsTool(repos: Repos, caseId: number): Tool {
  return {
    name: 'get_document_insights',
    description: 'מביא תובנות AI על מסמכי התיק — מזהה טענות, עובדות, סיכונים',
    execute: async () =>
      repos.db.prepare(`
        SELECT di.insight_type, di.content, di.confidence, d.title, d.document_date
          FROM DocumentInsights di
          JOIN Documents d ON d.id = di.document_id
         WHERE d.case_id = ?
         ORDER BY di.confidence DESC
         LIMIT 30
      `).all(caseId) as Record<string, unknown>[],
  };
}

function makeChronologyTool(repos: Repos, caseId: number): Tool {
  return {
    name: 'get_case_chronology',
    description: 'מביא ציר זמן של אירועי התיק לניתוח רצף ופערים',
    execute: async () =>
      repos.db.prepare(`
        SELECT 'document' AS type, title AS description, document_date AS event_date
          FROM Documents WHERE case_id = ? AND document_date IS NOT NULL
        UNION ALL
        SELECT 'hearing', hearing_type, hearing_date
          FROM CourtHearings WHERE case_id = ?
        UNION ALL
        SELECT 'task', title, due_date
          FROM Tasks WHERE case_id = ? AND due_date IS NOT NULL
        ORDER BY event_date ASC
      `).all(caseId, caseId, caseId) as Record<string, unknown>[],
  };
}

export async function runEvidenceReview(
  repos: Repos,
  caseId: number,
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  const output = await runAgent({
    agentName: 'evidence-review',
    task: `סקור את כל הראיות והמסמכים בתיק זה בפורמט JSON:
{
  "inconsistencies": [
    {
      "description": "<תיאור הסתירה>",
      "documentA": "<מסמך/ראיה ראשונה>",
      "documentB": "<מסמך/ראיה שנייה>",
      "severity": "low|medium|high|critical",
      "recommendation": "<המלצת פעולה>"
    }
  ],
  "chronologyGaps": [
    {
      "period": "<תקופה חסרה, לדוגמה: ינואר-מרץ 2024>",
      "significance": "<מדוע הפרק החסר חשוב>",
      "expectedDocuments": ["<מסמך שהיה צריך להיות קיים>"]
    }
  ],
  "missingDocuments": [
    {
      "documentType": "<סוג מסמך חסר>",
      "importance": "essential|helpful|optional",
      "reason": "<מדוע נדרש מסמך זה>",
      "howToObtain": "<דרך השגה>"
    }
  ],
  "evidenceStrengths": [
    { "item": "<ראיה חזקה>", "strength": "<כיצד מחזקת את התיק>" }
  ],
  "overallAssessment": "<הערכה כוללת של מצב הראיות>",
  "recommendedActions": ["<פעולה מוצעת 1>", "<פעולה מוצעת 2>"],
  "readinessScore": <0–100>,
  "confidence": <0.0–1.0>
}

בסס את הניתוח על כללי הראיות הישראליים (פקודת הראיות [נוסח חדש] תשל"א-1971)
ועל דרישות ההליך הרלוונטי.`,
    tools: [
      makeCaseTool(repos, caseId),
      makeCaseDocumentsTool(repos, caseId),
      makeCaseEvidenceTool(repos, caseId),
      makeDocumentInsightsTool(repos, caseId),
      makeChronologyTool(repos, caseId),
    ],
    caseId,
    ...(onProgress ? { onProgress } : {}),
  });

  const finalOutput: AgentOutput = { ...output, flagForReview: true };

  try {
    persistAgentResult(repos, finalOutput, { caseId });
  } catch { /* non-blocking */ }

  return finalOutput;
}
