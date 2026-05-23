import type { Repos } from '../../db.js';
import type { Tool } from '@factum-il/agent-core';

// Returns a Tool that fetches case + client data
export function makeCaseTool(repos: Repos, caseId: number): Tool {
  return {
    name: 'get_case',
    description: 'מביא נתוני תיק ולקוח',
    execute: async () => {
      return repos.db.prepare(`
        SELECT c.id, c.case_number, c.case_type, c.title_he, c.status,
               c.statute_deadline, c.judge_name, c.court_name, c.procedure_type,
               cl.name_he AS client_name, cl.phone AS client_phone
          FROM Cases c
          JOIN Clients cl ON cl.id = c.client_id
         WHERE c.id = ?
      `).get(caseId);
    },
  };
}

// Returns a Tool that fetches documents for a case (id, title, document_type, created_at)
export function makeCaseDocumentsTool(repos: Repos, caseId: number): Tool {
  return {
    name: 'get_case_documents',
    description: 'מביא רשימת מסמכי התיק',
    execute: async () =>
      repos.db.prepare(`
        SELECT id, original_name, document_type, ai_enriched, created_at
          FROM Documents
         WHERE case_id = ?
         ORDER BY created_at DESC
         LIMIT 20
      `).all(caseId),
  };
}

// Returns a Tool that fetches tasks for a case
export function makeCaseTasksTool(repos: Repos, caseId: number): Tool {
  return {
    name: 'get_case_tasks',
    description: 'מביא משימות התיק',
    execute: async () =>
      repos.db.prepare(`
        SELECT id, title, status, due_date, priority
          FROM Tasks
         WHERE case_id = ?
         ORDER BY due_date ASC
      `).all(caseId),
  };
}

// Returns a Tool that fetches court hearings for a case
export function makeCaseHearingsTool(repos: Repos, caseId: number): Tool {
  return {
    name: 'get_case_hearings',
    description: 'מביא דיוני בית משפט',
    execute: async () =>
      repos.db.prepare(`
        SELECT id, hearing_date, hearing_type, court_name, notes, status
          FROM CourtHearings
         WHERE case_id = ?
         ORDER BY hearing_date ASC
      `).all(caseId),
  };
}
