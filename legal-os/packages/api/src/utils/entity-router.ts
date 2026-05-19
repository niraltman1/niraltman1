import type { Repos } from '../db.js';
import { discoverFields } from './field-discovery.js';
import type { DiscoveredFields } from './field-discovery.js';
import { broadcast } from '../routes/events.js';

export interface RagExtraction {
  caseNumber:    string | null;
  courtName:     string | null;
  judgeName:     string | null;
  offenseType:   string | null;
  procedureType: string | null;
  documentType:  string | null;
  confidence:    number;
}

export interface EntityRouterInput {
  documentId:       number;
  discoveredFields: DiscoveredFields;
  ragExtraction:    Partial<RagExtraction>;
}

export async function routeEntities(repos: Repos, input: EntityRouterInput): Promise<void> {
  const { documentId, discoveredFields, ragExtraction } = input;

  // ── 1. Client matching / stub creation via Luhn-validated Israeli ID ───
  // Wrapped independently: client failure must not block case/contact routing.
  let clientId: number | null = null;
  try {
    for (const idNum of discoveredFields.israeliIds) {
      const existing = repos.clients.findByIdNumber(idNum);
      if (existing) {
        clientId = existing.id;
      } else {
        const stub = repos.clients.create({
          nameHe:   `לקוח ${idNum}`,
          idNumber: idNum,
          idType:   'personal',
        });
        clientId = stub.id;
      }
      break; // use first matched ID only
    }
    if (clientId !== null) {
      repos.db
        .prepare('UPDATE Documents SET client_id = ? WHERE id = ? AND client_id IS NULL')
        .run(clientId, documentId);
    }
  } catch (err) {
    console.warn(`[EntityRouter] client routing failed doc=${documentId}:`, err);
  }

  // ── 2. Case linking / stub creation via extracted case number ──────────
  // Wrapped independently: case failure must not block contact routing.
  let caseId: number | null = null;
  try {
    const caseNum = ragExtraction.caseNumber ?? discoveredFields.caseNumbers[0] ?? null;
    if (caseNum) {
      let matched = repos.cases.findByCaseNumber(caseNum);
      if (!matched && clientId !== null) {
        matched = repos.cases.create({
          caseNumber: caseNum,
          titleHe:    `תיק ${caseNum}`,
          clientId:   clientId,
          openedDate: new Date().toISOString().slice(0, 10),
          status:     'open',
          ...(ragExtraction.courtName != null ? { courtName: ragExtraction.courtName } : {}),
        });
      }
      if (matched) {
        caseId = matched.id;
        repos.db
          .prepare('UPDATE Documents SET case_id = ? WHERE id = ? AND case_id IS NULL')
          .run(caseId, documentId);
      }
    }
  } catch (err) {
    console.warn(`[EntityRouter] case routing failed doc=${documentId}:`, err);
  }

  // ── 3. Contacts from extraction ────────────────────────────────────────
  // Each contact creation is individually guarded; a locked DB row or
  // duplicate CaseContacts entry must never crash the engine.
  if (caseId !== null) {
    if (discoveredFields.prosecutionEntity) {
      try {
        const c = repos.contacts.create({
          nameHe: discoveredFields.prosecutionEntity,
          role:   'prosecutor',
        });
        try { repos.contacts.linkToCase(caseId, c.id, 'תביעה'); } catch { /* duplicate ok */ }
        broadcast('CONTACT_EXTRACTED', { documentId, contactId: c.id, role: 'prosecutor', nameHe: c.nameHe });
      } catch (err) {
        console.warn(`[EntityRouter] prosecutor contact failed doc=${documentId}:`, err);
      }
    }
    for (const judgeName of discoveredFields.judgeNames) {
      try {
        const c = repos.contacts.create({ nameHe: judgeName, role: 'court_clerk' });
        try { repos.contacts.linkToCase(caseId, c.id, 'שופט/ת'); } catch { /* duplicate ok */ }
        broadcast('CONTACT_EXTRACTED', { documentId, contactId: c.id, role: 'court_clerk', nameHe: c.nameHe });
      } catch (err) {
        console.warn(`[EntityRouter] judge contact failed doc=${documentId} name=${judgeName}:`, err);
      }
    }

    // ── 4. Expanded actor extraction ────────────────────────────────────────
    for (const name of discoveredFields.investigators) {
      try {
        const c = repos.contacts.create({ nameHe: name, role: 'investigator' });
        try { repos.contacts.linkToCase(caseId, c.id, 'חוקר'); } catch { /* duplicate ok */ }
        broadcast('CONTACT_EXTRACTED', { documentId, contactId: c.id, role: 'investigator', nameHe: name });
      } catch (err) {
        console.warn(`[EntityRouter] investigator contact failed doc=${documentId}:`, err);
      }
    }
    for (const name of discoveredFields.expertWitnesses) {
      try {
        const c = repos.contacts.create({ nameHe: name, role: 'expert_witness' });
        try { repos.contacts.linkToCase(caseId, c.id, 'מומחה'); } catch { /* duplicate ok */ }
        broadcast('CONTACT_EXTRACTED', { documentId, contactId: c.id, role: 'expert_witness', nameHe: name });
      } catch (err) {
        console.warn(`[EntityRouter] expert_witness contact failed doc=${documentId}:`, err);
      }
    }
    for (const name of discoveredFields.coDefendants) {
      try {
        const c = repos.contacts.create({ nameHe: name, role: 'co_defendant' });
        try { repos.contacts.linkToCase(caseId, c.id, 'נאשם משותף'); } catch { /* duplicate ok */ }
        broadcast('CONTACT_EXTRACTED', { documentId, contactId: c.id, role: 'co_defendant', nameHe: name });
      } catch (err) {
        console.warn(`[EntityRouter] co_defendant contact failed doc=${documentId}:`, err);
      }
    }
  }
}

export { discoverFields };
