/**
 * RepairRecommendationsEngine — analyzes a SystemSnapshot + live DB to
 * produce an actionable list of RepairRecommendation objects.
 *
 * Detects:
 *   - Stale FTS5 shadow tables (out-of-sync full-text search)
 *   - WAL file larger than 100 MB (checkpoint needed)
 *   - Migration gaps (applied count below expected minimum)
 *   - sqlite-vec extension failures (vector index unavailable)
 *   - Orphan files (files in PipelineLogs with no matching DB record)
 */

export type RepairAction =
  | 'rebuild-fts'
  | 'wal-checkpoint'
  | 'vacuum'
  | 'validate-vec'
  | 'validate-migrations'
  | 'orphan-cleanup';

export type RepairSeverity = 'info' | 'warn' | 'critical';

export interface RepairRecommendation {
  action:       RepairAction;
  severity:     RepairSeverity;
  titleHe:      string;
  descriptionHe: string;
  /** Estimated duration in seconds */
  estimatedSec:  number;
  safeToAutoRun: boolean;
}

export interface RecommendationsInput {
  /** WAL file size in bytes (0 if not found) */
  walSizeBytes:       number;
  /** Number of applied migrations */
  appliedMigrations:  number;
  /** Minimum expected migrations count */
  expectedMigrations: number;
  /** Whether sqlite-vec loaded successfully */
  vecAvailable:       boolean;
  /** Whether FTS integrity check passed */
  ftsHealthy:         boolean;
  /** Number of orphan pipeline log entries with missing files */
  orphanCount:        number;
}

const WAL_WARN_BYTES  = 50  * 1024 * 1024;   // 50 MB
const WAL_CRIT_BYTES  = 100 * 1024 * 1024;   // 100 MB

export class RepairRecommendationsEngine {
  analyze(input: RecommendationsInput): RepairRecommendation[] {
    const recs: RepairRecommendation[] = [];

    // 1. WAL size
    if (input.walSizeBytes >= WAL_CRIT_BYTES) {
      recs.push({
        action:        'wal-checkpoint',
        severity:      'critical',
        titleHe:       'קובץ WAL גדול מאוד',
        descriptionHe: `קובץ WAL הגיע ל-${Math.round(input.walSizeBytes / 1024 / 1024)} MB. נדרש checkpoint מיידי למניעת האטה.`,
        estimatedSec:  10,
        safeToAutoRun: true,
      });
    } else if (input.walSizeBytes >= WAL_WARN_BYTES) {
      recs.push({
        action:        'wal-checkpoint',
        severity:      'warn',
        titleHe:       'קובץ WAL גדול',
        descriptionHe: `קובץ WAL הגיע ל-${Math.round(input.walSizeBytes / 1024 / 1024)} MB. מומלץ לבצע checkpoint.`,
        estimatedSec:  10,
        safeToAutoRun: true,
      });
    }

    // 2. FTS integrity
    if (!input.ftsHealthy) {
      recs.push({
        action:        'rebuild-fts',
        severity:      'warn',
        titleHe:       'אינדקס חיפוש פגום',
        descriptionHe: 'בדיקת שלמות FTS5 נכשלה. בנייה מחדש של אינדקס החיפוש תשפר את תוצאות החיפוש.',
        estimatedSec:  30,
        safeToAutoRun: true,
      });
    }

    // 3. Migration gaps
    if (input.appliedMigrations < input.expectedMigrations) {
      const missing = input.expectedMigrations - input.appliedMigrations;
      recs.push({
        action:        'validate-migrations',
        severity:      'critical',
        titleHe:       `${missing} מיגרציות חסרות`,
        descriptionHe: `הופעלו ${input.appliedMigrations} מתוך ${input.expectedMigrations} מיגרציות. ייתכן שחסרות עמודות או טבלאות.`,
        estimatedSec:  60,
        safeToAutoRun: false,
      });
    }

    // 4. sqlite-vec
    if (!input.vecAvailable) {
      recs.push({
        action:        'validate-vec',
        severity:      'warn',
        titleHe:       'הרחבת sqlite-vec אינה זמינה',
        descriptionHe: 'חיפוש סמנטי וחיפוש דמיון AI לא יפעלו. יש לוודא התקנת sqlite-vec.',
        estimatedSec:  5,
        safeToAutoRun: false,
      });
    }

    // 5. Orphan cleanup
    if (input.orphanCount > 0) {
      recs.push({
        action:        'orphan-cleanup',
        severity:      input.orphanCount > 50 ? 'warn' : 'info',
        titleHe:       `${input.orphanCount} רשומות עזובות`,
        descriptionHe: `נמצאו ${input.orphanCount} רשומות pipeline ללא קבצים תואמים. ניקוי ישפר ביצועים.`,
        estimatedSec:  15,
        safeToAutoRun: true,
      });
    }

    // 6. Vacuum (always recommend if other issues exist)
    if (recs.length > 0) {
      recs.push({
        action:        'vacuum',
        severity:      'info',
        titleHe:       'דחיסת מסד הנתונים',
        descriptionHe: 'הפעלת VACUUM תקטין את גודל מסד הנתונים ותשפר ביצועים לאחר ביצוע תיקונים.',
        estimatedSec:  20,
        safeToAutoRun: true,
      });
    }

    return recs;
  }
}
