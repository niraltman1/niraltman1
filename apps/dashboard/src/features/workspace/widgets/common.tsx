// Shared sub-components and helpers for workspace widgets.
// Extracted from DashboardPage.tsx — single source of truth used by both
// DashboardPage and DashboardHomePage.

import { Link } from 'react-router-dom';
import { WarningIcon, ArrowRightIcon, BellIcon } from '@phosphor-icons/react';
import type { IconWeight } from '@phosphor-icons/react';
import type { CalendarEvent, DeadlineRisk, NotificationItem } from '@/api/hooks.js';

// ─── Shared types ──────────────────────────────────────────────────────────────

export interface CaseRow {
  id: number;
  case_number: string;
  title: string;
  procedure_type: string | null;
  status: string;
}

export interface EnrichedCaseRow extends CaseRow {
  court_name?: string | null;
  judge_name?: string | null;
  next_hearing?: string | null;
  unread_comms?: number;
  overdue_tasks?: number;
  missing_evidence?: number;
  last_agent_finding?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function hebrewDate(): string {
  return new Date().toLocaleDateString('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

export function linkForNotification(n: NotificationItem): string {
  if (n.linkType === 'case' && n.linkId)       return `/cases/${n.linkId}`;
  if (n.linkType === 'document' && n.linkId)   return `/documents/${n.linkId}`;
  if (n.linkType === 'task' && n.linkId)       return '/tasks';
  if (n.linkType === 'communications')         return '/communications';
  return '/activity';
}

export function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    whatsapp:         'וואטסאפ',
    telegram:         'טלגרם',
    telegram_message: 'טלגרם',
    email:            'מייל',
    inbound_message:  'הודעה',
  };
  return map[kind] ?? kind;
}

export const KIND_HE: Record<CalendarEvent['kind'], string> = {
  hearing:          'דיון',
  statute_deadline: 'התיישנות',
  task:             'משימה',
  document:         'מסמך',
  call:             'שיחה',
  evidence:         'ראיה',
};

export const KIND_DOT: Record<CalendarEvent['kind'], string> = {
  hearing:          'var(--brand-gold)',
  statute_deadline: 'var(--bad)',
  task:             'var(--warn)',
  document:         'var(--fg-3)',
  call:             'var(--success)',
  evidence:         'var(--info)',
};

export const COMMS_KINDS = new Set([
  'whatsapp', 'telegram', 'telegram_message', 'email', 'inbound_message',
]);

// ─── Shared sub-components ────────────────────────────────────────────────────

export function StatCard({
  label, value, Icon, accent = false, danger = false,
}: {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ size?: number; weight?: IconWeight; className?: string }>;
  accent?: boolean;
  danger?: boolean;
}) {
  const valueColor  = danger ? 'var(--bad)' : accent ? 'var(--brand-gold-2)' : 'var(--fg-1)';
  const valueShadow = danger
    ? '0 0 14px rgba(197,122,106,0.3)'
    : accent ? '0 0 14px rgba(197,160,89,0.35)' : undefined;
  const iconColor = danger ? 'var(--bad)' : accent ? 'var(--brand-gold)' : 'var(--fg-3)';
  return (
    <div className="cyber-stat-card">
      <div className="flex items-start justify-between mb-2">
        <span className="cyber-stat-label">{label}</span>
        <span style={{ color: iconColor, opacity: 0.8, display: 'flex' }}>
          <Icon size={18} weight="duotone" />
        </span>
      </div>
      <div className="cyber-stat-value" style={{ color: valueColor, textShadow: valueShadow }}>
        {value}
      </div>
    </div>
  );
}

export function AgendaRow({ event }: { event: CalendarEvent }) {
  const dot       = KIND_DOT[event.kind] ?? 'var(--fg-3)';
  const kindLabel = KIND_HE[event.kind] ?? event.kind;
  const inner = (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-white/[0.02] transition-colors cursor-pointer">
      <span style={{ width: 6, height: 6, borderRadius: 3, background: dot, boxShadow: `0 0 6px ${dot}`, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13, color: 'var(--fg-1)' }} className="truncate">{event.title}</div>
        {event.caseNumber && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', marginTop: 1 }}>
            {event.caseNumber}{event.courtName ? ` · ${event.courtName}` : ''}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        {event.time && (
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-2)' }}>{event.time}</span>
        )}
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {kindLabel}
        </span>
      </div>
    </div>
  );
  if (event.linkType === 'case' && event.caseId) {
    return <Link to={`/cases/${event.caseId}`}>{inner}</Link>;
  }
  return inner;
}

export function DeadlineRow({ deadline }: { deadline: DeadlineRisk }) {
  const days = daysUntil(deadline.date);
  const urgent = days <= 7;
  const daysLabel =
    days <= 0 ? 'היום' :
    days === 1 ? 'מחר' :
    `${days} ימים`;
  return (
    <Link to={deadline.caseId ? `/cases/${deadline.caseId}` : '/deadlines'}>
      <div className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-white/[0.02] transition-colors">
        <WarningIcon size={14} weight="fill" style={{ color: urgent ? 'var(--bad)' : 'var(--warn)', flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13, color: 'var(--fg-1)' }} className="truncate">{deadline.title}</div>
          {deadline.caseNumber && (
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', marginTop: 1 }}>
              {deadline.caseNumber}
            </div>
          )}
        </div>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: urgent ? 'var(--bad)' : 'var(--warn)', flexShrink: 0 }}>
          {daysLabel}
        </span>
      </div>
    </Link>
  );
}

export function SectionRule({ label }: { label: string }) {
  return (
    <div className="section-rule">
      <span className="label">{label}</span>
    </div>
  );
}

export function PanelHeader({
  icon, title, right,
}: {
  icon?: React.ReactNode;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="cyber-panel-header">
      <div className="flex items-center gap-2.5">
        {icon}
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
          {title}
        </span>
      </div>
      {right}
    </div>
  );
}

export function AttentionRow({
  title, sub, to, severity,
}: {
  title: string;
  sub?: string;
  to: string;
  severity: 'critical' | 'warning' | 'info';
}) {
  const color = severity === 'critical' ? 'var(--bad)' : severity === 'warning' ? 'var(--warn)' : 'var(--fg-3)';
  return (
    <Link to={to}>
      <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-white/[0.02] transition-colors">
        <span style={{ width: 5, height: 5, borderRadius: 3, background: color, flexShrink: 0, boxShadow: `0 0 5px ${color}` }} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13, color: 'var(--fg-1)' }} className="truncate">{title}</div>
          {sub && (
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', marginTop: 1 }}>{sub}</div>
          )}
        </div>
        <ArrowRightIcon size={12} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
      </div>
    </Link>
  );
}

// Suppress unused import warning — BellIcon used by consumers
void BellIcon;
