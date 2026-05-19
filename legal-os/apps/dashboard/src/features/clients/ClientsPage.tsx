import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UsersIcon, MagnifyingGlassIcon, UserPlusIcon } from '@phosphor-icons/react';
import { useClients } from '@/api/hooks.js';
import { ClientForm } from './ClientForm.js';

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('');
}

export function ClientsPage() {
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError } = useClients(page, 50);
  const items = (data?.items ?? []) as Record<string, unknown>[];
  const total = data?.total ?? 0;

  const filtered = search.trim()
    ? items.filter((c) => {
        const q = search.toLowerCase();
        return (
          String(c['nameHe'] ?? '').toLowerCase().includes(q) ||
          String(c['idNumber'] ?? '').includes(q) ||
          String(c['phone'] ?? '').includes(q)
        );
      })
    : items;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-serif font-bold text-parchment">לקוחות</h1>
          <p className="text-parchment/50 text-sm mt-1">
            {total > 0 ? `${total} לקוחות במאגר` : 'ניהול רשומות לקוחות ותיקיהם'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded bg-gold text-navy
                     font-semibold text-sm hover:bg-gold/90 transition-colors"
        >
          <UserPlusIcon size={16} weight="bold" />
          לקוח חדש
        </button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <MagnifyingGlassIcon
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-parchment/40 pointer-events-none"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם, ת.ז. או טלפון…"
          className="form-input pr-9 w-full"
          dir="rtl"
        />
      </div>

      {/* Table */}
      <div className="bg-navy-100 border border-parchment/10 rounded-lg overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-4 py-2.5
                        border-b border-parchment/10 text-parchment/50 text-xs font-medium">
          <span>שם</span>
          <span>מספר ת.ז.</span>
          <span>טלפון</span>
          <span>תיקים פעילים</span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-parchment/40 text-sm">
            טוען…
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center py-12 text-red-400 text-sm">
            שגיאה בטעינת הנתונים
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-parchment/30 gap-3">
            <UsersIcon size={40} weight="thin" />
            <span className="text-sm">
              {search ? `אין תוצאות עבור "${search}"` : 'אין לקוחות לתצוגה'}
            </span>
          </div>
        )}

        {filtered.map((client) => (
          <Link
            key={client['id'] as number}
            to={`/clients/${client['id'] as number}`}
            className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-4 py-3
                       border-b border-parchment/5 last:border-b-0
                       hover:bg-parchment/5 transition-colors items-center"
          >
            {/* Name + avatar */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center
                              text-gold font-serif font-bold text-sm shrink-0">
                {initials(client['nameHe'] as string)}
              </div>
              <div className="min-w-0">
                <p className="text-parchment text-sm font-medium truncate">{client['nameHe'] as string}</p>
                {!!client['nameEn'] && (
                  <p className="text-parchment/40 text-xs truncate">{client['nameEn'] as string}</p>
                )}
              </div>
            </div>

            <span className="text-parchment/70 text-sm font-mono">
              {(client['idNumber'] as string | null) ?? '—'}
            </span>
            <span className="text-parchment/70 text-sm">
              {(client['phone'] as string | null) ?? '—'}
            </span>
            <span className="text-parchment/50 text-sm">—</span>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded border border-parchment/20 text-parchment/60
                       hover:text-parchment disabled:opacity-40 text-sm"
          >
            הקודם
          </button>
          <span className="text-parchment/40 text-sm">עמוד {page} מתוך {Math.ceil(total / 50)}</span>
          <button
            disabled={page >= Math.ceil(total / 50)}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded border border-parchment/20 text-parchment/60
                       hover:text-parchment disabled:opacity-40 text-sm"
          >
            הבא
          </button>
        </div>
      )}

      {showForm && <ClientForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
