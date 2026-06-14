// Draft Letter Agent — generates formal Hebrew legal correspondence.
// Takes caseId + recipientType. Saves draft to LegalDrafts (type: 'letter').
// Model: BrainboxAI/law-il-E2B:Q4_K_M (mandatory — do not change).
import { runAgent } from '@factum-il/agent-core';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress } from '@factum-il/agent-core';
import { makeCaseTool, makeCaseTasksTool } from './db-tools.js';
import { persistAgentResult } from './persist-result.js';

export type RecipientType = 'client' | 'court' | 'opposing_counsel' | 'authority';

export async function runDraftLetter(
  repos: Repos,
  caseId: number,
  recipientType: RecipientType = 'client',
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  const recipientLabels: Record<RecipientType, string> = {
    client:            'ללקוח',
    court:             'לבית המשפט',
    opposing_counsel:  'לבא כוח הצד השני',
    authority:         'לרשות',
  };
  const recipientLabel = recipientLabels[recipientType];

  const output = await runAgent({
    agentName: 'draft-letter',
    task: `נסח מכתב משפטי רשמי ${recipientLabel} עבור תיק זה. החזר JSON בפורמט:
{
  "subject": "<נושא המכתב>",
  "salutation": "<פנייה מתאימה>",
  "opening": "<פסקת פתיחה — מטרת המכתב>",
  "body": "<גוף המכתב — עובדות, טענות, דרישות>",
  "closing": "<פסקת סיכום והנחיות>",
  "signature": "<חתימה: שם עו'ד, כותרת>",
  "enclosures": ["<מסמך מצורף 1>"],
  "urgency": "routine|urgent|immediate",
  "confidenceNote": "<הערת מהימנות>",
  "confidence": <0.0–1.0>
}

חשוב: שמור על לשון ענייה ומקצועית. ${
  recipientType === 'court'
    ? 'פנה לבית המשפט בנוסח פורמלי לפי כללי לשכת עורכי הדין.'
    : recipientType === 'client'
    ? 'הסבר לשון פשוטה ומובנת, ללא עמימות משפטית.'
    : 'שמור על גבול מקצועי, ללא ויתורים על עמדות.'
}`,
    tools: [
      makeCaseTool(repos, caseId),
      makeCaseTasksTool(repos, caseId),
    ],
    caseId,
    ...(onProgress ? { onProgress } : {}),
  });

  const finalOutput: AgentOutput = { ...output, flagForReview: true };

  try {
    persistAgentResult(repos, finalOutput, { caseId });
    const wordCount = (finalOutput.result ?? '').split(/\s+/).length;
    repos.drafts.create({
      title:           `מכתב ${recipientLabel} — תיק ${caseId}`,
      content_json:    finalOutput.result,
      content_html:    null,
      matter_id:       caseId,
      client_id:       null,
      document_type:   'letter',
      status:          'draft',
      word_count:      wordCount,
      parent_draft_id: null,
      fork_reason:     null,
      created_by:      'draft-letter-agent',
      is_active:       1,
    });
  } catch { /* non-blocking */ }

  return finalOutput;
}
