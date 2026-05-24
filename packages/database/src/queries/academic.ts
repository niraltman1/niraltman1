import type { DatabaseConnection } from '../connection.js';

export interface AcademicSubject {
  readonly id:          number;
  readonly nameHe:      string;
  readonly nameEn:      string | null;
  readonly description: string | null;
  readonly createdAt:   string;
}

export interface AcademicCourse {
  readonly id:        number;
  readonly subjectId: number;
  readonly nameHe:    string;
  readonly semester:  string | null;
  readonly year:      number | null;
  readonly notes:     string | null;
  readonly createdAt: string;
}

export interface StudyQuestion {
  readonly id:            number;
  readonly courseId:      number | null;
  readonly documentId:    number | null;
  readonly questionHe:    string;
  readonly optionA:       string;
  readonly optionB:       string;
  readonly optionC:       string;
  readonly optionD:       string;
  readonly correctAnswer: 'a' | 'b' | 'c' | 'd';
  readonly explanation:   string | null;
  readonly sourceSlide:   number | null;
  readonly createdAt:     string;
}

export interface GraphNode {
  readonly id:           number;
  readonly courseId:     number | null;
  readonly labelHe:      string;
  readonly nodeType:     string;
  readonly parentId:     number | null;
  readonly positionX:    number;
  readonly positionY:    number;
  readonly metadataJson: string | null;
  readonly createdAt:    string;
}

function mapSubject(r: Record<string, unknown>): AcademicSubject {
  return {
    id:          r['id']          as number,
    nameHe:      r['name_he']     as string,
    nameEn:      r['name_en']     as string | null,
    description: r['description'] as string | null,
    createdAt:   r['created_at']  as string,
  };
}

function mapCourse(r: Record<string, unknown>): AcademicCourse {
  return {
    id:        r['id']         as number,
    subjectId: r['subject_id'] as number,
    nameHe:    r['name_he']    as string,
    semester:  r['semester']   as string | null,
    year:      r['year']       as number | null,
    notes:     r['notes']      as string | null,
    createdAt: r['created_at'] as string,
  };
}

function mapQuestion(r: Record<string, unknown>): StudyQuestion {
  return {
    id:            r['id']             as number,
    courseId:      r['course_id']      as number | null,
    documentId:    r['document_id']    as number | null,
    questionHe:    r['question_he']    as string,
    optionA:       r['option_a']       as string,
    optionB:       r['option_b']       as string,
    optionC:       r['option_c']       as string,
    optionD:       r['option_d']       as string,
    correctAnswer: r['correct_answer'] as 'a' | 'b' | 'c' | 'd',
    explanation:   r['explanation']    as string | null,
    sourceSlide:   r['source_slide']   as number | null,
    createdAt:     r['created_at']     as string,
  };
}

function mapNode(r: Record<string, unknown>): GraphNode {
  return {
    id:           r['id']            as number,
    courseId:     r['course_id']     as number | null,
    labelHe:      r['label_he']      as string,
    nodeType:     r['node_type']     as string,
    parentId:     r['parent_id']     as number | null,
    positionX:    (r['position_x']   as number | null) ?? 0,
    positionY:    (r['position_y']   as number | null) ?? 0,
    metadataJson: r['metadata_json'] as string | null,
    createdAt:    r['created_at']    as string,
  };
}

export class AcademicRepository {
  constructor(private readonly db: DatabaseConnection) {}

  // ── Subjects ────────────────────────────────────────────────────────────────

  listSubjects(): AcademicSubject[] {
    return (this.db.prepare('SELECT * FROM AcademicSubjects ORDER BY name_he ASC').all() as Record<string, unknown>[]).map(mapSubject);
  }

  createSubject(input: { nameHe: string; nameEn?: string | null; description?: string | null }): AcademicSubject {
    const res = this.db.prepare(
      `INSERT INTO AcademicSubjects (name_he, name_en, description) VALUES (?, ?, ?) RETURNING *`,
    ).get(input.nameHe, input.nameEn ?? null, input.description ?? null) as Record<string, unknown>;
    return mapSubject(res);
  }

  // ── Courses ─────────────────────────────────────────────────────────────────

  listCourses(subjectId?: number): AcademicCourse[] {
    if (subjectId !== undefined) {
      return (this.db.prepare('SELECT * FROM AcademicCourses WHERE subject_id = ? ORDER BY year DESC, name_he ASC').all(subjectId) as Record<string, unknown>[]).map(mapCourse);
    }
    return (this.db.prepare('SELECT * FROM AcademicCourses ORDER BY year DESC, name_he ASC').all() as Record<string, unknown>[]).map(mapCourse);
  }

  findCourse(id: number): AcademicCourse | null {
    const row = this.db.prepare('SELECT * FROM AcademicCourses WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapCourse(row) : null;
  }

  createCourse(input: { subjectId: number; nameHe: string; semester?: string | null; year?: number | null; notes?: string | null }): AcademicCourse {
    const res = this.db.prepare(
      `INSERT INTO AcademicCourses (subject_id, name_he, semester, year, notes) VALUES (?, ?, ?, ?, ?) RETURNING *`,
    ).get(input.subjectId, input.nameHe, input.semester ?? null, input.year ?? null, input.notes ?? null) as Record<string, unknown>;
    return mapCourse(res);
  }

  // ── Study Questions ─────────────────────────────────────────────────────────

  listQuestions(courseId: number): StudyQuestion[] {
    return (this.db.prepare('SELECT * FROM StudyQuestions WHERE course_id = ? ORDER BY id ASC').all(courseId) as Record<string, unknown>[]).map(mapQuestion);
  }

  createQuestion(input: {
    courseId?: number | null;
    documentId?: number | null;
    questionHe: string;
    optionA: string; optionB: string; optionC: string; optionD: string;
    correctAnswer: 'a' | 'b' | 'c' | 'd';
    explanation?: string | null;
    sourceSlide?: number | null;
  }): StudyQuestion {
    const res = this.db.prepare(`
      INSERT INTO StudyQuestions
        (course_id, document_id, question_he, option_a, option_b, option_c, option_d, correct_answer, explanation, source_slide)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
    `).get(
      input.courseId ?? null, input.documentId ?? null,
      input.questionHe, input.optionA, input.optionB, input.optionC, input.optionD,
      input.correctAnswer, input.explanation ?? null, input.sourceSlide ?? null,
    ) as Record<string, unknown>;
    return mapQuestion(res);
  }

  searchQuestions(query: string, limit = 30): StudyQuestion[] {
    const rows = this.db.prepare(`
      SELECT sq.*
      FROM fts_study_questions fts
      JOIN StudyQuestions sq ON sq.id = fts.rowid
      WHERE fts_study_questions MATCH ?
      ORDER BY fts.rank
      LIMIT ?
    `).all(query, limit) as Record<string, unknown>[];
    return rows.map(mapQuestion);
  }

  // ── Graph Nodes ─────────────────────────────────────────────────────────────

  getGraphForCourse(courseId: number): GraphNode[] {
    return (this.db.prepare('SELECT * FROM GraphNodes WHERE course_id = ? ORDER BY id ASC').all(courseId) as Record<string, unknown>[]).map(mapNode);
  }

  createNode(input: {
    courseId: number | null;
    labelHe: string;
    nodeType?: string;
    parentId?: number | null;
    positionX?: number;
    positionY?: number;
    metadataJson?: string | null;
  }): GraphNode {
    const res = this.db.prepare(`
      INSERT INTO GraphNodes (course_id, label_he, node_type, parent_id, position_x, position_y, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *
    `).get(
      input.courseId, input.labelHe, input.nodeType ?? 'concept',
      input.parentId ?? null, input.positionX ?? 0, input.positionY ?? 0,
      input.metadataJson ?? null,
    ) as Record<string, unknown>;
    return mapNode(res);
  }

  updateNodePosition(id: number, x: number, y: number): void {
    this.db.prepare('UPDATE GraphNodes SET position_x = ?, position_y = ? WHERE id = ?').run(x, y, id);
  }
}
