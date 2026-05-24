import { useState } from 'react';
import { XIcon, GavelIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useCreateCase, useClients } from '@/api/hooks.js';

interface Props {
  defaultClientId?: number;
  onClose:          () => void;
  onCreated?:       (caseId: number) => void;
}

export function CaseForm({ defaultClientId, onClose, onCreated }: Props) {
  const createCase = useCreateCase();
  const { data: clientsData } = useClients(1, 100);
  const clients = (clientsData?.items ?? []) as Record<string, unknown>[];

  const [form, setForm] = useState({
    caseNumber:  '',
    caseType:    'civil',
    titleHe:     '',
    courtName:   '',
    status:      'open',
    openedDate:  new Date().toISOString().slice(0, 10),
    notes:       '',
    clientId:    defaultClientId ? String(defaultClientId) : '',
  });
  const [clientSearch, setClientSearch] = useState('');

  const filteredClients = clientSearch.trim()
    ? clients.filter((c) =>
        String(c['nameHe'] ?? '').toLowerCase().includes(clientSearch.toLowerCase()) ||
        String(c['idNumber'] ?? '').includes(clientSearch),
      )
    : clients;

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  const canSubmit =
    form.caseNumber.trim().length > 0 &&
    form.titleHe.trim().length > 0 &&
    form.clientId !== '' &&
    !createCase.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      const result = await createCase.mutateAsync({
        caseNumber: form.caseNumber,
        caseType:   form.caseType,
        titleHe:    form.titleHe,
        courtName:  form.courtName   || null,
        status:     form.status,
        openedDate: form.openedDate  || null,
        notes:      form.notes       || null,
        clientId:   Number(form.clientId),
      });
      onCreated?.(result.id);
      onClose();
    } catch {
      // error displayed inline
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-navy/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <aside className="w-full max-w-md bg-navy-100 border-r border-parchment/10 h-full flex flex-col shadow-2xl" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-parchment/10">
          <div className="flex items-center gap-3">
            <GavelIcon size={20} weight="duotone" className="text-gold" />
            <h2 className="font-serif font-bold text-parchment text-lg">תיק חדש</h2>
          </div>
          <button onClick={onClose} className="text-parchment/40 hover:text-parchment/70 transition-colors">
            <XIcon size={20} />
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* Client selector */}
          {!defaultClientId && (
            <div>
              <label className="block text-xs text-parchment/60 mb-1">
                לקוח <span className="text-red-400">*</span>
              </label>
              <div className="relative mb-1">
                <MagnifyingGlassIcon size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-parchment/40 pointer-events-none" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="חיפוש לקוח…"
                  className="form-input pr-8 text-sm"
                />
              </div>
              <select
                value={form.clientId}
                onChange={set('clientId')}
                required
                size={4}
                className="form-input text-sm"
              >
                <option value="" disabled>בחר לקוח</option>
                {filteredClients.map((c) => (
                  <option key={c['id'] as number} value={String(c['id'])}>
                    {c['nameHe'] as string}{c['idNumber'] ? ` — ${c['idNumber'] as string}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Case number */}
          <div>
            <label className="block text-xs text-parchment/60 mb-1">
              מספר תיק <span className="text-red-400">*</span>
            </label>
            <input type="text" value={form.caseNumber} onChange={set('caseNumber')} required className="form-input" dir="ltr" placeholder="2024/1234" />
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs text-parchment/60 mb-1">
              כותרת תיק <span className="text-red-400">*</span>
            </label>
            <input type="text" value={form.titleHe} onChange={set('titleHe')} required className="form-input" dir="rtl" placeholder="תיאור קצר" />
          </div>

          {/* Type + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-parchment/60 mb-1">סוג תיק</label>
              <select value={form.caseType} onChange={set('caseType')} className="form-input">
                <option value="civil">אזרחי</option>
                <option value="criminal">פלילי</option>
                <option value="family">משפחה</option>
                <option value="labour">עבודה</option>
                <option value="administrative">מנהלי</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-parchment/60 mb-1">סטטוס</label>
              <select value={form.status} onChange={set('status')} className="form-input">
                <option value="open">פתוח</option>
                <option value="closed">סגור</option>
                <option value="suspended">מושהה</option>
                <option value="archived">בארכיון</option>
              </select>
            </div>
          </div>

          {/* Court + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-parchment/60 mb-1">בית משפט</label>
              <input type="text" value={form.courtName} onChange={set('courtName')} className="form-input" dir="rtl" placeholder="שלום תל אביב" />
            </div>
            <div>
              <label className="block text-xs text-parchment/60 mb-1">תאריך פתיחה</label>
              <input type="date" value={form.openedDate} onChange={set('openedDate')} className="form-input" dir="ltr" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-parchment/60 mb-1">הערות</label>
            <textarea value={form.notes} onChange={set('notes')} rows={3} className="form-input resize-none" dir="rtl" />
          </div>

          {createCase.isError && (
            <p className="text-red-400 text-sm bg-red-500/10 rounded px-3 py-2">שגיאה ביצירת התיק. אנא נסה שוב.</p>
          )}
        </form>

        <div className="px-5 py-4 border-t border-parchment/10 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded border border-parchment/20 text-parchment/70 hover:text-parchment text-sm">
            ביטול
          </button>
          <button
            onClick={(e) => { void handleSubmit(e as unknown as React.FormEvent); }}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2 rounded bg-gold text-navy font-semibold text-sm hover:bg-gold/90 disabled:opacity-40 transition-colors"
          >
            {createCase.isPending ? 'שומר…' : 'שמור תיק'}
          </button>
        </div>
      </aside>
    </div>
  );
}
