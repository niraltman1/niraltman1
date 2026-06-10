import { useState } from 'react';
import { ClockIcon, TrashIcon, CurrencyCircleDollarIcon } from '@phosphor-icons/react';
import {
  useTimeEntries,
  useCreateTimeEntry,
  useUpdateTimeEntry,
  useDeleteTimeEntry,
  type TimeEntry,
} from '@/api/hooks.js';

function fmt(n: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
}

interface Props {
  caseId: number;
}

export function CaseTimeEntries({ caseId }: Props) {
  const { data, isLoading } = useTimeEntries(caseId);
  const createEntry = useCreateTimeEntry();
  const updateEntry = useUpdateTimeEntry();
  const deleteEntry = useDeleteTimeEntry();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    descriptionHe: '',
    entryDate:     '',
    hours:         '',
    rate:          '',
    billable:      true,
    notes:         '',
  });

  const entries = data?.entries ?? [];
  const summary = data?.summary ?? { totalHours: 0, billableHours: 0, totalAmount: 0 };

  function handleCreate() {
    if (!form.descriptionHe || !form.entryDate || !form.hours) return;
    createEntry.mutate({
      caseId,
      descriptionHe: form.descriptionHe,
      entryDate:     form.entryDate,
      hours:         Number(form.hours),
      rate:          form.rate ? Number(form.rate) : undefined,
      billable:      form.billable,
      notes:         form.notes || undefined,
    }, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ descriptionHe: '', entryDate: '', hours: '', rate: '', billable: true, notes: '' });
      },
    });
  }

  function toggleBillable(entry: TimeEntry) {
    updateEntry.mutate({ id: entry.id, body: { billable: entry.billable !== 1 } });
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-serif font-bold text-parchment flex items-center gap-2">
            <ClockIcon size={18} weight="duotone" className="text-gold" />
            רישומי זמן
          </h3>
          <p className="text-parchment/40 text-xs mt-0.5">מעקב שעות עבודה לתיק — בסיס לחיוב שכ"ט</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 text-sm bg-gold/15 border border-gold/30 text-gold
                     rounded-lg hover:bg-gold/25 transition-colors"
        >
          + הוסף רישום
        </button>
      </div>

      {/* Summary header */}
      <div className="grid grid-cols-3 gap-3">
        {([
          ['סה"כ שעות',   `${summary.totalHours.toFixed(1)} ש'`,    'text-parchment'],
          ['שעות לחיוב',  `${summary.billableHours.toFixed(1)} ש'`, 'text-blue-300'],
          ['שווי לחיוב', fmt(summary.totalAmount),                   'text-emerald-300'],
        ] as const).map(([label, val, cls]) => (
          <div key={label} className="bg-navy-100 border border-parchment/10 rounded-lg p-3 text-center">
            <div className={`text-base font-mono font-semibold ${cls}`}>{val}</div>
            <div className="text-parchment/40 text-[11px] mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-navy-100 border border-parchment/15 rounded-lg p-4 space-y-3">
          <input
            dir="rtl"
            placeholder="תיאור הפעולה"
            value={form.descriptionHe}
            onChange={(e) => setForm((f) => ({ ...f, descriptionHe: e.target.value }))}
            className="w-full bg-navy-200 border border-parchment/10 rounded px-3 py-1.5
                       text-sm text-parchment placeholder:text-parchment/30 outline-none
                       focus:border-gold/40"
          />
          <div className="grid grid-cols-3 gap-3">
            <input
              type="date"
              dir="ltr"
              value={form.entryDate}
              onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
              className="bg-navy-200 border border-parchment/10 rounded px-3 py-1.5
                         text-sm text-parchment outline-none focus:border-gold/40"
            />
            <input
              type="number"
              step="0.25"
              dir="ltr"
              placeholder="שעות"
              value={form.hours}
              onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
              className="bg-navy-200 border border-parchment/10 rounded px-3 py-1.5
                         text-sm text-parchment placeholder:text-parchment/30 outline-none
                         focus:border-gold/40"
            />
            <input
              type="number"
              dir="ltr"
              placeholder="תעריף לשעה (₪)"
              value={form.rate}
              onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
              className="bg-navy-200 border border-parchment/10 rounded px-3 py-1.5
                         text-sm text-parchment placeholder:text-parchment/30 outline-none
                         focus:border-gold/40"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-parchment/60 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={form.billable}
              onChange={(e) => setForm((f) => ({ ...f, billable: e.target.checked }))}
              className="accent-gold"
            />
            ניתן לחיוב
          </label>
          <textarea
            dir="rtl"
            rows={2}
            placeholder="הערות (אופציונלי)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full bg-navy-200 border border-parchment/10 rounded px-3 py-1.5
                       text-sm text-parchment placeholder:text-parchment/30 outline-none
                       focus:border-gold/40 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-parchment/50 hover:text-parchment transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={handleCreate}
              disabled={createEntry.isPending}
              className="px-4 py-1.5 text-sm bg-gold/20 border border-gold/40 text-gold
                         rounded hover:bg-gold/30 disabled:opacity-50 transition-colors"
            >
              שמור
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-parchment/30 text-sm">טוען...</div>
      ) : entries.length === 0 ? (
        <div className="py-12 text-center text-parchment/30 text-sm">
          אין רישומי זמן לתיק זה
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-navy-100 border border-parchment/10 rounded-lg px-4 py-3
                         hover:border-parchment/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-parchment text-sm font-medium">{entry.description_he}</div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-parchment/30 text-xs">
                      {new Date(entry.entry_date).toLocaleDateString('he-IL')}
                    </span>
                    <span className="text-parchment/40 text-xs font-mono">
                      {entry.hours.toFixed(2)} ש' × {fmt(entry.rate)}
                    </span>
                    {entry.billable === 1 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]
                                       bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
                        <CurrencyCircleDollarIcon size={11} weight="fill" />
                        {fmt(entry.hours * entry.rate)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleBillable(entry)}
                    disabled={updateEntry.isPending}
                    className={`px-2 py-1 text-[11px] rounded border transition-colors disabled:opacity-50 ${
                      entry.billable === 1
                        ? 'bg-emerald-900/30 border-emerald-700/30 text-emerald-300 hover:bg-emerald-900/50'
                        : 'bg-navy-200 border-parchment/10 text-parchment/40 hover:text-parchment/60'
                    }`}
                  >
                    {entry.billable === 1 ? 'לחיוב' : 'לא לחיוב'}
                  </button>
                  <button
                    onClick={() => deleteEntry.mutate({ id: entry.id, caseId })}
                    disabled={deleteEntry.isPending}
                    className="p-1.5 text-parchment/30 hover:text-red-400 transition-colors disabled:opacity-50"
                    title="מחק רישום"
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
              {entry.notes && (
                <div className="text-parchment/30 text-[11px] mt-1.5">{entry.notes}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
