import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GavelIcon, BankIcon } from '@phosphor-icons/react';
import { useEntities, type EntityType, type EntitySummary } from '@/api/hooks.js';

const TABS: { key: EntityType; label: string; Icon: typeof GavelIcon }[] = [
  { key: 'judges', label: 'שופטים', Icon: GavelIcon },
  { key: 'courts', label: 'בתי משפט', Icon: BankIcon },
];

export function EntitiesPage() {
  const navigate = useNavigate();
  const [type, setType] = useState<EntityType>('judges');
  const { data: entities, isLoading } = useEntities(type);

  return (
    <div className="space-y-4" dir="rtl">
      <h1 className="text-xl font-serif font-bold text-parchment">ישויות משפטיות</h1>

      <div className="flex gap-1 border-b border-parchment/10">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setType(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px
              ${type === key ? 'text-gold border-gold' : 'text-parchment/50 border-transparent hover:text-parchment'}`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-parchment/30 text-sm py-8 text-center">טוען…</div>
      ) : (entities?.length ?? 0) === 0 ? (
        <div className="bg-navy-100 border border-parchment/10 rounded-xl py-12 text-center text-parchment/50 text-sm">
          לא נמצאו {type === 'judges' ? 'שופטים' : 'בתי משפט'} בנתונים שחולצו.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {entities!.map((e: EntitySummary) => (
            <li key={e.canonical}>
              <button
                onClick={() => navigate(`/entities/${type}/${encodeURIComponent(e.canonical)}`)}
                className="w-full text-right flex items-center gap-3 px-4 py-2.5 bg-navy-100 border border-parchment/10 rounded-lg hover:bg-parchment/5 transition-colors"
              >
                <span className="flex-1 text-parchment text-sm">{e.canonical}</span>
                <span className="text-parchment/40 text-xs">{e.caseCount} תיקים</span>
                {e.hearingCount > 0 && <span className="text-blue-400/70 text-xs">{e.hearingCount} דיונים</span>}
                {e.documentCount > 0 && <span className="text-parchment/40 text-xs">{e.documentCount} מסמכים</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
