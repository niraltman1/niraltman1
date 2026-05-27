import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { SpotlightSearch } from '@/components/common/SpotlightSearch.js';
import { useSpotlightShortcut } from '@/hooks/useSpotlight.js';
import { useUIStore } from '@/store/index.js';
import { ReviewRequiredBanner } from '@/components/admin/ReviewRequiredBanner.js';
import { UpdateNotificationBanner } from '@/components/admin/UpdateNotificationBanner.js';

export function AppShell() {
  useSpotlightShortcut();
  const { spotlight, closeSpotlight } = useUIStore();

  return (
    <div className="flex h-screen overflow-hidden fx-surface" dir="rtl">
      <Sidebar />

      <main className="flex-1 overflow-auto flex flex-col min-w-0">
        <UpdateNotificationBanner />
        <ReviewRequiredBanner />
        <div className="flex-1 p-6">
          <Outlet />
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
