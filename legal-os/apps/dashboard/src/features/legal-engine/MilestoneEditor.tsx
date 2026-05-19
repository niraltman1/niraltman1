import { TrashIcon, ArrowUpIcon, ArrowDownIcon, PlusIcon } from '@phosphor-icons/react';
import type { MilestoneDraft } from '@/api/hooks.js';

const ANCHOR_LABELS = {
  filing:      'מיום הגשה',
  previous:    'מהשלב הקודם',
  court_order: 'לפי צו בית משפט',
};

const PRIORITY_LABELS = {
  low:      'נמוכה',
  normal:   'רגיל',
  high:     'גבוהה',
  critical: 'קריטי',
};

interface Props {
  milestones: MilestoneDraft[];
  onChange:   (milestones: MilestoneDraft[]) => void;
  readOnly?:  boolean;
}

export function MilestoneEditor({ milestones, onChange, readOnly }: Props) {
  function update(idx: number, patch: Partial<MilestoneDraft>) {
    const next = milestones.map((m, i) => i === idx ? { ...m, ...patch } : m);
    onChange(next);
  }

  function remove(idx: number) {
    onChange(milestones.filter((_, i) => i !== idx));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...milestones];
    [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
    onChange(next);
  }

  function moveDown(idx: number) {
    if (idx === milestones.length - 1) return;
    const next = [...milestones];
    [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
    onChange(next);
  }

  function addBlank() {
    onChange([...milestones, {
      titleHe:     '',
      dayOffset:   null,
      anchor:      'filing',
      isMandatory: true,
      taskPriority: 'normal',
    }]);
  }

  return (
    <div className="space-y-2">
      {milestones.map((m, idx) => (
        <div
          key={idx}
          className="bg-navy/40 border border-parchment/10 rounded-lg p-3 space-y-2"
        >
          {/* Row 1: sequence + title + reorder + delete */}
          <div className="flex items-center gap-2">
            <span className="text-parchment/30 text-xs font-mono w-5 shrink-0 text-center">
              {idx + 1}
            </span>
            <input
              className="form-input flex-1 text-sm"
              value={m.titleHe}
              onChange={(e) => update(idx, { titleHe: e.target.value })}
              placeholder="שם השלב בעברית *"
              dir="rtl"
              disabled={readOnly}
              required
            />
            {!readOnly && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="p-1 rounded text-parchment/30 hover:text-parchment/70 disabled:opacity-20"
                  title="הזז למעלה"
                >
                  <ArrowUpIcon size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(idx)}
                  disabled={idx === milestones.length - 1}
                  className="p-1 rounded text-parchment/30 hover:text-parchment/70 disabled:opacity-20"
                  title="הזז למטה"
                >
                  <ArrowDownIcon size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="p-1 rounded text-red-400/60 hover:text-red-400"
                  title="מחק"
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Row 2: day offset + anchor + priority + mandatory */}
          <div className="grid grid-cols-4 gap-2 pr-7">
            <div>
              <label className="block text-xs text-parchment/40 mb-0.5">ימים</label>
              <input
                type="number"
                min={0}
                className="form-input text-xs"
                value={m.dayOffset ?? ''}
                onChange={(e) => update(idx, { dayOffset: e.target.value ? Number(e.target.value) : null })}
                placeholder="—"
                dir="ltr"
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="block text-xs text-parchment/40 mb-0.5">עוגן</label>
              <select
                className="form-input text-xs"
                value={m.anchor ?? 'filing'}
                onChange={(e) => update(idx, { anchor: e.target.value as 'filing' | 'previous' | 'court_order' })}
                disabled={readOnly}
              >
                {Object.entries(ANCHOR_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-parchment/40 mb-0.5">עדיפות</label>
              <select
                className="form-input text-xs"
                value={m.taskPriority ?? 'normal'}
                onChange={(e) => update(idx, { taskPriority: e.target.value as 'low' | 'normal' | 'high' | 'critical' })}
                disabled={readOnly}
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1 gap-1.5">
              <input
                type="checkbox"
                id={`mandatory-${idx}`}
                checked={m.isMandatory !== false}
                onChange={(e) => update(idx, { isMandatory: e.target.checked })}
                disabled={readOnly}
                className="accent-gold"
              />
              <label htmlFor={`mandatory-${idx}`} className="text-xs text-parchment/50">חובה</label>
            </div>
          </div>

          {/* Row 3: description */}
          {!readOnly || m.description ? (
            <div className="pr-7">
              <input
                className="form-input text-xs"
                value={m.description ?? ''}
                onChange={(e) => update(idx, { description: e.target.value || null })}
                placeholder="תיאור (אופציונלי)"
                dir="rtl"
                disabled={readOnly}
              />
            </div>
          ) : null}
        </div>
      ))}

      {!readOnly && (
        <button
          type="button"
          onClick={addBlank}
          className="w-full flex items-center justify-center gap-2 py-2 rounded border border-dashed
                     border-parchment/20 text-parchment/40 hover:text-parchment/70 hover:border-parchment/40
                     text-sm transition-colors"
        >
          <PlusIcon size={14} />
          הוסף שלב
        </button>
      )}
    </div>
  );
}
