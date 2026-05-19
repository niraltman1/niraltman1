import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FileTextIcon, GavelIcon, SealCheckIcon, CheckCircleIcon, PlusIcon, ArrowRightIcon,
} from '@phosphor-icons/react';
import { useCanvasDocument, useCreateCanvasTask } from '@/api/hooks.js';
import type { TaskRecord } from '@/api/hooks.js';

function CourtReceiptBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full">
      <CheckCircleIcon size={10} />
      קבלת בית משפט
    </span>
  );
}

function SignedPdfBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-full">
      <SealCheckIcon size={10} />
      חתום דיגיטלית
    </span>
  );
}

function AddTaskForm({ docId, onDone }: { docId: number; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const { mutate, isPending } = useCreateCanvasTask();

  const submit = () => {
    if (!title.trim()) return;
    mutate({ docId, title: title.trim() }, { onSuccess: onDone });
    setTitle('');
  };

  return (
    <div className="flex gap-2 mt-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="תיאור משימה..."
        className="flex-1 bg-navy-200 border border-parchment/10 rounded-lg px-3 py-1.5 text-parchment text-sm placeholder:text-parchment/30 outline-none focus:border-gold/40"
        dir="rtl"
        autoFocus
      />
      <button
        onClick={submit}
        disabled={isPending || !title.trim()}
        className="px-3 py-1.5 bg-gold/15 text-gold border border-gold/30 rounded-lg text-xs hover:bg-gold/25 disabled:opacity-40"
      >
        הוסף
      </button>
      <button onClick={onDone} className="px-2 text-parchment/40 text-xs hover:text-parchment">ביטול</button>
    </div>
  );
}

export function CanvasPage() {
  const { id } = useParams<{ id: string }>();
  const docId  = Number(id);
  const [showAddTask, setShowAddTask] = useState(false);

  const { data, isLoading, isError } = useCanvasDocument(docId);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-parchment/30 text-sm">טוען...</div>;
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <FileTextIcon size={36} className="text-parchment/20" />
        <p className="text-parchment/40 text-sm">מסמך לא נמצא</p>
        <Link to="/documents" className="text-gold text-xs hover:underline">← חזרה למסמכים</Link>
      </div>
    );
  }

  const doc      = data.document as Record<string, unknown>;
  const insights = data.insights as Record<string, unknown> | null;
  const tasks    = data.tasks as TaskRecord[];
  const filename = String(doc['filename'] ?? '');
  const isCourtReceipt = Boolean(doc['is_court_receipt']);
  const isSignedPdf    = Boolean(doc['is_signed_pdf']);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4" dir="rtl">
      <Link to={`/documents/${docId}`} className="inline-flex items-center gap-1 text-parchment/40 text-xs hover:text-parchment transition-colors">
        <ArrowRightIcon size={12} />
        חזרה למסמך
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Left — Document Info */}
        <div className="space-y-4">
          <div className="bg-navy-100 border border-parchment/10 rounded-xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <FileTextIcon size={20} className="text-parchment/40 mt-0.5 shrink-0" weight="duotone" />
              <div className="space-y-1">
                <h1 className="text-parchment font-semibold text-sm">{filename}</h1>
                <div className="flex flex-wrap gap-1.5">
                  {isCourtReceipt && <CourtReceiptBadge />}
                  {isSignedPdf    && <SignedPdfBadge />}
                </div>
              </div>
            </div>
          </div>

          {/* AI Insights */}
          {insights && (
            <div className="bg-navy-100 border border-parchment/10 rounded-xl p-5 space-y-2">
              <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
                <GavelIcon size={12} className="text-gold" />
                תובנות AI
              </h2>
              <dl className="space-y-1 text-sm">
                {[
                  ['מספר תיק', String(insights['case_number'] ?? '')],
                  ['בית משפט', String(insights['court_name'] ?? '')],
                  ['שופט/ת',   String(insights['judge_name'] ?? '')],
                  ['עבירה',    String(insights['offense_type'] ?? '')],
                ].map(([label, value]) => value ? (
                  <div key={label} className="flex gap-2">
                    <dt className="text-parchment/40 w-20 shrink-0">{label}</dt>
                    <dd className="text-parchment/70 truncate">{value}</dd>
                  </div>
                ) : null)}
              </dl>
            </div>
          )}
        </div>

        {/* Right — Task Workflow */}
        <div className="bg-navy-100 border border-parchment/10 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest">
              משימות ({tasks.length})
            </h2>
            <button
              onClick={() => setShowAddTask((v) => !v)}
              className="flex items-center gap-1 text-gold text-xs hover:underline"
            >
              <PlusIcon size={12} />
              צור משימה
            </button>
          </div>

          {showAddTask && (
            <AddTaskForm docId={docId} onDone={() => setShowAddTask(false)} />
          )}

          {tasks.length === 0 ? (
            <p className="text-parchment/30 text-sm text-center py-8">אין משימות למסמך זה</p>
          ) : (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2 py-2 border-b border-parchment/5 last:border-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    task.status === 'checked'    ? 'bg-green-400' :
                    task.status === 'in_progress'? 'bg-amber-400' :
                    task.status === 'cancelled'  ? 'bg-parchment/20' :
                    'bg-parchment/40'
                  }`} />
                  <span className={`text-sm flex-1 ${task.status === 'checked' ? 'line-through text-parchment/30' : 'text-parchment/80'}`}>
                    {task.title}
                  </span>
                  {task.dueDate && (
                    <span className="text-[10px] text-parchment/30">{task.dueDate}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
