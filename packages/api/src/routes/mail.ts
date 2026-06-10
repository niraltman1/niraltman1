import { Router } from 'express';
import type { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok, fail } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError } from '../errors/api-error.js';
import { generateReplySchema } from '../validation/mail.js';
import { logger } from '@factum-il/shared';

const OLLAMA_BASE  = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env['OLLAMA_MODEL']    ?? 'legal-brain';

const TONE_INSTRUCTION: Record<string, string> = {
  formal:       'כתוב תשובה רשמית וממלכתית, בסגנון מקצועי-משפטי עם כבוד לצד שכנגד.',
  assertive:    'כתוב תשובה תקיפה ונחרצת, עם דגש על עמדת מרשך, ללא ויתורים בלשון.',
  conciliatory: 'כתוב תשובה מפשרת ומאוזנת, השואפת להסכמה תוך שמירה על זכויות מרשך.',
};

function buildSystemPrompt(
  tone: string,
  context: string,
  caseNumber: string,
): string {
  return `אתה עוזר משפטי מקצועי לעורך דין ישראלי.
תפקידך: לנסח תגובה מקצועית למייל משפטי שהתקבל, בהתבסס אך ורק על ההקשר המשפטי שסופק.

תיק: ${caseNumber}

הוראת סגנון: ${TONE_INSTRUCTION[tone] ?? TONE_INSTRUCTION['formal']}

הקשר תיק (מסמכים רלוונטיים):
---
${context || 'לא נמצאו מסמכים רלוונטיים בתיק.'}
---

כללים קריטיים:
1. כתוב רק עובדות המבוססות על ההקשר שסופק לעיל.
2. אל תמציא תאריכים, מספרי תיק, שמות שופטים או עובדות שאינן מופיעות בהקשר.
3. כתוב בעברית משפטית תקנית.
4. המבנה: פתיחה → גוף → סיום מכובד.
5. אל תוסיף כותרות markdown — רק טקסט רץ.`;
}

function isDraftGrounded(draft: string, context: string): boolean {
  if (!context.trim()) return true;
  const significant = context
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .map((w) => w.toLowerCase().replace(/[^֐-׿a-z0-9]/g, ''));
  const draftLower = draft.toLowerCase();
  const matched = significant.filter((w) => w && draftLower.includes(w));
  return matched.length >= 3;
}

export function mailRouter(repos: Repos): Router {
  const router = Router();

  router.post(
    '/generate-reply',
    validate(generateReplySchema),
    asyncHandler(async (req, res) => {
      const { emailId, caseId, tone, emailBody } = req.body as z.infer<typeof generateReplySchema>;

      const caseRow = repos.cases.findById(caseId) as Record<string, unknown> | null;
      if (!caseRow) throw new NotFoundError('Case');

      const caseNumber = String(caseRow['caseNumber'] ?? caseRow['case_number'] ?? `${caseId}`);

      // RAG: fetch top-5 relevant document snippets for this case
      const hits = repos.search.search(emailBody.slice(0, 300), {
        filter:   { caseId },
        entities: ['documents'],
        limit:    5,
      });
      const context = hits
        .map((h) => h.snippet)
        .join('\n\n')
        .slice(0, 2000);

      const systemPrompt = buildSystemPrompt(tone, context, caseNumber);
      const temperature  = tone === 'formal' ? 0.25 : 0.35;

      let rawDraft: string;
      try {
        const ollamaRes = await fetch(`${OLLAMA_BASE}/api/generate`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model:  OLLAMA_MODEL,
            system: systemPrompt,
            prompt: `נא לנסח תגובה למייל הבא:\n\n${emailBody}`,
            stream: false,
            options: { temperature, repeat_penalty: 1.05, num_predict: 600 },
          }),
          signal: AbortSignal.timeout(60_000),
        });

        if (!ollamaRes.ok) {
          logger.warn(`Ollama returned ${ollamaRes.status} for mail/generate-reply`, { category: 'ai' });
          fail(res, 'OLLAMA_UNAVAILABLE', 'מנוע ה-AI אינו זמין כעת. נסה שוב בעוד מספר שניות.', 503);
          return;
        }

        const data    = await ollamaRes.json() as { response?: string };
        rawDraft      = (data.response ?? '').trim();
      } catch (e) {
        logger.warn(`Ollama unreachable for mail/generate-reply: ${e instanceof Error ? e.message : String(e)}`, { category: 'ai' });
        fail(res, 'OLLAMA_UNAVAILABLE', 'מנוע ה-AI אינו זמין כעת. ודא ש-Ollama פועל ונסה שוב.', 503);
        return;
      }

      const grounded = isDraftGrounded(rawDraft, context);
      const draftBody = grounded
        ? rawDraft
        : `⚠️ אזהרה: הטיוטה לא אומתה מול נתוני התיק — אנא בדוק לפני שליחה.\n\n${rawDraft}`;

      logger.info(
        `mail/generate-reply case=${caseId} tone=${tone} grounded=${grounded} emailId=${emailId ?? '—'}`,
        { category: 'ai' },
      );

      ok(res, { draftBody });
    }),
  );

  return router;
}
