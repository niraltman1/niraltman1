import { runAgent } from '@factum-il/agent-core';
import { checkConfidence } from '@factum-il/ai-guardrails';
import type { Repos } from '../../db.js';
import type { AgentOutput, AgentProgress } from '@factum-il/agent-core';
import { persistAgentResult } from './persist-result.js';

// Research agent ALWAYS sets flagForReview = true (medium risk)
export async function researchLegalQuestion(
  repos: Repos,
  question: string,
  caseId?: number,
  onProgress?: (p: AgentProgress) => void,
): Promise<AgentOutput> {
  // Build a search tool that queries FTS5
  const searchTool = {
    name: 'search_cases',
    description: 'מחפש תיקים קשורים בבסיס הנתונים',
    execute: async () => {
      try {
        return repos.db.prepare(`
          SELECT c.case_number, c.title_he, c.case_type, c.status,
                 snippet(fts_documents, 0, '<mark>', '</mark>', '…', 15) AS excerpt
            FROM fts_documents fd
            JOIN Documents d ON d.id = fd.rowid
            JOIN Cases c ON c.id = d.case_id
           WHERE fts_documents MATCH ?
           LIMIT 5
        `).all(question) as unknown[];
      } catch {
        return [];
      }
    },
  };

  const precedentTool = {
    name: 'get_precedents',
    description: 'מחפש פסיקה קשורה',
    execute: async () => {
      try {
        return repos.db.prepare(`
          SELECT case_number, title, court, year, summary
            FROM CaseLawRegistry
           WHERE summary LIKE ?
           LIMIT 5
        `).all(`%${question.slice(0, 30)}%`) as unknown[];
      } catch {
        return [];
      }
    },
  };

  const output = await runAgent({
    agentName: 'research-agent',
    task: `חקור את השאלה המשפטית הבאה: "${question}"

ספק תשובה בפורמט JSON:
{
  "answer": "<תשובה מפורטת בעברית>",
  "legalBasis": ["<סעיף חוק / פסיקה 1>", "<סעיף חוק / פסיקה 2>"],
  "risks": ["<סיכון 1>"],
  "disclaimer": "תשובה זו מיועדת לסיוע בלבד ואינה מהווה ייעוץ משפטי",
  "confidence": <0.0–1.0>
}`,
    tools: [searchTool, precedentTool],
    ...(caseId !== undefined ? { caseId } : {}),
    ...(onProgress ? { onProgress } : {}),
  });

  // Research agent ALWAYS requires human review — override flag
  const guardResult = checkConfidence(
    { caseNumber: null, courtName: null, judgeName: null, offenseType: null,
      charges: [], nextHearing: null, procedureType: null, documentType: null,
      confidence: output.confidence },
    { ocrText: output.result, documentId: 0 },
  );

  const reviewRequired = output.flagForReview || guardResult.status !== 'pass';

  const finalOutput: AgentOutput = { ...output, flagForReview: reviewRequired };

  try {
    persistAgentResult(repos, finalOutput, ...(caseId !== undefined ? [{ caseId }] : [{}]));
  } catch { /* ignore */ }

  return finalOutput;
}
