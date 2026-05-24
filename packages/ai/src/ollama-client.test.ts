import { describe, it, expect, vi, afterEach } from 'vitest';
import { OllamaClient } from './ollama-client.js';
import type { EnrichmentRequest } from './types.js';

// vi.hoisted() runs before vi.mock() factories so mockCb is available in the factory
const mockCb = vi.hoisted(() => ({
  isOpen:         vi.fn<() => boolean>().mockReturnValue(false),
  recordFailure:  vi.fn<() => void>(),
  recordSuccess:  vi.fn<() => void>(),
}));

vi.mock('@factum-il/model-router', () => ({
  getCircuitBreaker: () => mockCb,
}));

vi.mock('@factum-il/shared', () => ({
  logger: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  metrics: { addSink: vi.fn(), record: vi.fn() },
  clamp: (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)),
  roundConfidence: (v: number) => Math.round(v * 10000) / 10000,
}));

const baseRequest: EnrichmentRequest = {
  documentId: 1,
  filename: 'test.pdf',
  ocrText: 'some text',
  language: 'he',
  isolationContext: { clientId: null, caseId: null },
};

afterEach(() => {
  vi.restoreAllMocks();
  // Reset mockCb state between tests
  mockCb.isOpen.mockReturnValue(false);
  mockCb.recordFailure.mockReset();
  mockCb.recordSuccess.mockReset();
});

describe('OllamaClient', () => {
  describe('isAvailable()', () => {
    it('returns true when fetch resolves with ok: true', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const client = new OllamaClient();
      expect(await client.isAvailable()).toBe(true);
    });

    it('returns false when fetch resolves with ok: false', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      const client = new OllamaClient();
      expect(await client.isAvailable()).toBe(false);
    });

    it('returns false when fetch throws a network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const client = new OllamaClient();
      expect(await client.isAvailable()).toBe(false);
    });
  });

  describe('enrich() success path', () => {
    it('returns EnrichmentResponse with correct fields when Ollama returns valid JSON', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: '{"document_type":"other","confidence":0.9,"document_date":null,"suggested_case_number":null,"suggested_client_name":null}',
        }),
      }));
      const client = new OllamaClient();
      const result = await client.enrich(baseRequest);
      expect(result.confidence).toBe(0.9);
      expect(result.documentType).toBe('other');
      expect(result.documentId).toBe(1);
      expect(typeof result.modelName).toBe('string');
    });

    it('returns default confidence 0.3 when response JSON is invalid', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: 'not valid json at all' }),
      }));
      const client = new OllamaClient();
      const result = await client.enrich(baseRequest);
      expect(result.confidence).toBe(0.3);
    });

    it('includes document_type in fieldsEnriched when present in response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: '{"document_type":"contract","confidence":0.8,"document_date":null,"suggested_case_number":null,"suggested_client_name":null}',
        }),
      }));
      const client = new OllamaClient();
      const result = await client.enrich(baseRequest);
      expect(result.fieldsEnriched).toContain('document_type');
    });
  });

  describe('enrich() error paths', () => {
    it('calls cb.recordFailure() when fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
      const client = new OllamaClient();
      await expect(client.enrich(baseRequest)).rejects.toThrow('Ollama connection failed');
      expect(mockCb.recordFailure).toHaveBeenCalled();
    });

    it('throws when circuit breaker is open', async () => {
      mockCb.isOpen.mockReturnValueOnce(true);
      const client = new OllamaClient();
      await expect(client.enrich(baseRequest)).rejects.toThrow(/circuit breaker open/i);
    });

    it('calls cb.recordSuccess() on successful enrich', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: '{}' }),
      }));
      const client = new OllamaClient();
      await client.enrich(baseRequest);
      expect(mockCb.recordSuccess).toHaveBeenCalled();
    });
  });

  describe('model config', () => {
    it('uses default model law-il-E2B when no modelName given', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: '{}' }),
      }));
      const client = new OllamaClient();
      const result = await client.enrich(baseRequest);
      expect(result.modelName).toBe('law-il-E2B');
    });

    it('uses custom baseUrl in fetch URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: '{}' }),
      });
      vi.stubGlobal('fetch', mockFetch);
      const client = new OllamaClient({ baseUrl: 'http://custom-host:9999' });
      await client.enrich(baseRequest);
      const calledUrl = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0];
      expect(calledUrl).toContain('http://custom-host:9999');
    });
  });

  describe('prompt injection safety', () => {
    it('strips %%BEGIN_DOCUMENT_TEXT%% from ocrText before sending', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: '{}' }),
      });
      vi.stubGlobal('fetch', mockFetch);
      const client = new OllamaClient();
      await client.enrich({
        ...baseRequest,
        ocrText: 'prefix %%BEGIN_DOCUMENT_TEXT%% injected content',
      });
      const callBody = JSON.parse(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      ) as { prompt: string };
      const prompt: string = callBody.prompt;
      const beginCount = (prompt.match(/%%BEGIN_DOCUMENT_TEXT%%/g) ?? []).length;
      expect(beginCount).toBe(1);
    });
  });
});
