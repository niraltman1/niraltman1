import { useState } from 'react';
import { CurrencyCircleDollarIcon, CheckCircleIcon, WarningCircleIcon, ClockIcon } from '@phosphor-icons/react';
import {
  useLedger,
  useCreatePaymentSchedule,
  useMarkPaid,
  type PaymentSchedule,
} from '@/api/hooks.js';

function fmt(n: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
}

function StatusBadge({ row }: { row: PaymentSchedule }) {
  if (row.payment_status === 'PAID') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]
                       bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
        <CheckCircleIcon size={11} weight="fill" /> שולם
      </span>
    );
  }
  if (row.payment_status === 'OVERDUE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]
                       bg-red-900/40 text-red-300 border border-red-700/40">
        <WarningCircleIcon size={11} weight="fill" />
        פיגור של {row.overdue_days} ימים בדיוק
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]
                     bg-amber-900/40 text-amber-300 border border-amber-700/40">
      <ClockIcon size={11} weight="fill" /> ממתין
    </span>
  );
}

interface Props {
  clientId?: number;
}

export function LedgerPage({ clientId }: Props) {
  const { data, isLoading } = useLedger(clientId);
  const createSchedule      = useCreatePaymentSchedule();
  const markPaid            = useMarkPaid();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    descriptionHe: '',
    totalAmount:   '',
    dueDate:       '',
    notes:         '',
  });

  const schedules = data?.schedules ?? [];
  const summary   = data?.summary ?? { totalAmount: 0, clearedFunds: 0, openBalance: 0 };

  function handleCreate() {
    if (!form.descriptionHe || !form.totalAmount || !form.dueDate) return;
    createSchedule.mutate({
      clientId,
      descriptionHe: form.descriptionHe,
      totalAmount:   Number(form.totalAmount),
      dueDate:       form.dueDate,
      notes:         form.notes || undefined,
    }, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ descriptionHe: '', totalAmount: '', dueDate: '', notes: '' });
      },
    });
  }

  return (
    <div className="space-y-5 p-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-serif font-bold text-parchment flex items-center gap-2">
            <CurrencyCircleDollarIcon size={20} weight="duotone" className="text-gold" />
            ספר גבייה
          </h2>
          <p className="text-parchment/40 text-xs mt-0.5">לוח תשלומים ידני — ללא אוטומציה</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 text-sm bg-gold/15 border border-gold/30 text-gold
                     rounded-lg hover:bg-gold/25 transition-colors"
        >
          + הוסף שורה
        </button>
      </div>

      {/* Summary header */}
      <div className="grid grid-cols-3 gap-3">
        {([
          ['סך שכ"ט',    summary.totalAmount,  'text-parchment'],
          ['גבוי',        summary.clearedFunds, 'text-emerald-300'],
          ['יתרה פתוחה', summary.openBalance,   'text-amber-300'],
        ] as const).map(([label, val, cls]) => (
          <div key={label} className="bg-navy-100 border border-parchment/10 rounded-lg p-3 text-center">
            <div className={`text-base font-mono font-semibold ${cls}`}>{fmt(val)}</div>
            <div className="text-parchment/40 text-[11px] mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-navy-100 border border-parchment/15 rounded-lg p-4 space-y-3">
          <input
            dir="rtl"
            placeholder="תיאור התשלום"
            value={form.descriptionHe}
            onChange={(e) => setForm((f) => ({ ...f, descriptionHe: e.target.value }))}
            className="w-full bg-navy-200 border border-parchment/10 rounded px-3 py-1.5
                       text-sm text-parchment placeholder:text-parchment/30 outline-none
                       focus:border-gold/40"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              dir="ltr"
              placeholder="סכום (₪)"
              value={form.totalAmount}
              onChange={(e) => setForm((f) => ({ ...f, totalAmount: e.target.value }))}
              className="bg-navy-200 border border-parchment/10 rounded px-3 py-1.5
                         text-sm text-parchment placeholder:text-parchment/30 outline-none
                         focus:border-gold/40"
            />
            <input
              type="date"
              dir="ltr"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="bg-navy-200 border border-parchment/10 rounded px-3 py-1.5
                         text-sm text-parchment outline-none focus:border-gold/40"
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
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-parchment/50 hover:text-parchment transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={handleCreate}
              disabled={createSchedule.isPending}
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
      ) : schedules.length === 0 ? (
        <div className="py-12 text-center text-parchment/30 text-sm">
          אין שורות בספר הגבייה
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((row) => (
            <div
              key={row.id}
              className="bg-navy-100 border border-parchment/10 rounded-lg px-4 py-3
                         hover:border-parchment/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-parchment text-sm font-medium">{row.description_he}</div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-parchment/40 text-xs font-mono">
                      {fmt(row.paid_amount)} / {fmt(row.total_amount)}
                    </span>
                    <span className="text-parchment/30 text-xs">
                      יעד: {new Date(row.due_date).toLocaleDateString('he-IL')}
                    </span>
                    {row.invoice_number && (
                      <span className="text-parchment/30 text-[11px]">חשבונית: {row.invoice_number}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <StatusBadge row={row} />
                  {row.morning_doc_url && (
                    <a
                      href={row.morning_doc_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-1 text-[11px] bg-blue-900/30 border border-blue-700/30
                                 text-blue-300 rounded hover:bg-blue-900/50 transition-colors"
                    >
                      הפק דרישת תשלום
                    </a>
                  )}
                  {row.payment_status !== 'PAID' && (
                    <button
                      onClick={() => markPaid.mutate(row.id)}
                      disabled={markPaid.isPending}
                      className="px-2 py-1 text-[11px] bg-emerald-900/30 border border-emerald-700/30
                                 text-emerald-300 rounded hover:bg-emerald-900/50 disabled:opacity-50
                                 transition-colors"
                    >
                      סמן כשולם
                    </button>
                  )}
                </div>
              </div>
              {row.notes && (
                <div className="text-parchment/30 text-[11px] mt-1.5">{row.notes}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
