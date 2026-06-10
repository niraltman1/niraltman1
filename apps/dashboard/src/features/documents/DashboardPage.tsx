import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  GavelIcon, FolderOpenIcon, UsersIcon, CheckSquareIcon, ScalesIcon,
  LockIcon, FileDashedIcon, BookOpenIcon, RobotIcon, WarningCircleIcon,
  ShieldIcon, FileTextIcon, CalendarIcon, ClockIcon, WarningIcon,
} from '@phosphor-icons/react';
import type { IconWeight } from '@phosphor-icons/react';
import {
  useAdminStats, useWatcherEvents, useQueueStats, useSeedDemo,
  useCalendarEvents, useDeadlinesAtRisk, useDrafts, useTasks,
} from '@/api/hooks.js';
import type { CalendarEvent, DeadlineRisk } from '@/api/hooks.js';

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

// ─── Module tile ──────────────────────────────────────────────────────────────

function ModuleTile({
  to, icon, label, value, sub, badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  badge?: string;
}) {
  return (
    <Link to={to} className="cyber-panel group block p-4 space-y-2.5 hover:border-gold/30 transition-colors">
      <div className="flex items-start justify-between">
        <span style={{ color: 'var(--fg-4)' }} className="group-hover:text-gold transition-colors">
          {icon}
        </span>
        {badge && (
          <span className="badge badge-gold" style={{ fontSize: 9 }}>{badge}</span>
        )}
      </div>
      <div>
        <div style={{ fontFamily: 'var(--f-serif)', fontWeight: 700, fontSize: 22, color: 'var(--fg-1)', lineHeight: 1 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', marginTop: 3 }}>
            {sub}
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-3)' }} className="group-hover:text-parchment transition-colors">
        {label}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: events }     = useWatcherEvents(3);
  const { data: queueStats } = useQueueStats();
  const seedDemo             = useSeedDemo();
  const navigate             = useNavigate();

  const today = useMemo(todayISO, []);
  const { data: todayEvents }  = useCalendarEvents(today, today);
  const { data: atRisk }       = useDeadlinesAtRisk(30);
  const { data: activeDrafts } = useDrafts({ status: 'draft' });
  const { data: tasksData }    = useTasks({ status: 'pending', pageSize: 5 });

  const isEmpty = !statsLoading && stats && stats.clients === 0 && stats.documentsTotal === 0;

  const agenda = useMemo(
    () => (todayEvents ?? []).slice().sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [todayEvents],
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

      {/* ── Hero greeting ─────────────────────────────────────────────────── */}
      <div className="cyber-panel" style={{ padding: '18px 24px' }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="h-eyebrow" style={{ marginBottom: 4 }}>{hebrewDate()}</div>
            <h1 style={{ fontFamily: 'var(--f-serif)', fontSize: 21, fontWeight: 500, color: 'var(--fg-1)', lineHeight: 1.2 }}>
              שלום, ניר
              <span style={{ color: 'var(--brand-gold)', margin: '0 6px' }}>—</span>
              <span style={{ color: 'var(--fg-2)', fontSize: 17, fontWeight: 400 }}>לוח בקרה</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(stats?.tasksOverdue ?? 0) > 0 && (
              <span className="badge badge-error" style={{ padding: '5px 10px', fontSize: 11 }}>
                <WarningCircleIcon size={12} weight="fill" style={{ marginInlineEnd: 4 }} />
                {stats!.tasksOverdue} באיחור
              </span>
            )}
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

      {/* Command Center — "מה דורש תשומת לב עכשיו?" */}
      {((atRisk?.length ?? 0) > 0 || (activeDrafts?.length ?? 0) > 0 || (tasksData?.items?.length ?? 0) > 0) && (
        <div className="bg-navy-100 border border-parchment/10 rounded-xl p-4 space-y-3" dir="rtl">
          <h2 className="text-parchment/60 text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
            <ClockIcon size={12} className="text-amber-400" />
            מה דורש תשומת לב עכשיו?
          </h2>
          <div className="flex gap-2 flex-wrap">
            {/* Critical deadlines (≤7 days) */}
            {(atRisk ?? []).filter((d) => daysUntil(d.date) <= 7).slice(0, 3).map((d) => {
              const days = daysUntil(d.date);
              const overdue = days <= 0;
              return (
                <button
                  key={d.id}
                  onClick={() => navigate('/deadlines')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    overdue
                      ? 'bg-red-900/30 text-red-400 border-red-700/40 hover:bg-red-900/50'
                      : 'bg-amber-900/20 text-amber-400 border-amber-700/30 hover:bg-amber-900/40'
                  }`}
                >
                  <CalendarIcon size={10} />
                  {d.title}
                  <span className="opacity-60 text-[10px]">
                    {overdue ? 'עבר' : `${days}י`}
                  </span>
                </button>
              );
            })}

            {/* Active drafts count */}
            {(activeDrafts?.length ?? 0) > 0 && (
              <button
                onClick={() => navigate('/drafting')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-navy-200/50 text-parchment/70 border border-parchment/15 hover:border-parchment/30 transition-colors"
              >
                <FileTextIcon size={10} />
                {activeDrafts!.length} טיוטות פתוחות
              </button>
            )}

            {/* Pending tasks */}
            {(tasksData?.items ?? []).slice(0, 2).map((t) => (
              <button
                key={t.id}
                onClick={() => navigate('/tasks')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  t.urgency === 'critical'
                    ? 'bg-red-900/20 text-red-400 border-red-700/30 hover:bg-red-900/40'
                    : t.urgency === 'warning'
                    ? 'bg-amber-900/20 text-amber-300 border-amber-700/20 hover:bg-amber-900/40'
                    : 'bg-navy-200/50 text-parchment/60 border-parchment/10 hover:border-parchment/25'
                }`}
              >
                <CheckSquareIcon size={10} />
                {t.title.slice(0, 28)}{t.title.length > 28 ? '…' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── KPI row ───────────────────────────────────────────────────────── */}
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

      {/* ── Today + At-Risk ───────────────────────────────────────────────── */}
      <SectionRule label="עבודה שוטפת" />
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

        {/* Deadlines at risk */}
        <div className="cyber-panel">
          <PanelHeader
            icon={<WarningIcon size={13} weight="duotone" style={{ color: 'var(--warn)' }} />}
            title="מועדים בסיכון — 30 יום"
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
            {!atRisk || atRisk.length === 0 ? (
              <p style={{ color: 'var(--fg-4)', fontSize: 13, textAlign: 'center', padding: '22px 0' }}>
                אין מועדים בסיכון בשלושים הימים הקרובים
              </p>
            ) : (
              atRisk.slice(0, 6).map((d) => <DeadlineRow key={d.id} deadline={d} />)
            )}
          </div>
        </div>
      </div>

      {/* ── Module tiles ──────────────────────────────────────────────────── */}
      <SectionRule label="מודולים" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <ModuleTile
          to="/evidence"
          icon={<LockIcon size={20} weight="duotone" />}
          label="כספת ראיות"
          value={stats?.evidenceItems ?? '—'}
          sub="פריטים נעולים"
        />
        <ModuleTile
          to="/stens"
          icon={<FileDashedIcon size={20} weight="duotone" />}
          label="ספריית טפסים"
          value={stats?.stensTemplates ?? '—'}
          sub="תבניות פעילות"
        />
        <ModuleTile
          to="/studies"
          icon={<BookOpenIcon size={20} weight="duotone" />}
          label="לימודים"
          value={stats?.studyQuestions ?? '—'}
          sub={`${stats?.studyCourses ?? 0} קורסים`}
        />
        <ModuleTile
          to="/documents"
          icon={<RobotIcon size={20} weight="duotone" />}
          label="מסמכים — AI"
          value={stats?.aiEnriched ?? '—'}
          sub="הועשרו על-ידי law-il-E2B"
          badge="AI"
        />
        <ModuleTile
          to="/traffic"
          icon={<WarningCircleIcon size={20} weight="duotone" />}
          label="תיקי תנועה דחופים"
          value={stats?.trafficAlerts ?? '—'}
          sub="תיקים קרובים"
        />
        <ModuleTile
          to="/admin"
          icon={<ShieldIcon size={20} weight="duotone" />}
          label="גיבויים"
          value={stats?.backupsTotal ?? '—'}
          sub={stats?.backupEncrypted ? 'מוצפן AES-256' : 'לא מוצפן'}
          {...(stats?.backupEncrypted ? { badge: 'AES-256' } : {})}
        />
      </div>

      {/* ── System status ─────────────────────────────────────────────────── */}
      <SectionRule label="מצב מערכת" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent watcher events */}
        <div className="cyber-panel">
          <PanelHeader title="אירועי קבצים אחרונים" />
          <div style={{ padding: '6px 10px' }}>
            {!events || (events as unknown[]).length === 0 ? (
              <p style={{ color: 'var(--fg-4)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                אין אירועים
              </p>
            ) : (
              (events as Record<string, unknown>[]).slice(0, 3).map((e) => (
                <div
                  key={String(e['id'])}
                  className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-white/[0.02] transition-colors"
                >
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', flexShrink: 0, minWidth: 52 }}>
                    {new Date(String(e['occurred_at'] ?? e['detected_at'])).toLocaleTimeString('he-IL')}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--fg-2)', fontFamily: 'var(--f-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {String(e['file_path'] ?? '').split(/[/\\]/).pop()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Queue overview */}
        <div className="cyber-panel">
          <PanelHeader
            title="תור עיבוד"
            right={(queueStats?.total ?? 0) > 0 ? <span className="cyber-dot" /> : undefined}
          />
          <div style={{ padding: '6px 10px' }}>
            {queueStats && Object.keys(queueStats.byState).length > 0 ? (
              <div className="space-y-1">
                {Object.entries(queueStats.byState).map(([state, count]) => (
                  <div
                    key={state}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md"
                    style={{ background: 'rgba(0,0,0,0.25)' }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--f-mono)' }}>{state}</span>
                    <span style={{ fontSize: 13, color: 'var(--fg-1)', fontFamily: 'var(--f-mono)', fontWeight: 600 }}>
                      {String(count)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--fg-4)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                תור ריק
              </p>
            )}
            {stats?.lastBackupAt && (
              <p style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)', marginTop: 8 }}>
                גיבוי אחרון: {new Date(stats.lastBackupAt).toLocaleDateString('he-IL')}
              </p>
            )}
          </div>
        </div>
      </div>

      <p style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)', textAlign: 'center', letterSpacing: '0.06em' }}>
        Factum IL · ניהול תיקים מקומי · Israeli Privacy Law
      </p>
    </div>
  );
}
