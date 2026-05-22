import type { Repos } from '../db.js';
import { broadcast } from '../routes/events.js';
import type { EventBus } from '@factum-il/events';

let _eventBus: EventBus | null = null;
export function configureEventBus(bus: EventBus): void { _eventBus = bus; }

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

  // Fan-out to domain event bus for event-driven subscribers
  if (_eventBus) {
    if (event.kind === 'ocr_completed' && event.documentId !== undefined) {
      void _eventBus.publish({ kind: 'OCRCompleted', documentId: event.documentId, caseId: event.caseId ?? null, ocrTextLength: 0 });
    } else if (event.kind === 'ocr_failed' && event.documentId !== undefined) {
      void _eventBus.publish({ kind: 'OCRFailed', documentId: event.documentId, reason: event.message ?? 'unknown' });
    } else if (event.kind === 'entities_extracted' && event.documentId !== undefined) {
      void _eventBus.publish({ kind: 'EntitiesExtracted', documentId: event.documentId, caseId: event.caseId ?? null });
    } else if (event.kind === 'deadline_detected' && event.caseId !== undefined) {
      void _eventBus.publish({ kind: 'DeadlineDetected', caseId: event.caseId, deadlineDate: String(event.details?.['deadlineDate'] ?? '') });
    }
  }
}
