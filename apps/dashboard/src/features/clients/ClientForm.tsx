import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { XIcon, UserPlusIcon } from '@phosphor-icons/react';
import { validateIsraeliId } from '@factum-il/shared';
import { useCreateClient } from '@/api/hooks.js';

interface Props {
  onClose: () => void;
}

function useIsraeliIdValidation(value: string) {
  if (!value) return { valid: null, error: null };
  if (!/^\d+$/.test(value.replace(/\s/g, ''))) {
    return { valid: false, error: 'מספר ת.ז. חייב להכיל ספרות בלבד' };
  }
  const valid = validateIsraeliId(value);
  return { valid, error: valid ? null : 'מספר ת.ז. אינו תקין' };
}

export function ClientForm({ onClose }: Props) {
  const navigate = useNavigate();
  const createClient = useCreateClient();

  const [form, setForm] = useState({
    nameHe:    '',
    nameEn:    '',
    idType:    'personal',
    idNumber:  '',
    phone:     '',
    email:     '',
    addressHe: '',
    notes:     '',
  });

  const idValidation = useIsraeliIdValidation(form.idNumber);
  const canSubmit    = form.nameHe.trim().length > 0 && !createClient.isPending;

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const payload: Record<string, unknown> = {
      nameHe:    form.nameHe,
      nameEn:    form.nameEn    || null,
      idType:    form.idType,
      idNumber:  form.idNumber  || null,
      phone:     form.phone     || null,
      email:     form.email     || null,
      addressHe: form.addressHe || null,
      notes:     form.notes     || null,
    };

    try {
      const result = await createClient.mutateAsync(payload);
      onClose();
      navigate(`/clients/${result.id}`);
    } catch {
      // error displayed inline
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-navy/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <aside
        className="w-full max-w-md bg-navy-100 border-r border-parchment/10 h-full flex flex-col shadow-2xl"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-parchment/10">
          <div className="flex items-center gap-3">
            <UserPlusIcon size={20} weight="duotone" className="text-gold" />
            <h2 className="font-serif font-bold text-parchment text-lg">לקוח חדש</h2>
          </div>
          <button
            onClick={onClose}
            className="text-parchment/40 hover:text-parchment/70 transition-colors"
            aria-label="סגור"
          >
            <XIcon size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* שם בעברית */}
          <div>
            <label className="block text-xs text-parchment/60 mb-1">
              שם מלא (עברית) <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.nameHe}
              onChange={set('nameHe')}
              required
              className="form-input"
              placeholder="ישראל ישראלי"
              dir="rtl"
            />
          </div>

          {/* שם באנגלית */}
          <div>
            <label className="block text-xs text-parchment/60 mb-1">שם באנגלית (אופציונלי)</label>
            <input
              type="text"
              value={form.nameEn}
              onChange={set('nameEn')}
              className="form-input"
              placeholder="Israel Israeli"
              dir="ltr"
            />
          </div>

          {/* סוג זיהוי + מספר */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-parchment/60 mb-1">סוג זיהוי</label>
              <select value={form.idType} onChange={set('idType')} className="form-input">
                <option value="personal">תעודת זהות</option>
                <option value="company">ח.פ. / ע.מ.</option>
                <option value="passport">דרכון</option>
                <option value="other">אחר</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-parchment/60 mb-1">מספר זיהוי</label>
              <input
                type="text"
                value={form.idNumber}
                onChange={set('idNumber')}
                maxLength={12}
                className={`form-input ${
                  form.idNumber && idValidation.valid === false
                    ? 'border-red-500/60 focus:border-red-400'
                    : form.idNumber && idValidation.valid === true
                    ? 'border-green-500/60 focus:border-green-400'
                    : ''
                }`}
                placeholder="000000000"
                dir="ltr"
              />
              {form.idNumber && idValidation.error && (
                <p className="text-red-400 text-xs mt-1">{idValidation.error}</p>
              )}
              {form.idNumber && idValidation.valid && (
                <p className="text-green-400 text-xs mt-1">תקין</p>
              )}
            </div>
          </div>

          {/* טלפון */}
          <div>
            <label className="block text-xs text-parchment/60 mb-1">טלפון</label>
            <input
              type="tel"
              value={form.phone}
              onChange={set('phone')}
              className="form-input"
              placeholder="050-0000000"
              dir="ltr"
            />
          </div>

          {/* דוא"ל */}
          <div>
            <label className="block text-xs text-parchment/60 mb-1">דוא&quot;ל</label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              className="form-input"
              placeholder="example@domain.com"
              dir="ltr"
            />
          </div>

          {/* כתובת */}
          <div>
            <label className="block text-xs text-parchment/60 mb-1">כתובת</label>
            <input
              type="text"
              value={form.addressHe}
              onChange={set('addressHe')}
              className="form-input"
              placeholder="רחוב, עיר"
              dir="rtl"
            />
          </div>

          {/* הערות */}
          <div>
            <label className="block text-xs text-parchment/60 mb-1">הערות</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              className="form-input resize-none"
              dir="rtl"
            />
          </div>

          {createClient.isError && (
            <p className="text-red-400 text-sm bg-red-500/10 rounded px-3 py-2">
              שגיאה בשמירת הלקוח. אנא נסה שוב.
            </p>
          )}
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-parchment/10 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded border border-parchment/20 text-parchment/70
                       hover:text-parchment hover:border-parchment/40 transition-colors text-sm"
          >
            ביטול
          </button>
          <button
            onClick={(e) => { void handleSubmit(e as unknown as React.FormEvent); }}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2 rounded bg-gold text-navy font-semibold text-sm
                       hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {createClient.isPending ? 'שומר…' : 'שמור לקוח'}
          </button>
        </div>
      </aside>
    </div>
  );
}
