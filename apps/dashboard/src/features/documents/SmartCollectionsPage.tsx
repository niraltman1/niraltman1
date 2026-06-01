import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StackIcon, FileTextIcon } from '@phosphor-icons/react';
import { useCollections, useCollectionItems } from '@/api/hooks.js';

export function SmartCollectionsPage() {
  const navigate = useNavigate();
  const { data: collections, isLoading } = useCollections();
  const [active, setActive] = useState<string | null>(null);
  const { data: items, isLoading: itemsLoading } = useCollectionItems(active);

  return (
    <div className="space-y-4" dir="rtl">
      <h1 className="text-xl font-serif font-bold text-parchment flex items-center gap-2">
        <StackIcon size={20} className="text-gold" weight="duotone" />
        אוספים חכמים
      </h1>
      <p className="text-parchment/40 text-xs">אוספים דינמיים שמתעדכנים אוטומטית — לחיצה מציגה את המסמכים.</p>

      {isLoading ? (
        <div className="text-parchment/30 text-sm py-8 text-center">טוען…</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {(collections ?? []).map((c) => (
            <button
              key={c.key}
              onClick={() => setActive(c.key)}
              className={`text-right p-3 rounded-xl border transition-colors
                ${active === c.key ? 'border-gold/40 bg-gold/10' : 'border-parchment/10 bg-navy-100 hover:bg-parchment/5'}`}
            >
              <div className="text-parchment text-2xl font-semibold">{c.count}</div>
              <div className="text-parchment/50 text-xs mt-0.5">{c.label}</div>
            </button>
          ))}
        </div>
      )}

      {active && (
        <div className="bg-navy-100 border border-parchment/10 rounded-xl divide-y divide-parchment/5">
          {itemsLoading ? (
            <div className="text-parchment/30 text-sm py-8 text-center">טוען מסמכים…</div>
          ) : (items?.length ?? 0) === 0 ? (
            <div className="text-parchment/40 text-sm py-8 text-center">אין מסמכים באוסף זה</div>
          ) : (
            items!.map((d) => (
              <button
                key={d.id}
                onClick={() => navigate(`/documents/${d.id}/read`)}
                className="w-full text-right flex items-center gap-3 px-4 py-2.5 hover:bg-parchment/5 transition-colors"
              >
                <FileTextIcon size={14} className="text-parchment/40 shrink-0" />
                <span className="flex-1 text-parchment text-sm truncate">{d.filename}</span>
                {d.processingState && <span className="text-parchment/40 text-[10px]">{d.processingState}</span>}
                {d.createdAt && <span className="text-parchment/40 text-[10px] font-mono">{d.createdAt.slice(0, 10)}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
