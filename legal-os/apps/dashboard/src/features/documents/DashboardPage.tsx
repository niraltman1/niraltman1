import { Link, useNavigate } from 'react-router-dom';
import {
  GavelIcon, FolderOpenIcon, UsersIcon, CheckSquareIcon, ScalesIcon,
  LockIcon, FileDashedIcon, BookOpenIcon, RobotIcon, WarningCircleIcon,
  ShieldIcon,
} from '@phosphor-icons/react';
import type { IconWeight } from '@phosphor-icons/react';
import { useAdminStats, useWatcherEvents, useQueueStats, useSeedDemo } from '@/api/hooks.js';

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, Icon, color = 'text-gold/60',
}: {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ size?: number; weight?: IconWeight; className?: string }>;
  color?: string;
}) {
  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-parchment/60 text-sm">{label}</span>
        <Icon size={20} weight="duotone" className={color} />
      </div>
      <div className="text-2xl font-bold text-parchment font-serif">{value}</div>
    </div>
  );
}

// ─── Module Tile ──────────────────────────────────────────────────────────────

function ModuleTile({
  to, icon, label, primary, secondary, badgeText,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  primary: string | number;
  secondary?: string;
  badgeText?: string;
}) {
  return (
    <Link
      to={to}
      className="bg-navy-100 border border-parchment/10 rounded-xl p-4 space-y-2 hover:border-gold/30 transition-colors group"
    >
      <div className="flex items-start justify-between">
        <span className="text-parchment/40 group-hover:text-gold transition-colors">{icon}</span>
        {badgeText && (
          <span className="badge badge-blue text-[10px]">{badgeText}</span>
        )}
      </div>
      <div>
        <div className="text-lg font-bold text-parchment font-serif">{primary}</div>
        {secondary && <div className="text-parchment/40 text-[11px]">{secondary}</div>}
      </div>
      <div className="text-parchment/40 text-xs group-hover:text-parchment transition-colors">{label}</div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: events }                          = useWatcherEvents(3);
  const { data: queueStats }                      = useQueueStats();
  const seedDemo                                  = useSeedDemo();
  const navigate                                  = useNavigate();

  const isEmpty = !statsLoading && stats && stats.clients === 0 && stats.documentsTotal === 0;

  return (
    <div className="space-y-6" dir="rtl">

      {/* Hebrew onboarding — shown only when system has no data yet */}
      {isEmpty && (
        <div className="rounded-xl border border-parchment/10 bg-navy-100 p-8 text-center">
          <ScalesIcon size={48} weight="duotone" className="mx-auto text-gold mb-4" />
          <h2 className="text-xl font-serif font-bold text-parchment mb-2">
            ברוך הבא ל-Legal-OS
          </h2>
          <p className="text-parchment/60 text-sm mb-6 max-w-sm mx-auto">
            גרור תיקיית מסמכים לחלון זה, או לחץ על הכפתור למטה כדי לבחור תיקייה לסריקה ראשונית.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => void navigate('/queue')}
              className="px-5 py-2 bg-gold/20 text-gold border border-gold/30 rounded-lg text-sm
                         hover:bg-gold/30 transition-colors font-medium"
            >
              בחר תיקייה לסריקה
            </button>
            <button
              onClick={() => seedDemo.mutate()}
              disabled={seedDemo.isPending}
              className="px-4 py-2 border border-parchment/20 text-parchment/60 rounded-lg text-sm
                         hover:border-parchment/40 hover:text-parchment transition-colors disabled:opacity-50"
            >
              {seedDemo.isPending ? 'טוען...' : 'טען נתוני הדגמה'}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-serif font-bold text-parchment flex items-center gap-2">
            <ScalesIcon size={22} weight="duotone" className="text-gold" />
            לוח בקרה
          </h1>
          <p className="text-parchment/40 text-sm mt-0.5">אלטמן משרד עורכי דין — סדר 2026</p>
        </div>
      </div>

      {/* Row 1 — Core KPIs */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-navy-100 border border-parchment/10 rounded-lg p-4 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="לקוחות"           value={stats?.clients         ?? '—'} Icon={UsersIcon}      color="text-gold/60" />
          <KpiCard label="תיקים פתוחים"     value={stats?.openCases       ?? '—'} Icon={GavelIcon}      color="text-blue-400/70" />
          <KpiCard label="מסמכים במאגר"     value={stats?.documentsTotal  ?? '—'} Icon={FolderOpenIcon} color="text-parchment/40" />
          <KpiCard label="משימות ממתינות"   value={stats?.tasksPending    ?? '—'} Icon={CheckSquareIcon} color="text-amber-400/70" />
        </div>
      )}

      {/* Row 2 — Module tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <ModuleTile
          to="/evidence"
          icon={<LockIcon size={20} weight="duotone" />}
          label="ארגז ראיות"
          primary={stats?.evidenceItems ?? '—'}
          secondary="פריטים נעולים"
        />
        <ModuleTile
          to="/stens"
          icon={<FileDashedIcon size={20} weight="duotone" />}
          label="ספריית טפסים"
          primary={stats?.stensTemplates ?? '—'}
          secondary="תבניות פעילות"
        />
        <ModuleTile
          to="/studies"
          icon={<BookOpenIcon size={20} weight="duotone" />}
          label="לימודים"
          primary={stats?.studyQuestions ?? '—'}
          secondary={`${stats?.studyCourses ?? 0} קורסים`}
        />
        <ModuleTile
          to="/documents"
          icon={<RobotIcon size={20} weight="duotone" />}
          label="AI הועשר"
          primary={stats?.aiEnriched ?? '—'}
          secondary="מסמכים מנותחים"
          badgeText="law-il-E2B"
        />
        <ModuleTile
          to="/traffic"
          icon={<WarningCircleIcon size={20} weight="duotone" />}
          label="תעבורה — דחוף"
          primary={stats?.trafficAlerts ?? '—'}
          secondary="תיקים קרובים"
        />
        <ModuleTile
          to="/admin"
          icon={<ShieldIcon size={20} weight="duotone" />}
          label="גיבויים"
          primary={stats?.backupsTotal ?? '—'}
          secondary={stats?.backupEncrypted ? 'מוצפן AES-256' : 'לא מוצפן'}
          {...(stats?.backupEncrypted ? { badgeText: 'מוצפן' } : {})}
        />
      </div>

      {/* Row 3 — Activity feed + queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent watcher events */}
        <div className="bg-navy-100 border border-parchment/10 rounded-lg p-4 space-y-2">
          <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest">
            אירועי קבצים אחרונים
          </h2>
          {!events || (events as unknown[]).length === 0 ? (
            <p className="text-parchment/30 text-sm text-center py-4">אין אירועים</p>
          ) : (
            <div className="space-y-1">
              {(events as Record<string, unknown>[]).slice(0, 3).map((e) => (
                <div key={String(e['id'])} className="flex items-center gap-2 text-xs py-1">
                  <span className="text-parchment/30 font-mono text-[10px] shrink-0">
                    {new Date(String(e['occurred_at'] ?? e['detected_at'])).toLocaleTimeString('he-IL')}
                  </span>
                  <span className="text-parchment/60 font-mono truncate">
                    {String(e['file_path'] ?? '').split(/[/\\]/).pop()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Queue overview */}
        <div className="bg-navy-100 border border-parchment/10 rounded-lg p-4 space-y-2">
          <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
            תור עיבוד
            {(queueStats?.total ?? 0) > 0 && (
              <span className="w-2 h-2 rounded-full bg-gold animate-pulse inline-block" />
            )}
          </h2>
          {queueStats && Object.keys(queueStats.byState).length > 0 ? (
            <div className="space-y-1">
              {Object.entries(queueStats.byState).map(([state, count]) => (
                <div key={state} className="flex items-center justify-between text-xs px-2 py-1.5 bg-navy/40 rounded">
                  <span className="text-parchment/50">{state}</span>
                  <span className="text-parchment font-mono font-semibold">{String(count)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-parchment/30 text-sm text-center py-4">תור ריק</p>
          )}
          {stats?.lastBackupAt && (
            <p className="text-parchment/25 text-[10px] pt-1">
              גיבוי אחרון: {new Date(stats.lastBackupAt).toLocaleDateString('he-IL')}
            </p>
          )}
        </div>
      </div>

      <p className="text-parchment/20 text-xs text-center">
        Legal-OS · C:\אלטמן משרד עורכי דין - סדר 2026 · מערכת ניהול מסמכים מקומית
      </p>
    </div>
  );
}
