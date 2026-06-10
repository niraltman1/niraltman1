import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { SpotlightSearch } from '@/components/common/SpotlightSearch.js';
import { useSpotlightShortcut } from '@/hooks/useSpotlight.js';
import { useUIStore } from '@/store/index.js';
import { ReviewRequiredBanner } from '@/components/admin/ReviewRequiredBanner.js';
import { UpdateNotificationBanner } from '@/components/admin/UpdateNotificationBanner.js';
import { NotificationBell } from '@/components/notifications/NotificationBell.js';

export function AppShell() {
  useSpotlightShortcut();
  const { spotlight, closeSpotlight, openSpotlight } = useUIStore();

  return (
    <div className="flex h-screen overflow-hidden fx-surface" dir="rtl">
      <Sidebar />

      <main className="flex-1 overflow-auto flex flex-col min-w-0">
        {/* Slim top bar — date · spotlight hint · notification bell */}
        <header
          className="flex items-center justify-between px-4 shrink-0"
          style={{ height: 44, borderBottom: '1px solid var(--hairline)' }}
        >
          <div className="flex items-center gap-4">
            <span
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                color: 'var(--fg-4)',
                letterSpacing: '0.08em',
                userSelect: 'none',
              }}
              dir="rtl"
            >
              {new Date().toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            <button
              type="button"
              onClick={openSpotlight}
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                color: 'var(--fg-4)',
                letterSpacing: '0.08em',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--brand-gold)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--fg-4)'; }}
            >
              ⌘K · חיפוש
            </button>
          </div>
          <NotificationBell />
        </header>
        <UpdateNotificationBanner />
        <ReviewRequiredBanner />
        <div className="flex-1 p-6">
          <Suspense fallback={
            <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--fg-3)' }}>
              טוען…
            </div>
          }>
            <Outlet />
          </Suspense>
        </div>

        {/* Status bar */}
        <footer
          className="flex items-center gap-3 px-5 shrink-0"
          style={{
            height: 28,
            borderTop: '1px solid var(--hairline)',
            background: 'rgba(11,11,13,0.6)',
            fontFamily: 'var(--f-mono)',
            fontSize: 10,
            color: 'var(--fg-3)',
            letterSpacing: '0.06em',
          }}
        >
          <span className="flex items-center gap-1.5">
            <span
              style={{
                display: 'inline-block',
                width: 6, height: 6, borderRadius: 3,
                background: 'var(--ok)',
                boxShadow: '0 0 4px var(--ok)',
              }}
            />
            מוכן
          </span>
          <span style={{ color: 'var(--fg-4)' }}>·</span>
          <span>FTS5 פעיל</span>
          <span style={{ color: 'var(--fg-4)' }}>·</span>
          <span>factum-il.db</span>
          <span className="mr-auto flex items-center gap-1.5" style={{ color: 'var(--brand-gold-2)' }}>
            <span>🔒</span>
            מקומי · ללא ענן
          </span>
          <span style={{ color: 'var(--fg-4)' }}>·</span>
          <span style={{ fontSize: 9, color: 'var(--fg-4)' }} dir="ltr">
            Israeli Privacy Law · GDPR
          </span>
        </footer>
      </main>

      {spotlight.open && (
        <SpotlightSearch onClose={closeSpotlight} />
      )}
    </div>
  );
}
