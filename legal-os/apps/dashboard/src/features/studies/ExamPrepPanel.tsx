import { useState } from 'react';
import { CheckCircleIcon, XCircleIcon, SparkleIcon, UploadIcon } from '@phosphor-icons/react';
import type { StudyQuestion } from '@/api/hooks.js';
import { useGenerateQuestions } from '@/api/hooks.js';

interface Props {
  courseId:  number;
  questions: StudyQuestion[];
}

export function ExamPrepPanel({ courseId, questions }: Props) {
  const [documentId, setDocumentId]   = useState('');
  const [count, setCount]             = useState(5);
  const [selected, setSelected]       = useState<Record<number, 'a' | 'b' | 'c' | 'd'>>({});
  const [revealed, setRevealed]       = useState<Set<number>>(new Set());

  const generate = useGenerateQuestions();

  function handleGenerate() {
    const docId = Number(documentId);
    if (!docId) return;
    generate.mutate({ documentId: docId, courseId, count });
  }

  function choose(qId: number, opt: 'a' | 'b' | 'c' | 'd') {
    setSelected((prev) => ({ ...prev, [qId]: opt }));
    setRevealed((prev) => new Set(prev).add(qId));
  }

  const OPTIONS: Array<'a' | 'b' | 'c' | 'd'> = ['a', 'b', 'c', 'd'];
  const optionLabel: Record<string, string> = { a: 'א', b: 'ב', c: 'ג', d: 'ד' };

  return (
    <div className="space-y-5">
      {/* Generate panel */}
      <div className="bg-navy-100 border border-parchment/10 rounded-xl p-4 space-y-3">
        <h3 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
          <SparkleIcon size={12} className="text-gold" />
          יצירת שאלות מבחן אוטומטית
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="מזהה מסמך..."
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            className="w-36 bg-navy border border-parchment/20 rounded px-2 py-1.5 text-parchment text-sm outline-none focus:border-gold/50"
          />
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="bg-navy border border-parchment/20 rounded px-2 py-1.5 text-parchment text-sm outline-none"
          >
            {[3, 5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>{n} שאלות</option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            disabled={!documentId || generate.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-gold/20 text-gold border border-gold/30 rounded-lg text-sm hover:bg-gold/30 transition-colors disabled:opacity-40"
          >
            <UploadIcon size={13} />
            {generate.isPending ? 'מייצר...' : 'צור שאלות'}
          </button>
        </div>
        {generate.data && (
          <p className="text-green-400/70 text-xs">{generate.data.message}</p>
        )}
      </div>

      {/* Questions list */}
      {questions.length === 0 && (
        <p className="text-parchment/30 text-sm text-center py-8">אין שאלות בקורס זה עדיין</p>
      )}

      {questions.map((q, i) => {
        const isRevealed  = revealed.has(q.id);
        const userAnswer  = selected[q.id];
        return (
          <div key={q.id} className="bg-navy-100 border border-parchment/10 rounded-xl p-4 space-y-3">
            <p className="text-parchment text-sm font-medium" dir="rtl">
              <span className="text-parchment/30 ml-2">{i + 1}.</span>
              {q.questionHe}
            </p>

            <div className="grid grid-cols-2 gap-2">
              {OPTIONS.map((opt) => {
                const text = q[`option${opt.toUpperCase() as 'A'|'B'|'C'|'D'}` as keyof StudyQuestion] as string;
                const isCorrect  = q.correctAnswer === opt;
                const isSelected = userAnswer === opt;
                let cls = 'border border-parchment/15 text-parchment/60';
                if (isRevealed) {
                  if (isCorrect)                   cls = 'border border-green-500/50 bg-green-500/10 text-green-400';
                  else if (isSelected && !isCorrect) cls = 'border border-red-500/50 bg-red-500/10 text-red-400';
                } else if (isSelected) {
                  cls = 'border border-gold/40 bg-gold/10 text-gold';
                }
                return (
                  <button
                    key={opt}
                    onClick={() => choose(q.id, opt)}
                    disabled={isRevealed}
                    className={`flex items-start gap-2 px-3 py-2 rounded-lg text-right text-xs transition-colors ${cls} hover:border-parchment/30 disabled:cursor-default`}
                  >
                    <span className="text-parchment/30 shrink-0 mt-0.5">{optionLabel[opt]}.</span>
                    <span>{text}</span>
                  </button>
                );
              })}
            </div>

            {isRevealed && (
              <div className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
                selected[q.id] === q.correctAnswer
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                {selected[q.id] === q.correctAnswer
                  ? <CheckCircleIcon size={14} className="shrink-0 mt-0.5" />
                  : <XCircleIcon size={14} className="shrink-0 mt-0.5" />
                }
                <span>
                  {selected[q.id] === q.correctAnswer ? 'נכון! ' : `שגוי. התשובה הנכונה: ${optionLabel[q.correctAnswer]}. `}
                  {q.explanation ?? ''}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
