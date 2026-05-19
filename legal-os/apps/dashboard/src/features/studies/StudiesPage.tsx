import { useState } from 'react';
import { BookOpenIcon, PlusIcon, ListBulletsIcon, ChartBarIcon } from '@phosphor-icons/react';
import { useSubjects, useCourses, useCourseQuestions, useCourseGraph, useCreateSubject, useCreateCourse } from '@/api/hooks.js';
import type { AcademicSubject, AcademicCourse } from '@/api/hooks.js';
import { ExamPrepPanel } from './ExamPrepPanel.js';
import { MindMapView } from './MindMapView.js';

type Tab = 'courses' | 'questions' | 'mindmap';

export function StudiesPage() {
  const [tab, setTab]               = useState<Tab>('courses');
  const [selectedSubject, setSubject] = useState<number | null>(null);
  const [selectedCourse, setCourse]   = useState<number | null>(null);
  const [showNewSubject, setNewSubject] = useState(false);
  const [showNewCourse, setNewCourse]   = useState(false);
  const [subjectName, setSubjectName]   = useState('');
  const [courseName, setCourseName]     = useState('');

  const { data: subjects = [] } = useSubjects();
  const { data: courses  = [] } = useCourses(selectedSubject ?? undefined);
  const { data: questions = [] } = useCourseQuestions(tab === 'questions' ? selectedCourse : null);
  const { data: graph     = [] } = useCourseGraph(tab === 'mindmap' ? selectedCourse : null);

  const createSubject = useCreateSubject();
  const createCourse  = useCreateCourse();

  function handleAddSubject() {
    if (!subjectName.trim()) return;
    createSubject.mutate({ nameHe: subjectName.trim() }, {
      onSuccess: (s: AcademicSubject) => { setSubject(s.id); setSubjectName(''); setNewSubject(false); },
    });
  }

  function handleAddCourse() {
    if (!courseName.trim() || !selectedSubject) return;
    createCourse.mutate({ subjectId: selectedSubject, nameHe: courseName.trim() }, {
      onSuccess: (c: AcademicCourse) => { setCourse(c.id); setCourseName(''); setNewCourse(false); },
    });
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <BookOpenIcon size={24} className="text-gold" weight="duotone" />
        <div>
          <h1 className="text-parchment font-semibold text-lg">מרכז הלימודים</h1>
          <p className="text-parchment/40 text-xs">קורסים, שאלות מבחן, ומפות מושגים</p>
        </div>
      </div>

      <div className="grid grid-cols-[220px_1fr] gap-6">
        {/* Sidebar: subjects + courses */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-parchment/50 text-xs font-semibold uppercase tracking-widest">מקצועות</span>
            <button onClick={() => setNewSubject(true)} className="text-gold hover:text-gold/70 transition-colors">
              <PlusIcon size={14} />
            </button>
          </div>

          {showNewSubject && (
            <div className="flex gap-1">
              <input
                className="flex-1 bg-navy border border-parchment/20 rounded px-2 py-1 text-parchment text-xs outline-none focus:border-gold/50"
                placeholder="שם מקצוע..."
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubject(); if (e.key === 'Escape') setNewSubject(false); }}
                autoFocus
              />
              <button onClick={handleAddSubject} className="text-gold text-xs px-2">הוסף</button>
            </div>
          )}

          <ul className="space-y-1">
            {subjects.map((s: AcademicSubject) => (
              <li key={s.id}>
                <button
                  onClick={() => { setSubject(s.id); setCourse(null); }}
                  className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors
                    ${selectedSubject === s.id ? 'bg-gold/15 text-gold' : 'text-parchment/60 hover:text-parchment hover:bg-parchment/5'}`}
                >
                  {s.nameHe}
                </button>

                {selectedSubject === s.id && (
                  <ul className="mr-3 mt-1 space-y-0.5">
                    {courses.map((c: AcademicCourse) => (
                      <li key={c.id}>
                        <button
                          onClick={() => setCourse(c.id)}
                          className={`w-full text-right px-3 py-1.5 rounded text-xs transition-colors
                            ${selectedCourse === c.id ? 'text-gold bg-gold/10' : 'text-parchment/40 hover:text-parchment'}`}
                        >
                          {c.nameHe}
                        </button>
                      </li>
                    ))}
                    <li>
                      {showNewCourse ? (
                        <div className="flex gap-1 mt-1">
                          <input
                            className="flex-1 bg-navy border border-parchment/20 rounded px-2 py-0.5 text-parchment text-xs outline-none focus:border-gold/50"
                            placeholder="שם קורס..."
                            value={courseName}
                            onChange={(e) => setCourseName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCourse(); if (e.key === 'Escape') setNewCourse(false); }}
                            autoFocus
                          />
                          <button onClick={handleAddCourse} className="text-gold text-xs px-1">+</button>
                        </div>
                      ) : (
                        <button onClick={() => setNewCourse(true)} className="text-parchment/25 hover:text-parchment/50 text-xs px-3 py-1">
                          + קורס חדש
                        </button>
                      )}
                    </li>
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Main content */}
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-parchment/10">
            {([
              { key: 'courses'   as Tab, label: 'קורסים',         Icon: BookOpenIcon    },
              { key: 'questions' as Tab, label: 'שאלות מבחן',     Icon: ListBulletsIcon },
              { key: 'mindmap'   as Tab, label: 'מפה קונצפטואלית', Icon: ChartBarIcon   },
            ] as const).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px
                  ${tab === key
                    ? 'border-gold text-gold'
                    : 'border-transparent text-parchment/40 hover:text-parchment'}`}
              >
                <Icon size={14} weight="duotone" />
                {label}
              </button>
            ))}
          </div>

          {tab === 'courses' && (
            <div className="grid grid-cols-1 gap-3">
              {!selectedSubject && (
                <p className="text-parchment/30 text-sm text-center py-12">בחר מקצוע מהרשימה משמאל</p>
              )}
              {selectedSubject && courses.length === 0 && (
                <p className="text-parchment/30 text-sm text-center py-12">אין קורסים במקצוע זה — הוסף קורס חדש</p>
              )}
              {courses.map((c: AcademicCourse) => (
                <button
                  key={c.id}
                  onClick={() => setCourse(c.id)}
                  className={`flex items-center gap-3 px-4 py-4 bg-navy-100 border rounded-xl text-right transition-colors
                    ${selectedCourse === c.id ? 'border-gold/40' : 'border-parchment/10 hover:border-gold/20'}`}
                >
                  <BookOpenIcon size={18} className="text-gold/60" weight="duotone" />
                  <div>
                    <p className="text-parchment text-sm font-medium">{c.nameHe}</p>
                    {(c.semester || c.year) && (
                      <p className="text-parchment/40 text-xs">{[c.year, c.semester].filter(Boolean).join(' • ')}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === 'questions' && (
            <div className="space-y-4">
              {selectedCourse && <ExamPrepPanel courseId={selectedCourse} questions={questions} />}
              {!selectedCourse && (
                <p className="text-parchment/30 text-sm text-center py-12">בחר קורס לצפייה בשאלות</p>
              )}
            </div>
          )}

          {tab === 'mindmap' && (
            <div className="h-[520px] bg-navy-100 border border-parchment/10 rounded-xl overflow-hidden">
              {selectedCourse ? (
                <MindMapView nodes={graph} courseId={selectedCourse} />
              ) : (
                <div className="flex items-center justify-center h-full text-parchment/30 text-sm">
                  בחר קורס לצפייה במפה קונצפטואלית
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
