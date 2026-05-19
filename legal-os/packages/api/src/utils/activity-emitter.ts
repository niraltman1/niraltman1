import type { Repos } from '../db.js';
import { broadcast } from '../routes/events.js';

export type ActivityKind =
  | 'ocr_completed' | 'ocr_failed' | 'entities_extracted' | 'deadline_detected'
  | 'precedent_matched' | 'ai_summary_generated' | 'verification_completed'
  | 'export_completed' | 'sync_completed' | 'document_ingested'
  | 'queue_failure' | 'queue_retry' | 'watcher_event';

export interface ActivityEvent {
  kind:        ActivityKind;
  caseId?:     number;
  documentId?: number;
  source?:     string;
  confidence?: number;
  message?:    string;
  details?:    Record<string, unknown>;
}

export function emitActivity(repos: Repos, event: ActivityEvent): void {
  repos.db.prepare(`
    INSERT INTO activity_events (kind, case_id, document_id, source, confidence, message, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.kind,
    event.caseId     ?? null,
    event.documentId ?? null,
    event.source     ?? null,
    event.confidence ?? null,
    event.message    ?? null,
    event.details    ? JSON.stringify(event.details) : null,
  );
  broadcast('ACTIVITY', { ...event, emittedAt: new Date().toISOString() });
}
