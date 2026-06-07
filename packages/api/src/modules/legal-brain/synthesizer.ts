import type { LegalBrainMessage } from '@factum-il/database';
import type { RetrievalResult } from './retriever.js';

export const LEGAL_BRAIN_SYSTEM =
  `אתה עוזר משפטי מומחה לדין ישראלי, המסייע לעורכי-דין ישראלים.
ענה בעברית בלבד, בצורה מקצועית וברורה.
התבסס על המידע המשפטי שסופק בהקשר: חקיקה, פסיקה ומסמכי תיק.
אם המידע אינו מספיק — ציין זאת בבירור ואל תמציא עובדות משפטיות.
אסור לחשוף פרטי לקוחות, מספרי תיק, או מידע אישי שאינו קשור לשאלה.`;

const MAX_HISTORY_CHARS = 800;
const MAX_SOURCE_CHARS  = 400;
const MAX_SOURCES_CHARS = 2_000;

export function buildLegalBrainPrompt(
  query:   string,
  sources: RetrievalResult,
  history: LegalBrainMessage[],
): string {
  const parts: string[] = [];

  const historyBlock = buildHistoryBlock(history);
  if (historyBlock) parts.push(historyBlock);

  const sourcesBlock = buildSourcesBlock(sources);
  if (sourcesBlock) parts.push(sourcesBlock);

  parts.push(`## שאלה\n${query}`);
  parts.push('ענה בעברית. התבסס על המידע שסופק. אם אין מידע רלוונטי — ציין זאת בבירור.');

  return parts.join('\n\n');
}

function buildHistoryBlock(history: LegalBrainMessage[]): string {
  if (history.length === 0) return '';
  const lines = ['## היסטוריית שיחה'];
  let chars = 0;
  for (const msg of history) {
    const prefix = msg.role === 'user' ? 'שאלה' : 'תשובה';
    const text = `${prefix}: ${msg.content.slice(0, 200)}`;
    if (chars + text.length > MAX_HISTORY_CHARS) break;
    lines.push(text);
    chars += text.length;
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

function buildSourcesBlock(sources: RetrievalResult): string {
  const parts: string[] = [];

  if (sources.legislation.length > 0) {
    parts.push('## חקיקה רלוונטית');
    for (const s of sources.legislation.slice(0, 3)) {
      const label = s.lawName ? `[${s.lawName}]\n` : '';
      parts.push(`${label}${s.chunkText.slice(0, MAX_SOURCE_CHARS)}`);
    }
  }

  if (sources.caseDocuments.length > 0) {
    parts.push('## מסמכי תיק');
    for (const s of sources.caseDocuments.slice(0, 3)) {
      parts.push(s.chunkText.slice(0, MAX_SOURCE_CHARS));
    }
  }

  if (sources.precedents.length > 0) {
    parts.push('## פסיקה');
    for (const s of sources.precedents.slice(0, 3)) {
      parts.push(s.chunkText.slice(0, MAX_SOURCE_CHARS));
    }
  }

  if (parts.length === 0) return '';
  return parts.join('\n\n').slice(0, MAX_SOURCES_CHARS);
}
