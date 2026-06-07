import { streamGenerate } from '@factum-il/ai';
import type { DatabaseConnection, LegalCorpusRepository, LegalBrainSessionsRepository } from '@factum-il/database';
import { retrieveAllSources, type RetrievalResult } from './retriever.js';
import { buildLegalBrainPrompt, LEGAL_BRAIN_SYSTEM } from './synthesizer.js';

export type LegalBrainEvent =
  | { type: 'sources';  data: RetrievalResult }
  | { type: 'token';    data: { text: string } }
  | { type: 'complete'; data: { sessionId: number; messageId: number; durationMs: number } }
  | { type: 'error';    data: { code: string; message: string } };

export interface AskInput {
  query:     string;
  sessionId: number;
  caseId?:   number;
}

export async function* ask(
  input:       AskInput,
  db:          DatabaseConnection,
  legalCorpus: LegalCorpusRepository,
  sessions:    LegalBrainSessionsRepository,
  signal?:     AbortSignal,
): AsyncGenerator<LegalBrainEvent> {
  const startMs = Date.now();

  // 1. Save user message immediately so it's durable
  const userMsg = sessions.addMessage({
    sessionId: input.sessionId,
    role:      'user',
    content:   input.query,
  });

  // 2. Parallel retrieval — all sources at once, ~100ms total
  let sources: RetrievalResult;
  try {
    sources = await retrieveAllSources(input.query, db, legalCorpus,
      input.caseId !== undefined ? { caseId: input.caseId } : undefined);
  } catch {
    sources = { legislation: [], caseDocuments: [], precedents: [] };
  }

  yield { type: 'sources', data: sources };

  // 3. Load conversation history (exclude the message just saved)
  const history = sessions.getHistory(input.sessionId, 7)
    .filter((m) => m.id !== userMsg.id);

  // 4. Build prompt from retrieved sources + conversation history
  const prompt = buildLegalBrainPrompt(input.query, sources, history);

  // 5. Stream tokens from law-il-E2B via Ollama
  let fullAnswer = '';
  try {
    for await (const token of streamGenerate(prompt, {
      system: LEGAL_BRAIN_SYSTEM,
      ...(signal !== undefined ? { signal } : {}),
    })) {
      fullAnswer += token;
      yield { type: 'token', data: { text: token } };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isDown =
      msg.includes('circuit breaker') ||
      msg.includes('connection') ||
      msg.includes('fetch') ||
      msg.includes('ECONNREFUSED');
    yield {
      type: 'error',
      data: {
        code:    isDown ? 'OLLAMA_UNAVAILABLE' : 'STREAM_ERROR',
        message: isDown
          ? 'מנוע ה-AI אינו זמין כרגע. ניתן להמשיך לעיין במקורות שנמצאו.'
          : 'אירעה שגיאה בעיבוד הבקשה.',
      },
    };
  }

  // 6. Save assistant message (even on partial failure — save what we got)
  const assistantMsg = sessions.addMessage({
    sessionId:   input.sessionId,
    role:        'assistant',
    content:     fullAnswer || '[AI לא זמין]',
    sourcesJson: JSON.stringify(sources),
  });

  // 7. Auto-title session from first user query (if still untitled)
  const session = sessions.getSession(input.sessionId);
  if (session && !session.title) {
    sessions.updateTitle(input.sessionId, input.query.slice(0, 80));
  }

  yield {
    type: 'complete',
    data: {
      sessionId:  input.sessionId,
      messageId:  assistantMsg.id,
      durationMs: Date.now() - startMs,
    },
  };
}
