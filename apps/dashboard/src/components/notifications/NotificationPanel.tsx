import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GearSixIcon } from '@phosphor-icons/react';
import type { NotificationItem } from '@/api/hooks.js';
import { useMarkNotificationRead, useMarkAllNotificationsRead } from '@/api/hooks.js';
import { useUIStore } from '@/store/index.js';

interface Props {
  items: NotificationItem[];
  unread: number;
  onClose: () => void;
}

const KIND_LABELS: Record<string, string> = {
  statute_deadline: 'התיישנות',
  task_due:         'משימות',
  form5_gap:        'טופס 5',
  queue_stuck:      'תור תקוע',
  overdue_tasks:    'משימות באיחור',
};

function hrefFor(n: NotificationItem): string | null {
  if (!n.linkId) return null;
  switch (n.linkType) {
    case 'case':     return `/cases/${n.linkId}`;
    case 'client':   return `/clients/${n.linkId}`;
    case 'document': return `/documents/${n.linkId}`;
    case 'route':    return n.linkId;
    default:         return null;
  }
}

function severityMark(severity: NotificationItem['severity']): { glyph: string; color: string } {
  switch (severity) {
    case 'critical': return { glyph: '⚠', color: 'var(--danger, #f87171)' };
    case 'warning':  return { glyph: '●', color: 'var(--warn, #fbbf24)' };
    default:         return { glyph: '●', color: 'var(--fg-4)' };
  }
}

function relativeHe(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return '';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1)  return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'אתמול' : `לפני ${days} ימים`;
}

export function NotificationPanel({ items, unread, onClose }: Props) {
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  const markAll  = useMarkAllNotificationsRead();
  const [showSettings, setShowSettings] = useState(false);
  const muted      = useUIStore((s) => s.mutedNotificationKinds);
  const toggleMute = useUIStore((s) => s.toggleNotificationKindMute);

  function open(n: NotificationItem): void {
    if (!n.readAt) markRead.mutate(n.id);
    const href = hrefFor(n);
    if (href) {
      navigate(href);
      onClose();
    }
  }

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-label="התראות"
      className="absolute z-50 mt-2 rounded-lg shadow-xl overflow-hidden"
      style={{
        top: '100%',
        insetInlineEnd: 0,
        width: 360,
        maxHeight: 460,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-1, #16161a)',
        border: '1px solid var(--hairline)',
      }}
    >
      <header
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium shrink-0"
        style={{ borderBottom: '1px solid var(--hairline)', color: 'var(--fg-2)' }}
      >
        <span>התראות</span>
        {unread > 0 && (
          <span style={{ color: 'var(--brand-gold-2)' }}>{unread} חדשות</span>
        )}
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-label="הגדרות התראות"
          className="mr-auto"
          style={{ color: showSettings ? 'var(--brand-gold-2)' : 'var(--fg-4)' }}
        >
          <GearSixIcon size={15} />
        </button>
      </header>

      {showSettings && (
        <div className="px-4 py-2.5 text-xs shrink-0" style={{ borderBottom: '1px solid var(--hairline)' }}>
          <div style={{ color: 'var(--fg-4)', marginBottom: 6 }}>הצג סוגי התראות:</div>
          <div className="flex flex-col gap-1.5">
            {Object.entries(KIND_LABELS).map(([kind, label]) => (
              <label key={kind} className="flex items-center gap-2" style={{ color: 'var(--fg-2)' }}>
                <input
                  type="checkbox"
                  checked={!muted[kind]}
                  onChange={() => toggleMute(kind)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-auto" style={{ flex: 1 }}>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--fg-4)' }}>
            אין התראות
          </div>
        ) : (
          items.map((n) => {
            const mark = severityMark(n.severity);
            const href = hrefFor(n);
            return (
              <div
                key={n.id}
                className="flex items-start gap-2.5 px-4 py-2.5 text-sm"
                style={{
                  borderBottom: '1px solid var(--hairline)',
                  background: n.readAt ? 'transparent' : 'rgba(212,175,55,0.05)',
                }}
              >
                <span style={{ color: mark.color, fontSize: 14, lineHeight: '20px' }}>{mark.glyph}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--fg-2)' }}>{n.titleHe}</div>
                  {n.bodyHe && (
                    <div className="truncate" style={{ color: 'var(--fg-4)', fontSize: 12, marginTop: 2 }}>
                      {n.bodyHe}
                    </div>
                  )}
                  <div className="flex items-center gap-3" style={{ marginTop: 4 }}>
                    <span style={{ color: 'var(--fg-4)', fontSize: 11 }}>{relativeHe(n.createdAt)}</span>
                    {href && (
                      <button
                        type="button"
                        onClick={() => open(n)}
                        className="underline underline-offset-2"
                        style={{ color: 'var(--brand-gold-2)', fontSize: 11 }}
                      >
                        פתח
                      </button>
                    )}
                    {!n.readAt && (
                      <button
                        type="button"
                        onClick={() => markRead.mutate(n.id)}
                        style={{ color: 'var(--fg-4)', fontSize: 11 }}
                      >
                        סמן כנקרא
                      </button>
                    )}
                  </div>
                </div>
                {!n.readAt && (
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block', width: 6, height: 6, borderRadius: 3,
                      marginTop: 7, background: 'var(--brand-gold-2)',
                    }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      <footer
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderTop: '1px solid var(--hairline)' }}
      >
        <button
          type="button"
          onClick={() => markAll.mutate()}
          disabled={unread === 0 || markAll.isPending}
          className="text-xs"
          style={{ color: unread === 0 ? 'var(--fg-4)' : 'var(--fg-2)' }}
        >
          סמן הכל כנקרא
        </button>
      </footer>
    </div>
  );
}
