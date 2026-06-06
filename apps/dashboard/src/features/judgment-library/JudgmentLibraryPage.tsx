import { useState, useEffect, useRef, useCallback } from 'react';
import {
  GavelIcon, MagnifyingGlassIcon, CaretDownIcon, CaretLeftIcon,
  CopyIcon, QuotesIcon, SpinnerIcon, WarningIcon, TrashIcon,
} from '@phosphor-icons/react';
import {
  useJudgmentLibrary, useJudgmentFullText, useDeleteJudgment,
  type JudgmentLibraryItem,
} from '@/api/hooks.js';

// ── Display helpers ──────────────────────────────────────────────────────────

const PROC_TYPE_HE: Record<string, string> = {
  civil:                    'אזרחי',
  criminal:                 'פלילי',
  traffic_criminal:         'תנועה פלילי',
  traffic_administrative:   'תנועה מנהלי',
  labor:                    'עבודה',
  family:                   'משפחה',
  administrative:           'מנהלי',
  other:                    'אחר',
};

function procTypeHe(pt: string | null): string {
  return pt ? (PROC_TYPE_HE[pt] ?? pt) : '';
}

// ── Context menu ─────────────────────────────────────────────────────────────

interface CtxState { x: number; y: number; text: string }

function buildCitation(text: string, item: JudgmentLibraryItem): string {
  const parts: string[] = [item.originalFilename];
  if (item.legalDomain)   parts.push(item.legalDomain);
  if (item.procedureType) parts.push(procTypeHe(item.procedureType));
  return `"${text}"\n\n(מקור: ${parts.join(' | ')}, Source ID: ${item.id})`;
}

interface SelectionMenuProps {
  ctx:    CtxState;
  item:   JudgmentLibraryItem;
  onClose: () => void;
}

function SelectionMenu({ ctx, item, onClose }: SelectionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<'text' | 'cite' | null>(null);

  // Dismiss on click outside or Escape
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', down);
    document.addEventListener('mousedown', click);
    return () => { document.removeEventListener('keydown', down); document.removeEventListener('mousedown', click); };
  }, [onClose]);

  async function copy(mode: 'text' | 'cite') {
    const content = mode === 'text' ? ctx.text : buildCitation(ctx.text, item);
    await navigator.clipboard.writeText(content);
    setCopied(mode);
    setTimeout(onClose, 700);
  }

  // Keep menu inside viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuW = 210;
  const menuH = 80;
  const left = Math.min(ctx.x, vw - menuW - 8);
  const top  = Math.min(ctx.y, vh - menuH - 8);

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-lg border shadow-2xl overflow-hidden"
      style={{ left, top, minWidth: menuW, background: 'var(--bg-2)', borderColor: 'rgba(224,224,224,0.12)' }}
      dir="rtl"
    >
      <button
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-parchment/80 hover:text-parchment hover:bg-white/5 transition-colors text-right"
        onMouseDown={(e) => { e.preventDefault(); void copy('text'); }}
      >
        <CopyIcon size={13} weight="bold" />
        {copied === 'text' ? 'הועתק ✓' : 'העתק טקסט בלבד'}
      </button>
      <div className="h-px mx-3" style={{ background: 'var(--hairline)' }} />
      <button
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-parchment/80 hover:text-parchment hover:bg-white/5 transition-colors text-right"
        onMouseDown={(e) => { e.preventDefault(); void copy('cite'); }}
      >
        <QuotesIcon size={13} weight="bold" />
        {copied === 'cite' ? 'הועתק ✓' : 'העתק עם מראי מקום'}
      </button>
    </div>
  );
}

// ── Document viewer ──────────────────────────────────────────────────────────

interface ViewerProps {
  item:      JudgmentLibraryItem;
  onClose:   () => void;
}

function DocumentViewer({ item, onClose }: ViewerProps) {
  const { data, isLoading, error } = useJudgmentFullText(item.id);
  const [ctxMenu, setCtxMenu] = useState<CtxState | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!text) return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, text });
  }, []);

  const handleMouseDown = useCallback(() => setCtxMenu(null), []);

  return (
    <div className="flex flex-col h-full min-h-0" dir="rtl">
      {/* Viewer header */}
      <div
        className="flex items-center gap-3 px-5 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <GavelIcon size={16} className="text-gold shrink-0" />
        <span className="font-medium text-parchment text-sm truncate flex-1">{item.originalFilename}</span>
        <div className="flex items-center gap-2 shrink-0">
          {item.legalDomain && (
            <span className="badge badge-gold">{item.legalDomain}</span>
          )}
          {item.procedureType && (
            <span className="badge badge-neutral">{procTypeHe(item.procedureType)}</span>
          )}
          <span className="badge badge-neutral">{item.chunkCount} קטעים</span>
        </div>
        <button
          className="text-parchment/30 hover:text-parchment/70 transition-colors text-xs ml-2"
          onClick={onClose}
          title="סגור"
        >
          ✕
        </button>
      </div>

      {/* Keywords */}
      {item.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-5 py-2 border-b shrink-0" style={{ borderColor: 'var(--hairline)' }}>
          {item.keywords.map((kw) => (
            <span key={kw} className="px-2 py-0.5 rounded text-[10px] text-parchment/50 border" style={{ borderColor: 'var(--hairline)' }}>
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* OCR text body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading && (
          <div className="flex items-center justify-center h-32 gap-2 text-parchment/40">
            <SpinnerIcon size={16} className="animate-spin" />
            <span className="text-sm">טוען...</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 m-5 text-amber-400/80 text-sm">
            <WarningIcon size={16} /> שגיאה בטעינת הטקסט
          </div>
        )}
        {data && (
          <div
            className="px-6 py-5 select-text cursor-text"
            onContextMenu={handleContextMenu}
            onMouseDown={handleMouseDown}
          >
            <pre
              className="text-xs text-parchment/75 leading-relaxed whitespace-pre-wrap font-mono"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              {data.ocrText}
            </pre>
          </div>
        )}
      </div>

      {ctxMenu && (
        <SelectionMenu ctx={ctxMenu} item={item} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  );
}

// ── Category sidebar ─────────────────────────────────────────────────────────

interface SidebarProps {
  items:          JudgmentLibraryItem[];
  selectedId:     number | null;
  onSelect:       (id: number) => void;
  query:          string;
  onQueryChange:  (q: string) => void;
}

function CategorySidebar({ items, selectedId, onSelect, query, onQueryChange }: SidebarProps) {
  const deleteMutation = useDeleteJudgment();
  const [open, setOpen] = useState<Set<string>>(new Set());

  const filtered = query.trim()
    ? items.filter((it) =>
        it.originalFilename.toLowerCase().includes(query.toLowerCase()) ||
        (it.legalDomain ?? '').includes(query) ||
        it.keywords.some((k) => k.includes(query)),
      )
    : items;

  // Group by legalDomain
  const groups = new Map<string, JudgmentLibraryItem[]>();
  for (const it of filtered) {
    const key = it.legalDomain ?? 'לא מסווג';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  // Auto-open groups when searching
  useEffect(() => {
    if (query) setOpen(new Set(groups.keys()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function toggleGroup(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full min-h-0 border-r" style={{ borderColor: 'var(--hairline)' }} dir="rtl">
      {/* Search */}
      <div className="px-3 py-3 border-b shrink-0" style={{ borderColor: 'var(--hairline)' }}>
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border" style={{ borderColor: 'var(--hairline)', background: 'rgba(255,255,255,0.03)' }}>
          <MagnifyingGlassIcon size={13} className="text-parchment/30 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="חפש בספרייה..."
            className="flex-1 bg-transparent text-xs text-parchment placeholder-parchment/30 outline-none"
            dir="rtl"
          />
        </div>
      </div>

      {/* Count */}
      <div className="px-4 py-1.5 text-[10px] text-parchment/30 shrink-0 border-b" style={{ borderColor: 'var(--hairline)' }}>
        {filtered.length} פסקי דין
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-parchment/30">
            {query ? 'לא נמצאו תוצאות' : 'הספרייה ריקה — הפעל קליטה מה-Admin API'}
          </div>
        )}
        {Array.from(groups.entries()).map(([domain, groupItems]) => (
          <div key={domain}>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-parchment/60 hover:text-parchment/90 hover:bg-white/3 transition-colors"
              onClick={() => toggleGroup(domain)}
            >
              {open.has(domain)
                ? <CaretDownIcon size={11} className="shrink-0" />
                : <CaretLeftIcon size={11} className="shrink-0" />
              }
              <span className="truncate flex-1 text-right">{domain}</span>
              <span className="text-[10px] text-parchment/30 shrink-0">{groupItems.length}</span>
            </button>

            {open.has(domain) && groupItems.map((it) => (
              <div
                key={it.id}
                className={`group relative flex items-start gap-2 px-4 py-2 cursor-pointer transition-colors ${
                  selectedId === it.id
                    ? 'bg-gold/10 border-r-2 border-gold'
                    : 'hover:bg-white/3'
                }`}
                onClick={() => onSelect(it.id)}
              >
                <GavelIcon size={12} className="text-parchment/25 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-parchment/80 truncate leading-snug">{it.originalFilename}</p>
                  {it.procedureType && (
                    <p className="text-[10px] text-parchment/35 mt-0.5">{procTypeHe(it.procedureType)}</p>
                  )}
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 text-parchment/25 hover:text-red-400 transition-all shrink-0 mt-0.5"
                  title="מחק"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`מחק את "${it.originalFilename}" מהספרייה?`)) {
                      deleteMutation.mutate(it.id);
                    }
                  }}
                >
                  <TrashIcon size={11} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function JudgmentLibraryPage() {
  const { data: items = [], isLoading, error } = useJudgmentLibrary();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery]           = useState('');

  const selectedItem = items.find((it) => it.id === selectedId) ?? null;

  // Auto-select first item when loaded
  useEffect(() => {
    if (items.length > 0 && selectedId === null) setSelectedId(items[0]!.id);
  }, [items, selectedId]);

  return (
    <div className="h-full flex flex-col -m-6" dir="rtl">
      {/* Page header */}
      <div
        className="flex items-center gap-3 px-6 py-4 border-b shrink-0"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <GavelIcon size={18} className="text-gold" />
        <h1 className="font-semibold text-parchment text-base">ספריית פסקי דין</h1>
        {!isLoading && (
          <span className="badge badge-neutral mr-1">{items.length} מסמכים</span>
        )}
        {isLoading && <SpinnerIcon size={14} className="animate-spin text-parchment/30" />}
        {error && (
          <span className="text-xs text-amber-400/70 flex items-center gap-1">
            <WarningIcon size={13} /> שגיאת טעינה
          </span>
        )}
      </div>

      {/* Split panel */}
      <div className="flex-1 grid min-h-0" style={{ gridTemplateColumns: '320px 1fr' }}>
        {/* RIGHT: categorized list */}
        <CategorySidebar
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          query={query}
          onQueryChange={setQuery}
        />

        {/* LEFT / CENTER: document viewer */}
        <div className="flex flex-col min-h-0 overflow-hidden">
          {selectedItem ? (
            <DocumentViewer item={selectedItem} onClose={() => setSelectedId(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-parchment/25">
              <GavelIcon size={40} weight="thin" />
              <p className="text-sm">בחר פסק דין מהרשימה לצפייה</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
