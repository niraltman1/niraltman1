// Insolvency Agent — analyzes insolvency filing stage, posture, deadlines, risks.
// Saves findings to LegalDrafts + AgentResults.
// Model: BrainboxAI/law-il-E2B:Q4_K_M (mandatory — do not change).
import { runAgent } from '@factum-il/agent-core';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress, Tool } from '@factum-il/agent-core';
import { makeCaseTool, makeCaseHearingsTool } from './db-tools.js';
import { persistAgentResult } from './persist-result.js';

function makeInsolvencyTool(repos: Repos, caseId: number): Tool {
  return {
    name: 'get_insolvency_filing',
    description: 'מביא פרטי תיק חדלות פירעון: שלב, פרטי כונס, פריטי רשימת תיוג',
    execute: async () => {
      const filing = repos.db.prepare(
        'SELECT * FROM insolvency_filings WHERE case_id = ?',
      ).get(caseId) as Record<string, unknown> | undefined;
      if (!filing) return { filing: null, checklistItems: [] };
      const checklistItems = repos.db.prepare(
        'SELECT field_key, status, value, section FROM insolvency_checklist_items WHERE filing_id = ? ORDER BY section, id',
      ).all(filing['id'] as number) as Record<string, unknown>[];
      return { filing, checklistItems };
    },
  };
}

function makePaymentLedgerTool(repos: Repos, caseId: number): Tool {
  return {
    name: 'get_payment_schedule',
    description: 'מביא לוח תשלומים וחובות לקוח',
    execute: async () => {
      const caseRow = repos.db.prepare(
        'SELECT client_id FROM Cases WHERE id = ?',
      ).get(caseId) as { client_id: number } | undefined;
      if (!caseRow) return [];
      return repos.db.prepare(
        'SELECT due_date, amount, status, description FROM client_payment_schedules WHERE client_id = ? ORDER BY due_date ASC LIMIT 20',
      ).all(caseRow.client_id) as Record<string, unknown>[];
    },
  };
}

export async function runInsolvencyAnalysis(
  repos: Repos,
  caseId: number,
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  const output = await runAgent({
    agentName: 'insolvency-agent',
    task: `נתח תיק חדלות פירעון ישראלי זה בפורמט JSON:
{
  "stage": "<שלב נוכחי: Pre_Filing|Judicial_Litigation|Discharge|Completed>",
  "posture": "<עמדה: aggressive|defensive|cooperative>",
  "nextDeadline": {
    "date": "<YYYY-MM-DD>",
    "description": "<תיאור>",
    "urgency": "low|medium|high|critical"
  },
  "pendingActions": ["<פעולה 1>", "<פעולה 2>"],
  "risks": [
    { "risk": "<תיאור סיכון>", "severity": "low|medium|high", "mitigation": "<המלצה>" }
  ],
  "checklistSummary": {
    "complete": <מספר>, "partial": <מספר>, "missing": <מספר>
  },
  "recommendedNextStep": "<הצעד הבא המומלץ>",
  "confidence": <0.0–1.0>
}

חשוב: התייחס לדין הישראלי — חוק חדלות פירעון ושיקום כלכלי תשע"ח-2018.
ציין כל מועד חוקי שניתן לזהות מהנתונים.`,
    tools: [
      makeCaseTool(repos, caseId),
      makeInsolvencyTool(repos, caseId),
      makePaymentLedgerTool(repos, caseId),
      makeCaseHearingsTool(repos, caseId),
    ],
    caseId,
    ...(onProgress ? { onProgress } : {}),
  });

  const finalOutput: AgentOutput = { ...output, flagForReview: true };

  try {
    persistAgentResult(repos, finalOutput, { caseId });
    // Save to LegalDrafts for attorney review
    repos.drafts.create({
      title:          `ניתוח חדלות פירעון — תיק ${caseId}`,
      content_json:   finalOutput.result,
      content_html:   null,
      matter_id:      caseId,
      client_id:      null,
      document_type:  'opinion',
      status:         'draft',
      word_count:     (finalOutput.result ?? '').split(/\s+/).length,
      parent_draft_id: null,
      fork_reason:    null,
      created_by:     'insolvency-agent',
      is_active:      1,
    });
  } catch { /* non-blocking */ }

  return finalOutput;
}
