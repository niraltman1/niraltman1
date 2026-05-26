import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError } from '../errors/api-error.js';
const OLLAMA_URL   = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env['OLLAMA_MODEL']    ?? 'law-il-E2B';

async function ollamaGenerate(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false,
                              options: { temperature: 0.1, repeat_penalty: 1.05 } }),
  });
  if (!res.ok) throw new Error(`Ollama: ${res.status}`);
  const data = await res.json() as { response: string };
  return data.response;
}

const createSubjectSchema = z.object({
  nameHe:      z.string().min(1),
  nameEn:      z.string().nullish(),
  description: z.string().nullish(),
}).strict();

const createCourseSchema = z.object({
  subjectId: z.number().int().positive(),
  nameHe:    z.string().min(1),
  semester:  z.string().nullish(),
  year:      z.number().int().positive().nullish(),
  notes:     z.string().nullish(),
}).strict();

const createQuestionSchema = z.object({
  courseId:      z.number().int().positive().nullish(),
  documentId:    z.number().int().positive().nullish(),
  questionHe:    z.string().min(1),
  optionA:       z.string().min(1),
  optionB:       z.string().min(1),
  optionC:       z.string().min(1),
  optionD:       z.string().min(1),
  correctAnswer: z.enum(['a', 'b', 'c', 'd']),
  explanation:   z.string().nullish(),
  sourceSlide:   z.number().int().positive().nullish(),
}).strict();

const generateQuestionsSchema = z.object({
  documentId: z.number().int().positive(),
  courseId:   z.number().int().positive().nullish(),
  count:      z.number().int().min(1).max(20).default(5),
}).strict();

const createNodeSchema = z.object({
  courseId:     z.number().int().positive().nullish(),
  labelHe:      z.string().min(1),
  nodeType:     z.string().default('concept'),
  parentId:     z.number().int().positive().nullish(),
  metadataJson: z.string().nullish(),
}).strict();

export function studiesRouter(repos: Repos): Router {
  const router = Router();
  const { academic, documents } = repos;

  // ── Subjects ──────────────────────────────────────────────────────────────
  router.get('/subjects', asyncHandler((_req, res) => {
    ok(res, academic.listSubjects());
  }));

  router.post('/subjects', validate(createSubjectSchema), asyncHandler((req, res) => {
    const body = req.body as z.infer<typeof createSubjectSchema>;
    const subject = academic.createSubject({
      nameHe:      body.nameHe,
      nameEn:      body.nameEn ?? null,
      description: body.description ?? null,
    });
    ok(res, subject, 201);
  }));

  // ── Courses ──────────────────────────────────────────────────────────────
  router.get('/courses', asyncHandler((req, res) => {
    const subjectId = req.query['subjectId'] ? Number(req.query['subjectId']) : undefined;
    ok(res, academic.listCourses(subjectId));
  }));

  router.post('/courses', validate(createCourseSchema), asyncHandler((req, res) => {
    const body = req.body as z.infer<typeof createCourseSchema>;
    const course = academic.createCourse({
      subjectId: body.subjectId,
      nameHe:    body.nameHe,
      semester:  body.semester ?? null,
      year:      body.year ?? null,
      notes:     body.notes ?? null,
    });
    ok(res, course, 201);
  }));

  router.get('/courses/:id', asyncHandler((req, res) => {
    const course = academic.findCourse(Number(req.params['id']));
    if (!course) throw new NotFoundError('קורס לא נמצא');
    ok(res, course);
  }));

  // ── Questions ─────────────────────────────────────────────────────────────
  router.get('/courses/:id/questions', asyncHandler((req, res) => {
    ok(res, academic.listQuestions(Number(req.params['id'])));
  }));

  router.post('/questions', validate(createQuestionSchema), asyncHandler((req, res) => {
    const body = req.body as z.infer<typeof createQuestionSchema>;
    const q = academic.createQuestion({
      courseId:      body.courseId ?? null,
      documentId:    body.documentId ?? null,
      questionHe:    body.questionHe,
      optionA:       body.optionA,
      optionB:       body.optionB,
      optionC:       body.optionC,
      optionD:       body.optionD,
      correctAnswer: body.correctAnswer,
      explanation:   body.explanation ?? null,
      sourceSlide:   body.sourceSlide ?? null,
    });
    ok(res, q, 201);
  }));

  router.get('/search', asyncHandler((req, res) => {
    const q     = (req.query['q'] as string | undefined)?.trim() ?? '';
    const limit = Math.min(Number(req.query['limit'] ?? 20), 100);
    ok(res, q.length >= 2 ? academic.searchQuestions(q, limit) : []);
  }));

  // ── AI Question Generation ────────────────────────────────────────────────
  router.post('/generate-questions', validate(generateQuestionsSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof generateQuestionsSchema>;
    const doc  = documents.findById(body.documentId);
    if (!doc) throw new NotFoundError('מסמך לא נמצא');

    const ocrText = doc.ocrText?.slice(0, 3000) ?? '';
    if (ocrText.length < 50) {
      ok(res, { generated: 0, questions: [], message: 'אין טקסט מספיק במסמך לייצר שאלות' });
      return;
    }

    const prompt = `
אתה מומחה לפדגוגיה משפטית. צור ${body.count} שאלות בחירה מרובות (4 אפשרויות, תשובה אחת נכונה) מהטקסט הבא.
החזר JSON תקני בלבד — מערך של אובייקטים עם שדות:
  question_he, option_a, option_b, option_c, option_d, correct_answer (a/b/c/d), explanation

טקסט:
${ocrText}
`.trim();

    let generated = 0;
    const questions = [];
    try {
      const response = await ollamaGenerate(prompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const items = JSON.parse(jsonMatch[0]) as Record<string, unknown>[];
        for (const item of items.slice(0, body.count)) {
          try {
            const q = academic.createQuestion({
              courseId:      body.courseId ?? null,
              documentId:    body.documentId,
              questionHe:    String(item['question_he'] ?? ''),
              optionA:       String(item['option_a'] ?? ''),
              optionB:       String(item['option_b'] ?? ''),
              optionC:       String(item['option_c'] ?? ''),
              optionD:       String(item['option_d'] ?? ''),
              correctAnswer: (item['correct_answer'] as 'a' | 'b' | 'c' | 'd') ?? 'a',
              explanation:   item['explanation'] ? String(item['explanation']) : null,
              sourceSlide:   null,
            });
            questions.push(q);
            generated++;
          } catch { /* skip malformed item */ }
        }
      }
    } catch (e) {
      console.warn('[Studies] AI question generation failed:', e);
    }

    ok(res, { generated, questions, message: `נוצרו ${generated} שאלות` });
  }));

  // ── Mind Map (Graph Nodes) ────────────────────────────────────────────────
  router.get('/courses/:id/graph', asyncHandler((req, res) => {
    ok(res, academic.getGraphForCourse(Number(req.params['id'])));
  }));

  router.post('/nodes', validate(createNodeSchema), asyncHandler((req, res) => {
    const body = req.body as z.infer<typeof createNodeSchema>;
    const node = academic.createNode({
      courseId:     body.courseId ?? null,
      labelHe:      body.labelHe,
      nodeType:     body.nodeType,
      parentId:     body.parentId ?? null,
      metadataJson: body.metadataJson ?? null,
    });
    ok(res, node, 201);
  }));

  return router;
}
