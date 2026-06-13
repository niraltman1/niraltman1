// ActiveMattersWidget — Section 1: "My Active Matters" primary attorney cockpit.
// New component for DashboardHomePage — surfaces the most actionable items first.

import { Link } from 'react-router-dom';
import {
  WarningCircleIcon, CalendarIcon, ChatCircleIcon,
  GavelIcon, WarningIcon, CheckSquareIcon,
} from '@phosphor-icons/react';
import type { DeadlineRisk, NotificationItem } from '@/api/hooks.js';
import type { EnrichedCaseRow } from './common.js';
import { daysUntil } from './common.js';

interface Props {
  urgentDeadlines:  DeadlineRisk[];
  commsNotifs:      NotificationItem[];
  cases:            EnrichedCaseRow[];
  pendingEvidence?: number;
  overdueTaskCount?: number;
}

interface ActionItem {
  key:      string;
  type:     'deadline' | 'hearing' | 'comms' | 'evidence' | 'task';
  title:    string;
  sub?:     string;
  to:       string;
  urgency:  'critical' | 'high' | 'normal';
  meta?:    string;
}

function urgencyColor(u: ActionItem['urgency']): string {
  return u === 'critical' ? 'var(--bad)' : u === 'high' ? 'var(--warn)' : 'var(--fg-3)';
}

function typeIcon(type: ActionItem['type']) {
  switch (type) {
    case 'deadline': return WarningIcon;
    case 'hearing':  return CalendarIcon;
    case 'comms':    return ChatCircleIcon;
    case 'evidence': return GavelIcon;
    case 'task':     return CheckSquareIcon;
  }
}

export function ActiveMattersWidget({
  urgentDeadlines, commsNotifs, cases, pendingEvidence = 0, overdueTaskCount = 0,
}: Props) {
  const items: ActionItem[] = [];

  // Critical deadlines (overdue or ≤3 days)
  for (const d of urgentDeadlines) {
    const days = daysUntil(d.date);
    if (days <= 3) {
      items.push({
        key: `dl-${d.id}`,
        type: 'deadline',
        title: d.title,
        sub: d.caseNumber ?? undefined,
        to: d.caseId ? `/cases/${d.caseId}` : '/deadlines',
        urgency: days <= 0 ? 'critical' : 'high',
        meta: days <= 0 ? 'היום!' : days === 1 ? 'מחר' : `${days} ימים`,
      });
    }
  }

  // Upcoming hearings from active cases
  for (const c of cases) {
    if (c.next_hearing) {
      const days = daysUntil(c.next_hearing);
      if (days >= 0 && days <= 7) {
        items.push({
          key: `hearing-${c.id}`,
          type: 'hearing',
          title: `דיון: ${c.title || c.case_number}`,
          sub: c.court_name ?? undefined,
          to: `/cases/${c.id}`,
          urgency: days <= 1 ? 'critical' : days <= 3 ? 'high' : 'normal',
          meta: days === 0 ? 'היום' : days === 1 ? 'מחר' : `${days} ימים`,
        });
      }
    }
  }

  // Unread communications
  if (commsNotifs.length > 0) {
    items.push({
      key: 'comms',
      type: 'comms',
      title: `${commsNotifs.length} הודעות שלא נקראו`,
      to: '/communications',
      urgency: commsNotifs.some((n) => n.severity === 'critical') ? 'critical' : 'high',
    });
  }

  // Pending evidence
  if (pendingEvidence > 0) {
    items.push({
      key: 'evidence',
      type: 'evidence',
      title: `${pendingEvidence} ראיות ממתינות לבדיקה`,
      to: '/evidence',
      urgency: 'normal',
    });
  }

  // Overdue tasks
  if (overdueTaskCount > 0) {
    items.push({
      key: 'tasks',
      type: 'task',
      title: `${overdueTaskCount} משימות באיחור`,
      to: '/tasks',
      urgency: 'critical',
    });
  }

  // Sort: critical → high → normal
  const ORDER = { critical: 0, high: 1, normal: 2 } as const;
  items.sort((a, b) => ORDER[a.urgency] - ORDER[b.urgency]);

  if (items.length === 0) {
    return (
      <div className="cyber-panel p-6 text-center" style={{ borderColor: 'rgba(100,200,100,0.2)', background: 'rgba(100,200,100,0.02)' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
        <p style={{ color: 'var(--ok)', fontSize: 14, fontWeight: 500 }}>כל הפריטים הדחופים טופלו</p>
        <p style={{ color: 'var(--fg-4)', fontSize: 12, marginTop: 4 }}>אין פריטים דחופים כרגע</p>
      </div>
    );
  }

  return (
    <div className="cyber-panel" style={{ borderColor: 'rgba(197,122,106,0.2)' }}>
      <div className="cyber-panel-header">
        <div className="flex items-center gap-2.5">
          <WarningCircleIcon size={13} weight="duotone" style={{ color: 'var(--warn)' }} />
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
            עניינים פעילים
          </span>
        </div>
        <span className="badge badge-error" style={{ fontSize: 9 }}>{items.length} פריטים</span>
      </div>
      <div style={{ padding: '6px 10px' }}>
        {items.map((item) => {
          const Icon = typeIcon(item.type);
          const color = urgencyColor(item.urgency);
          return (
            <Link key={item.key} to={item.to}>
              <div className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-white/[0.02] transition-colors">
                <Icon size={14} weight="fill" style={{ color, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13, color: 'var(--fg-1)' }} className="truncate">{item.title}</div>
                  {item.sub && (
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', marginTop: 1 }}>{item.sub}</div>
                  )}
                </div>
                {item.meta && (
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color, flexShrink: 0, fontWeight: 600 }}>
                    {item.meta}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
