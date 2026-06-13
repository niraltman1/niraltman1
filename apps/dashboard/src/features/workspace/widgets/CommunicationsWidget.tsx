// CommunicationsWidget — Communications center panel.
// Extracted from DashboardPage.tsx; used by both DashboardPage and DashboardHomePage.

import { Link } from 'react-router-dom';
import { ChatCircleIcon } from '@phosphor-icons/react';
import type { NotificationItem } from '@/api/hooks.js';
import { PanelHeader, linkForNotification, kindLabel } from './common.js';

interface CommSummary {
  channel: string;
  unread:  number;
  urgency: 'normal' | 'high' | 'critical';
  aiTag?:  string;
}

interface Props {
  /** Notification items from the Notifications table that relate to comms */
  commsNotifs: NotificationItem[];
  /** Optional per-channel summary from /api/communications/inbox/summary */
  channelSummary?: CommSummary[];
}

export function CommunicationsWidget({ commsNotifs, channelSummary }: Props) {
  const totalUnread = channelSummary
    ? channelSummary.reduce((s, c) => s + c.unread, 0)
    : commsNotifs.length;

  return (
    <div className="cyber-panel">
      <PanelHeader
        icon={<ChatCircleIcon size={13} weight="duotone" style={{ color: 'var(--info)' }} />}
        title="מרכז תקשורת"
        right={
          totalUnread > 0 ? (
            <span className="badge badge-gold" style={{ fontSize: 9 }}>{totalUnread} חדשים</span>
          ) : (
            <Link
              to="/communications"
              style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--brand-gold)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
            >
              פתח
            </Link>
          )
        }
      />
      <div style={{ padding: '6px 10px' }}>
        {/* Channel summary badges */}
        {channelSummary && channelSummary.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap px-3 py-2">
            {channelSummary.map((ch) => (
              <span
                key={ch.channel}
                className="flex items-center gap-1"
                style={{
                  fontSize: 11, color: ch.urgency === 'critical' ? 'var(--bad)' : ch.urgency === 'high' ? 'var(--warn)' : 'var(--fg-3)',
                  background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '2px 6px',
                }}
              >
                {ch.channel === 'whatsapp' ? 'וואטסאפ' : ch.channel === 'telegram' ? 'טלגרם' : ch.channel === 'email' ? 'מייל' : ch.channel}
                {ch.unread > 0 && (
                  <span style={{ fontWeight: 700 }}>({ch.unread})</span>
                )}
                {ch.aiTag && (
                  <span style={{ fontSize: 9, color: 'var(--fg-4)' }}>{ch.aiTag}</span>
                )}
              </span>
            ))}
          </div>
        )}

        {commsNotifs.length === 0 && !channelSummary ? (
          <div style={{ padding: '16px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--fg-4)', fontSize: 13 }}>אין הודעות חדשות</p>
            <Link to="/communications" className="btn btn-ghost btn-sm mt-2 inline-flex items-center gap-1.5">
              <ChatCircleIcon size={12} />
              מרכז תקשורת
            </Link>
          </div>
        ) : (
          <>
            {commsNotifs.map((n) => (
              <Link key={n.id} to={linkForNotification(n)}>
                <div className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-white/[0.02] transition-colors">
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--info)', boxShadow: '0 0 5px var(--info)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, color: 'var(--fg-1)' }} className="truncate">{n.titleHe}</div>
                    {n.bodyHe && (
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', marginTop: 1 }} className="truncate">
                        {n.bodyHe}
                      </div>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', flexShrink: 0 }}>
                    {kindLabel(n.kind)}
                  </span>
                </div>
              </Link>
            ))}
            <div style={{ padding: '6px 3px' }}>
              <Link to="/communications" className="btn btn-ghost btn-sm flex items-center gap-1.5 w-full justify-center">
                <ChatCircleIcon size={12} />
                פתח מרכז תקשורת
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
