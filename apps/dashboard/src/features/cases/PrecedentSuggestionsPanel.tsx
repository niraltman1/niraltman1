import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GavelIcon, CircleNotchIcon, ArrowSquareOutIcon, CaretDownIcon } from '@phosphor-icons/react';
import { useVerdictSearch, type VerdictSearchHit } from '@/api/hooks.js';

interface Props {
  caseTitle: string;
}

function SuggestionRow({ hit }: { hit: VerdictSearchHit }) {
  return (
    <div className="py-2 border-b border-parchment/5 last:border-0 space-y-0.5" dir="rtl">
      <div className="flex items-start justify-between gap-2">
        <span className="text-parchment/80 text-xs leading-snug line-clamp-2 text-right">
          {hit.caseName ?? hit.caseNumber ?? 'פסק דין'}
        </span>
        <Link
          to={`/supreme-court`}
          className="shrink-0 text-parchment/30 hover:text-gold transition-colors"
          title="פתח בחיפוש פסיקה"
        >
          <ArrowSquareOutIcon size={11} />
        </Link>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-parchment/35">
        {hit.court && <span>{hit.court}</span>}
        {hit.year && <span className="font-mono">{hit.year}</span>}
        {hit.caseNumber && <span className="font-mono truncate">{hit.caseNumber}</span>}
      </div>
      {hit.snippet && (
        <p className="text-parchment/40 text-[10px] leading-relaxed line-clamp-2 text-right">
          {hit.snippet.replace(/\[|\]/g, '')}
        </p>
      )}
    </div>
  );
}

export function PrecedentSuggestionsPanel({ caseTitle }: Props) {
  const [open, setOpen] = useState(false);

  // Extract meaningful keywords from case title (remove short particles)
  const query = caseTitle
    .replace(/[^֐-׿a-zA-Z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4)
    .join(' ');

  const enabled = open && query.trim().length >= 2;
  const { data: hits, isFetching } = useVerdictSearch(enabled ? query : '', undefined);

  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-xl">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-3 text-left"
        dir="rtl"
      >
        <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5">
          <GavelIcon size={11} className="text-gold" />
          פסיקה רלוונטית
        </h2>
        <CaretDownIcon
          size={12}
          className={`text-parchment/30 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-3">
          {isFetching && (
            <div className="flex items-center justify-center py-4">
              <CircleNotchIcon size={16} className="animate-spin text-gold" />
            </div>
          )}
          {!isFetching && (hits?.length ?? 0) === 0 && query.trim().length >= 2 && (
            <p className="text-parchment/30 text-xs text-center py-4">לא נמצאה פסיקה רלוונטית</p>
          )}
          {!isFetching && query.trim().length < 2 && (
            <p className="text-parchment/30 text-xs text-center py-4">אין מספיק מידע לחיפוש</p>
          )}
          {!isFetching && (hits?.length ?? 0) > 0 && (
            <>
              {hits!.slice(0, 5).map((h) => (
                <SuggestionRow key={h.docKey} hit={h} />
              ))}
              <div className="pt-2">
                <Link
                  to={`/supreme-court`}
                  className="text-gold text-[11px] hover:underline flex items-center gap-1"
                  dir="rtl"
                >
                  <ArrowSquareOutIcon size={11} />
                  חפש עוד פסיקה
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
