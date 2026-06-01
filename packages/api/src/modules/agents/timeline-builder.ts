import { runAgent } from '@factum-il/agent-core';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress } from '@factum-il/agent-core';
import { makeCaseTool, makeCaseHearingsTool, makeCaseTasksTool, makeCaseDocumentsTool } from './db-tools.js';
import { persistAgentResult } from './persist-result.js';

export async function buildTimeline(
  repos: Repos,
  caseId: number,
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  const output = await runAgent({
    agentName: 'timeline-builder',
    task: `צור ציר זמן כרונולוגי של התיק בפורמט JSON:
{
  "events": [
    {"date": "<YYYY-MM-DD>", "type": "<hearing|task|document|deadline>", "description": "<תיאור>"}
  ],
  "nextDeadline": {"date": "<YYYY-MM-DD>", "description": "<תיאור>"},
  "confidence": <0.0–1.0>
}
מיין לפי תאריך, כלול אירועים עתידיים עם סימון ברור.`,
    tools: [
      makeCaseTool(repos, caseId),
      makeCaseHearingsTool(repos, caseId),
      makeCaseTasksTool(repos, caseId),
      makeCaseDocumentsTool(repos, caseId),
    ],
    caseId,
    ...(onProgress ? { onProgress } : {}),
  });

  try {
    persistAgentResult(repos, output, { caseId });
  } catch { /* ignore */ }

  return output;
}
