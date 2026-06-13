// Case Intake Agent — processes new client intake: summary, procedure type, required docs,
// preliminary risks, and recommended next steps. Saves to LegalDrafts + AgentResults.
// Model: BrainboxAI/law-il-E2B:Q4_K_M (mandatory — do not change).
import { runAgent } from '@factum-il/agent-core';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress, Tool } from '@factum-il/agent-core';
import { persistAgentResult } from './persist-result.js';

export interface CaseIntakeInput {
  clientName:    string;
  idNumber?:     string;
  caseType?:     string;
  factsNarrative: string;
  documentIds?:  number[];
  clientId?:     number;
}

function makeIntakeDocsTool(repos: Repos, documentIds: number[]): Tool {
  return {
    name: 'get_intake_documents',
    description: 'מביא מסמכים שהועלו בתהליך הקליטה',
    execute: async () => {
      if (documentIds.length === 0) return [];
      const placeholders = documentIds.map(() => '?').join(', ');
      return repos.db.prepare(`
        SELECT id, original_name, document_type, ai_enriched, created_at
          FROM Documents
         WHERE id IN (${placeholders})
      `).all(...documentIds) as Record<string, unknown>[];
    },
  };
}

function makeAllRulesTool(repos: Repos): Tool {
  return {
    name: 'get_all_procedure_types',
    description: 'מביא סוגי הליכים זמינים לקיטלוג תיק חדש',
    execute: async () =>
      repos.db.prepare(`
        SELECT DISTINCT procedure_type, COUNT(*) AS rule_count
          FROM Rules_Engine
         WHERE is_active = 1 AND procedure_type IS NOT NULL
         GROUP BY procedure_type
      `).all() as Record<string, unknown>[],
  };
}

export async function runCaseIntake(
  repos: Repos,
  input: CaseIntakeInput,
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  const clientContext = `לקוח: ${input.clientName}${input.idNumber ? ` (ת.ז. ${input.idNumber})` : ''}
סוג תיק משוער: ${input.caseType ?? 'לא צוין'}

עובדות:
${input.factsNarrative}`;

  const output = await runAgent({
    agentName: 'case-intake',
    task: `נתח את פרטי הקליטה הבאים וצור סיכום מקצועי לפתיחת תיק בפורמט JSON:
{
  "caseSummary": "<סיכום 2-3 משפטים>",
  "recommendedProcedureType": "<סוג הליך מוצע: civil|criminal|family|labor|administrative|commercial|insolvency>",
  "recommendedCourt": "<בית משפט מוצע: שלום|מחוזי|עליון|עבודה|משפחה|מנהלי>",
  "legalIssues": ["<סוגיה משפטית 1>", "<סוגיה משפטית 2>"],
  "requiredDocuments": [
    { "document": "<סוג מסמך>", "urgency": "immediate|soon|when_available", "purpose": "<מטרה>" }
  ],
  "preliminaryRisks": [
    { "risk": "<סיכון>", "severity": "low|medium|high", "recommendation": "<המלצה>" }
  ],
  "statOfLimitations": {
    "applicable": true,
    "deadline": "<YYYY-MM-DD or null>",
    "basis": "<חוק התיישנות רלוונטי>"
  },
  "nextSteps": ["<צעד 1>", "<צעד 2>", "<צעד 3>"],
  "estimatedComplexity": "simple|moderate|complex|highly_complex",
  "confidence": <0.0–1.0>
}

בסס על חוק ההתיישנות תשי"ח-1958, תקנות סדר הדין האזרחי תשע"ט-2018, וחוק בתי המשפט.`,
    context:  clientContext,
    tools:    [
      makeAllRulesTool(repos),
      ...(input.documentIds && input.documentIds.length > 0
        ? [makeIntakeDocsTool(repos, input.documentIds)]
        : []),
    ],
    ...(onProgress ? { onProgress } : {}),
  });

  const finalOutput: AgentOutput = { ...output, flagForReview: true };

  try {
    persistAgentResult(repos, finalOutput, {
      ...(input.clientId ? {} : {}),
    });
    repos.drafts.create({
      title:          `קליטת תיק חדש — ${input.clientName}`,
      content_json:   finalOutput.result,
      content_html:   null,
      matter_id:      null,
      client_id:      input.clientId ?? null,
      document_type:  'general',
      status:         'draft',
      word_count:     (finalOutput.result ?? '').split(/\s+/).length,
      parent_draft_id: null,
      fork_reason:    null,
      created_by:     'case-intake',
      is_active:      1,
    });
  } catch { /* non-blocking */ }

  return finalOutput;
}
