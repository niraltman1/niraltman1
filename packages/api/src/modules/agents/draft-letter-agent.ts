// Draft Letter Agent — generates a Hebrew letter (client/demand/court notification).
// Output saved to LegalDrafts. Always flagForReview=true.
// Model: BrainboxAI/law-il-E2B:Q4_K_M (mandatory — do not change).
import { runAgent } from '@factum-il/agent-core';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress } from '@factum-il/agent-core';
import { makeCaseTool, makeCaseDocumentsTool } from './db-tools.js';
import { persistAgentResult } from './persist-result.js';

export type LetterType = 'client' | 'demand' | 'court';

export interface DraftLetterInput {
  caseId:       number;
  letterType:   LetterType;
  recipient:    string;
  instructions: string;
}

const LETTER_TYPE_LABELS: Record<LetterType, string> = {
  client:  'מכתב ללקוח',
  demand:  'מכתב דרישה',
  court:   'הודעה לבית המשפט',
};

export async function runDraftLetter(
  repos: Repos,
  input: DraftLetterInput,
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  const { caseId, letterType, recipient, instructions } = input;
  const letterLabel = LETTER_TYPE_LABELS[letterType];

  const output = await runAgent({
    agentName: 'draft-letter',
    task: `כתוב ${letterLabel} בעברית פורמלית בפורמט JSON:
{
  "date": "<תאריך בפורמט DD.MM.YYYY>",
  "to": "${recipient}",
  "subject": "<נושא המכתב>",
  "salutation": "<פתיחת מכתב — לכבוד / אל כבוד>",
  "body": "<גוף המכתב — פסקאות מובנות>",
  "closing": "<סיום — בכבוד רב / בברכה>",
  "signature": "עו'ד [שם]",
  "attachments": ["<רשימת מצורפים אם יש>"],
  "confidence": <0.0–1.0>
}

סוג מכתב: ${letterLabel}
נמען: ${recipient}
הוראות: ${instructions}

התאם את הטון לסוג המכתב:
- מכתב ללקוח: בהיר ומסביר, לא משפטי מדי
- מכתב דרישה: נחרץ ורשמי, עם מועד תגובה מפורש
- הודעה לבית המשפט: רשמי לחלוטין, לפי כללי הדיון`,
    tools: [
      makeCaseTool(repos, caseId),
      makeCaseDocumentsTool(repos, caseId),
    ],
    caseId,
    ...(onProgress ? { onProgress } : {}),
  });

  const finalOutput: AgentOutput = { ...output, flagForReview: true };

  try {
    persistAgentResult(repos, finalOutput, { caseId });
    repos.drafts.create({
      title:          `${letterLabel} ל-${recipient} — תיק ${caseId}`,
      content_json:   finalOutput.result,
      content_html:   null,
      matter_id:      caseId,
      client_id:      null,
      document_type:  'letter',
      status:         'draft',
      word_count:     (finalOutput.result ?? '').split(/\s+/).length,
      parent_draft_id: null,
      fork_reason:    null,
      created_by:     'draft-letter',
      is_active:      1,
    });
  } catch { /* non-blocking */ }

  return finalOutput;
}
