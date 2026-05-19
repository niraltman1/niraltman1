export type CitationSource =
  | CaseCitation
  | LawCitation
  | RegulationCitation
  | BookCitation
  | ArticleCitation;

export interface CaseCitation {
  readonly type: 'case';
  readonly procedure: string;
  readonly number: string;
  readonly parties: readonly string[];
  readonly publication?: string;
  readonly volume?: string;
  readonly page?: string;
  readonly date?: string;
}

export interface LawCitation {
  readonly type: 'law';
  readonly name: string;
  readonly year: number;
  readonly section?: string;
  readonly publication?: 'ס"ח' | 'ק"ת';
  readonly lawNumber?: number;
}

export interface RegulationCitation {
  readonly type: 'regulation';
  readonly name: string;
  readonly year: number;
  readonly regulation?: string;
  readonly publication?: 'ק"ת';
  readonly lawNumber?: number;
}

export interface BookCitation {
  readonly type: 'book';
  readonly authors: readonly string[];
  readonly title: string;
  readonly volume?: number;
  readonly edition?: number;
  readonly year?: number;
  readonly pages?: string;
}

export interface ArticleCitation {
  readonly type: 'article';
  readonly authors: readonly string[];
  readonly title: string;
  readonly journal: string;
  readonly volume?: number;
  readonly year?: number;
  readonly firstPage?: string;
  readonly citedPage?: string;
}

export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationError[];
}

export type CitationTrustLevel = 'validated' | 'partial' | 'invalid' | 'review_required';

export interface CitationConfidence {
  readonly score: number;
  readonly level: CitationTrustLevel;
  readonly extractedFrom?: string;
  readonly ocrConfidence?: number;
  readonly verified: boolean;
}
