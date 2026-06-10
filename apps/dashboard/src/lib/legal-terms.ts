/** Hebrew display labels for Israeli legal procedure types (procedure_type column). */
export const PROCEDURE_TYPE_LABELS: Record<string, string> = {
  civil:                  'אזרחי',
  civil_appeal:           'ערעור אזרחי',
  criminal:               'פלילי',
  traffic_administrative: 'תעבורה - מנהלי',
  traffic_criminal:       'תעבורה - פלילי',
  labor:                  'עבודה',
  family:                 'משפחה',
  administrative:         'מינהלי',
  constitutional:         'חוקתי (בג"ץ)',
  insolvency:             'חדלות פירעון',
  academic:               'אקדמי',
  other:                  'אחר',
};

export function procedureTypeLabel(type: string | null | undefined): string {
  if (!type) return '';
  return PROCEDURE_TYPE_LABELS[type] ?? type;
}

/** CSS badge variant per procedure type (maps to Tailwind classes). */
export const PROCEDURE_TYPE_BADGE: Record<string, string> = {
  criminal:               'bg-red-900/40 text-red-300',
  traffic_criminal:       'bg-red-900/30 text-red-400',
  constitutional:         'bg-violet-900/40 text-violet-300',
  civil:                  'bg-blue-900/30 text-blue-300',
  civil_appeal:           'bg-blue-900/20 text-blue-400',
  family:                 'bg-rose-900/30 text-rose-300',
  labor:                  'bg-amber-900/30 text-amber-300',
  administrative:         'bg-green-900/30 text-green-300',
  traffic_administrative: 'bg-orange-900/30 text-orange-300',
  insolvency:             'bg-yellow-900/30 text-yellow-300',
  academic:               'bg-teal-900/30 text-teal-300',
};

/** Hebrew display labels for case status values. */
export const CASE_STATUS_LABELS: Record<string, string> = {
  open:      'פתוח',
  closed:    'סגור',
  suspended: 'מושהה',
  archived:  'ארכיון',
};

/** Hebrew labels for document processing states. */
export const PROCESSING_STATE_LABELS: Record<string, string> = {
  PENDING:       'ממתין',
  OCR_COMPLETE:  'OCR הושלם',
  AI_ENRICHED:   'עובד ע"י AI',
  FAILED:        'נכשל',
};

/** ISO date string → localized Hebrew date display (dd/mm/yyyy). */
export function formatDateHe(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Days from today to an ISO date string. Negative = overdue. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86_400_000);
}
