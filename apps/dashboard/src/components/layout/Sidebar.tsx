import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ScalesIcon, BugIcon, CaretDownIcon } from '@phosphor-icons/react';
import { useUIStore } from '@/store/index.js';
import { BugReportModal } from '@/components/admin/BugReportModal.js';
import { NAV_GROUPS, groupIdForPath, type NavItem } from './nav-config.js';

function itemClass({ isActive }: { isActive: boolean }): string {
  return `sidebar-item ${isActive ? 'sidebar-item-active' : ''}`;
}

/** A single navigation link rendered inside an expanded group. */
function GroupItem({ item }: { item: NavItem }) {
  const { to, label, Icon } = item;
  return (
    <NavLink to={to} className={itemClass} style={{ paddingInlineStart: 30 }}>
      <Icon size={15} weight="duotone" className="shrink-0" />
      <span style={{ flex: 1 }}>{label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar    = useUIStore((s) => s.toggleSidebar);
  const expandedGroups   = useUIStore((s) => s.expandedGroups);
  const toggleNavGroup   = useUIStore((s) => s.toggleNavGroup);
  const setNavGroupOpen  = useUIStore((s) => s.setNavGroupOpen);

  const [bugOpen, setBugOpen] = useState(false);

  // Auto-expand the group that owns the active route (longest-prefix match).
  const { pathname } = useLocation();
  useEffect(() => {
    const gid = groupIdForPath(pathname);
    if (gid) setNavGroupOpen(gid, true);
  }, [pathname, setNavGroupOpen]);

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

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5" aria-label="ניווט ראשי">
        {sidebarCollapsed ? (
          // ── Collapsed: flat icon rail, grouped by thin dividers ──────────
          NAV_GROUPS.map((group, gi) => (
            <div
              key={group.id}
              style={gi > 0 ? { borderTop: '1px solid var(--hairline)', paddingTop: 4, marginTop: 4 } : undefined}
            >
              {group.items.map(({ to, label, Icon }) => (
                <NavLink key={to} to={to} className={itemClass} title={label}>
                  <Icon size={16} weight="duotone" className="shrink-0" />
                </NavLink>
              ))}
              {group.id === 'admin' && (
                <button
                  type="button"
                  className="sidebar-item w-full"
                  title="דווח על באג"
                  onClick={() => setBugOpen(true)}
                >
                  <BugIcon size={16} weight="duotone" className="shrink-0" />
                </button>
              )}
            </div>
          ))
        ) : (
          // ── Expanded: collapsible 8-group accordion ──────────────────────
          NAV_GROUPS.map((group) => {
            const open = expandedGroups[group.id] ?? group.defaultOpen;
            const GroupIcon = group.Icon;
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => toggleNavGroup(group.id)}
                  className="sidebar-item w-full"
                  aria-expanded={open}
                >
                  <GroupIcon size={16} weight="duotone" className="shrink-0" />
                  <span style={{ flex: 1, fontWeight: 500 }}>{group.label}</span>
                  <CaretDownIcon
                    size={12}
                    className="shrink-0"
                    style={{
                      transition: 'transform 0.15s',
                      transform: open ? 'rotate(0deg)' : 'rotate(90deg)',
                      color: 'var(--fg-4)',
                    }}
                  />
                </button>
                {open && (
                  <div className="space-y-0.5 mt-0.5">
                    {group.items.map((item) => (
                      <GroupItem key={item.to} item={item} />
                    ))}
                    {group.id === 'admin' && (
                      <button
                        type="button"
                        className="sidebar-item w-full"
                        style={{ paddingInlineStart: 30 }}
                        onClick={() => setBugOpen(true)}
                      >
                        <BugIcon size={15} weight="duotone" className="shrink-0" />
                        <span style={{ flex: 1 }}>דווח על באג</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </nav>

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

      {bugOpen && <BugReportModal onClose={() => setBugOpen(false)} />}
    </aside>
  );
}
