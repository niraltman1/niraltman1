import type { ProcessingState } from './processing.js';

export type DocumentLanguage = 'he' | 'en' | 'ar' | 'mixed';

export type DocumentType =
  | 'court_ruling'
  | 'petition'
  | 'summons'
  | 'contract'
  | 'power_of_attorney'
  | 'correspondence'
  | 'invoice'
  | 'medical_report'
  | 'evidence'
  | 'protocol'
  | 'other';

export interface Document {
  readonly id: number;
  readonly fileHash: string;
  readonly originalPath: string;
  readonly storagePath: string;
  readonly filename: string;
  readonly extension: string;
  readonly fileSizeBytes: number;
  readonly mimeType: string | null;
  readonly caseId: number | null;
  readonly clientId: number | null;
  readonly documentType: DocumentType | null;
  readonly documentDate: string | null;
  readonly language: DocumentLanguage;
  readonly ocrText: string | null;
  readonly ocrConfidence: number | null;
  readonly processingState: ProcessingState;
  readonly pageCount: number | null;
  readonly isDuplicate: boolean;
  readonly duplicateOf: number | null;
  readonly tags: string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DocumentCreateInput {
  readonly fileHash: string;
  readonly originalPath: string;
  readonly storagePath: string;
  readonly filename: string;
  readonly extension: string;
  readonly fileSizeBytes: number;
  readonly mimeType?: string | null;
  readonly language?: DocumentLanguage;
  readonly clientId?: number | null;
  readonly caseId?: number | null;
}

export interface DocumentSearchResult {
  readonly document: Document;
  readonly rank: number;
  readonly snippet: string;
}

export interface PaginatedResult<T> {
  readonly items: T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}
