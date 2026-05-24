// Tests that don't need Ollama (Ollama is unavailable → graceful fallback)
import { describe, it, expect } from 'vitest';
import { runAgent } from './agent-runner.js';
import type { Tool } from './types.js';

// Use an env var to point to a non-existent Ollama during tests
process.env['OLLAMA_BASE_URL'] = 'http://127.0.0.1:19999'; // nothing running there

describe('runAgent', () => {
  it('completes without Ollama — returns fallback result', async () => {
    const tools: Tool[] = [
      {
        name: 'test-tool',
        description: 'returns test data',
        execute: async () => ({ caseNumber: 'תא-2024-001', status: 'open' }),
      },
    ];

    const output = await runAgent({
      agentName: 'test-agent',
      task: 'תן לי סיכום של התיק',
      tools,
    });

    expect(output.ollamaAvailable).toBe(false);
    expect(output.flagForReview).toBe(true);
    expect(output.toolResults).toHaveLength(1);
    expect(output.toolResults[0]?.toolName).toBe('test-tool');
    expect(output.traceId).toBeTruthy();
    expect(output.durationMs).toBeGreaterThan(0);
  });

  it('captures tool errors without throwing', async () => {
    const failingTool: Tool = {
      name: 'failing-tool',
      description: 'always fails',
      execute: async () => { throw new Error('DB connection failed'); },
    };

    const output = await runAgent({
      agentName: 'test-agent',
      task: 'test task',
      tools: [failingTool],
    });

    expect(output.toolResults[0]?.error).toBe('DB connection failed');
    expect(output.toolResults[0]?.output).toBeNull();
  });
});
