import { describe, it, expect, vi, afterEach } from 'vitest';
import { runAgent } from './agent-runner.js';
import type { AgentProgress } from './types.js';

// §4.2.4 — runAgent reports its real, observable execution phases via onProgress.
// Verifiable without a live Ollama: callOllama degrades to null on a failed fetch,
// so the run still completes through every phase.
describe('runAgent — execution-phase progress (§4.2.4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports the four phases in order even when Ollama is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const phases: string[] = [];
    const out = await runAgent({
      agentName: 'test-agent',
      task:      'בדיקה',
      tools:     [],
      onProgress: (p: AgentProgress) => phases.push(p.stage),
    });
    expect(phases).toEqual(['gathering', 'context', 'analyzing', 'validating']);
    expect(out.ollamaAvailable).toBe(false);
    expect(out.flagForReview).toBe(true); // graceful degradation flags for human review
  });

  it('emits monotonically increasing pct values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const pcts: number[] = [];
    await runAgent({
      agentName: 't', task: 'x', tools: [],
      onProgress: (p) => pcts.push(p.pct),
    });
    expect(pcts.length).toBe(4);
    for (let i = 1; i < pcts.length; i++) {
      expect(pcts[i]!).toBeGreaterThan(pcts[i - 1]!);
    }
  });

  it('runs fine when onProgress is omitted (callback is optional)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await expect(
      runAgent({ agentName: 't', task: 'x', tools: [] }),
    ).resolves.toMatchObject({ agentName: 't' });
  });
});
