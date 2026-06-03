import { Link } from 'react-router-dom';
import { ChatCircleIcon, UserPlusIcon } from '@phosphor-icons/react';
import { useCommUnknownInbox } from '@/api/hooks.js';
import { CHANNEL_META, commTime } from './channel-meta.js';
import { CommunicationsPanel } from './CommunicationsPanel.js';

/** Firm-wide communications hub — all conversations + the unknown-sender inbox (C8 entry). */
export function CommunicationsInboxPage() {
  const { data: unknown = [] } = useCommUnknownInbox();

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
          <ul className="space-y-1.5">
            {unknown.slice(0, 8).map((u) => {
              const meta = CHANNEL_META[u.channel];
              const { Icon } = meta;
              return (
                <li key={u.id} className="flex items-center gap-2 text-sm text-parchment/80">
                  <Icon size={15} className={meta.accent} weight="duotone" />
                  <span className="font-medium">{u.displayName ?? u.externalId}</span>
                  <span className="text-parchment/40 truncate flex-1">{u.body ?? `[${u.mediaKind ?? 'מדיה'}]`}</span>
                  <span className="text-parchment/30 text-[11px]">{commTime(u.createdAt)}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-amber-200/60 text-[11px] mt-2">
            ניתן להמיר ללקוח חדש או לשמור כאיש קשר מתוך מודול ניהול אנשי הקשר.{' '}
            <Link to="/contacts" className="underline hover:text-amber-100">אנשי קשר</Link>
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
