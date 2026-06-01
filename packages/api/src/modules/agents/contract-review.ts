import { runAgent } from '@factum-il/agent-core';
import { checkConfidence } from '@factum-il/ai-guardrails';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress } from '@factum-il/agent-core';
import { makeDocumentTool, makeDocumentInsightsTool } from './db-tools.js';
import { persistAgentResult } from './persist-result.js';

// Contract Review Agent: extracts clauses, identifies risks, flags missing standard sections.
// Always sets flagForReview = true (medium risk — lawyer must verify AI analysis).
export async function reviewContract(
  repos: Repos,
  documentId: number,
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  const output = await runAgent({
    agentName: 'contract-review',
    task: `בדוק את החוזה הבא וספק ניתוח בפורמט JSON:
{
  "contractType": "<סוג חוזה>",
  "parties": ["<צד 1>", "<צד 2>"],
  "effectiveDate": "<תאריך תחולה או null>",
  "duration": "<תקופת החוזה או null>",
  "clauses": [
    {
      "title": "<כותרת סעיף>",
      "summary": "<תקציר הסעיף>",
      "riskLevel": "low|medium|high",
      "riskNote": "<הערת סיכון אם קיים>"
    }
  ],
  "missingClauses": ["<סעיף חסר 1>", "<סעיף חסר 2>"],
  "overallRisk": "low|medium|high",
  "recommendations": ["<המלצה 1>"],
  "confidence": <0.0–1.0>
}`,
    tools:      [makeDocumentTool(repos, documentId), makeDocumentInsightsTool(repos, documentId)],
    documentId,
    ...(onProgress ? { onProgress } : {}),
  });

  // Contract review always requires attorney verification
  const guardResult = checkConfidence(
    { caseNumber: null, courtName: null, judgeName: null, offenseType: null,
      charges: [], nextHearing: null, procedureType: null, documentType: null,
      confidence: output.confidence },
    { ocrText: output.result, documentId },
  );

  const finalOutput: AgentOutput = {
    ...output,
    flagForReview: true,
  };

  // Suppress unused variable warning — guardResult checked for side-effects only
  void guardResult;

  try {
    persistAgentResult(repos, finalOutput, { documentId });
  } catch { /* ignore */ }

  return finalOutput;
}
