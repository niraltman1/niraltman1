import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StackIcon, FileTextIcon, PlusIcon, TrashIcon, FunnelIcon } from '@phosphor-icons/react';
import {
  useCollections, useCollectionItems,
  useSavedFilters, useSavedFilterItems,
  useCreateSavedFilter, useDeleteSavedFilter,
} from '@/api/hooks.js';

const DOC_TYPES = ['פסק דין', 'כתב תביעה', 'חוזה', 'ייפוי כוח', 'חקירה', 'ערעור', 'אחר'];
const PROC_STATES = ['ENRICHED', 'OCR_PENDING', 'REVIEW_PENDING', 'CLASSIFIED'];

type ActiveKey = { kind: 'system'; key: string } | { kind: 'saved'; id: number } | null;

export function SmartCollectionsPage() {
  const navigate = useNavigate();

  const { data: collections, isLoading } = useCollections();
  const { data: savedList = [] }         = useSavedFilters();
  const createSaved = useCreateSavedFilter();
  const deleteSaved = useDeleteSavedFilter();

  const [active, setActive] = useState<ActiveKey>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName]         = useState('');
  const [formDocType, setFormDocType]   = useState('');
  const [formState, setFormState]       = useState('');

  const systemKey  = active?.kind === 'system' ? active.key  : null;
  const savedId    = active?.kind === 'saved'  ? active.id   : null;

  const { data: systemItems, isLoading: sysLoading } = useCollectionItems(systemKey);
  const { data: savedItems,  isLoading: savLoading  } = useSavedFilterItems(savedId);

  const activeItems = active?.kind === 'system' ? systemItems : savedItems;
  const itemsLoading = active?.kind === 'system' ? sysLoading : savLoading;

  function handleSave() {
    if (!formName.trim()) return;
    const filter: Record<string, string> = {};
    if (formDocType) filter['documentType']    = formDocType;
    if (formState)   filter['processingState'] = formState;
    createSaved.mutate(
      { nameHe: formName.trim(), filterJson: JSON.stringify(filter) },
      { onSuccess: () => { setShowForm(false); setFormName(''); setFormDocType(''); setFormState(''); } },
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-serif font-bold text-parchment flex items-center gap-2">
            <StackIcon size={20} className="text-gold" weight="duotone" />
            אוספים חכמים
          </h1>
          <p className="text-parchment/40 text-xs mt-0.5">אוספים דינמיים שמתעדכנים אוטומטית — לחיצה מציגה את המסמכים.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gold border border-gold/30 rounded-lg hover:bg-gold/10 transition-colors shrink-0"
        >
          <PlusIcon size={12} />
          אוסף חדש
        </button>
      </div>

      {/* New saved filter form */}
      {showForm && (
        <div className="bg-navy-100 border border-parchment/10 rounded-xl p-4 space-y-3">
          <p className="text-parchment/60 text-xs font-semibold uppercase tracking-widest">אוסף מותאם אישית</p>
          <input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="שם האוסף (לדוג׳: חוזים לא מאומתים)"
            className="w-full bg-parchment/5 border border-parchment/10 rounded-lg px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-gold/40"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={formDocType}
              onChange={(e) => setFormDocType(e.target.value)}
              className="bg-parchment/5 border border-parchment/10 rounded-lg px-3 py-2 text-sm text-parchment focus:outline-none"
            >
              <option value="">כל סוגי המסמך</option>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={formState}
              onChange={(e) => setFormState(e.target.value)}
              className="bg-parchment/5 border border-parchment/10 rounded-lg px-3 py-2 text-sm text-parchment focus:outline-none"
            >
              <option value="">כל מצבי עיבוד</option>
              {PROC_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-xs text-parchment/40 hover:text-parchment px-3 py-1.5">ביטול</button>
            <button
              onClick={handleSave}
              disabled={!formName.trim() || createSaved.isPending}
              className="btn-primary text-xs px-4 py-1.5 disabled:opacity-40"
            >
              שמור אוסף
            </button>
          </div>
        </div>
      )}

      {/* System collections */}
      {isLoading ? (
        <div className="text-parchment/30 text-sm py-8 text-center">טוען…</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {(collections ?? []).map((c) => (
            <button
              key={c.key}
              onClick={() => setActive({ kind: 'system', key: c.key })}
              className={`text-right p-3 rounded-xl border transition-colors
                ${active?.kind === 'system' && active.key === c.key
                  ? 'border-gold/40 bg-gold/10'
                  : 'border-parchment/10 bg-navy-100 hover:bg-parchment/5'}`}
            >
              <div className="text-parchment text-2xl font-semibold">{c.count}</div>
              <div className="text-parchment/50 text-xs mt-0.5">{c.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Saved filters */}
      {savedList.length > 0 && (
        <div className="space-y-1">
          <p className="text-parchment/30 text-[10px] font-semibold uppercase tracking-widest">אוספים מותאמים אישית</p>
          <div className="flex flex-wrap gap-2">
            {savedList.map((f) => (
              <div key={f.id} className="flex items-center gap-1">
                <button
                  onClick={() => setActive({ kind: 'saved', id: f.id })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors
                    ${active?.kind === 'saved' && active.id === f.id
                      ? 'border-gold/40 bg-gold/10 text-gold'
                      : 'border-parchment/10 bg-navy-100 text-parchment/60 hover:bg-parchment/5'}`}
                >
                  <FunnelIcon size={11} />
                  {f.nameHe}
                </button>
                <button
                  onClick={() => { deleteSaved.mutate(f.id); if (active?.kind === 'saved' && active.id === f.id) setActive(null); }}
                  className="text-parchment/20 hover:text-red-400 transition-colors p-1"
                  aria-label="מחק אוסף"
                >
                  <TrashIcon size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items panel */}
      {active && (
        <div className="bg-navy-100 border border-parchment/10 rounded-xl divide-y divide-parchment/5">
          {itemsLoading ? (
            <div className="text-parchment/30 text-sm py-8 text-center">טוען מסמכים…</div>
          ) : (activeItems?.length ?? 0) === 0 ? (
            <div className="text-parchment/40 text-sm py-8 text-center">אין מסמכים באוסף זה</div>
          ) : (
            activeItems!.map((d) => (
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
