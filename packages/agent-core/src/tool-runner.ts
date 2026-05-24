// Executes all provided tools in parallel and collects results.
// Never throws — errors are captured in ToolResult.error.

import type { Tool, ToolResult } from './types.js';

export async function runTools(tools: Tool[]): Promise<ToolResult[]> {
  return Promise.all(
    tools.map(async (tool) => {
      const start = Date.now();
      try {
        const output = await tool.execute(undefined);
        return { toolName: tool.name, input: undefined, output, durationMs: Date.now() - start };
      } catch (err) {
        return {
          toolName: tool.name,
          input: undefined,
          output: null,
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
}
