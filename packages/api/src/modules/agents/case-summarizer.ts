import { runAgent } from '@factum-il/agent-core';
import { assembleContext } from '@factum-il/memory';
import type { Repos } from '../../db.js';
import type { AgentOutput } from '@factum-il/agent-core';
import { makeCaseTool, makeCaseDocumentsTool, makeCaseTasksTool } from './db-tools.js';
import { persistAgentResult } from './persist-result.js';

export async function summarizeCase(repos: Repos, caseId: number): Promise<AgentOutput> {
  // Load prior case memory for context
  const assembled = assembleContext(caseId, 'system', repos.db as never);

  const output = await runAgent({
    agentName: 'case-summarizer',
    task: `סכם את התיק הבא בפורמט JSON מובנה:
{
  "parties": ["<שם צד 1>", "<שם צד 2>"],
  "caseType": "<סוג תיק>",
  "status": "<סטטוס>",
  "keyDates": [{"date": "<YYYY-MM-DD>", "description": "<תיאור>"}],
  "summary": "<סיכום 2-3 משפטים>",
  "nextAction": "<הפעולה הבאה הנדרשת>",
  "confidence": <0.0–1.0>
}`,
    ...(assembled.summary ? { context: assembled.summary } : {}),
    tools:    [
      makeCaseTool(repos, caseId),
      makeCaseDocumentsTool(repos, caseId),
      makeCaseTasksTool(repos, caseId),
    ],
    caseId,
  });

  // Persist to AgentResults table (non-blocking — don't throw if migration not applied yet)
  try {
    persistAgentResult(repos, output, { caseId });
  } catch { /* ignore — table might not exist in older DBs */ }

  return output;
}
