import { describe, it, expect } from 'vitest';
import { AIValidator } from '../../packages/ai/src/validator.js';

const validator = new AIValidator();

describe('AIValidator.validate — hallucination rejection', () => {
  const base = {
    documentType: 'CONTRACT' as const,
    confidence: 0.85,
    documentDate: '2024-01-15',
    parties: ['יוסי כהן', 'דינה לוי'],
    caseNumber: null,
    idNumbers: [],
    summary: 'חוזה שכירות',
    rawAIResponse: '{}',
  };

  it('passes a clean response', () => {
    const result = validator.validate(base, {});
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.85);
  });

  it('returns null when a hallucination pattern is detected', () => {
    const result = validator.validate({
      ...base,
      summary: 'I cannot determine the document type',
    }, {});
    expect(result).toBeNull();
  });

  it('returns null for "as an AI" pattern', () => {
    const result = validator.validate({
      ...base,
      summary: 'As an AI language model, I think this is a contract.',
    }, {});
    expect(result).toBeNull();
  });

  it('penalises confidence for each hallucination flag', () => {
    const result = validator.validate({
      ...base,
      summary: 'I cannot be certain about the exact details.',
    }, {});
    // Should be null (hallucination) or penalised
    if (result !== null) {
      expect(result.confidence).toBeLessThan(base.confidence);
    }
  });

  it('regex supremacy: preserves regex-extracted id_number over AI value', () => {
    const regexGroundTruth = { id_number: '123456782' };
    const aiResult = { ...base, idNumbers: ['999999999'] };
    const result = validator.validate(aiResult, regexGroundTruth);
    expect(result).not.toBeNull();
    // The validator should override AI id with regex ground truth
    expect(result!.idNumbers).toContain('123456782');
  });

  it('regex supremacy: preserves regex-extracted case_number', () => {
    const regexGroundTruth = { case_number: '1234/24' };
    const aiResult = { ...base, caseNumber: 'תיק 9999/99' };
    const result = validator.validate(aiResult, regexGroundTruth);
    expect(result).not.toBeNull();
    expect(result!.caseNumber).toBe('1234/24');
  });

  it('penalises implausible future date', () => {
    const result = validator.validate({
      ...base,
      documentDate: '2099-12-31',
    }, {});
    if (result !== null) {
      expect(result.confidence).toBeLessThan(base.confidence);
    }
  });
});

describe('AIValidator.extractRegexGroundTruth', () => {
  it('extracts Israeli case number pattern', () => {
    const text = 'תיק מספר 1234/24 בבית המשפט';
    const gt = validator.extractRegexGroundTruth(text);
    expect(gt.case_number).toBe('1234/24');
  });

  it('extracts 9-digit Israeli ID', () => {
    const text = 'תעודת זהות 123456782 של הנאשם';
    const gt = validator.extractRegexGroundTruth(text);
    expect(gt.id_number).toBe('123456782');
  });

  it('extracts dd/mm/yyyy date and converts to ISO', () => {
    const text = 'ביום 15/01/2024 נחתם החוזה';
    const gt = validator.extractRegexGroundTruth(text);
    expect(gt.document_date).toBe('2024-01-15');
  });

  it('returns empty object when no patterns match', () => {
    const gt = validator.extractRegexGroundTruth('no extractable data here');
    expect(Object.keys(gt)).toHaveLength(0);
  });
});
