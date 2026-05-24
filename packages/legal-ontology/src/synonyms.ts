export const LEGAL_SYNONYM_GROUPS: readonly string[][] = [
  ['תביעה', 'תובענה', 'בקשה'],
  ['פינוי', 'סילוק יד', 'פינוי מושכר'],
  ['שוכר', 'דייר', 'מחזיק', 'ברת רשות'],
  ['ערעור', 'עתירה', 'ערר'],
  ['קנס', 'עיצום כספי', 'פיצוי'],
  ['חוזה', 'הסכם', 'עסקה'],
  ['ביטול', 'הפרה', 'אי קיום'],
  ['נתבע', 'משיב', 'מבקש'],
  ['תובע', 'עותר', 'מערער'],
  ['פיצוי', 'תשלום', 'שיפוי'],
  ['מסמך', 'כתב', 'פרוטוקול'],
  ['הסכמה', 'הודאה', 'קבלה'],
];

export function getSynonymExpansions(term: string): string[] {
  for (const group of LEGAL_SYNONYM_GROUPS) {
    if (group.includes(term)) return group.filter(t => t !== term);
  }
  return [];
}
