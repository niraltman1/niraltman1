import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { useUIStore } from '@/store/index.js';
import { useSearch } from '@/api/hooks.js';
import type { SearchHit } from '@/api/hooks.js';
import { matchCommands, type Command } from '@/commands/command-registry.js';
import {
  ENTITY_META,
  type SearchEntityType,
  resultHref,
  resultSub,
  groupHits,
  countByType,
  Highlight,
} from '@/features/search/shared.js';

type Selectable =
  | { kind: 'command'; command: Command }
  | { kind: 'hit'; hit: SearchHit };

interface Props {
  onClose: () => void;
}

type Filter = 'all' | SearchEntityType;

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'all',      label: 'הכל'    },
  { key: 'client',   label: 'לקוחות' },
  { key: 'case',     label: 'תיקים'  },
  { key: 'document', label: 'מסמכים' },
];

export function SpotlightSearch({ onClose }: Props) {
  const navigate    = useNavigate();
  const { spotlight, setSpotlightQuery } = useUIStore();
  const inputRef    = useRef<HTMLInputElement>(null);
  const listRef     = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [cursor, setCursor] = useState(0);

  const { data: rawResults } = useSearch(spotlight.query);
  const allHits = useMemo<SearchHit[]>(() => rawResults ?? [], [rawResults]);

  const hits = useMemo(
    () => (filter === 'all' ? allHits : allHits.filter((h) => h.entityType === filter)),
    [allHits, filter],
  );

  // Grouped sections (only in the unfiltered "all" view).
  const groups = useMemo(() => (filter === 'all' ? groupHits(hits) : null), [hits, filter]);

  // Matching commands (§4.6.4) — only in the unfiltered "all" view.
  const commandMatches = useMemo<Command[]>(
    () => (filter === 'all' ? matchCommands(spotlight.query) : []),
    [spotlight.query, filter],
  );
  const commandCount = commandMatches.length;

  // Flat list of search hits (grouped order when filter=all).
  const hitList = useMemo(
    () => (groups ? groups.flatMap((g) => g.items) : hits),
    [groups, hits],
  );

  // Unified selectable list (commands first, then hits) for keyboard navigation.
  const selectables = useMemo<Selectable[]>(
    () => [
      ...commandMatches.map((command) => ({ kind: 'command' as const, command })),
      ...hitList.map((hit) => ({ kind: 'hit' as const, hit })),
    ],
    [commandMatches, hitList],
  );

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setCursor(0); }, [spotlight.query, filter]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const activate = useCallback((sel: Selectable) => {
    if (sel.kind === 'command') sel.command.perform({ navigate });
    else navigate(resultHref(sel.hit));
    onClose();
  }, [navigate, onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, selectables.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
        return;
      }
      if (e.key === 'Enter' && selectables[cursor]) {
        activate(selectables[cursor]!);
        return;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, selectables, cursor, activate]);

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
            placeholder="חיפוש מסמכים, לקוחות, תיקים… או פקודה (צור תיק/לקוח/משימה)"
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
              const count = key === 'all' ? allHits.length : countByType(allHits, key);
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
          {/* Commands section (§4.6.4) — always shown when matches exist */}
          {commandCount > 0 && (
            <div>
              <div className="flex items-center gap-2 px-4 py-1.5 sticky top-0 bg-navy/90 backdrop-blur-sm border-b border-parchment/5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-parchment/30">
                  פקודות
                </span>
                <span className="text-parchment/20 text-[10px] mr-auto">{commandCount}</span>
              </div>
              <ul>
                {commandMatches.map((command, i) => (
                  <li key={command.id}>
                    <CommandRow
                      command={command} idx={i} cursor={cursor}
                      onHover={() => setCursor(i)}
                      onClick={() => activate({ kind: 'command', command })}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tooShort ? (
            commandCount > 0 ? null : (
              <div className="flex flex-col items-center justify-center py-10 text-parchment/25 text-sm gap-2">
                <MagnifyingGlassIcon size={28} weight="thin" />
                <span>הקלד לפחות 2 תווים לחיפוש</span>
              </div>
            )
          ) : hitList.length === 0 ? (
            commandCount > 0 ? null : (
              <div className="py-10 text-center text-parchment/35 text-sm">
                אין תוצאות עבור &ldquo;{query}&rdquo;
              </div>
            )
          ) : filter !== 'all' ? (
            // ── Flat list (filtered mode) ───────────────────────
            <ul>
              {hits.map((hit, i) => {
                const flatIdx = commandCount + i;
                return (
                  <li key={`${hit.entityType}-${hit.id}`}>
                    <ResultRow
                      hit={hit} query={query}
                      idx={flatIdx} cursor={cursor}
                      onHover={() => setCursor(flatIdx)}
                      onClick={() => activate({ kind: 'hit', hit })}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            // ── Grouped mode ────────────────────────────────────
            groups!.map((group) => {
              const meta = ENTITY_META[group.type];
              const { Icon } = meta;
              const offset = commandCount + groups!
                .slice(0, groups!.indexOf(group))
                .reduce((acc, g) => acc + g.items.length, 0);
              return (
                <div key={group.type}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-4 py-1.5 sticky top-0 bg-navy/90 backdrop-blur-sm
                                  border-b border-parchment/5">
                    <Icon size={13} className={`${meta.accent} shrink-0`} weight="duotone" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-parchment/30">
                      {meta.label}
                    </span>
                    <span className="text-parchment/20 text-[10px] mr-auto">{group.items.length}</span>
                  </div>
                  <ul>
                    {group.items.map((hit, i) => {
                      const flatIdx = offset + i;
                      return (
                        <li key={`${group.type}-${hit.id}`}>
                          <ResultRow
                            hit={hit} query={query}
                            idx={flatIdx} cursor={cursor}
                            onHover={() => setCursor(flatIdx)}
                            onClick={() => activate({ kind: 'hit', hit })}
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
          {selectables.length > 0 && (
            <span className="mr-auto">{selectables.length} תוצאות</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Command row component ─────────────────────────────────────────────────────
interface CommandRowProps {
  command: Command;
  idx:     number;
  cursor:  number;
  onHover: () => void;
  onClick: () => void;
}

function CommandRow({ command, idx, cursor, onHover, onClick }: CommandRowProps) {
  const { Icon } = command;
  return (
    <button
      data-idx={idx}
      onClick={onClick}
      onMouseEnter={onHover}
      className={`w-full text-right flex items-center gap-3 px-4 py-2.5 transition-colors
        ${idx === cursor ? 'bg-gold/10' : 'hover:bg-parchment/5'}`}
    >
      <Icon size={15} className="text-gold shrink-0" weight="duotone" />
      <span className="flex-1 text-parchment text-sm font-medium">{command.labelHe}</span>
      <span className="badge badge-gold text-[10px]">פעולה</span>
      {idx === cursor && (
        <span className="text-parchment/20 text-xs shrink-0">↵</span>
      )}
    </button>
  );
}

// ── Result row component ──────────────────────────────────────────────────────
interface RowProps {
  hit:     SearchHit;
  query:   string;
  idx:     number;
  cursor:  number;
  onHover: () => void;
  onClick: () => void;
}

function ResultRow({ hit, query, idx, cursor, onHover, onClick }: RowProps) {
  const meta = ENTITY_META[hit.entityType];
  const { Icon } = meta;
  const sub = resultSub(hit);
  return (
    <button
      data-idx={idx}
      onClick={onClick}
      onMouseEnter={onHover}
      className={`w-full text-right flex items-start gap-3 px-4 py-2.5 transition-colors
        ${idx === cursor ? 'bg-gold/10' : 'hover:bg-parchment/5'}`}
    >
      <div className="mt-0.5">
        <Icon size={13} className={`${meta.accent} shrink-0`} weight="duotone" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-parchment text-sm font-medium truncate">
            <Highlight text={hit.title} query={query} />
          </span>
          <span className={meta.badgeCls}>{meta.badge}</span>
        </div>
        {sub && (
          <p className="text-parchment/35 text-xs mt-0.5 truncate" dir="rtl">
            <Highlight text={sub} query={query} />
          </p>
        )}
      </div>
      {idx === cursor && (
        <span className="text-parchment/20 text-xs mt-0.5 shrink-0">↵</span>
      )}
    </button>
  );
}
