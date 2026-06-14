// Draft Motion Agent — generates a Hebrew legal motion/brief draft for court submission.
// Takes caseId + optional motionType. Saves draft to LegalDrafts (type: 'motion').
// Model: BrainboxAI/law-il-E2B:Q4_K_M (mandatory — do not change).
import { runAgent } from '@factum-il/agent-core';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress } from '@factum-il/agent-core';
import { makeCaseTool, makeCaseDocumentsTool, makeCaseEvidenceTool, makeCaseHearingsTool } from './db-tools.js';
import { persistAgentResult } from './persist-result.js';

export type MotionType =
  | 'preliminary_injunction' // צו ביניים
  | 'extension_of_time'      // ארכה
  | 'summary_judgment'       // פסק דין על הסף
  | 'dismissal'              // דחיית תביעה
  | 'evidence_exclusion'     // הוצאת ראיות
  | 'general';               // בקשה כללית

export async function runDraftMotion(
  repos: Repos,
  caseId: number,
  motionType: MotionType = 'general',
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  const motionLabels: Record<MotionType, string> = {
    preliminary_injunction: 'צו ביניים',
    extension_of_time:      'ארכה',
    summary_judgment:       'פסק דין על הסף',
    dismissal:              'דחיית תביעה',
    evidence_exclusion:     'הוצאת ראיות',
    general:                'בקשה לבית המשפט',
  };
  const motionLabel = motionLabels[motionType];

  const output = await runAgent({
    agentName: 'draft-motion',
    task: `נסח ${motionLabel} בעברית משפטית רשמית עבור תיק זה. החזר JSON בפורמט:
{
  "title": "<כותרת הבקשה>",
  "header": "<כותרת פורמלית: בית המשפט, מספר תיק, הצדדים>",
  "opening": "<פסקת פתיחה — הגדרת הבקשה והסעד המבוקש>",
  "factualBackground": "<רקע עובדתי — עובדות רלוונטיות בלבד>",
  "legalArguments": [
    { "heading": "<כותרת טענה>", "body": "<תוכן הטענה המשפטית עם אסמכתאות>", "authorities": ["<פסיקה/חקיקה>"] }
  ],
  "relief": "<הסעד המבוקש — ניסוח מדויק>",
  "conclusion": "<פסקת סיום ובקשת בית המשפט>",
  "confidenceNote": "<הערת מהימנות — מה דורש אימות נוסף>",
  "confidence": <0.0–1.0>
}

חשוב: השתמש בדין הישראלי בלבד (תקנות סדר הדין האזרחי תשע"ט-2018, חוק בתי המשפט).
כל טענה חייבת להסתמך על עובדות קיימות בתיק. אל תמציא עובדות.`,
    tools: [
      makeCaseTool(repos, caseId),
      makeCaseDocumentsTool(repos, caseId),
      makeCaseEvidenceTool(repos, caseId),
      makeCaseHearingsTool(repos, caseId),
    ],
    caseId,
    ...(onProgress ? { onProgress } : {}),
  });

  const finalOutput: AgentOutput = { ...output, flagForReview: true };

  try {
    persistAgentResult(repos, finalOutput, { caseId });
    const wordCount = (finalOutput.result ?? '').split(/\s+/).length;
    repos.drafts.create({
      title:           `${motionLabel} — תיק ${caseId}`,
      content_json:    finalOutput.result,
      content_html:    null,
      matter_id:       caseId,
      client_id:       null,
      document_type:   'motion',
      status:          'draft',
      word_count:      wordCount,
      parent_draft_id: null,
      fork_reason:     null,
      created_by:      'draft-motion-agent',
      is_active:       1,
    });
  } catch { /* non-blocking */ }

  return finalOutput;
}
