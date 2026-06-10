import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChatCircleIcon, UserPlusIcon, XIcon, CheckIcon } from '@phosphor-icons/react';
import { useCommUnknownInbox, useConvertUnknownSender } from '@/api/hooks.js';
import { CHANNEL_META, commTime } from './channel-meta.js';
import { CommunicationsPanel } from './CommunicationsPanel.js';

/** Firm-wide communications hub — all conversations + the unknown-sender inbox (C8 entry). */
export function CommunicationsInboxPage() {
  const { data: unknown = [] } = useCommUnknownInbox();
  const [converting, setConverting] = useState<number | null>(null);
  const [nameHe, setNameHe] = useState('');
  const [phone, setPhone] = useState('');
  const convert = useConvertUnknownSender();

  function startConvert(id: number, displayName: string | null) {
    setConverting(id);
    setNameHe(displayName ?? '');
    setPhone('');
  }

  function cancelConvert() {
    setConverting(null);
    setNameHe('');
    setPhone('');
  }

  function submitConvert(inboxId: number) {
    if (!nameHe.trim()) return;
    convert.mutate(
      { id: inboxId, nameHe: nameHe.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) },
      { onSuccess: cancelConvert },
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center gap-2">
        <ChatCircleIcon size={22} className="text-gold" weight="duotone" />
        <div>
          <h1 className="text-xl font-serif font-bold text-parchment">מרכז תקשורת</h1>
          <p className="text-parchment/50 text-sm">כל הערוצים במקום אחד — מנותב אוטומטית לתיק ולעורך הדין המטפל</p>
        </div>
      </div>

      {/* Unknown senders — routing target for unidentified contacts (C8) */}
      {unknown.length > 0 && (
        <section className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <UserPlusIcon size={16} className="text-amber-300" weight="duotone" />
            <h2 className="text-sm font-medium text-amber-200">פניות מאנשי קשר לא מזוהים ({unknown.length})</h2>
          </div>
          <ul className="space-y-2">
            {unknown.slice(0, 8).map((u) => {
              const meta = CHANNEL_META[u.channel];
              const { Icon } = meta;
              const isConverting = converting === u.id;
              return (
                <li key={u.id} className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-2.5 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-parchment/80">
                    <Icon size={15} className={meta.accent} weight="duotone" />
                    <span className="font-medium">{u.displayName ?? u.externalId}</span>
                    <span className="text-parchment/40 truncate flex-1">{u.body ?? `[${u.mediaKind ?? 'מדיה'}]`}</span>
                    <span className="text-parchment/30 text-[11px]">{commTime(u.createdAt)}</span>
                    {!isConverting && (
                      <button
                        onClick={() => startConvert(u.id, u.displayName)}
                        className="flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-100 border border-amber-400/30 rounded px-1.5 py-0.5 transition-colors"
                      >
                        <UserPlusIcon size={11} /> המר ללקוח
                      </button>
                    )}
                  </div>

                  {/* Inline conversion form */}
                  {isConverting && (
                    <form
                      onSubmit={(e) => { e.preventDefault(); submitConvert(u.id); }}
                      className="flex flex-wrap gap-2 items-end"
                    >
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-parchment/50">שם מלא *</label>
                        <input
                          autoFocus
                          value={nameHe}
                          onChange={(e) => setNameHe(e.target.value)}
                          placeholder="ישראל ישראלי"
                          className="bg-navy-100 border border-parchment/20 rounded px-2 py-1 text-xs text-parchment
                                     placeholder-parchment/30 outline-none focus:border-gold/50 w-44"
                          dir="rtl"
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-parchment/50">טלפון (אופציונלי)</label>
                        <input
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="05X-XXXXXXX"
                          className="bg-navy-100 border border-parchment/20 rounded px-2 py-1 text-xs text-parchment
                                     placeholder-parchment/30 outline-none focus:border-gold/50 w-36"
                          dir="ltr"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={convert.isPending || !nameHe.trim()}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-emerald-400 border border-emerald-400/30
                                   rounded hover:bg-emerald-400/10 disabled:opacity-40 transition-colors"
                      >
                        <CheckIcon size={12} /> צור לקוח
                      </button>
                      <button
                        type="button"
                        onClick={cancelConvert}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-parchment/50 border border-parchment/15
                                   rounded hover:bg-parchment/5 transition-colors"
                      >
                        <XIcon size={12} /> ביטול
                      </button>
                      {convert.isError && (
                        <span className="text-[10px] text-red-400/80">שגיאה בשמירה — נסה שוב</span>
                      )}
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-amber-200/60 text-[11px] mt-2">
            ניתן גם{' '}
            <Link to="/contacts" className="underline hover:text-amber-100">לשמור כאיש קשר</Link>
            {' '}מתוך מודול אנשי הקשר.
          </p>
        </section>
      )}

      {/* All conversations (firm-wide) */}
      <div className="bg-navy-100/40 border border-parchment/10 rounded-xl p-4">
        <CommunicationsPanel />
      </div>
    </div>
  );
}
