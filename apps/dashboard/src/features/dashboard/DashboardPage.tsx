import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  GavelIcon, FolderOpenIcon, UsersIcon, CheckSquareIcon, ScalesIcon,
  LockIcon, FileDashedIcon, BookOpenIcon, RobotIcon, WarningCircleIcon,
  ShieldIcon, FileTextIcon, CalendarIcon, WarningIcon, MagnifyingGlassIcon,
  ChatCircleIcon, FolderIcon, ArrowRightIcon, BrainIcon, ClockIcon,
  BellIcon, FilesIcon,
} from '@phosphor-icons/react';
import type { IconWeight } from '@phosphor-icons/react';
import {
  useAdminStats, useWatcherEvents, useSeedDemo,
  useCalendarEvents, useDeadlinesAtRisk, useTasks, useCases,
  useNotifications,
} from '@/api/hooks.js';
import type { CalendarEvent, DeadlineRisk, NotificationItem } from '@/api/hooks.js';
import { useUIStore } from '@/store/index.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CaseRow {
  id: number;
  case_number: string;
  title: string;
  procedure_type: string | null;
  status: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function hebrewDate(): string {
  return new Date().toLocaleDateString('he-IL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

const KIND_HE: Record<CalendarEvent['kind'], string> = {
  hearing:          'דיון',
  statute_deadline: 'התיישנות',
  task:             'משימה',
  document:         'מסמך',
  call:             'שיחה',
  evidence:         'ראיה',
};

const KIND_DOT: Record<CalendarEvent['kind'], string> = {
  hearing:          'var(--brand-gold)',
  statute_deadline: 'var(--bad)',
  task:             'var(--warn)',
  document:         'var(--fg-3)',
  call:             'var(--success)',
  evidence:         'var(--info)',
};

const COMMS_KINDS = new Set(['whatsapp', 'telegram', 'telegram_message', 'email', 'inbound_message']);

// ─── KPI Stat Card ───────────────────────────────────────────────────────────

function StatCard({
  label, value, Icon, accent = false, danger = false,
}: {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ size?: number; weight?: IconWeight; className?: string }>;
  accent?: boolean;
  danger?: boolean;
}) {
  const valueColor = danger ? 'var(--bad)' : accent ? 'var(--brand-gold-2)' : 'var(--fg-1)';
  const valueShadow = danger
    ? '0 0 14px rgba(197,122,106,0.3)'
    : accent
    ? '0 0 14px rgba(197,160,89,0.35)'
    : undefined;
  const iconColor = danger ? 'var(--bad)' : accent ? 'var(--brand-gold)' : 'var(--fg-3)';

  return (
    <div className="cyber-stat-card">
      <div className="flex items-start justify-between mb-2">
        <span className="cyber-stat-label">{label}</span>
        <span style={{ color: iconColor, opacity: 0.8, display: 'flex' }}>
          <Icon size={18} weight="duotone" />
        </span>
      </div>
      <div
        className="cyber-stat-value"
        style={{ color: valueColor, textShadow: valueShadow }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Today agenda row ────────────────────────────────────────────────────────

function AgendaRow({ event }: { event: CalendarEvent }) {
  const dot = KIND_DOT[event.kind] ?? 'var(--fg-3)';
  const kindLabel = KIND_HE[event.kind] ?? event.kind;

  const inner = (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-white/[0.02] transition-colors cursor-pointer">
      <span
        style={{
          width: 6, height: 6, borderRadius: 3,
          background: dot, boxShadow: `0 0 6px ${dot}`,
          flexShrink: 0,
        }}
      />
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
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--fg-2)' }}>
            {event.time}
          </span>
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

// ─── Deadline risk row ────────────────────────────────────────────────────────

function DeadlineRow({ deadline }: { deadline: DeadlineRisk }) {
  const days = daysUntil(deadline.date);
  const urgent = days <= 7;

  const daysLabel =
    days <= 0 ? 'היום' :
    days === 1 ? 'מחר' :
    `${days} ימים`;

  return (
    <Link to={deadline.caseId ? `/cases/${deadline.caseId}` : '/deadlines'}>
      <div className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-white/[0.02] transition-colors">
        <WarningIcon
          size={14}
          weight="fill"
          style={{ color: urgent ? 'var(--bad)' : 'var(--warn)', flexShrink: 0 }}
        />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13, color: 'var(--fg-1)' }} className="truncate">{deadline.title}</div>
          {deadline.caseNumber && (
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', marginTop: 1 }}>
              {deadline.caseNumber}
            </div>
          )}
        </div>
        <span
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 12,
            color: urgent ? 'var(--bad)' : 'var(--warn)',
            flexShrink: 0,
          }}
        >
          {daysLabel}
        </span>
      </div>
    </Link>
  );
}

// ─── Section rule ─────────────────────────────────────────────────────────────

function SectionRule({ label }: { label: string }) {
  return (
    <div className="section-rule">
      <span className="label">{label}</span>
    </div>
  );
}

// ─── Panel header ─────────────────────────────────────────────────────────────

function PanelHeader({
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

// ─── Attention item row ───────────────────────────────────────────────────────

function AttentionRow({
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
        <span
          style={{ width: 5, height: 5, borderRadius: 3, background: color, flexShrink: 0, boxShadow: `0 0 5px ${color}` }}
        />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13, color: 'var(--fg-1)' }} className="truncate">{title}</div>
          {sub && (
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', marginTop: 1 }}>
              {sub}
            </div>
          )}
        </div>
        <ArrowRightIcon size={12} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: events }     = useWatcherEvents(5);
  const seedDemo             = useSeedDemo();
  const navigate             = useNavigate();
  const openSpotlight        = useUIStore((s) => s.openSpotlight);

  const today = useMemo(todayISO, []);
  const { data: todayEvents }   = useCalendarEvents(today, today);
  const { data: atRisk }        = useDeadlinesAtRisk(30);
  const { data: tasksData }     = useTasks({ status: 'pending', pageSize: 10 });
  const { data: casesData }     = useCases(1, 6);
  const { data: notifData }     = useNotifications(30);

  const isEmpty = !statsLoading && stats && stats.clients === 0 && stats.documentsTotal === 0;

  // § 1 — Today's agenda
  const agenda = useMemo(
    () => (todayEvents ?? []).slice().sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [todayEvents],
  );

  // § 1 — Urgent deadlines (≤ 7 days)
  const urgentDeadlines = useMemo(
    () => (atRisk ?? []).filter((d) => daysUntil(d.date) <= 7),
    [atRisk],
  );

  // § 2 — Requires Attention: critical tier
  const criticalItems = useMemo(() => {
    const items: Array<{ key: string; title: string; sub?: string; to: string }> = [];
    for (const d of atRisk ?? []) {
      if (d.risk === 'overdue') {
        items.push({ key: `dl-${d.id}`, title: d.title, to: d.caseId ? `/cases/${d.caseId}` : '/deadlines',
          ...(d.caseNumber ? { sub: d.caseNumber } : {}) });
      }
    }
    for (const t of tasksData?.items ?? []) {
      if (t.urgency === 'critical') {
        items.push({ key: `task-${t.id}`, title: t.title, sub: 'משימה קריטית', to: '/tasks' });
      }
    }
    for (const n of notifData?.items ?? []) {
      if (n.severity === 'critical' && !n.readAt) {
        items.push({ key: `notif-${n.id}`, title: n.titleHe, to: linkForNotification(n),
          ...(n.bodyHe ? { sub: n.bodyHe } : {}) });
      }
    }
    return items.slice(0, 8);
  }, [atRisk, tasksData, notifData]);

  // § 2 — Requires Attention: important tier
  const importantItems = useMemo(() => {
    const items: Array<{ key: string; title: string; sub?: string; to: string }> = [];
    for (const d of atRisk ?? []) {
      if (d.risk === 'critical') {
        items.push({ key: `dl-${d.id}`, title: d.title, to: d.caseId ? `/cases/${d.caseId}` : '/deadlines',
          ...(d.caseNumber ? { sub: d.caseNumber } : {}) });
      }
    }
    for (const t of tasksData?.items ?? []) {
      if (t.urgency === 'warning') {
        items.push({ key: `task-${t.id}`, title: t.title, sub: 'משימה דחופה', to: '/tasks' });
      }
    }
    for (const n of notifData?.items ?? []) {
      if (n.severity === 'warning' && !n.readAt) {
        items.push({ key: `notif-${n.id}`, title: n.titleHe, to: linkForNotification(n),
          ...(n.bodyHe ? { sub: n.bodyHe } : {}) });
      }
    }
    return items.slice(0, 6);
  }, [atRisk, tasksData, notifData]);

  // § 2 — Requires Attention: informational tier
  const infoItems = useMemo(() => {
    const items: Array<{ key: string; title: string; sub?: string; to: string }> = [];
    for (const n of notifData?.items ?? []) {
      if (n.severity === 'info' && !n.readAt) {
        items.push({ key: `notif-${n.id}`, title: n.titleHe, to: linkForNotification(n),
          ...(n.bodyHe ? { sub: n.bodyHe } : {}) });
      }
    }
    return items.slice(0, 5);
  }, [notifData]);

  const hasAttentionItems = criticalItems.length > 0 || importantItems.length > 0 || infoItems.length > 0;

  // § 3 — Active cases
  const activeCases = useMemo(
    () => (casesData?.items ?? []).map((r) => r as unknown as CaseRow).slice(0, 6),
    [casesData],
  );

  // § 4 — Communications notifications
  const commsNotifs = useMemo(
    () => (notifData?.items ?? []).filter((n) => COMMS_KINDS.has(n.kind) && !n.readAt).slice(0, 5),
    [notifData],
  );

  return (
    <div className="space-y-5" dir="rtl">

      {/* ── Empty-state onboarding ─────────────────────────────────────────── */}
      {isEmpty && (
        <div className="cyber-panel p-8 text-center">
          <ScalesIcon size={48} weight="duotone" style={{ color: 'var(--brand-gold)', margin: '0 auto 16px' }} />
          <h2 style={{ fontFamily: 'var(--f-serif)', fontSize: 20, color: 'var(--fg-1)', marginBottom: 8 }}>
            ברוכים הבאים ל-Factum IL
          </h2>
          <p style={{ color: 'var(--fg-3)', fontSize: 13, maxWidth: 360, margin: '0 auto 24px' }}>
            גרור תיקיית מסמכים לחלון זה, או לחץ על הכפתור למטה כדי לבחור תיקייה לסריקה ראשונית.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button onClick={() => void navigate('/queue')} className="btn btn-primary">
              בחר תיקייה לסריקה
            </button>
            <button
              onClick={() => seedDemo.mutate()}
              disabled={seedDemo.isPending}
              className="btn btn-secondary"
            >
              {seedDemo.isPending ? 'טוען...' : 'טען נתוני הדגמה'}
            </button>
          </div>
        </div>
      )}

      {/* ── Hero + Universal Search ───────────────────────────────────────── */}
      <div className="cyber-panel" style={{ padding: '18px 24px' }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="h-eyebrow" style={{ marginBottom: 4 }}>{hebrewDate()}</div>
            <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 21, fontWeight: 500, color: 'var(--fg-1)', lineHeight: 1.2 }}>
              שלום, ניר
              <span style={{ color: 'var(--brand-gold)', margin: '0 6px' }}>—</span>
              <span style={{ color: 'var(--fg-2)', fontSize: 17, fontWeight: 400 }}>שולחן העבודה</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {(stats?.tasksOverdue ?? 0) > 0 && (
              <span className="badge badge-error" style={{ padding: '5px 10px', fontSize: 11 }}>
                <WarningCircleIcon size={12} weight="fill" style={{ marginInlineEnd: 4 }} />
                {stats!.tasksOverdue} באיחור
              </span>
            )}
            {/* § 7 — Universal Search trigger */}
            <button
              onClick={openSpotlight}
              className="btn btn-ghost btn-sm flex items-center gap-2"
              style={{ minWidth: 180, justifyContent: 'flex-start', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}
            >
              <MagnifyingGlassIcon size={13} weight="duotone" />
              <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>חיפוש גלובלי...</span>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)', marginInlineStart: 'auto' }}>⌘K</span>
            </button>
            <Link to="/calendar" className="btn btn-ghost btn-sm flex items-center gap-1.5">
              <CalendarIcon size={13} weight="duotone" />
              יומן
            </Link>
            <Link to="/deadlines" className="btn btn-ghost btn-sm flex items-center gap-1.5">
              <WarningIcon size={13} weight="duotone" />
              מועדים
            </Link>
          </div>
        </div>
      </div>

      {/* ── § 1: Today ────────────────────────────────────────────────────── */}
      <SectionRule label="היום" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Today's agenda */}
        <div className="cyber-panel">
          <PanelHeader
            icon={<CalendarIcon size={13} weight="duotone" style={{ color: 'var(--brand-gold)' }} />}
            title="אג׳נדה — היום"
            right={
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.08em' }}>
                {agenda.length} אירועים
              </span>
            }
          />
          <div style={{ padding: '6px 10px' }}>
            {agenda.length === 0 ? (
              <p style={{ color: 'var(--fg-4)', fontSize: 13, textAlign: 'center', padding: '22px 0' }}>
                אין אירועים מתוזמנים להיום
              </p>
            ) : (
              agenda.map((ev) => <AgendaRow key={ev.id} event={ev} />)
            )}
          </div>
        </div>

        {/* Urgent deadlines ≤ 7 days */}
        <div className="cyber-panel">
          <PanelHeader
            icon={<WarningIcon size={13} weight="duotone" style={{ color: 'var(--warn)' }} />}
            title="מועדים קרובים — 7 ימים"
            right={
              <Link
                to="/deadlines"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--brand-gold)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
              >
                הצג הכל
              </Link>
            }
          />
          <div style={{ padding: '6px 10px' }}>
            {urgentDeadlines.length === 0 ? (
              <p style={{ color: 'var(--fg-4)', fontSize: 13, textAlign: 'center', padding: '22px 0' }}>
                אין מועדים דחופים בשבוע הקרוב
              </p>
            ) : (
              urgentDeadlines.slice(0, 6).map((d) => <DeadlineRow key={d.id} deadline={d} />)
            )}
          </div>
        </div>
      </div>

      {/* ── § 2: Requires Attention ────────────────────────────────────────── */}
      {hasAttentionItems && (
        <>
          <SectionRule label="דורש תשומת לב" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Critical */}
            {criticalItems.length > 0 && (
              <div className="cyber-panel" style={{ borderColor: 'rgba(197,122,106,0.3)' }}>
                <PanelHeader
                  icon={<span className="cyber-dot" style={{ background: 'var(--bad)', boxShadow: '0 0 6px var(--bad)' }} />}
                  title="קריטי"
                  right={
                    <span className="badge badge-error" style={{ fontSize: 9 }}>{criticalItems.length}</span>
                  }
                />
                <div style={{ padding: '4px 8px' }}>
                  {criticalItems.map((item) => (
                    <AttentionRow key={item.key} title={item.title} to={item.to} severity="critical" {...(item.sub ? { sub: item.sub } : {})} />
                  ))}
                </div>
              </div>
            )}

            {/* Important */}
            {importantItems.length > 0 && (
              <div className="cyber-panel" style={{ borderColor: 'rgba(197,160,89,0.25)' }}>
                <PanelHeader
                  icon={<span className="cyber-dot" style={{ background: 'var(--warn)', boxShadow: '0 0 6px var(--warn)' }} />}
                  title="חשוב"
                  right={
                    <span className="badge badge-gold" style={{ fontSize: 9 }}>{importantItems.length}</span>
                  }
                />
                <div style={{ padding: '4px 8px' }}>
                  {importantItems.map((item) => (
                    <AttentionRow key={item.key} title={item.title} to={item.to} severity="warning" {...(item.sub ? { sub: item.sub } : {})} />
                  ))}
                </div>
              </div>
            )}

            {/* Informational */}
            {infoItems.length > 0 && (
              <div className="cyber-panel">
                <PanelHeader
                  icon={<BellIcon size={13} weight="duotone" style={{ color: 'var(--info)' }} />}
                  title="לידיעה"
                  right={
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)' }}>{infoItems.length}</span>
                  }
                />
                <div style={{ padding: '4px 8px' }}>
                  {infoItems.map((item) => (
                    <AttentionRow key={item.key} title={item.title} to={item.to} severity="info" {...(item.sub ? { sub: item.sub } : {})} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── § 3: Active Cases ──────────────────────────────────────────────── */}
      <SectionRule label="תיקים פעילים" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {activeCases.length === 0 ? (
          <div className="cyber-panel col-span-full p-6 text-center">
            <p style={{ color: 'var(--fg-4)', fontSize: 13 }}>אין תיקים פתוחים</p>
            <Link to="/cases" className="btn btn-ghost btn-sm mt-3 inline-flex items-center gap-1.5">
              <FolderIcon size={13} />
              נהל תיקים
            </Link>
          </div>
        ) : (
          <>
            {activeCases.map((c) => (
              <Link
                key={c.id}
                to={`/cases/${c.id}`}
                className="cyber-panel block p-4 hover:border-gold/30 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span
                    style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--brand-gold)', letterSpacing: '0.08em' }}
                    className="truncate"
                  >
                    {c.case_number || '—'}
                  </span>
                  {c.procedure_type && (
                    <span className="badge badge-gold" style={{ fontSize: 9, flexShrink: 0 }}>
                      {c.procedure_type}
                    </span>
                  )}
                </div>
                <div
                  style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, lineHeight: 1.4 }}
                  className="truncate group-hover:text-parchment transition-colors"
                >
                  {c.title || 'תיק ללא שם'}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)' }}>
                    {c.status === 'open' ? 'פתוח' : c.status}
                  </span>
                  <ArrowRightIcon size={12} style={{ color: 'var(--fg-4)' }} className="group-hover:text-gold transition-colors" />
                </div>
              </Link>
            ))}
            <Link
              to="/cases"
              className="cyber-panel flex items-center justify-center p-4 hover:border-gold/30 transition-colors gap-2"
              style={{ color: 'var(--fg-3)', fontSize: 12 }}
            >
              <span>כל התיקים</span>
              <ArrowRightIcon size={12} />
            </Link>
          </>
        )}
      </div>

      {/* ── § 4 + § 5: Communications + Documents ─────────────────────────── */}
      <SectionRule label="תקשורת ומסמכים" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* § 4 — Communications Center */}
        <div className="cyber-panel">
          <PanelHeader
            icon={<ChatCircleIcon size={13} weight="duotone" style={{ color: 'var(--info)' }} />}
            title="מרכז תקשורת"
            right={
              commsNotifs.length > 0 ? (
                <span className="badge badge-gold" style={{ fontSize: 9 }}>{commsNotifs.length} חדשים</span>
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
            {commsNotifs.length === 0 ? (
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

        {/* § 5 — Document Center */}
        <div className="cyber-panel">
          <PanelHeader
            icon={<FilesIcon size={13} weight="duotone" style={{ color: 'var(--fg-3)' }} />}
            title="מרכז מסמכים"
            right={
              stats ? (
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)' }}>
                  {stats.aiEnriched}/{stats.documentsTotal} הועשרו
                </span>
              ) : undefined
            }
          />
          <div style={{ padding: '6px 10px' }}>
            {!events || (events as unknown[]).length === 0 ? (
              <p style={{ color: 'var(--fg-4)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
                אין קבצים שנקלטו לאחרונה
              </p>
            ) : (
              (events as Record<string, unknown>[]).map((e) => (
                <div
                  key={String(e['id'])}
                  className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-white/[0.02] transition-colors"
                >
                  <FileTextIcon size={12} weight="duotone" style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {String(e['file_path'] ?? '').split(/[/\\]/).pop()}
                  </span>
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', flexShrink: 0 }}>
                    {new Date(String(e['occurred_at'] ?? e['detected_at'])).toLocaleTimeString('he-IL')}
                  </span>
                </div>
              ))
            )}
            <div className="flex items-center gap-2 flex-wrap pt-2" style={{ borderTop: '1px solid var(--border)', marginTop: 6 }}>
              <Link to="/documents" className="btn btn-ghost btn-sm flex items-center gap-1">
                <FilesIcon size={11} />
                כל המסמכים
              </Link>
              <Link to="/evidence" className="btn btn-ghost btn-sm flex items-center gap-1">
                <LockIcon size={11} />
                כספת ראיות
              </Link>
              <Link to="/queue" className="btn btn-ghost btn-sm flex items-center gap-1">
                תור קליטה
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── § 6: AI Workbench ──────────────────────────────────────────────── */}
      <SectionRule label="שולחן AI" />
      <div className="cyber-panel" style={{ borderColor: 'rgba(197,160,89,0.25)', background: 'rgba(197,160,89,0.03)' }}>
        <PanelHeader
          icon={<BrainIcon size={13} weight="duotone" style={{ color: 'var(--brand-gold)' }} />}
          title="בינה מלאכותית — law-il-E2B"
          right={
            stats ? (
              <span className="badge badge-gold" style={{ fontSize: 9 }}>
                {stats.aiEnriched} מסמכים הועשרו
              </span>
            ) : undefined
          }
        />
        <div style={{ padding: '10px 16px 14px' }}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="cyber-panel p-4 text-center">
              <div style={{ fontFamily: 'var(--f-serif)', fontSize: 28, color: 'var(--brand-gold-2)', fontWeight: 700, lineHeight: 1 }}>
                {statsLoading ? '…' : (stats?.aiEnriched ?? 0)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 4 }}>מסמכים שנותחו</div>
            </div>
            <div className="cyber-panel p-4 text-center">
              <div style={{ fontFamily: 'var(--f-serif)', fontSize: 28, color: 'var(--fg-2)', fontWeight: 700, lineHeight: 1 }}>
                {statsLoading ? '…' : (stats?.documentsTotal ?? 0) - (stats?.aiEnriched ?? 0)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 4 }}>ממתינים להעשרה</div>
            </div>
            <div className="cyber-panel p-4 text-center">
              <div style={{ fontFamily: 'var(--f-serif)', fontSize: 28, color: 'var(--fg-2)', fontWeight: 700, lineHeight: 1 }}>
                {statsLoading || !stats || stats.documentsTotal === 0
                  ? '—'
                  : `${Math.round((stats.aiEnriched / stats.documentsTotal) * 100)}%`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 4 }}>כיסוי AI</div>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <Link to="/agents" className="btn btn-primary btn-sm flex items-center gap-1.5">
              <RobotIcon size={13} weight="duotone" />
              הפעל סוכן AI
            </Link>
            <Link to="/drafting" className="btn btn-ghost btn-sm flex items-center gap-1.5">
              <FileTextIcon size={13} weight="duotone" />
              טיוטות
            </Link>
            <Link to="/documents?filter=unenriched" className="btn btn-ghost btn-sm flex items-center gap-1.5">
              <FileDashedIcon size={13} weight="duotone" />
              הצג ממתינים להעשרה
            </Link>
          </div>
        </div>
      </div>

      {/* ── § 8: Office Metrics (KPI strip — secondary) ────────────────────── */}
      <SectionRule label="מדדי משרד" />
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="cyber-stat-card animate-pulse" style={{ minHeight: 84 }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="לקוחות פעילים"  value={stats?.clients        ?? '—'} Icon={UsersIcon}       accent />
          <StatCard label="תיקים פתוחים"   value={stats?.openCases      ?? '—'} Icon={GavelIcon} />
          <StatCard label="מסמכים במאגר"   value={stats?.documentsTotal ?? '—'} Icon={FolderOpenIcon} />
          <StatCard
            label="משימות ממתינות"
            value={stats?.tasksPending ?? '—'}
            Icon={CheckSquareIcon}
            danger={(stats?.tasksOverdue ?? 0) > 0}
          />
        </div>
      )}

      {/* ── Quick access modules ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link to="/stens" className="cyber-panel group flex items-center gap-3 p-3 hover:border-gold/30 transition-colors">
          <FileDashedIcon size={18} weight="duotone" style={{ color: 'var(--fg-4)' }} className="group-hover:text-gold transition-colors" />
          <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>ספריית טפסים</span>
        </Link>
        <Link to="/studies" className="cyber-panel group flex items-center gap-3 p-3 hover:border-gold/30 transition-colors">
          <BookOpenIcon size={18} weight="duotone" style={{ color: 'var(--fg-4)' }} className="group-hover:text-gold transition-colors" />
          <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>לימודים</span>
        </Link>
        <Link to="/traffic" className="cyber-panel group flex items-center gap-3 p-3 hover:border-gold/30 transition-colors">
          <WarningCircleIcon size={18} weight="duotone" style={{ color: 'var(--fg-4)' }} className="group-hover:text-gold transition-colors" />
          <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>תיקי תנועה</span>
        </Link>
        <Link to="/admin" className="cyber-panel group flex items-center gap-3 p-3 hover:border-gold/30 transition-colors">
          <ShieldIcon size={18} weight="duotone" style={{ color: 'var(--fg-4)' }} className="group-hover:text-gold transition-colors" />
          <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>מצב מערכת</span>
        </Link>
      </div>

      <p style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)', textAlign: 'center', letterSpacing: '0.06em' }}>
        Factum IL · ניהול תיקים מקומי · Israeli Privacy Law
      </p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function linkForNotification(n: NotificationItem): string {
  if (n.linkType === 'case' && n.linkId)       return `/cases/${n.linkId}`;
  if (n.linkType === 'document' && n.linkId)   return `/documents/${n.linkId}`;
  if (n.linkType === 'task' && n.linkId)       return '/tasks';
  if (n.linkType === 'communications')         return '/communications';
  return '/activity';
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    whatsapp:         'וואטסאפ',
    telegram:         'טלגרם',
    telegram_message: 'טלגרם',
    email:            'מייל',
    inbound_message:  'הודעה',
  };
  return map[kind] ?? kind;
}
