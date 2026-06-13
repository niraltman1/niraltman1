// Hearing Prep Agent — hearing brief, strategy, weaknesses, missing evidence, witness questions.
// Saves to LegalDrafts + AgentResults.
// Model: BrainboxAI/law-il-E2B:Q4_K_M (mandatory — do not change).
import { runAgent } from '@factum-il/agent-core';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress, Tool } from '@factum-il/agent-core';
import {
  makeCaseTool, makeCaseDocumentsTool, makeCaseEvidenceTool, makeCaseTasksTool,
} from './db-tools.js';
import { persistAgentResult } from './persist-result.js';

function makeHearingDetailTool(repos: Repos, caseId: number, hearingId: number): Tool {
  return {
    name: 'get_hearing_detail',
    description: 'מביא פרטי הדיון הספציפי: תאריך, שופט, סוג, הערות',
    execute: async () => {
      const hearing = repos.db.prepare(
        'SELECT * FROM CourtHearings WHERE id = ? AND case_id = ?',
      ).get(hearingId, caseId) as Record<string, unknown> | undefined;
      return hearing ?? null;
    },
  };
}

function makePriorHearingsTool(repos: Repos, caseId: number, hearingId: number): Tool {
  return {
    name: 'get_prior_hearings',
    description: 'מביא דיונים קודמים להכנת המשכיות טיעון',
    execute: async () =>
      repos.db.prepare(`
        SELECT id, hearing_date, hearing_type, notes, status
          FROM CourtHearings
         WHERE case_id = ? AND id != ? AND status IN ('completed', 'adjourned')
         ORDER BY hearing_date DESC
         LIMIT 10
      `).all(caseId, hearingId) as Record<string, unknown>[],
  };
}

export async function runHearingPrep(
  repos: Repos,
  caseId: number,
  hearingId: number,
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  const output = await runAgent({
    agentName: 'hearing-prep',
    task: `הכן תדריך דיון מקיף לעורך הדין בפורמט JSON:
{
  "hearingSummary": {
    "date": "<תאריך>",
    "court": "<בית משפט>",
    "judge": "<שופט>",
    "hearingType": "<סוג דיון>"
  },
  "casePositionSummary": "<סיכום עמדת הלקוח בשני משפטים>",
  "keyArguments": [
    { "argument": "<טיעון>", "legalBasis": "<בסיס משפטי>", "strength": "strong|medium|weak" }
  ],
  "weaknesses": [
    { "weakness": "<חולשה>", "mitigation": "<אופן התמודדות>", "risk": "low|medium|high" }
  ],
  "missingEvidence": [
    { "evidenceType": "<סוג ראיה>", "importance": "essential|helpful", "howToObtain": "<דרך השגה>" }
  ],
  "witnessQuestions": [
    { "witness": "<עד>", "questions": ["<שאלה 1>", "<שאלה 2>"] }
  ],
  "openingStatement": "<פתיחה מוצעת לדיון>",
  "nextSteps": ["<צעד 1>", "<צעד 2>"],
  "confidence": <0.0–1.0>
}

הדגש על כללי ראיות ישראליים וסדרי הדין בבית המשפט הרלוונטי.`,
    tools: [
      makeCaseTool(repos, caseId),
      makeHearingDetailTool(repos, caseId, hearingId),
      makePriorHearingsTool(repos, caseId, hearingId),
      makeCaseDocumentsTool(repos, caseId),
      makeCaseEvidenceTool(repos, caseId),
      makeCaseTasksTool(repos, caseId),
    ],
    caseId,
    ...(onProgress ? { onProgress } : {}),
  });

  const finalOutput: AgentOutput = { ...output, flagForReview: true };

  try {
    persistAgentResult(repos, finalOutput, { caseId });
    repos.drafts.create({
      title:          `הכנה לדיון — תיק ${caseId} דיון ${hearingId}`,
      content_json:   finalOutput.result,
      content_html:   null,
      matter_id:      caseId,
      client_id:      null,
      document_type:  'brief',
      status:         'draft',
      word_count:     (finalOutput.result ?? '').split(/\s+/).length,
      parent_draft_id: null,
      fork_reason:    null,
      created_by:     'hearing-prep',
      is_active:      1,
    });
  } catch { /* non-blocking */ }

  return finalOutput;
}
