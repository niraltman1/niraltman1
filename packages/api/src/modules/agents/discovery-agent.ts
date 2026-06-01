import { runAgent } from '@factum-il/agent-core';
import { analyzeEvidenceGaps, getCaseCompleteness } from '@factum-il/litigation-intelligence';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress } from '@factum-il/agent-core';
import { makeCaseTool, makeCaseDocumentsTool, makeCaseEvidenceTool } from './db-tools.js';
import { persistAgentResult } from './persist-result.js';

// Discovery Agent: maps evidence gaps + procedural completeness + suggests discovery actions.
// Always sets flagForReview = true (high risk — lawyer must review discovery strategy).
export async function runDiscovery(
  repos: Repos,
  caseId: number,
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  // Pre-execute litigation-intelligence tools synchronously before the LLM call
  const evidenceGaps  = analyzeEvidenceGaps(caseId, repos.db as never);
  const completeness  = getCaseCompleteness(caseId, repos.db as never);

  const contextSummary = JSON.stringify({ evidenceGaps, completeness }, null, 2);

  const output = await runAgent({
    agentName: 'discovery-agent',
    task: `בצע ניתוח גילוי ראיות לתיק זה בפורמט JSON:
{
  "evidenceGaps": [
    {
      "claim": "<תיאור טענה>",
      "missingEvidence": "<סוג ראיה חסרה>",
      "priority": "low|medium|high",
      "discoveryAction": "<פעולת גילוי מוצעת>"
    }
  ],
  "proceduralGaps": [
    {
      "stepName": "<שם שלב>",
      "status": "missing|overdue",
      "urgency": "low|medium|high"
    }
  ],
  "discoveryPlan": ["<פעולה 1>", "<פעולה 2>"],
  "completenessScore": <0.0–1.0>,
  "riskLevel": "low|medium|high|critical",
  "confidence": <0.0–1.0>
}`,
    context:  contextSummary,
    tools:    [makeCaseTool(repos, caseId), makeCaseDocumentsTool(repos, caseId), makeCaseEvidenceTool(repos, caseId)],
    caseId,
    ...(onProgress ? { onProgress } : {}),
  });

  const finalOutput: AgentOutput = { ...output, flagForReview: true };

  try {
    persistAgentResult(repos, finalOutput, { caseId });
  } catch { /* ignore */ }

  return finalOutput;
}
