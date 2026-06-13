// AgendaWidget — Today's agenda + upcoming deadlines panels.
// Extracted from DashboardPage.tsx; used by both DashboardPage and DashboardHomePage.

import { Link } from 'react-router-dom';
import { CalendarIcon, WarningIcon } from '@phosphor-icons/react';
import type { CalendarEvent, DeadlineRisk } from '@/api/hooks.js';
import { AgendaRow, DeadlineRow, PanelHeader, daysUntil } from './common.js';

interface Props {
  agenda:          CalendarEvent[];
  atRisk:          DeadlineRisk[];
  maxDeadlineDays?: number;
}

export function AgendaWidget({ agenda, atRisk, maxDeadlineDays = 7 }: Props) {
  const urgentDeadlines = atRisk.filter((d) => daysUntil(d.date) <= maxDeadlineDays);

  return (
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

      {/* Urgent deadlines */}
      <div className="cyber-panel">
        <PanelHeader
          icon={<WarningIcon size={13} weight="duotone" style={{ color: 'var(--warn)' }} />}
          title={`מועדים קרובים — ${maxDeadlineDays} ימים`}
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
  );
}
