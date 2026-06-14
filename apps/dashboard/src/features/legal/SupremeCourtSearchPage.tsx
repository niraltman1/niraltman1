import { useState, useCallback } from 'react';
import {
  MagnifyingGlassIcon, GavelIcon, CalendarBlankIcon,
  UserIcon, CircleNotchIcon, WarningIcon, CopyIcon, ArrowSquareOutIcon,
} from '@phosphor-icons/react';
import {
  useVerdictCorpus, useVerdictSearch, useVerdictDetail,
  type VerdictSearchHit,
} from '@/api/hooks.js';

const COURT_OPTIONS = [
  { value: '',        label: 'כל הערכאות' },
  { value: 'עליון',   label: 'בית המשפט העליון' },
  { value: 'מחוזי',   label: 'בית משפט מחוזי' },
  { value: 'שלום',    label: 'בית משפט השלום' },
  { value: 'עבודה',   label: 'בית הדין לעבודה' },
  { value: 'משפחה',   label: 'בית משפט לענייני משפחה' },
];

function StatsBar({ stats }: { stats: { verdicts: number; embedded: number; courts: number } }) {
  return (
    <div className="flex items-center gap-4 text-parchment/40 text-[11px] font-mono">
      <span>{stats.verdicts.toLocaleString('he-IL')} פסקי דין</span>
      <span className="text-parchment/15">·</span>
      <span>{stats.courts} ערכאות</span>
      {stats.embedded > 0 && (
        <>
          <span className="text-parchment/15">·</span>
          <span>{stats.embedded.toLocaleString('he-IL')} עם וקטורים</span>
        </>
      )}
    </div>
  );
}

function VerdictListItem({
  hit,
  isSelected,
  onSelect,
}: {
  hit:        VerdictSearchHit;
  isSelected: boolean;
  onSelect:   () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-right p-3 rounded-lg border transition-colors text-xs space-y-1.5 ${
        isSelected
          ? 'bg-gold/10 border-gold/30 text-parchment'
          : 'bg-navy-900/30 border-parchment/10 text-parchment/80 hover:border-parchment/25 hover:bg-navy-900/50'
      }`}
      dir="rtl"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium leading-snug line-clamp-2 text-right">
          {hit.caseName ?? hit.caseNumber ?? 'פסק דין ללא שם'}
        </span>
        {hit.year && (
          <span className="text-parchment/35 font-mono shrink-0 mt-0.5">{hit.year}</span>
        )}
      </div>
      {hit.caseNumber && hit.caseName && (
        <div className="text-parchment/40 font-mono text-[10px]">{hit.caseNumber}</div>
      )}
      {hit.court && (
        <div className="flex items-center gap-1 text-parchment/40">
          <GavelIcon size={10} />
          <span>{hit.court}</span>
        </div>
      )}
      {hit.snippet && (
        <p className="text-parchment/50 text-[10px] leading-relaxed line-clamp-2 text-right">
          {hit.snippet.replace(/\[|\]/g, '')}
        </p>
      )}
    </button>
  );
}

function VerdictDetailPanel({ docKey }: { docKey: string }) {
  const { data: verdict, isLoading, error } = useVerdictDetail(docKey);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!verdict) return;
    const cite = verdict.caseNumber ?? verdict.caseName ?? '';
    navigator.clipboard.writeText(cite).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [verdict]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <CircleNotchIcon size={24} className="animate-spin text-gold" />
      </div>
    );
  }
  if (error || !verdict) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-parchment/40" dir="rtl">
        <WarningIcon size={28} />
        <p className="text-xs">פסק הדין לא נמצא</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* Header */}
      <div className="p-4 border-b border-parchment/10 space-y-2 shrink-0">
        <h2 className="font-serif font-bold text-parchment text-sm leading-snug">
          {verdict.caseName ?? verdict.caseNumber ?? 'פסק דין'}
        </h2>
        {verdict.caseNumber && verdict.caseName && (
          <p className="text-parchment/40 font-mono text-[11px]">{verdict.caseNumber}</p>
        )}
        <div className="flex items-center gap-3 text-[11px] text-parchment/50 flex-wrap">
          {verdict.court && (
            <span className="flex items-center gap-1">
              <GavelIcon size={10} />
              {verdict.court}
            </span>
          )}
          {verdict.verdictDate && (
            <span className="flex items-center gap-1 font-mono">
              <CalendarBlankIcon size={10} />
              {verdict.verdictDate.slice(0, 10)}
            </span>
          )}
          {verdict.verdictType && <span>{verdict.verdictType}</span>}
        </div>
        {verdict.judges.length > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-parchment/40">
            <UserIcon size={10} />
            <span className="truncate">{verdict.judges.join(' · ')}</span>
          </div>
        )}
        {/* Provenance badge */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] bg-parchment/5 border border-parchment/10 rounded px-1.5 py-0.5 text-parchment/30 font-mono">
            {verdict.sourceDataset} · {verdict.snapshotLabel}
          </span>
          {verdict.sourceLicense && (
            <span className="text-[9px] text-parchment/20 font-mono">{verdict.sourceLicense}</span>
          )}
        </div>
        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] px-2 py-1 bg-gold/10 border border-gold/20 text-gold rounded hover:bg-gold/20 transition-colors"
          >
            <CopyIcon size={10} />
            {copied ? 'הועתק!' : 'העתק ציטוט'}
          </button>
          <span className="text-parchment/25 text-[10px] font-mono">
            {(verdict.charCount ?? verdict.verbatimText?.length ?? 0).toLocaleString('he-IL')} תווים
          </span>
        </div>
      </div>

      {/* Verbatim text */}
      <div className="flex-1 overflow-y-auto p-4">
        <pre className="text-parchment/75 text-[11px] leading-relaxed whitespace-pre-wrap font-sans text-right">
          {verdict.verbatimText}
        </pre>
      </div>
    </div>
  );
}

export function SupremeCourtSearchPage() {
  const [query, setQuery]           = useState('');
  const [court, setCourt]           = useState('');
  const [selectedDocKey, setSelected] = useState<string | null>(null);

  const { data: listData } = useVerdictCorpus({ limit: 10 });
  const { data: results, isFetching } = useVerdictSearch(query, court ? { court } : undefined);

  const displayHits: VerdictSearchHit[] =
    query.trim().length >= 2
      ? (results ?? [])
      : (listData?.verdicts ?? []).map((v) => ({
          id:          v.id,
          docKey:      v.docKey,
          caseNumber:  v.caseNumber,
          caseName:    v.caseName,
          court:       v.court,
          verdictType: v.verdictType,
          verdictDate: v.verdictDate,
          year:        v.year,
          snippet:     v.verbatimText.slice(0, 160),
        }));

  return (
    <div className="flex flex-col h-full" dir="rtl">

      {/* Page header */}
      <div className="p-4 border-b border-parchment/10 space-y-3 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <GavelIcon size={18} className="text-gold" />
            <h1 className="text-lg font-serif font-bold text-parchment">פסיקה ישראלית</h1>
          </div>
          {listData?.stats && <StatsBar stats={listData.stats} />}
        </div>

        {/* Search controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlassIcon
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-parchment/30"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="חפש בפסיקה ישראלית..."
              className="w-full bg-navy-900/50 border border-parchment/15 rounded-lg pr-9 pl-3 py-2 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-gold/40"
            />
          </div>
          <select
            value={court}
            onChange={(e) => { setCourt(e.target.value); setSelected(null); }}
            className="bg-navy-900/50 border border-parchment/15 rounded-lg px-3 py-2 text-sm text-parchment focus:outline-none focus:border-gold/40"
          >
            {COURT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {isFetching && <CircleNotchIcon size={14} className="animate-spin text-gold shrink-0" />}
        </div>
      </div>

      {/* Results + detail split */}
      <div className="flex flex-1 overflow-hidden">

        {/* Results list */}
        <div className="w-[340px] shrink-0 border-l border-parchment/10 overflow-y-auto p-3 space-y-2">
          {displayHits.length === 0 && query.trim().length >= 2 && !isFetching && (
            <div className="py-12 text-center">
              <p className="text-parchment/40 text-xs">לא נמצאו תוצאות עבור "{query}"</p>
            </div>
          )}
          {displayHits.length === 0 && query.trim().length < 2 && !listData && (
            <div className="py-12 text-center">
              <CircleNotchIcon size={20} className="animate-spin text-gold mx-auto" />
            </div>
          )}
          {displayHits.map((hit) => (
            <VerdictListItem
              key={hit.docKey}
              hit={hit}
              isSelected={selectedDocKey === hit.docKey}
              onSelect={() => setSelected(hit.docKey)}
            />
          ))}
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-hidden bg-navy-900/20">
          {selectedDocKey ? (
            <VerdictDetailPanel docKey={selectedDocKey} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-parchment/30" dir="rtl">
              <ArrowSquareOutIcon size={36} />
              <p className="text-sm">בחר פסק דין מהרשימה לצפייה בנוסח המלא</p>
              {query.trim().length < 2 && (
                <p className="text-xs text-parchment/20">
                  הקלד מילות חיפוש לחיפוש בפסיקה ישראלית
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
