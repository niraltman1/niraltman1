const OLLAMA_BASE  = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env['OLLAMA_MODEL']    ?? 'law-il-E2B';

export interface ThreeStepResult {
  step1Passed:    boolean;
  step2Passed:    boolean;
  step3Passed:    boolean;
  stepsPassed:    number;
  step1Reason:    string | null;
  step2Reason:    string | null;
  step3Reason:    string | null;
  citationString: string | null;
}

interface RawResult {
  step1?: { passed?: boolean; reason?: string };
  step2?: { passed?: boolean; reason?: string };
  step3?: { passed?: boolean; reason?: string };
  citation_string?: string;
}

export async function runThreeStepTest(params: {
  citation:      string;
  caseTitle:     string | null;
  summaryHe:     string | null;
  governingLaw:  string | null;
  offenseClause: string | null;
  caseNotes:     string | null;
  procedureType: string | null;
  caseType:      string | null;
}): Promise<ThreeStepResult | null> {
  const prompt = `בצע מבחן רלוונטיות תלת-שלבי לתקדים המשפטי:

תקדים: ${params.citation}${params.caseTitle ? ` — ${params.caseTitle}` : ''}
דין שליט: ${params.governingLaw ?? 'לא ידוע'}
סעיף ספציפי: ${params.offenseClause ?? 'לא ידוע'}
תמצית: ${params.summaryHe ?? 'אין תמצית'}

תיק: סוג=${params.caseType ?? 'לא ידוע'}, הליך=${params.procedureType ?? 'לא ידוע'}
הערות התיק: ${params.caseNotes ?? 'אין הערות'}

שלב 1 — התאמת דין שליט: האם התקדים בוחן את אותו דין מהותי עיקרי?
שלב 2 — התאמת סעיף/עבירה: האם התקדים מתייחס לאותו סעיף, עבירה, או עילה משפטית?
שלב 3 — מטריצת נסיבות עובדתיות: האם נסיבות עובדתיות מהותיות דומות?

החזר JSON בלבד ללא markdown:
{
  "step1": {"passed": true/false, "reason": "הסבר קצר"},
  "step2": {"passed": true/false, "reason": "הסבר קצר"},
  "step3": {"passed": true/false, "reason": "הסבר קצר"},
  "citation_string": "מחרוזת ציטוט מוצעת לכתב הטענות"
}`;

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:  OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.05, num_predict: 300 },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) return null;

    const data   = await res.json() as { response?: string };
    const raw    = (data.response ?? '').trim()
      .replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(raw) as RawResult;

    const s1 = Boolean(parsed.step1?.passed);
    const s2 = Boolean(parsed.step2?.passed);
    const s3 = Boolean(parsed.step3?.passed);

    return {
      step1Passed:    s1,
      step2Passed:    s2,
      step3Passed:    s3,
      stepsPassed:    (s1 ? 1 : 0) + (s2 ? 1 : 0) + (s3 ? 1 : 0),
      step1Reason:    parsed.step1?.reason ?? null,
      step2Reason:    parsed.step2?.reason ?? null,
      step3Reason:    parsed.step3?.reason ?? null,
      citationString: parsed.citation_string ?? null,
    };
  } catch {
    return null;
  }
}
