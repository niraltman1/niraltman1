import { useState } from 'react';
import { ClockIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import {
  useTimeEntries,
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useCases,
  type TimeEntry,
} from '@/api/hooks.js';

function fmt(n: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
}

function fmtHours(h: number) {
  return h.toFixed(2);
}

const emptyForm = {
  descriptionHe: '',
  entryDate:     '',
  hours:         '',
  rate:          '',
  billable:      true,
  notes:         '',
};

export function TimeTrackingPage() {
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [showForm, setShowForm]             = useState(false);
  const [form, setForm]                     = useState(emptyForm);

  const { data: casesData } = useCases(1, 200);
  const { data, isLoading } = useTimeEntries(selectedCaseId);
  const createEntry         = useCreateTimeEntry();
  const deleteEntry         = useDeleteTimeEntry();

  const cases   = (casesData?.items ?? []) as Array<{ id: number; titleHe?: string; caseNumber?: string }>;
  const entries = data?.entries ?? [];
  const summary = data?.summary ?? { totalHours: 0, billableHours: 0, totalAmount: 0 };

  function handleCreate() {
    if (!selectedCaseId || !form.descriptionHe || !form.entryDate || !form.hours) return;
    createEntry.mutate({
      caseId:        selectedCaseId,
      descriptionHe: form.descriptionHe,
      entryDate:     form.entryDate,
      hours:         Number(form.hours),
      rate:          form.rate ? Number(form.rate) : undefined,
      billable:      form.billable ? 1 : 0,
      notes:         form.notes || undefined,
    }, {
      onSuccess: () => {
        setShowForm(false);
        setForm(emptyForm);
      },
    });
  }

  function handleDelete(entry: TimeEntry) {
    deleteEntry.mutate({ id: entry.id, caseId: entry.case_id });
  }

  const selectedCase = cases.find((c) => c.id === selectedCaseId);

  return (
    <div className="space-y-5 p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-serif font-bold text-parchment flex items-center gap-2">
            <ClockIcon size={20} weight="duotone" className="text-gold" />
            רישום שעות
          </h2>
          <p className="text-parchment/40 text-xs mt-0.5">מעקב שעות עבודה לפי תיק</p>
        </div>
        {selectedCaseId && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gold/15 border border-gold/30
                       text-gold rounded-lg hover:bg-gold/25 transition-colors"
          >
            <PlusIcon size={14} />
            הוסף רשומה
          </button>
        )}
      </div>

      {/* Case selector */}
      <div className="bg-navy-100 border border-parchment/10 rounded-lg p-4">
        <label className="text-parchment/60 text-xs mb-1.5 block">בחר תיק</label>
        <select
          value={selectedCaseId ?? ''}
          onChange={(e) => {
            setSelectedCaseId(e.target.value ? Number(e.target.value) : null);
            setShowForm(false);
          }}
          className="w-full bg-navy-200 border border-parchment/10 rounded px-3 py-1.5
                     text-sm text-parchment outline-none focus:border-gold/40"
        >
          <option value="">— בחר תיק —</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.caseNumber ? `${c.caseNumber} — ` : ''}
              {c.titleHe ?? `תיק ${c.id}`}
            </option>
          ))}
        </select>
      </div>

      {!selectedCaseId ? (
        <div className="py-16 text-center text-parchment/30 text-sm">
          בחר תיק כדי לצפות ברשומות שעות
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-3">
            {([
              ['סה"כ שעות',    fmtHours(summary.totalHours) + ' ש׳',   'text-parchment'],
              ['שעות לחיוב',   fmtHours(summary.billableHours) + ' ש׳', 'text-amber-300'],
              ['סכום לחיוב',   fmt(summary.totalAmount),                 'text-emerald-300'],
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
              <div className="text-parchment/70 text-sm font-medium">
                רשומה חדשה — {selectedCase?.titleHe ?? selectedCase?.caseNumber ?? `תיק ${selectedCaseId}`}
              </div>
              <input
                dir="rtl"
                placeholder="תיאור העבודה"
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
                  dir="ltr"
                  step="0.25"
                  min="0"
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
                  min="0"
                  placeholder="תעריף (₪, אופציונלי)"
                  value={form.rate}
                  onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                  className="bg-navy-200 border border-parchment/10 rounded px-3 py-1.5
                             text-sm text-parchment placeholder:text-parchment/30 outline-none
                             focus:border-gold/40"
                />
              </div>
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
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-parchment/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.billable}
                    onChange={(e) => setForm((f) => ({ ...f, billable: e.target.checked }))}
                    className="accent-gold"
                  />
                  לחיוב לקוח
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowForm(false); setForm(emptyForm); }}
                    className="px-3 py-1.5 text-sm text-parchment/50 hover:text-parchment transition-colors"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={createEntry.isPending || !form.descriptionHe || !form.entryDate || !form.hours}
                    className="px-4 py-1.5 text-sm bg-gold/20 border border-gold/40 text-gold
                               rounded hover:bg-gold/30 disabled:opacity-50 transition-colors"
                  >
                    שמור
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="py-12 text-center text-parchment/30 text-sm">טוען...</div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-parchment/30 text-sm">
              אין רשומות שעות לתיק זה
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-parchment/10 text-parchment/40 text-xs">
                    <th className="pb-2 text-right font-normal">תאריך</th>
                    <th className="pb-2 text-right font-normal">תיאור</th>
                    <th className="pb-2 text-right font-normal">שעות</th>
                    <th className="pb-2 text-right font-normal">תעריף</th>
                    <th className="pb-2 text-right font-normal">לחיוב</th>
                    <th className="pb-2 text-right font-normal">סכום</th>
                    <th className="pb-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-parchment/5">
                  {entries.map((row) => (
                    <tr key={row.id} className="hover:bg-navy-100/50 transition-colors">
                      <td className="py-2.5 text-parchment/60 font-mono text-xs">
                        {new Date(row.entry_date).toLocaleDateString('he-IL')}
                      </td>
                      <td className="py-2.5 text-parchment pr-3">
                        {row.description_he}
                        {row.notes && (
                          <div className="text-parchment/30 text-[11px] mt-0.5">{row.notes}</div>
                        )}
                      </td>
                      <td className="py-2.5 text-parchment/80 font-mono">{fmtHours(row.hours)}</td>
                      <td className="py-2.5 text-parchment/60 font-mono">
                        {row.rate > 0 ? fmt(row.rate) : '—'}
                      </td>
                      <td className="py-2.5">
                        {row.billable ? (
                          <span className="text-emerald-400 text-xs">כן</span>
                        ) : (
                          <span className="text-parchment/30 text-xs">לא</span>
                        )}
                      </td>
                      <td className="py-2.5 text-parchment font-mono font-medium">
                        {row.billable && row.rate > 0 ? fmt(row.hours * row.rate) : '—'}
                      </td>
                      <td className="py-2.5">
                        <button
                          onClick={() => handleDelete(row)}
                          disabled={deleteEntry.isPending}
                          className="p-1 text-parchment/20 hover:text-red-400 disabled:opacity-30
                                     transition-colors rounded"
                          aria-label="מחק רשומה"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
