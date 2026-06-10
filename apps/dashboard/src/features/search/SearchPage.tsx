import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MagnifyingGlassIcon, SpinnerGapIcon, WarningCircleIcon, PlusCircleIcon } from '@phosphor-icons/react';
import { useSearch, useAddToShelf, useCreateDraft } from '@/api/hooks.js';
import type { SearchHit } from '@/api/hooks.js';
import { useUIStore } from '@/store/index.js';
import {
  ENTITY_META,
  type SearchEntityType,
  resultHref,
  resultSub,
  groupHits,
  countByType,
  canSendToShelf,
  Highlight,
} from './shared.js';

type Filter = 'all' | SearchEntityType;

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'all',         label: 'הכל'     },
  { key: 'client',      label: 'לקוחות'  },
  { key: 'case',        label: 'תיקים'   },
  { key: 'document',    label: 'מסמכים'  },
  { key: 'legislation', label: 'חקיקה'   },
  { key: 'draft',       label: 'טיוטות'  },
  { key: 'precedent',   label: 'תקדימים' },
];

export function SearchPage() {
  const navigate     = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery]   = useState(params.get('q') ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const { selectedDraftId, selectDraft } = useUIStore();
  const addToShelf  = useAddToShelf();
  const createDraft = useCreateDraft();

  // Keep the URL ?q= in sync so searches are shareable / back-navigable.
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (query !== current) {
      const next = new URLSearchParams(params);
      if (query.trim()) next.set('q', query);
      else next.delete('q');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const trimmed = query.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 2;
  const { data, isFetching, isError, error } = useSearch(query);

  const allHits: SearchHit[] = useMemo(() => data ?? [], [data]);
  const hits = useMemo(
    () => (filter === 'all' ? allHits : allHits.filter((h) => h.entityType === filter)),
    [allHits, filter],
  );
  const groups = useMemo(() => groupHits(hits), [hits]);

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-xl font-serif font-bold text-parchment">חיפוש</h1>
        <p className="text-parchment/50 text-sm mt-1">חיפוש טקסט מלא במסמכים, לקוחות ותיקים</p>
      </div>

      {/* Search input */}
      <div className="relative">
        <MagnifyingGlassIcon
          size={18}
          className="absolute top-1/2 -translate-y-1/2 right-3 text-parchment/40 pointer-events-none"
        />
        <input
          type="search"
          placeholder="הקלד לחיפוש…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          className="w-full bg-navy-100 border border-parchment/20 rounded-lg
                     pr-10 pl-4 py-2.5 text-parchment placeholder-parchment/40
                     text-sm outline-none focus:border-gold/50 transition-colors"
          dir="rtl"
        />
        {isFetching && (
          <SpinnerGapIcon
            size={18}
            className="absolute top-1/2 -translate-y-1/2 left-3 text-gold animate-spin"
          />
        )}
      </div>

      {/* Filter pills */}
      {allHits.length > 0 && (
        <div className="flex gap-1.5">
          {FILTER_TABS.map(({ key, label }) => {
            const count = key === 'all' ? allHits.length : countByType(allHits, key);
            if (key !== 'all' && count === 0) return null;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1 rounded-full text-xs transition-colors flex items-center gap-1.5
                  ${filter === key
                    ? 'bg-gold/20 text-gold border border-gold/30'
                    : 'text-parchment/50 hover:text-parchment border border-parchment/15'}`}
              >
                {label}
                <span className={filter === key ? 'text-gold/60' : 'text-parchment/30'}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Results */}
      {trimmed.length === 0 ? (
        <EmptyHint icon="search" text="הזן מונח לחיפוש" />
      ) : tooShort ? (
        <EmptyHint icon="search" text="הקלד לפחות 2 תווים לחיפוש" />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 text-red-400/70 gap-3">
          <WarningCircleIcon size={40} weight="thin" />
          <span className="text-sm">החיפוש נכשל — {error instanceof Error ? error.message : 'שגיאה'}</span>
        </div>
      ) : isFetching && allHits.length === 0 ? (
        <EmptyHint icon="spinner" text="מחפש…" />
      ) : hits.length === 0 ? (
        <EmptyHint icon="search" text={`אין תוצאות עבור “${trimmed}”`} />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            const meta = ENTITY_META[group.type];
            const { Icon } = meta;
            return (
              <section key={group.type}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon size={14} className={meta.accent} weight="duotone" />
                  <h2 className="text-[11px] font-semibold uppercase tracking-widest text-parchment/40">
                    {meta.label}
                  </h2>
                  <span className="text-parchment/25 text-[11px]">{group.items.length}</span>
                </div>
                <ul className="space-y-1.5">
                  {group.items.map((hit) => {
                    const shelfHandler = canSendToShelf(hit.entityType) ? () => {
                      const doSend = (draftId: number) => {
                        addToShelf.mutate({
                          draftId,
                          shelfType: hit.entityType === 'legislation' ? 'legislation'
                                   : hit.entityType === 'precedent'   ? 'precedent'
                                   : 'document',
                          title: hit.title,
                          ...(hit.snippet ? { contentHe: hit.snippet } : {}),
                        });
                      };
                      if (selectedDraftId) {
                        doSend(selectedDraftId);
                      } else {
                        createDraft.mutate({ title: 'טיוטה חדשה' }, {
                          onSuccess: (d) => { selectDraft(d.id); doSend(d.id); navigate(`/drafting/${d.id}`); },
                        });
                      }
                    } : undefined;
                    return (
                      <li key={`${hit.entityType}-${hit.id}`}>
                        <ResultCard
                          hit={hit}
                          query={trimmed}
                          onClick={() => navigate(resultHref(hit))}
                          {...(shelfHandler ? { onSendToShelf: shelfHandler } : {})}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyHint({ icon, text }: { icon: 'search' | 'spinner'; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-parchment/30 gap-3">
      {icon === 'spinner' ? (
        <SpinnerGapIcon size={36} className="text-gold animate-spin" />
      ) : (
        <MagnifyingGlassIcon size={40} weight="thin" />
      )}
      <span className="text-sm">{text}</span>
    </div>
  );
}

function ResultCard({ hit, query, onClick, onSendToShelf }: { hit: SearchHit; query: string; onClick: () => void; onSendToShelf?: () => void }) {
  const meta = ENTITY_META[hit.entityType];
  const { Icon } = meta;
  const sub = resultSub(hit);
  return (
    <div className="w-full text-right flex items-start gap-3 bg-navy-100 border border-parchment/10 rounded-lg px-4 py-3 hover:border-gold/40 hover:bg-navy-100/70 transition-colors">
      <button onClick={onClick} className="flex-1 flex items-start gap-3 text-right min-w-0">
        <Icon size={18} className={`${meta.accent} shrink-0 mt-0.5`} weight="duotone" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-parchment text-sm font-medium truncate">
              <Highlight text={hit.title} query={query} />
            </span>
            <span className={meta.badgeCls}>{meta.badge}</span>
          </div>
          {sub && (
            <p className="text-parchment/40 text-xs mt-0.5 truncate" dir="rtl">
              <Highlight text={sub} query={query} />
            </p>
          )}
        </div>
      </button>
      {onSendToShelf && (
        <button
          onClick={(e) => { e.stopPropagation(); onSendToShelf(); }}
          className="shrink-0 flex items-center gap-1 text-[11px] px-2 py-1 text-gold bg-gold/10 border border-gold/20 rounded hover:bg-gold/20 transition-colors mt-0.5"
          title="שלח למדף"
        >
          <PlusCircleIcon size={11} />
          מדף
        </button>
      )}
    </div>
  );
}
