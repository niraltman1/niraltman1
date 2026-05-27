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
  const [open, setOpen]       = useState(false);
  const [bugOpen, setBugOpen] = useState(false);
  const ref                   = useRef<HTMLDivElement>(null);
  const navigate              = useNavigate();

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
            className="absolute bottom-full mb-1 right-0 w-44 rounded-lg overflow-hidden z-50 glass"
            style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
          >
            {[
              { label: 'אבחון מערכת',   icon: HardDriveIcon,    path: '/admin' },
              { label: 'הגדרות גיבוי',  icon: HardDriveIcon,    path: '/admin/backup-settings' },
              { label: 'מצב שחזור',     icon: ShieldWarningIcon, path: '/admin/recovery' },
            ].map(({ label, icon: Icon, path }) => (
              <button
                key={path}
                className="sidebar-item w-full rounded-none text-sm"
                onClick={() => { setOpen(false); navigate(path); }}
              >
                <Icon size={16} weight="duotone" className="shrink-0" />
                <span>{label}</span>
              </button>
            ))}
            <button
              className="sidebar-item w-full rounded-none text-sm"
              style={{ borderTop: '1px solid var(--hairline-2)' }}
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
      className={`flex flex-col transition-all duration-200 ${sidebarCollapsed ? 'w-16' : 'w-60'}`}
      style={{
        background: 'rgba(15,15,15,0.55)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        borderInlineEnd: '1px solid var(--hairline-2)',
        height: '100%',
      }}
    >
      {/* Brand mark */}
      <div
        className="flex items-center gap-3 px-4 py-[18px]"
        style={{ borderBottom: '1px solid var(--hairline)' }}
      >
        {/* Gold "F" monogram */}
        <div
          className="shrink-0 grid place-items-center rounded-md"
          style={{
            width: 28, height: 28,
            background: 'linear-gradient(135deg, #C5A059, #8C6F36)',
            boxShadow: '0 0 0 1px rgba(197,160,89,0.35), 0 6px 16px -6px rgba(197,160,89,0.5)',
            fontFamily: 'var(--f-serif)',
            color: '#1A140A',
            fontWeight: 700,
            fontSize: 15,
            fontStyle: 'italic',
          }}
        >
          F
        </div>
        {!sidebarCollapsed && (
          <div style={{ lineHeight: 1.1 }}>
            <div
              style={{
                fontFamily: 'var(--f-serif)',
                fontSize: 16,
                color: 'var(--fg-1)',
                fontWeight: 500,
              }}
            >
              Factum<span style={{ color: 'var(--brand-gold)' }}>.</span>
            </div>
            <div
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 9,
                color: 'var(--fg-3)',
                letterSpacing: '0.16em',
              }}
            >
              IL · v2.4.1
            </div>
          </div>
        )}
      </div>

      {/* Eyebrow */}
      {!sidebarCollapsed && (
        <div
          style={{
            padding: '16px 20px 6px',
            fontFamily: 'var(--f-mono)',
            fontSize: 9,
            letterSpacing: '0.18em',
            color: 'var(--fg-3)',
            textTransform: 'uppercase',
          }}
        >
          WORKSPACE
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-1 px-2 space-y-0.5" aria-label="ניווט ראשי">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-item ${isActive ? 'sidebar-item-active' : ''}`
            }
            title={sidebarCollapsed ? label : undefined}
          >
            <Icon size={16} weight="duotone" className="shrink-0" />
            {!sidebarCollapsed && <span style={{ flex: 1 }}>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Settings */}
      <div className="px-2 pb-1">
        <SettingsMenu collapsed={sidebarCollapsed} />
      </div>

      {/* Ollama status card */}
      {!sidebarCollapsed && (
        <div style={{ padding: '12px 16px 14px' }}>
          <div
            className="glass-2"
            style={{ padding: 12, borderRadius: 8 }}
          >
            <div
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 9,
                color: 'var(--fg-3)',
                letterSpacing: '0.14em',
              }}
            >
              LAW-IL E2B · מקומי
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span
                style={{
                  width: 6, height: 6, borderRadius: 3,
                  background: 'var(--ok)',
                  boxShadow: '0 0 6px var(--ok)',
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>מקומי · 47ms</span>
            </div>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        style={{ borderTop: '1px solid var(--hairline)', padding: '12px 14px' }}
        className="flex items-center justify-center transition-colors"
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = 'var(--brand-gold-2)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = 'var(--fg-3)';
        }}
        aria-label={sidebarCollapsed ? 'הרחב סרגל צד' : 'כווץ סרגל צד'}
      >
        <ScalesIcon size={14} weight="duotone" style={{ color: 'var(--fg-4)', marginInlineEnd: sidebarCollapsed ? 0 : 8 }} />
        {!sidebarCollapsed && (
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--fg-4)' }}>
            ⌘K · חיפוש
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 16, color: 'var(--fg-3)' }}>{sidebarCollapsed ? '›' : '‹'}</span>
      </button>
    </aside>
  );
}
