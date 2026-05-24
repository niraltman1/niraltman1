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

// Returns a Tool that fetches document OCR text and type
export function makeDocumentTool(repos: Repos, documentId: number): Tool {
  return {
    name: 'get_document',
    description: 'מביא תוכן מסמך ופרטיו',
    execute: async () =>
      repos.db.prepare(`
        SELECT id, filename, document_type, ocr_text, created_at
          FROM Documents
         WHERE id = ?
      `).get(documentId),
  };
}

// Returns a Tool that fetches AI-extracted entities from a document
export function makeDocumentInsightsTool(repos: Repos, documentId: number): Tool {
  return {
    name: 'get_document_entities',
    description: 'מביא ישויות שחולצו על ידי AI מהמסמך',
    execute: async () =>
      repos.db.prepare(`
        SELECT entity_type, entity_value, confidence
          FROM DocumentInsights
         WHERE document_id = ?
         ORDER BY confidence DESC
      `).all(documentId),
  };
}

// Returns a Tool that fetches evidence items for a case
export function makeCaseEvidenceTool(repos: Repos, caseId: number): Tool {
  return {
    name: 'get_case_evidence',
    description: 'מביא פריטי ראיות בתיק',
    execute: async () =>
      repos.db.prepare(`
        SELECT id, title, evidence_type, source, status, created_at
          FROM EvidenceItems
         WHERE case_id = ?
         ORDER BY created_at DESC
      `).all(caseId),
  };
}
