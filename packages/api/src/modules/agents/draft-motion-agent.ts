// Draft Motion Agent — generates a Hebrew motion/submission draft.
// Output saved to LegalDrafts. Always flagForReview=true (attorney must approve before use).
// Model: BrainboxAI/law-il-E2B:Q4_K_M (mandatory — do not change).
import { runAgent } from '@factum-il/agent-core';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress } from '@factum-il/agent-core';
import {
  makeCaseTool, makeCaseDocumentsTool, makeCaseEvidenceTool, makeCaseTasksTool,
} from './db-tools.js';
import { persistAgentResult } from './persist-result.js';

export interface DraftMotionInput {
  caseId:       number;
  motionType:   string;
  instructions: string;
}

export async function runDraftMotion(
  repos: Repos,
  input: DraftMotionInput,
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  const { caseId, motionType, instructions } = input;

  const output = await runAgent({
    agentName: 'draft-motion',
    task: `כתוב טיוטת ${motionType} בעברית משפטית פורמלית בפורמט JSON:
{
  "title": "<כותרת הבקשה/הסיכומים>",
  "court": "<שם בית המשפט>",
  "caseNumber": "<מספר תיק>",
  "parties": {
    "applicant": "<שם המבקש>",
    "respondent": "<שם המשיב>"
  },
  "introduction": "<פתיחה: 2-3 משפטים המציגים את הבקשה>",
  "background": "<רקע עובדתי: פסקה מסודרת לפי כרונולוגיה>",
  "legalBasis": [
    { "provision": "<סעיף חוק / תקנה / פסיקה>", "relevance": "<כיצד מחזק את הטענה>" }
  ],
  "arguments": [
    { "heading": "<כותרת הטענה>", "body": "<פירוט הטיעון המשפטי>" }
  ],
  "relief": "<הסעד המבוקש>",
  "signature": "עו\"ד [שם], ב\"כ המבקש",
  "confidence": <0.0–1.0>
}

הוראות נוספות: ${instructions}

השתמש בסגנון משפטי ישראלי רשמי. הכלל הפניות לחוק, לתקנות ולפסיקה רלוונטית.`,
    tools: [
      makeCaseTool(repos, caseId),
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
      title:          `${motionType} — תיק ${caseId}`,
      content_json:   finalOutput.result,
      content_html:   null,
      matter_id:      caseId,
      client_id:      null,
      document_type:  'motion',
      status:         'draft',
      word_count:     (finalOutput.result ?? '').split(/\s+/).length,
      parent_draft_id: null,
      fork_reason:    null,
      created_by:     'draft-motion',
      is_active:      1,
    });
  } catch { /* non-blocking */ }

  return finalOutput;
}
