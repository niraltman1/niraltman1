import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist fetch mock before all imports
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Mock circuit breaker: open by default, reset per test
const isOpenMock   = vi.fn(() => false);
const recordFail   = vi.fn();
const recordSuccess = vi.fn();
vi.mock('@factum-il/model-router', () => ({
  getCircuitBreaker: () => ({ isOpen: isOpenMock, recordFailure: recordFail, recordSuccess }),
}));

import { classifyInboundMessage } from './inbound-classifier.js';

function stubOllamaAvailable(response: string): void {
  fetchMock
    .mockResolvedValueOnce({ ok: true } as Response)              // ping /api/tags
    .mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ response }),
    } as unknown as Response);                                     // /api/generate
}

describe('classifyInboundMessage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    isOpenMock.mockReturnValue(false);
  });

  it('returns null when body is empty', async () => {
    const result = await classifyInboundMessage('');
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when circuit breaker is open', async () => {
    isOpenMock.mockReturnValue(true);
    const result = await classifyInboundMessage('שלום, אני צריך עזרה דחופה');
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when Ollama ping fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await classifyInboundMessage('שלום, אני צריך עזרה דחופה');
    expect(result).toBeNull();
  });

  it('returns null when Ollama ping returns non-ok', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    const result = await classifyInboundMessage('שלום');
    expect(result).toBeNull();
  });

  it('parses a valid classification response', async () => {
    stubOllamaAvailable('{"urgency":"urgent","tags":["דחוף","מסמך"],"confidence":0.9}');
    const result = await classifyInboundMessage('יש לי דיון מחר בבוקר ואני צריך את המסמכים');
    expect(result).not.toBeNull();
    expect(result!.urgency).toBe('urgent');
    expect(result!.tags).toEqual(['דחוף', 'מסמך']);
    expect(result!.confidence).toBeCloseTo(0.9);
    expect(recordSuccess).toHaveBeenCalled();
  });

  it('extracts JSON even when surrounded by prose', async () => {
    stubOllamaAvailable('Sure! Here is my answer: {"urgency":"normal","tags":["שאלה"],"confidence":0.7}');
    const result = await classifyInboundMessage('מתי הדיון הבא?');
    expect(result).not.toBeNull();
    expect(result!.urgency).toBe('normal');
  });

  it('returns null when urgency is unrecognised', async () => {
    stubOllamaAvailable('{"urgency":"critical","tags":[],"confidence":0.8}');
    const result = await classifyInboundMessage('כלשהו');
    expect(result).toBeNull();
  });

  it('returns null when JSON cannot be parsed', async () => {
    stubOllamaAvailable('This is not JSON at all');
    const result = await classifyInboundMessage('כלשהו');
    expect(result).toBeNull();
  });

  it('clips tags to 4 and confidence to [0,1]', async () => {
    stubOllamaAvailable('{"urgency":"low","tags":["א","ב","ג","ד","ה"],"confidence":1.5}');
    const result = await classifyInboundMessage('כלשהו');
    expect(result).not.toBeNull();
    expect(result!.tags).toHaveLength(4);
    expect(result!.confidence).toBe(1);
  });

  it('handles missing tags gracefully (falls back to empty array)', async () => {
    stubOllamaAvailable('{"urgency":"low","confidence":0.6}');
    const result = await classifyInboundMessage('כלשהו');
    expect(result).not.toBeNull();
    expect(result!.tags).toEqual([]);
  });
});
