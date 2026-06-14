// Evidence Review Agent — analyzes all evidence items for a case.
// Identifies strengths, gaps, admissibility risks. Saves to AgentResults.
// Model: BrainboxAI/law-il-E2B:Q4_K_M (mandatory — do not change).
import { runAgent } from '@factum-il/agent-core';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress, Tool } from '@factum-il/agent-core';
import { makeCaseTool, makeCaseDocumentsTool, makeCaseEvidenceTool } from './db-tools.js';
import { persistAgentResult } from './persist-result.js';

function makeEvidenceDetailTool(repos: Repos, caseId: number): Tool {
  return {
    name: 'get_evidence_detail',
    description: 'מביא פרטים מלאים של פריטי הראיות בתיק, כולל מידע OCR ומקור',
    execute: async () =>
      repos.db.prepare(`
        SELECT e.id, e.source_app, e.media_type, e.original_filename,
               e.ocr_text, e.locked_at, e.is_write_protected,
               e.notes, d.document_type, d.document_date
          FROM EvidenceItems e
          LEFT JOIN Documents d ON e.document_id = d.id
         WHERE e.case_id = ?
         ORDER BY e.locked_at DESC
         LIMIT 30
      `).all(caseId) as Record<string, unknown>[],
  };
}

export async function runEvidenceReview(
  repos: Repos,
  caseId: number,
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  const output = await runAgent({
    agentName: 'evidence-review',
    task: `נתח את מאגר הראיות בתיק זה בפורמט JSON:
{
  "summary": "<סיכום מצב הראיות>",
  "strengths": [
    { "item": "<תיאור ראיה>", "value": "high|medium|low", "reason": "<הסבר>", "admissibility": "strong|moderate|uncertain" }
  ],
  "weaknesses": [
    { "item": "<תיאור חסר>", "impact": "high|medium|low", "recommendation": "<המלצה לתיקון>" }
  ],
  "admissibilityRisks": [
    { "evidenceRef": "<שם/מזהה>", "risk": "<תיאור סיכון>", "legalBasis": "<עילה חוקית>", "severity": "high|medium|low" }
  ],
  "missingEvidence": ["<ראיה חסרה 1>", "<ראיה חסרה 2>"],
  "collectionPriority": [
    { "item": "<ראיה לאיסוף>", "urgency": "high|medium|low", "method": "<שיטת איסוף>" }
  ],
  "overallStrength": "strong|moderate|weak|insufficient",
  "readinessForTrial": <0.0–1.0>,
  "confidence": <0.0–1.0>
}

בסס את הניתוח על פקודת הראיות [נוסח חדש] תשל"א-1971 ועל הפסיקה הישראלית.
אל תמציא ראיות שאינן בתיק.`,
    tools: [
      makeCaseTool(repos, caseId),
      makeCaseDocumentsTool(repos, caseId),
      makeCaseEvidenceTool(repos, caseId),
      makeEvidenceDetailTool(repos, caseId),
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
