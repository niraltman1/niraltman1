import type { ToolResult } from './types.js';

const SYSTEM_PROMPT = `אתה עוזר משפטי מומחה לדין ישראלי.
תפקידך לנתח מידע משפטי ולספק תשובות מדויקות ומבוססות בעברית.
עבוד לפי ה-5 צעדים: הקשר → סיווג → רשויות → סיכון/קונפליקט → מסקנה.
ענה ONLY בעברית. החזר JSON בלבד — ללא הסברים חיצוניים.`;

export function buildPrompt(task: string, toolResults: ToolResult[], context?: string): string {
  const parts: string[] = [];

  if (context) {
    parts.push(`## הקשר תיק מקצועי\n${context}`);
  }

  const successfulResults = toolResults.filter((r) => r.error === undefined);
  if (successfulResults.length > 0) {
    parts.push('## מידע שנאסף');
    for (const r of successfulResults) {
      parts.push(`### ${r.toolName}\n${JSON.stringify(r.output, null, 2)}`);
    }
  }

  parts.push(`## משימה\n${task}`);

  return parts.join('\n\n');
}

export { SYSTEM_PROMPT };
