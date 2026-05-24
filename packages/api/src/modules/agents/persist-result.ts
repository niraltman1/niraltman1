// Saves AgentOutput to AgentResults table
import type { Repos } from '../../db.js';
import type { AgentOutput } from '@factum-il/agent-core';

export function persistAgentResult(
  repos: Repos,
  output: AgentOutput,
  opts?: { caseId?: number; documentId?: number },
): void {
  repos.db.prepare(`
    INSERT OR IGNORE INTO AgentResults
      (agent_name, trace_id, case_id, document_id, result_text, confidence,
       flag_review, tool_log, duration_ms)
    VALUES
      (@agentName, @traceId, @caseId, @documentId, @resultText, @confidence,
       @flagReview, @toolLog, @durationMs)
  `).run({
    agentName:   output.agentName,
    traceId:     output.traceId,
    caseId:      opts?.caseId ?? null,
    documentId:  opts?.documentId ?? null,
    resultText:  output.result,
    confidence:  output.confidence,
    flagReview:  output.flagForReview ? 1 : 0,
    toolLog:     JSON.stringify(output.toolResults),
    durationMs:  output.durationMs,
  });
}
