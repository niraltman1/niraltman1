import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowRightIcon, GavelIcon, FileTextIcon } from '@phosphor-icons/react';
import { useEntityDetail, type EntityType, type EntityReferenceItem } from '@/api/hooks.js';

function refHref(r: EntityReferenceItem): string {
  if (r.kind === 'document') return `/documents/${r.refId}/read`;
  if (r.caseId != null)      return `/cases/${r.caseId}`;
  return '/cases';
}

export function EntityDetailPage() {
  const { type, name } = useParams<{ type: EntityType; name: string }>();
  const navigate = useNavigate();
  const entityType = (type === 'courts' ? 'courts' : 'judges') as EntityType;
  const decoded = decodeURIComponent(name ?? '');
  const { data, isLoading } = useEntityDetail(entityType, decoded || null);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <Link to="/entities" className="inline-flex items-center gap-1 text-parchment/40 text-xs hover:text-parchment">
          <ArrowRightIcon size={12} />
          ישויות
        </Link>
        <h1 className="text-xl font-serif font-bold text-parchment">{decoded}</h1>
        <span className="badge badge-neutral text-[10px]">{entityType === 'judges' ? 'שופט/ת' : 'בית משפט'}</span>
      </div>

      {isLoading || !data ? (
        <div className="text-parchment/30 text-sm py-8 text-center">טוען…</div>
      ) : (
        <>
          <div className="flex gap-4 text-xs text-parchment/50">
            <span>{data.caseCount} תיקים</span>
            <span>{data.hearingCount} דיונים</span>
            <span>{data.documentCount} מסמכים</span>
          </div>

          {data.references.length === 0 ? (
            <p className="text-parchment/40 text-sm py-6 text-center">אין הפניות</p>
          ) : (
            <ul className="space-y-1.5">
              {data.references.map((r) => (
                <li key={`${r.kind}-${r.refId}`}>
                  <button
                    onClick={() => navigate(refHref(r))}
                    className="w-full text-right flex items-center gap-3 px-4 py-2.5 bg-navy-100 border border-parchment/10 rounded-lg hover:bg-parchment/5 transition-colors"
                  >
                    {r.kind === 'hearing' ? <GavelIcon size={14} className="text-blue-400 shrink-0" /> : <FileTextIcon size={14} className="text-parchment/40 shrink-0" />}
                    <span className="flex-1 text-parchment text-sm truncate">{r.title ?? (r.kind === 'hearing' ? 'דיון' : 'מסמך')}</span>
                    {r.caseNumber && <span className="text-parchment/40 text-xs font-mono shrink-0">{r.caseNumber}</span>}
                    {r.date && <span className="text-parchment/40 text-xs font-mono shrink-0">{r.date}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
