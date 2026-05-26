import { describe, it, expect, vi, afterEach } from 'vitest';
import { ModelCircuitBreaker } from './circuit-breaker.js';
import { getCircuitBreaker, allModelStatuses } from './registry.js';

describe('ModelCircuitBreaker', () => {
  it('starts closed (not open)', () => {
    const cb = new ModelCircuitBreaker('test-model');
    expect(cb.isOpen()).toBe(false);
    expect(cb.status().open).toBe(false);
    expect(cb.status().failures).toBe(0);
    expect(cb.status().resetAt).toBeNull();
  });

  it('opens after 3 failures', () => {
    const cb = new ModelCircuitBreaker('test-model');
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(false);
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true);
  });

  it('recordSuccess resets failure count and closes breaker', () => {
    const cb = new ModelCircuitBreaker('test-model');
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true);
    cb.recordSuccess();
    expect(cb.isOpen()).toBe(false);
    expect(cb.status().failures).toBe(0);
  });

  it('half-opens after RESET_MS elapses', () => {
    vi.useFakeTimers();
    const cb = new ModelCircuitBreaker('test-model');
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true);
    vi.advanceTimersByTime(61_000); // past 60s reset window
    expect(cb.isOpen()).toBe(false); // half-open: allow probe
    vi.useRealTimers();
  });

  it('status includes resetAt when open', () => {
    const cb = new ModelCircuitBreaker('test-model');
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    const s = cb.status();
    expect(s.open).toBe(true);
    expect(typeof s.resetAt).toBe('string');
  });
});

describe('registry', () => {
  afterEach(() => {
    // Reset circuit breaker state by calling recordSuccess
    // (getCircuitBreaker returns singleton per modelId)
    getCircuitBreaker('law-il-E2B').recordSuccess();
  });

  it('getCircuitBreaker returns same instance for same modelId', () => {
    const a = getCircuitBreaker('law-il-E2B');
    const b = getCircuitBreaker('law-il-E2B');
    expect(a).toBe(b);
  });

  it('getCircuitBreaker returns different instances for different modelIds', () => {
    const a = getCircuitBreaker('law-il-E2B');
    const b = getCircuitBreaker('nomic-embed-text');
    expect(a).not.toBe(b);
  });

  it('allModelStatuses returns an array with modelId fields', () => {
    const statuses = allModelStatuses();
    expect(Array.isArray(statuses)).toBe(true);
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0]).toHaveProperty('modelId');
    expect(statuses[0]).toHaveProperty('circuitStatus');
  });
});
