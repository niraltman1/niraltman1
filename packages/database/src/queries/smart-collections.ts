import type { DatabaseConnection } from '../connection.js';

/**
 * Smart Collections (M7) — virtual, always-fresh document collections defined by a
 * query rather than a folder. Read-only; reuses existing Documents / DocumentInsights /
 * court_hearings data. No new storage.
 */

export type SmartCollectionKey =
  | 'unverified'   // documents with an unverified AI insight
  | 'recent'       // most recently added
  | 'ocr_pending'  // awaiting OCR / review
  | 'hearing';     // documents on matters that have a court hearing

export interface SmartCollectionItem {
  id:              number;
  filename:        string;
  processingState: string | null;
  documentType:    string | null;
  caseId:          number | null;
  createdAt:       string | null;
}

export interface SmartCollectionMeta {
  key:   SmartCollectionKey;
  label: string;
  count: number;
}

const LABELS: Record<SmartCollectionKey, string> = {
  unverified:  'תובנות לא מאומתות',
  recent:      'נוספו לאחרונה',
  ocr_pending: 'ממתינים ל-OCR / סקירה',
  hearing:     'מסמכי דיון',
};

function mapRow(r: Record<string, unknown>): SmartCollectionItem {
  return {
    id:              r['id'] as number,
    filename:        (r['filename'] as string | null) ?? '',
    processingState: (r['processing_state'] as string | null) ?? null,
    documentType:    (r['document_type'] as string | null) ?? null,
    caseId:          (r['case_id'] as number | null) ?? null,
    createdAt:       (r['created_at'] as string | null) ?? null,
  };
}

export class SmartCollectionsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  private sql(key: SmartCollectionKey): string {
    switch (key) {
      case 'unverified':
        return `SELECT DISTINCT d.* FROM Documents d
                  JOIN DocumentInsights di ON di.document_id = d.id
                 WHERE di.verification_state = 'unverified'
                 ORDER BY d.created_at DESC`;
      case 'ocr_pending':
        return `SELECT * FROM Documents
                 WHERE processing_state IN ('OCR_PENDING','REVIEW_PENDING')
                 ORDER BY created_at DESC`;
      case 'hearing':
        return `SELECT DISTINCT d.* FROM Documents d
                  JOIN court_hearings h ON h.case_id = d.case_id
                 ORDER BY d.created_at DESC`;
      case 'recent':
      default:
        return `SELECT * FROM Documents ORDER BY created_at DESC LIMIT 100`;
    }
  }

  items(key: SmartCollectionKey): SmartCollectionItem[] {
    return (this.db.prepare(this.sql(key)).all() as Record<string, unknown>[]).map(mapRow);
  }

  /** All collections with their live counts, for the index view. */
  overview(): SmartCollectionMeta[] {
    return (Object.keys(LABELS) as SmartCollectionKey[]).map((key) => ({
      key,
      label: LABELS[key],
      count: this.items(key).length,
    }));
  }
}
