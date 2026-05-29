import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, XIcon, FileTextIcon, UsersIcon, GavelIcon } from '@phosphor-icons/react';
import type { IconWeight } from '@phosphor-icons/react';
import { useUIStore } from '@/store/index.js';
import { useSearch } from '@/api/hooks.js';

interface Props {
  onClose: () => void;
}

type EntityFilter = 'all' | 'clients' | 'cases' | 'documents';

const FILTER_TABS: { key: EntityFilter; label: string }[] = [
  { key: 'all',       label: 'הכל'     },
  { key: 'clients',   label: 'לקוחות'  },
  { key: 'cases',     label: 'תיקים'   },
  { key: 'documents', label: 'מסמכים'  },
];

const GROUP_META: Record<string, { label: string; Icon: React.ComponentType<{ size?: number; className?: string; weight?: IconWeight }> }> = {
  client:   { label: 'לקוחות',  Icon: UsersIcon    },
  case:     { label: 'תיקים',   Icon: GavelIcon    },
  document: { label: 'מסמכים',  Icon: FileTextIcon },
};

function highlightSnippet(text: string, query: string, maxLen = 140): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx > 60) {
    text = '…' + text.slice(idx - 30);
  }
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function resultHref(hit: Record<string, unknown>): string {
  const type = hit['type'] as string;
  const id   = hit['id']   as number;
  if (type === 'client')   return `/clients/${id}`;
  if (type === 'case')     return `/cases/${id}`;
  if (type === 'document') return `/documents/${id}`;
  return '/dashboard';
}

function resultLabel(hit: Record<string, unknown>): string {
  return (
    (hit['nameHe']   as string | undefined) ??
    (hit['titleHe']  as string | undefined) ??
    (hit['filename'] as string | undefined) ??
    String(hit['id'])
  );
}

function resultSub(hit: Record<string, unknown>, query: string): string | null {
  const type = hit['type'] as string;
  if (type === 'document') {
    const snippet = (hit['ocrText'] as string | undefined) ?? (hit['ocr_text'] as string | undefined);
    return snippet ? highlightSnippet(snippet, query) : null;
  }
  return (hit['idNumber'] as string | null) ?? (hit['caseNumber'] as string | null) ?? null;
}

function badgeCls(type: string): string {
  if (type === 'client')   return 'badge badge-blue';
  if (type === 'case')     return 'badge badge-gold';
  return 'badge badge-neutral';
}

function badgeLabel(type: string): string {
  if (type === 'client')   return 'לקוח';
  if (type === 'case')     return 'תיק';
  return 'מסמך';
}

function GroupIcon({ type }: { type: string }) {
  const meta = GROUP_META[type];
  if (!meta) return null;
  const { Icon } = meta;
  const cls =
    type === 'client'   ? 'text-blue-400' :
    type === 'case'     ? 'text-gold' :
    'text-parchment/40';
  return <Icon size={13} className={`${cls} shrink-0`} weight="duotone" />;
}

export function SpotlightSearch({ onClose }: Props) {
  const navigate    = useNavigate();
  const { spotlight, setSpotlightQuery } = useUIStore();
  const inputRef    = useRef<HTMLInputElement>(null);
  const listRef     = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<EntityFilter>('all');
  const [cursor, setCursor] = useState(0);

  const { data: rawResults } = useSearch(spotlight.query);
  const allHits = useMemo(() => (rawResults ?? []) as Record<string, unknown>[], [rawResults]);

  const hits = useMemo(() => {
    if (filter === 'all') return allHits;
    return allHits.filter((h) => {
      const t = h['type'] as string;
      if (filter === 'clients')   return t === 'client';
      if (filter === 'cases')     return t === 'case';
      if (filter === 'documents') return t === 'document';
      return true;
    });
  }, [allHits, filter]);

  // Flat index → grouped sections (only when filter=all)
  const groups = useMemo(() => {
    if (filter !== 'all') return null;
    const map = new Map<string, Record<string, unknown>[]>();
    for (const h of hits) {
      const t = h['type'] as string;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(h);
    }
    // Deterministic order: clients → cases → documents
    const order = ['client', 'case', 'document'];
    return order.flatMap((type) => {
      const items = map.get(type);
      return items ? [{ type, items }] : [];
    });
  }, [hits, filter]);

  // Build flat list for keyboard navigation
  const flatList = useMemo(() => {
    if (!groups) return hits;
    return groups.flatMap((g) => g.items);
  }, [groups, hits]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setCursor(0); }, [spotlight.query, filter]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const navigateTo = useCallback((hit: Record<string, unknown>) => {
    navigate(resultHref(hit));
    onClose();
  }, [navigate, onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, flatList.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
        return;
      }
      if (e.key === 'Enter' && flatList[cursor]) {
        navigateTo(flatList[cursor]!);
        return;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, flatList, cursor, navigateTo]);

  const query = spotlight.query;
  const tooShort = query.trim().length < 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-navy/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="חיפוש מהיר"
    >
      <div className="w-full max-w-2xl bg-navy-100 border border-parchment/20 rounded-xl shadow-2xl overflow-hidden">

        {/* ── Search input ──────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-parchment/10">
          <MagnifyingGlassIcon size={20} className="text-parchment/40 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            placeholder="חיפוש מסמכים, לקוחות, תיקים…"
            value={query}
            onChange={(e) => setSpotlightQuery(e.target.value)}
            className="flex-1 bg-transparent text-parchment placeholder-parchment/30 text-base outline-none"
            dir="rtl"
            autoComplete="off"
          />
          {query && (
            <button
              onClick={() => setSpotlightQuery('')}
              className="text-parchment/30 hover:text-parchment/60 transition-colors"
              aria-label="נקה"
            >
              <XIcon size={16} />
            </button>
          )}
        </div>

        {/* ── Filter pills ──────────────────────────────────────── */}
        {!tooShort && (
          <div className="flex gap-1 px-4 py-2 border-b border-parchment/10">
            {FILTER_TABS.map(({ key, label }) => {
              const count =
                key === 'all' ? allHits.length :
                key === 'clients'   ? allHits.filter((h) => h['type'] === 'client').length :
                key === 'cases'     ? allHits.filter((h) => h['type'] === 'case').length :
                allHits.filter((h) => h['type'] === 'document').length;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-2.5 py-0.5 rounded-full text-xs transition-colors flex items-center gap-1
                    ${filter === key
                      ? 'bg-gold/20 text-gold border border-gold/30'
                      : 'text-parchment/40 hover:text-parchment border border-transparent'}`}
                >
                  {label}
                  {count > 0 && (
                    <span className={filter === key ? 'text-gold/60' : 'text-parchment/25'}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Results ───────────────────────────────────────────── */}
        <div ref={listRef} className="min-h-[100px] max-h-[440px] overflow-y-auto overscroll-contain">
          {tooShort ? (
            <div className="flex flex-col items-center justify-center py-10 text-parchment/25 text-sm gap-2">
              <MagnifyingGlassIcon size={28} weight="thin" />
              <span>הקלד לפחות 2 תווים לחיפוש</span>
            </div>
          ) : flatList.length === 0 ? (
            <div className="py-10 text-center text-parchment/35 text-sm">
              אין תוצאות עבור &ldquo;{query}&rdquo;
            </div>
          ) : filter !== 'all' ? (
            // ── Flat list (filtered mode) ───────────────────────
            <ul>
              {hits.map((hit, i) => {
                const type = hit['type'] as string;
                const label = resultLabel(hit);
                const sub   = resultSub(hit, query);
                return (
                  <li key={`${type}-${hit['id'] as number}`}>
                    <ResultRow
                      hit={hit} type={type} label={label} sub={sub}
                      idx={i} cursor={cursor}
                      onHover={() => setCursor(i)}
                      onClick={() => navigateTo(hit)}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            // ── Grouped mode ────────────────────────────────────
            groups!.map((group) => {
              const meta = GROUP_META[group.type]!;
              const offset = groups!
                .slice(0, groups!.indexOf(group))
                .reduce((acc, g) => acc + g.items.length, 0);
              return (
                <div key={group.type}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-4 py-1.5 sticky top-0 bg-navy/90 backdrop-blur-sm
                                  border-b border-parchment/5">
                    <GroupIcon type={group.type} />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-parchment/30">
                      {meta.label}
                    </span>
                    <span className="text-parchment/20 text-[10px] mr-auto">{group.items.length}</span>
                  </div>
                  <ul>
                    {group.items.map((hit, i) => {
                      const flatIdx = offset + i;
                      return (
                        <li key={`${group.type}-${hit['id'] as number}`}>
                          <ResultRow
                            hit={hit} type={group.type}
                            label={resultLabel(hit)}
                            sub={resultSub(hit, query)}
                            idx={flatIdx} cursor={cursor}
                            onHover={() => setCursor(flatIdx)}
                            onClick={() => navigateTo(hit)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────── */}
        <div className="flex gap-4 px-4 py-2 border-t border-parchment/10 text-parchment/25 text-[11px]">
          <span><kbd className="kbd">↵</kbd> פתח</span>
          <span><kbd className="kbd">↑↓</kbd> נווט</span>
          <span><kbd className="kbd">Esc</kbd> סגור</span>
          {flatList.length > 0 && (
            <span className="mr-auto">{flatList.length} תוצאות</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Result row component ──────────────────────────────────────────────────────
interface RowProps {
  hit:     Record<string, unknown>;
  type:    string;
  label:   string;
  sub:     string | null;
  idx:     number;
  cursor:  number;
  onHover: () => void;
  onClick: () => void;
}

function ResultRow({ hit, type, label, sub, idx, cursor, onHover, onClick }: RowProps) {
  return (
    <button
      data-idx={idx}
      onClick={onClick}
      onMouseEnter={onHover}
      className={`w-full text-right flex items-start gap-3 px-4 py-2.5 transition-colors
        ${idx === cursor ? 'bg-gold/10' : 'hover:bg-parchment/5'}`}
    >
      <div className="mt-0.5">
        <GroupIcon type={type} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-parchment text-sm font-medium truncate">{label}</span>
          <span className={badgeCls(type)}>{badgeLabel(type)}</span>
          {(hit['idNumber'] as string | null) && type === 'client' && (
            <span className="text-parchment/30 text-xs">{hit['idNumber'] as string}</span>
          )}
        </div>
        {sub && (
          <p className="text-parchment/35 text-xs mt-0.5 truncate" dir="rtl">{sub}</p>
        )}
      </div>
      {idx === cursor && (
        <span className="text-parchment/20 text-xs mt-0.5 shrink-0">↵</span>
      )}
    </button>
  );
}
