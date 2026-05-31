import { useState, useRef, useEffect, useCallback } from 'react';
import { BellIcon } from '@phosphor-icons/react';
import { useNotifications } from '@/api/hooks.js';
import { NotificationPanel } from './NotificationPanel.js';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { data } = useNotifications();

  const unread = data?.unread ?? 0;
  const items  = data?.items ?? [];

  const close = useCallback(() => setOpen(false), []);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `התראות — ${unread} חדשות` : 'התראות'}
        className="relative flex items-center justify-center rounded-md"
        style={{ width: 32, height: 32, color: 'var(--fg-3)' }}
      >
        <BellIcon size={18} weight={unread > 0 ? 'fill' : 'regular'} />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute flex items-center justify-center"
            style={{
              top: 2, insetInlineEnd: 2,
              minWidth: 15, height: 15, padding: '0 3px',
              borderRadius: 8, fontSize: 9, fontWeight: 700, lineHeight: '15px',
              background: 'var(--brand-gold-2, #d4af37)', color: '#0b0b0d',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && <NotificationPanel items={items} unread={unread} onClose={close} />}
    </div>
  );
}
