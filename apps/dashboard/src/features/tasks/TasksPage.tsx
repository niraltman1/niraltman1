import { useState, useCallback } from 'react';
import {
  CheckSquareIcon, PlusIcon, ArrowsClockwiseIcon,
  ClockIcon, WarningIcon, CheckIcon,
} from '@phosphor-icons/react';
import { useTasks, useCreateTask, useUpdateTask, type TaskRecord } from '@/api/hooks.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: undefined,       label: 'הכל'      },
  { key: 'pending',       label: 'ממתין'    },
  { key: 'in_progress',   label: 'בביצוע'  },
  { key: 'checked',       label: 'בוצע'    },
  { key: 'cancelled',     label: 'בוטל'    },
] as const;

const PRIORITY_LABELS: Record<string, string> = {
  low:      'נמוכה',
  normal:   'רגיל',
  high:     'גבוהה',
  critical: 'קריטי',
};

const PRIORITY_BADGE_CLS: Record<string, string> = {
  low:      'badge-neutral',
  normal:   'badge-blue',
  high:     'badge-warning',
  critical: 'badge-error',
};

const SOURCE_LABELS: Record<string, string> = {
  manual:           'ידני',
  vacuum_protocol:  'Vacuum',
  action_plan:      'תוכנית פעולה',
  system:           'מערכת',
};

// ─── Urgency row class ────────────────────────────────────────────────────────

function rowUrgencyClass(task: TaskRecord): string {
  if (task.status === 'checked' || task.status === 'cancelled') return '';
  if (task.urgency === 'critical') return 'task-overdue';
  if (task.urgency === 'warning')  return 'task-urgent';
  return '';
}

// ─── New task form ────────────────────────────────────────────────────────────

interface NewTaskFormProps { onClose: () => void }

function NewTaskForm({ onClose }: NewTaskFormProps) {
  const [title,    setTitle]    = useState('');
  const [priority, setPriority] = useState<'low'|'normal'|'high'|'critical'>('normal');
  const [dueDate,  setDueDate]  = useState('');
  const create = useCreateTask();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await create.mutateAsync({
      title:    title.trim(),
      priority,
      ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/80 backdrop-blur-sm" dir="rtl">
      <form
        onSubmit={(e) => void submit(e)}
        className="bg-navy-100 border border-parchment/10 rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4"
      >
        <h2 className="text-lg font-serif font-bold text-parchment">משימה חדשה</h2>

        <div>
          <label className="block text-xs text-parchment/50 mb-1">כותרת *</label>
          <input
            autoFocus
            className="form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="תיאור המשימה…"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-parchment/50 mb-1">עדיפות</label>
            <select
              className="form-input"
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
            >
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-parchment/50 mb-1">תאריך יעד</label>
            <input
              type="datetime-local"
              className="form-input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={!title.trim() || create.isPending}
            className="flex-1 py-2 rounded bg-gold text-navy font-semibold text-sm
                       hover:bg-gold/90 disabled:opacity-40 transition-colors"
          >
            צור משימה
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border border-parchment/20 text-parchment/60
                       hover:text-parchment text-sm transition-colors"
          >
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────

interface TaskRowProps { task: TaskRecord }

function TaskRow({ task }: TaskRowProps) {
  const update = useUpdateTask();

  const toggleDone = useCallback(() => {
    void update.mutateAsync({
      id:     task.id,
      status: task.status === 'checked' ? 'pending' : 'checked',
    });
  }, [task.id, task.status, update]);

  const dueFmt = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      className={`grid grid-cols-[2rem_1fr_5rem_6rem_5rem_5rem] gap-3 px-4 py-3
                  border-b border-parchment/5 last:border-b-0 items-center text-sm
                  transition-all duration-200 ${rowUrgencyClass(task)}`}
    >
      {/* Checkbox */}
      <button
        onClick={toggleDone}
        disabled={update.isPending}
        className={`w-6 h-6 rounded border flex items-center justify-center transition-colors
                    ${task.status === 'checked'
                      ? 'bg-green-600 border-green-600'
                      : 'border-parchment/30 hover:border-gold'}`}
        aria-label={task.status === 'checked' ? 'סמן כלא בוצע' : 'סמן כבוצע'}
      >
        {task.status === 'checked' && <CheckIcon size={13} weight="bold" className="text-white" />}
      </button>

      {/* Title + metadata */}
      <div className="min-w-0">
        <p className={`truncate font-medium ${task.status === 'checked' ? 'line-through text-parchment/30' : 'text-parchment'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {!!task.clientName && (
            <span className="text-parchment/40 text-xs truncate">{task.clientName}</span>
          )}
          {task.source !== 'manual' && (
            <span className="badge badge-gold text-xs">{SOURCE_LABELS[task.source] ?? task.source}</span>
          )}
        </div>
      </div>

      {/* Due date */}
      <div className="flex items-center gap-1 text-xs">
        {dueFmt ? (
          <>
            {task.urgency === 'critical' && <WarningIcon size={12} className="text-red-400 shrink-0" weight="fill" />}
            {task.urgency === 'warning'  && <ClockIcon   size={12} className="text-orange-400 shrink-0" weight="fill" />}
            <span className={
              task.urgency === 'critical' ? 'text-red-400 font-semibold' :
              task.urgency === 'warning'  ? 'text-orange-400' :
              'text-parchment/40'
            }>{dueFmt}</span>
          </>
        ) : (
          <span className="text-parchment/20">—</span>
        )}
      </div>

      {/* Priority */}
      <span className={`badge ${PRIORITY_BADGE_CLS[task.priority] ?? 'badge-neutral'}`}>
        {PRIORITY_LABELS[task.priority] ?? task.priority}
      </span>

      {/* Status */}
      <span className={`badge ${
        task.status === 'checked'     ? 'badge-success' :
        task.status === 'in_progress' ? 'badge-blue'    :
        task.status === 'cancelled'   ? 'badge-neutral' :
        'badge-warning'
      }`}>
        {task.status === 'checked'     ? 'בוצע'   :
         task.status === 'in_progress' ? 'בביצוע' :
         task.status === 'cancelled'   ? 'בוטל'   :
         'ממתין'}
      </span>

      {/* Urgency icon */}
      <div className="flex justify-center">
        {task.urgency === 'critical' && (
          <span className="text-red-400 text-xs font-bold animate-pulse">⚠</span>
        )}
        {task.urgency === 'warning' && (
          <span className="text-orange-400 text-xs">🕐</span>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TasksPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [showForm, setShowForm]         = useState(false);
  const taskFilters = statusFilter !== undefined ? { status: statusFilter } : {};
  const { data, isLoading, isError, refetch } = useTasks(taskFilters);
  const tasks   = data?.items ?? [];
  const total   = data?.total ?? 0;
  const overdue = tasks.filter((t) => t.urgency === 'critical' && t.status !== 'checked').length;

  return (
    <div className="space-y-4 h-full flex flex-col" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between shrink-0">
        <div>
          <h1 className="text-xl font-serif font-bold text-parchment flex items-center gap-2">
            <CheckSquareIcon size={22} weight="duotone" className="text-gold" />
            משימות
          </h1>
          <p className="text-parchment/50 text-sm mt-1">
            {total > 0 ? `${total} משימות` : 'ניהול משימות ומעקב דדליינים'}
            {overdue > 0 && (
              <span className="mr-2 text-red-400 font-semibold animate-pulse">
                · {overdue} באיחור!
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refetch()}
            className="p-2 rounded text-parchment/40 hover:text-parchment/70 border border-parchment/10 transition-colors"
            title="רענן"
          >
            <ArrowsClockwiseIcon size={16} />
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded bg-gold text-navy font-semibold text-sm
                       hover:bg-gold/90 transition-colors"
          >
            <PlusIcon size={16} weight="bold" />
            משימה חדשה
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-0 border-b border-parchment/10 shrink-0">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key ?? 'all'}
            onClick={() => setStatusFilter(key)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors
              ${statusFilter === key
                ? 'border-gold text-parchment font-medium'
                : 'border-transparent text-parchment/50 hover:text-parchment/80'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div className="bg-navy-100 border border-parchment/10 rounded-t-lg shrink-0">
        <div className="grid grid-cols-[2rem_1fr_5rem_6rem_5rem_5rem] gap-3 px-4 py-2.5
                        text-parchment/50 text-xs font-medium border-b border-parchment/10">
          <span></span>
          <span>כותרת</span>
          <span>תאריך יעד</span>
          <span>עדיפות</span>
          <span>סטטוס</span>
          <span>דחיפות</span>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-auto bg-navy-100 border border-t-0 border-parchment/10 rounded-b-lg min-h-0">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-parchment/40 text-sm">טוען…</div>
        )}
        {isError && (
          <div className="flex items-center justify-center py-12 text-red-400 text-sm">שגיאה בטעינת הנתונים</div>
        )}
        {!isLoading && !isError && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-parchment/30 gap-3">
            <CheckSquareIcon size={40} weight="thin" />
            <span className="text-sm">אין משימות להצגה</span>
          </div>
        )}
        {tasks.map((task) => <TaskRow key={task.id} task={task} />)}
      </div>

      {showForm && <NewTaskForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
