-- Migration 016: Academic Hub — subjects, courses, study questions, mind-map graph nodes

CREATE TABLE IF NOT EXISTS AcademicSubjects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he     TEXT NOT NULL,
  name_en     TEXT,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS AcademicCourses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES AcademicSubjects(id) ON DELETE CASCADE,
  name_he    TEXT NOT NULL,
  semester   TEXT,  -- e.g. 'א תשפ"ה'
  year       INTEGER,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS StudyQuestions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id      INTEGER REFERENCES AcademicCourses(id) ON DELETE SET NULL,
  document_id    INTEGER REFERENCES Documents(id)        ON DELETE SET NULL,
  question_he    TEXT NOT NULL,
  option_a       TEXT NOT NULL,
  option_b       TEXT NOT NULL,
  option_c       TEXT NOT NULL,
  option_d       TEXT NOT NULL,
  correct_answer TEXT NOT NULL CHECK(correct_answer IN ('a','b','c','d')),
  explanation    TEXT,
  source_slide   INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS GraphNodes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id     INTEGER REFERENCES AcademicCourses(id) ON DELETE CASCADE,
  label_he      TEXT NOT NULL,
  node_type     TEXT NOT NULL DEFAULT 'concept'
                CHECK(node_type IN ('concept','process','term','person','law','other')),
  parent_id     INTEGER REFERENCES GraphNodes(id) ON DELETE SET NULL,
  position_x    REAL DEFAULT 0,
  position_y    REAL DEFAULT 0,
  metadata_json TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_courses_subject    ON AcademicCourses(subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_course   ON StudyQuestions(course_id);
CREATE INDEX IF NOT EXISTS idx_questions_doc      ON StudyQuestions(document_id);
CREATE INDEX IF NOT EXISTS idx_graph_course       ON GraphNodes(course_id);
CREATE INDEX IF NOT EXISTS idx_graph_parent       ON GraphNodes(parent_id);

-- FTS5 for question search
CREATE VIRTUAL TABLE IF NOT EXISTS fts_study_questions
  USING fts5(question_he, explanation, content=StudyQuestions, content_rowid=id);

CREATE TRIGGER IF NOT EXISTS fts_sq_insert AFTER INSERT ON StudyQuestions BEGIN
  INSERT INTO fts_study_questions(rowid, question_he, explanation)
  VALUES (new.id, new.question_he, new.explanation);
END;
CREATE TRIGGER IF NOT EXISTS fts_sq_update AFTER UPDATE ON StudyQuestions BEGIN
  INSERT INTO fts_study_questions(fts_study_questions, rowid, question_he, explanation)
  VALUES ('delete', old.id, old.question_he, old.explanation);
  INSERT INTO fts_study_questions(rowid, question_he, explanation)
  VALUES (new.id, new.question_he, new.explanation);
END;
CREATE TRIGGER IF NOT EXISTS fts_sq_delete AFTER DELETE ON StudyQuestions BEGIN
  INSERT INTO fts_study_questions(fts_study_questions, rowid, question_he, explanation)
  VALUES ('delete', old.id, old.question_he, old.explanation);
END;
