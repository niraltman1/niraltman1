export interface CourtReceiptResult {
  detected:  boolean;
  keywords:  string[];
}

const RECEIPT_PATTERNS = [
  /קבלה/u,
  /אישור\s+הגשה/u,
  /נתקבל\s+בבית\s+המשפט/u,
  /תאריך\s+קבלה/u,
  /מסמך\s+נרשם/u,
  /נרשם\s+ב/u,
  /receipt\s+stamp/i,
];

export function detectCourtReceipt(ocrText: string): CourtReceiptResult {
  const found = RECEIPT_PATTERNS.filter((re) => re.test(ocrText));
  return {
    detected: found.length > 0,
    keywords: found.map((r) => r.source),
  };
}
