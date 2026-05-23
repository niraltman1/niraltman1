export interface Tool {
  readonly name:        string;
  readonly description: string;
  execute(input: unknown): Promise<unknown>;
}

export interface ToolResult {
  toolName:   string;
  input:      unknown;
  output:     unknown;
  durationMs: number;
  error?:     string;
}

export interface AgentInput {
  agentName:    string;
  task:         string;        // Hebrew task description
  context?:     string;        // assembled case memory (from @factum-il/memory)
  tools:        Tool[];        // pre-configured tools to run before generation
  caseId?:      number;
  documentId?:  number;
  traceId?:     string;        // if omitted, generated internally
}

export interface AgentOutput {
  agentName:    string;
  traceId:      string;
  result:       string;        // the agent's final answer (Hebrew)
  confidence:   number;        // 0.0–1.0, extracted from model response or default 0.7
  toolResults:  ToolResult[];
  flagForReview: boolean;       // true for high-risk agents or low confidence
  durationMs:   number;
  ollamaAvailable: boolean;    // false if Ollama was down — result is best-effort without AI
}

export interface OllamaConfig {
  baseUrl:   string;
  model:     string;
  timeoutMs: number;
}
