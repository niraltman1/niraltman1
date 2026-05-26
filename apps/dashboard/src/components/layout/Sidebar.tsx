import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  UsersIcon,
  ScalesIcon,
  SealCheckIcon,
  ListBulletsIcon,
  PulseIcon,
  GearIcon,
  HardDriveIcon,
  BugIcon,
  EnvelopeIcon,
  RobotIcon,
  ShieldWarningIcon,
} from '@phosphor-icons/react';
import { useUIStore } from '@/store/index.js';
import { BugReportModal } from '@/components/admin/BugReportModal.js';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'לוח בקרה',             Icon: SealCheckIcon   },
  { to: '/queue',     label: 'צינור קליטה ואישורים', Icon: ListBulletsIcon },
  { to: '/clients',   label: 'ניהול תיקים ולקוחות',  Icon: UsersIcon       },
  { to: '/mail',      label: 'מחולל מייל',            Icon: EnvelopeIcon    },
  { to: '/agents',    label: 'סוכני AI',              Icon: RobotIcon       },
  { to: '/activity',  label: 'פעילות',                Icon: PulseIcon       },
] as const;

function SettingsMenu({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen]         = useState(false);
  const [bugOpen, setBugOpen]   = useState(false);
  const ref                     = useRef<HTMLDivElement>(null);
  const navigate                = useNavigate();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`sidebar-item w-full ${open ? 'sidebar-item-active' : ''}`}
          title={collapsed ? 'הגדרות' : undefined}
          aria-haspopup="true"
          aria-expanded={open}
        >
          <GearIcon size={18} weight="duotone" className="shrink-0" />
          {!collapsed && <span>הגדרות</span>}
        </button>

        {open && (
          <div
            className="absolute bottom-full mb-1 right-0 w-44 rounded-lg border border-parchment/10
                       shadow-xl overflow-hidden z-50"
            style={{ background: 'var(--bg-2)' }}
          >
            <button
              className="sidebar-item w-full rounded-none text-sm"
              onClick={() => { setOpen(false); navigate('/admin'); }}
            >
              <HardDriveIcon size={16} weight="duotone" className="shrink-0" />
              <span>אבחון מערכת</span>
            </button>
            <button
              className="sidebar-item w-full rounded-none text-sm"
              onClick={() => { setOpen(false); navigate('/admin/backup-settings'); }}
            >
              <HardDriveIcon size={16} weight="duotone" className="shrink-0" />
              <span>הגדרות גיבוי</span>
            </button>
            <button
              className="sidebar-item w-full rounded-none text-sm"
              onClick={() => { setOpen(false); navigate('/admin/recovery'); }}
            >
              <ShieldWarningIcon size={16} weight="duotone" className="shrink-0" />
              <span>מצב שחזור</span>
            </button>
            <button
              className="sidebar-item w-full rounded-none text-sm border-t border-parchment/10"
              onClick={() => { setOpen(false); setBugOpen(true); }}
            >
              <BugIcon size={16} weight="duotone" className="shrink-0" />
              <span>דווח על באג</span>
            </button>
          </div>
        )}
      </div>

      {bugOpen && <BugReportModal onClose={() => setBugOpen(false)} />}
    </>
  );
}

export function Sidebar() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar    = useUIStore((s) => s.toggleSidebar);

  return (
    <aside
      className={`
        flex flex-col border-l border-parchment/10
        transition-all duration-200
        ${sidebarCollapsed ? 'w-14' : 'w-56'}
      `}
      style={{
        background: 'linear-gradient(180deg, var(--bg-1) 0%, var(--bg-1) 70%, #0E1A33 100%)',
        boxShadow: 'inset -1px 0 0 rgba(220,227,236,0.04)',
      }}
    >
      {/* Logo / Header */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-parchment/10">
        <ScalesIcon
          size={24}
          weight="duotone"
          className="shrink-0"
          style={{ color: 'var(--brand-cyan)', filter: 'drop-shadow(0 0 5px rgba(91,224,212,0.5))' }}
        />
        {!sidebarCollapsed && (
          <span
            className="font-serif font-bold text-lg leading-none"
            style={{ color: 'var(--brand-silver-warm)', letterSpacing: '0.01em' }}
          >
            Legal<span style={{ color: 'var(--brand-cyan)' }}>-</span>OS Beta
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" aria-label="ניווט ראשי">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-item ${isActive ? 'sidebar-item-active' : ''}`
            }
            title={sidebarCollapsed ? label : undefined}
          >
            <Icon size={18} weight="duotone" className="shrink-0" />
            {!sidebarCollapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Settings dropdown */}
      <div className="px-2 pb-1">
        <SettingsMenu collapsed={sidebarCollapsed} />
      </div>

      {/* Spotlight hint + AI badge */}
      {!sidebarCollapsed && (
        <div className="px-3 py-3 border-t border-parchment/10 space-y-2">
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--fg-3)' }}>
            <span>חיפוש מהיר</span>
            <div className="flex gap-1">
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd">K</kbd>
            </div>
          </div>
          <div className="ai-badge w-full justify-center">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em' }}>
              law-il-E2B · מקומי
            </span>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="px-4 py-3 border-t border-parchment/10 flex items-center justify-center transition-colors"
        style={{ color: 'var(--fg-3)' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--brand-cyan)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--fg-3)'; }}
        aria-label={sidebarCollapsed ? 'הרחב סרגל צד' : 'כווץ סרגל צד'}
      >
        <span className="text-lg">{sidebarCollapsed ? '›' : '‹'}</span>
      </button>
    </aside>
  );
}
