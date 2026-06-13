// DataMigrationPage — /data-migration
// Phase 3B: Database Intelligence Platform — preview-only (no import execution).
// Source selection, schema preview, mapping, document inventory, file structure.

import { Link } from 'react-router-dom';
import { DatabaseIcon, WarningIcon } from '@phosphor-icons/react';

export function DataMigrationPage() {
  return (
    <div dir="rtl" style={{ padding: '24px', maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <div className="flex items-center gap-3 mb-2">
          <DatabaseIcon size={20} weight="duotone" style={{ color: 'var(--info)' }} />
          <h1 style={{ fontFamily: 'var(--f-mono)', fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-1)', margin: 0 }}>
            ייבוא נתונים
          </h1>
        </div>
        <p style={{ color: 'var(--fg-4)', fontSize: 13 }}>
          פלטפורמת מיגרציה חכמה — סריקה, ניתוח סמנטי, מיפוי אוטומטי לטבלאות Factum-IL.
        </p>
      </div>

      <div
        className="cyber-panel p-4 mb-4 flex items-center gap-3"
        style={{ borderColor: 'rgba(197,160,89,0.3)', background: 'rgba(197,160,89,0.04)' }}
      >
        <WarningIcon size={16} weight="fill" style={{ color: 'var(--warn)', flexShrink: 0 }} />
        <p style={{ color: 'var(--warn)', fontSize: 12, margin: 0 }}>
          תצוגה מקדימה בלבד — ביצוע ייבוא יהיה זמין בעדכון עתידי.
        </p>
      </div>

      <div className="cyber-panel p-6 text-center" style={{ borderColor: 'rgba(100,150,255,0.15)', background: 'rgba(100,150,255,0.02)' }}>
        <DatabaseIcon size={28} weight="duotone" style={{ color: 'var(--info)', marginBottom: 12 }} />
        <p style={{ color: 'var(--fg-2)', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
          בפיתוח — שלב 3
        </p>
        <p style={{ color: 'var(--fg-4)', fontSize: 12, marginBottom: 16 }}>
          פלטפורמת בינת מסד נתונים תהיה זמינה לאחר השלמת שלב 3.
        </p>
        <Link to="/admin" className="btn btn-ghost btn-sm">
          מעבר לאבחון נוכחי →
        </Link>
      </div>
    </div>
  );
}
