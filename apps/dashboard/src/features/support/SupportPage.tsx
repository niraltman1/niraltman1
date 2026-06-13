// SupportPage — /support
// Phase 3A: System health, support bundle, repair recommendations, self-healing.
// Wired to packages/support-diagnostics and /api/diagnostics/* endpoints.

import { Link } from 'react-router-dom';
import { HardDriveIcon, WarningIcon } from '@phosphor-icons/react';

export function SupportPage() {
  return (
    <div dir="rtl" style={{ padding: '24px', maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <div className="flex items-center gap-3 mb-2">
          <HardDriveIcon size={20} weight="duotone" style={{ color: 'var(--brand-gold)' }} />
          <h1 style={{ fontFamily: 'var(--f-mono)', fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-1)', margin: 0 }}>
            תמיכה ואבחון
          </h1>
        </div>
        <p style={{ color: 'var(--fg-4)', fontSize: 13 }}>
          אבחון מערכת, חבילות תמיכה, המלצות תיקון ופעולות ריפוי עצמי.
        </p>
      </div>

      <div className="cyber-panel p-6 text-center" style={{ borderColor: 'rgba(197,160,89,0.2)', background: 'rgba(197,160,89,0.02)' }}>
        <WarningIcon size={28} weight="duotone" style={{ color: 'var(--warn)', marginBottom: 12 }} />
        <p style={{ color: 'var(--fg-2)', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
          בפיתוח — שלב 3
        </p>
        <p style={{ color: 'var(--fg-4)', fontSize: 12, marginBottom: 16 }}>
          פלטפורמת התמיכה תהיה זמינה לאחר השלמת שלב 3.
        </p>
        <Link to="/admin" className="btn btn-ghost btn-sm">
          מעבר לאבחון נוכחי →
        </Link>
      </div>
    </div>
  );
}
