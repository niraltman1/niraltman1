import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GavelIcon, MagnifyingGlassIcon, PlusIcon } from '@phosphor-icons/react';
import { useCases } from '@/api/hooks.js';
import { NewCaseWizard } from '@/features/legal-engine/NewCaseWizard.js';

const STATUS_LABELS: Record<string, string> = {
  open:      'פתוח',
  closed:    'סגור',
  suspended: 'מושהה',
  archived:  'בארכיון',
};

const STATUS_CLASS: Record<string, string> = {
  open:      'badge-success',
  closed:    'badge-neutral',
  suspended: 'badge-warning',
  archived:  'badge-neutral',
};

const TYPE_LABELS: Record<string, string> = {
  civil:          'אזרחי',
  criminal:       'פלילי',
  family:         'משפחה',
  labour:         'עבודה',
  administrative: 'מנהלי',
};

export function CasesPage() {
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError } = useCases(page, 50);
  const items = (data?.items ?? []) as Record<string, unknown>[];
  const total = data?.total ?? 0;

  const filtered = search.trim()
    ? items.filter((c) => {
        const q = search.toLowerCase();
        return (
          String(c['titleHe'] ?? '').toLowerCase().includes(q) ||
          String(c['caseNumber'] ?? '').toLowerCase().includes(q)
        );
      })
    : items;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-serif font-bold text-parchment">תיקים</h1>
          <p className="text-parchment/50 text-sm mt-1">
            {total > 0 ? `${total} תיקים במאגר` : 'ניהול תיקים משפטיים ומסמכיהם'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded bg-gold text-navy
                     font-semibold text-sm hover:bg-gold/90 transition-colors"
        >
          <PlusIcon size={16} weight="bold" />
          תיק חדש
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-parchment/40 pointer-events-none"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם תיק או מספר…"
          className="form-input pr-9 w-full"
          dir="rtl"
        />
      </div>

      {/* Table */}
      <div className="bg-navy-100 border border-parchment/10 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-2.5
                        border-b border-parchment/10 text-parchment/50 text-xs font-medium">
          <span>כותרת / מספר</span>
          <span>סוג</span>
          <span>בית משפט</span>
          <span>תאריך פתיחה</span>
          <span>סטטוס</span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-parchment/40 text-sm">טוען…</div>
        )}

        {isError && (
          <div className="flex items-center justify-center py-12 text-red-400 text-sm">שגיאה בטעינת הנתונים</div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-parchment/30 gap-3">
            <GavelIcon size={40} weight="thin" />
            <span className="text-sm">
              {search ? `אין תוצאות עבור "${search}"` : 'אין תיקים לתצוגה'}
            </span>
          </div>
        )}

        {filtered.map((cs) => (
          <Link
            key={cs['id'] as number}
            to={`/cases/${cs['id'] as number}`}
            className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3
                       border-b border-parchment/5 last:border-b-0
                       hover:bg-parchment/5 transition-colors items-center"
          >
            <div className="min-w-0">
              <p className="text-parchment text-sm font-medium truncate">{cs['titleHe'] as string}</p>
              <p className="text-parchment/40 text-xs font-mono">{cs['caseNumber'] as string}</p>
            </div>
            <span className="text-parchment/60 text-sm">
              {TYPE_LABELS[cs['caseType'] as string] ?? String(cs['caseType'])}
            </span>
            <span className="text-parchment/60 text-sm truncate">
              {(cs['courtName'] as string | null) ?? '—'}
            </span>
            <span className="text-parchment/60 text-sm">
              {(cs['openedDate'] as string | null) ?? '—'}
            </span>
            <span className={`badge ${STATUS_CLASS[cs['status'] as string] ?? 'badge-neutral'} w-fit`}>
              {STATUS_LABELS[cs['status'] as string] ?? String(cs['status'])}
            </span>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded border border-parchment/20 text-parchment/60 hover:text-parchment disabled:opacity-40 text-sm"
          >
            הקודם
          </button>
          <span className="text-parchment/40 text-sm">עמוד {page} מתוך {Math.ceil(total / 50)}</span>
          <button
            disabled={page >= Math.ceil(total / 50)}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded border border-parchment/20 text-parchment/60 hover:text-parchment disabled:opacity-40 text-sm"
          >
            הבא
          </button>
        </div>
      )}

      {showForm && <NewCaseWizard onClose={() => setShowForm(false)} />}
    </div>
  );
}
