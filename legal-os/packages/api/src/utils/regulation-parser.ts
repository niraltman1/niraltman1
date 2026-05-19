import { generateLegalReasoning } from './ollama-legal-client.js';
import type { CreateMilestoneInput, GeneratedSkeleton } from '@factum-il/shared';

const MILESTONE_PROMPT = (caseType: string, legalBasis: string, sourceText: string) => `
You are an Israeli legal procedure expert. Analyze the following legal framework and extract the standard procedural milestones for a ${caseType} case.

LEGAL BASIS: ${legalBasis}

REGULATION TEXT:
${sourceText.slice(0, 8000)}

Extract the main procedural stages (5-15 milestones) and return ONLY a valid JSON array.
Each element must have these exact fields:
{
  "titleHe": "שם השלב בעברית",
  "titleEn": "Stage name in English",
  "description": "What happens at this stage",
  "dayOffset": <number of days from filing, or null if determined by court>,
  "anchor": "filing" | "previous" | "court_order",
  "isMandatory": true | false,
  "taskPriority": "low" | "normal" | "high" | "critical"
}

Rules:
- titleHe MUST be in Hebrew
- dayOffset should be a realistic number of days (e.g. 30, 60, 90) or null
- Use anchor="previous" only when the stage directly follows the previous one with no fixed calendar date
- Use anchor="court_order" when the date is always set by the court
- Mark isMandatory=true for legally required stages
- Mark high/critical priority for stages with legal consequences if missed
- Return ONLY the JSON array, no markdown, no explanation, no code blocks
`;

export async function parseRegulationIntoMilestones(
  caseType:   string,
  legalBasis: string,
  sourceText: string,
): Promise<GeneratedSkeleton> {
  const rawText = await generateLegalReasoning(
    MILESTONE_PROMPT(caseType, legalBasis, sourceText),
    0.1,
  );

  // Strip any markdown fences if the model added them anyway
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Find first '[' and last ']' to extract the JSON array
  const start = cleaned.indexOf('[');
  const end   = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error(`Ollama did not return a JSON array. Response: ${rawText.slice(0, 200)}`);
  }

  const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('Ollama response is not an array');

  const milestones: CreateMilestoneInput[] = parsed.map((item: unknown, idx: number) => {
    const m = item as Record<string, unknown>;
    if (!m['titleHe']) throw new Error(`Milestone ${idx} missing titleHe`);
    return {
      titleHe:     String(m['titleHe']),
      titleEn:     m['titleEn'] ? String(m['titleEn']) : null,
      description: m['description'] ? String(m['description']) : null,
      dayOffset:   typeof m['dayOffset'] === 'number' ? m['dayOffset'] : null,
      anchor:      (['filing', 'previous', 'court_order'] as const).includes(m['anchor'] as 'filing')
                     ? m['anchor'] as 'filing' | 'previous' | 'court_order'
                     : 'filing',
      isMandatory:  m['isMandatory'] !== false,
      taskPriority: (['low', 'normal', 'high', 'critical'] as const).includes(m['taskPriority'] as 'low')
                     ? m['taskPriority'] as 'low' | 'normal' | 'high' | 'critical'
                     : 'normal',
    };
  });

  return {
    templateDraft: {
      caseType,
      nameHe:      legalBasis,
      nameEn:      null,
      legalBasis,
      sourceUrl:   null,
      sourceText,
      status:      'draft',
      aiGenerated: true,
    },
    milestones,
    rawOllamaText: rawText,
  };
}
