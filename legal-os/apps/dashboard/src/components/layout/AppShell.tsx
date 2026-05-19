import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { SpotlightSearch } from '@/components/common/SpotlightSearch.js';
import { useSpotlightShortcut } from '@/hooks/useSpotlight.js';
import { useUIStore } from '@/store/index.js';

export function AppShell() {
  useSpotlightShortcut();
  const { spotlight, closeSpotlight } = useUIStore();

  return (
    <div className="flex h-screen overflow-hidden bg-navy cyber-shell" dir="rtl">
      <Sidebar />

      <main className="flex-1 overflow-auto flex flex-col">
        <div className="flex-1 p-6">
          <Outlet />
        </div>
        {/* Cyber statusbar */}
        <footer
          className="flex items-center gap-3 px-5 border-t border-parchment/10 shrink-0"
          style={{
            height: 28,
            background: 'linear-gradient(180deg, #0C1730 0%, #0A1428 100%)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--fg-3)',
            boxShadow: 'inset 0 1px 0 rgba(220,227,236,0.04)',
          }}
        >
          <span className="flex items-center gap-1.5">
            <span className="cyber-dot" />
            מוכן
          </span>
          <span style={{ color: 'var(--fg-4)' }}>·</span>
          <span>FTS5 פעיל</span>
          <span style={{ color: 'var(--fg-4)' }}>·</span>
          <span>מסד נתונים: factum-il.db</span>
          <span className="mr-auto flex items-center gap-1.5" style={{ color: 'var(--brand-cyan)' }}>
            <span>🔒</span>
            מקומי · ללא ענן
          </span>
          <span style={{ color: 'var(--fg-4)' }}>·</span>
          <span className="text-[9px]" style={{ color: 'var(--fg-4)' }} dir="ltr">
            Compliant: Israeli Privacy Law (Correction 13) | GDPR
          </span>
        </footer>
      </main>

      {spotlight.open && (
        <SpotlightSearch onClose={closeSpotlight} />
      )}
    </div>
  );
}
