import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GavelIcon, FileTextIcon, CheckCircleIcon, ArchiveIcon } from '@phosphor-icons/react';
import { useCitations, type CitationRecord } from '@/api/hooks.js';

type StatusFilter = 'all' | 'unresolved' | 'linked' | 'archived';

const STATUS_LABELS: Record<StatusFilter, string> = {
  all:        'הכל',
  unresolved: 'לא פוענח',
  linked:     'מקושר',
  archived:   'בארכיון',
};

const STATUS_COLORS: Record<CitationRecord['status'], string> = {
  unresolved: 'text-amber-400 bg-amber-900/30',
  linked:     'text-green-400 bg-green-900/30',
  archived:   'text-parchment/30 bg-parchment/5',
};

const STATUS_HEBREW: Record<CitationRecord['status'], string> = {
  unresolved: 'לא פוענח',
  linked:     'מקושר',
  archived:   'בארכיון',
};

export function CitationsPage() {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const { data, isLoading } = useCitations();

  const all = data?.rows ?? [];
  const rows = filter === 'all' ? all : all.filter((r) => r.status === filter);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <GavelIcon size={24} className="text-gold" />
        <div>
          <h1 className="text-xl font-bold text-parchment">אסמכתאות משפטיות</h1>
          <p className="text-parchment/50 text-sm">
            {data?.total != null ? `${data.total} אסמכתאות סה״כ` : 'אסמכתאות שחולצו מהמסמכים'}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((s) => (
          <button
            key={s}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === s
                ? 'bg-gold text-navy-900'
                : 'bg-parchment/10 text-parchment/60 hover:bg-parchment/20'
            }`}
            onClick={() => setFilter(s)}
          >
            {STATUS_LABELS[s]}
            {s !== 'all' && (
              <span className="mr-1 text-xs opacity-70">
                ({all.filter((r) => r.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-parchment/40 text-sm">טוען...</p>}

      {!isLoading && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-parchment/40 gap-3">
          <GavelIcon size={40} />
          <p className="text-sm">לא נמצאו אסמכתאות</p>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="bg-navy-100 border border-parchment/10 rounded-xl p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-4">
              <p className="text-parchment/85 text-sm font-medium leading-snug">{row.citation}</p>
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[row.status]}`}>
                {STATUS_HEBREW[row.status]}
              </span>
            </div>

            {row.context_snippet && (
              <p className="text-parchment/50 text-xs leading-relaxed line-clamp-2">
                {row.context_snippet}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-parchment/40">
              {row.source_document_id != null && (
                <Link
                  to={`/documents/${row.source_document_id}`}
                  className="flex items-center gap-1 hover:text-parchment/70"
                >
                  <FileTextIcon size={11} />
                  מסמך מקור
                </Link>
              )}
              {row.status === 'linked' && (
                <span className="flex items-center gap-1 text-green-400/70">
                  <CheckCircleIcon size={11} />
                  פסיקה מקושרת
                </span>
              )}
              {row.status === 'archived' && (
                <span className="flex items-center gap-1">
                  <ArchiveIcon size={11} />
                  בארכיון
                </span>
              )}
              <span className="mr-auto font-mono">
                {new Date(row.created_at).toLocaleDateString('he-IL')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
