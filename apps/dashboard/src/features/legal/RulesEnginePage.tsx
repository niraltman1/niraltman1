import { useMemo } from 'react';
import { ScalesIcon, ClockIcon, WarningIcon, BookOpenIcon } from '@phosphor-icons/react';
import { useRules, type Rule } from '@/api/hooks.js';

const PROCEDURE_LABELS: Record<string, string> = {
  civil:                  'אזרחי',
  civil_appeal:           'ערעור אזרחי',
  criminal:               'פלילי',
  family:                 'משפחה',
  labor:                  'עבודה',
  administrative:         'מינהלי',
  constitutional:         'חוקתי (בג"ץ)',
  insolvency:             'חדלות פירעון',
  traffic_administrative: 'תעבורה',
};

function procedureLabel(type: string): string {
  return PROCEDURE_LABELS[type] ?? type;
}

export function RulesEnginePage() {
  const { data: rules = [], isLoading, isError } = useRules();

  const grouped = useMemo(() => {
    const map = new Map<string, Rule[]>();
    for (const r of rules) {
      const arr = map.get(r.procedureType) ?? [];
      arr.push(r);
      map.set(r.procedureType, arr);
    }
    return Array.from(map.entries());
  }, [rules]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <ScalesIcon size={22} className="text-gold" />
        <h1 className="text-xl font-semibold text-parchment">מנוע כללים — סדרי דין</h1>
        <span className="text-parchment/40 text-sm">({rules.length} כללים)</span>
      </div>

      {/* Legal-review notice — the seeded deadlines are a first draft. */}
      <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 text-amber-200/90 text-sm">
        <WarningIcon size={18} className="mt-0.5 shrink-0" />
        <p>
          הכללים והמועדים שמוצגים כאן הם טיוטה ראשונית המעוגנת בחקיקה המצוטטת, ונדרשת בדיקה של עו"ד
          לפני הסתמכות. המועדים נשמרים כנתונים במסד (Rules_Engine) וניתן לעדכן אותם ללא שינוי קוד.
        </p>
      </div>

      {isLoading ? (
        <p className="text-parchment/30 text-sm">טוען כללים…</p>
      ) : isError ? (
        <p className="text-red-400/80 text-sm">שגיאה בטעינת הכללים</p>
      ) : rules.length === 0 ? (
        <p className="text-parchment/30 text-sm">לא הוגדרו כללים</p>
      ) : (
        <div className="space-y-5">
          {grouped.map(([type, typeRules]) => (
            <section key={type}>
              <h2 className="text-parchment/60 text-sm font-semibold mb-2">
                {procedureLabel(type)} <span className="text-parchment/30">· {typeRules.length}</span>
              </h2>
              <ul className="space-y-2">
                {typeRules.map((r) => (
                  <li key={r.id} className="bg-navy-100 border border-parchment/10 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-parchment font-medium">{r.ruleName}</span>
                      {r.deadlineDays != null ? (
                        <span className="inline-flex items-center gap-1 text-gold text-xs bg-gold/10 border border-gold/25 rounded-lg px-2 py-1">
                          <ClockIcon size={12} />
                          {r.deadlineDays} ימים
                          {r.deadlineBasis && <span className="text-parchment/50">· מ{r.deadlineBasis}</span>}
                        </span>
                      ) : (
                        <span className="text-parchment/35 text-xs">מועד לפי החלטת בית המשפט</span>
                      )}
                    </div>
                    {r.description && (
                      <p className="text-parchment/60 text-sm mt-1.5">{r.description}</p>
                    )}
                    {r.sourceReference && (
                      <p className="inline-flex items-center gap-1 text-parchment/35 text-[11px] mt-1.5">
                        <BookOpenIcon size={11} />
                        {r.sourceReference}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
