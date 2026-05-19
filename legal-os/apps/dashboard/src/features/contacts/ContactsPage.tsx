import { useState } from 'react';
import { UsersIcon, MagnifyingGlassIcon, UserIcon } from '@phosphor-icons/react';
import { useContacts, type ContactRecord } from '@/api/hooks.js';

const ROLE_LABELS: Record<string, string> = {
  opposing_counsel: 'סניגור נגדי',
  prosecutor:       'תביעה',
  witness:          'עד/ה',
  police:           'משטרה',
  court_clerk:      'שופט/ת / פקיד',
  expert:           'מומחה',
  family:           'משפחה',
  other:            'אחר',
};

export function ContactsPage() {
  const [query, setQuery] = useState('');
  const { data: contacts = [], isLoading } = useContacts(query.length >= 2 ? query : undefined);

  return (
    <div className="space-y-5 p-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-serif font-bold text-parchment flex items-center gap-2">
            <UsersIcon size={20} weight="duotone" className="text-gold" />
            אנשי קשר
          </h1>
          <p className="text-parchment/40 text-sm mt-0.5">ספריית אנשי הקשר של הלשכה</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-parchment/30 pointer-events-none"
        />
        <input
          type="text"
          dir="rtl"
          placeholder="חיפוש לפי שם..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-navy-100 border border-parchment/10 rounded-lg
                     pr-8 pl-3 py-2 text-sm text-parchment placeholder:text-parchment/30
                     outline-none focus:border-gold/50 transition-colors"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-parchment/30 text-sm">
          טוען...
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-parchment/30 gap-3">
          <UsersIcon size={40} weight="thin" />
          <span className="text-sm">לא נמצאו אנשי קשר</span>
        </div>
      ) : (
        <ul className="space-y-2">
          {contacts.map((ct: ContactRecord) => (
            <li
              key={ct.id}
              className="flex items-center gap-3 px-4 py-3 bg-navy-100 border border-parchment/10
                         rounded-lg hover:border-parchment/20 transition-colors"
            >
              <UserIcon size={16} className="text-blue-400 shrink-0" weight="duotone" />
              <div className="flex-1 min-w-0">
                <div className="text-parchment text-sm font-medium truncate">{ct.nameHe}</div>
                {ct.organization && (
                  <div className="text-parchment/40 text-xs truncate">{ct.organization}</div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {ct.phone && (
                  <span className="text-parchment/40 text-xs font-mono">{ct.phone}</span>
                )}
                <span className="badge badge-neutral text-[10px]">
                  {ROLE_LABELS[ct.role] ?? ct.role}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
