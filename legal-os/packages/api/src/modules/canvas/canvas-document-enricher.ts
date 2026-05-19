import type { DatabaseConnection } from '@factum-il/database';
import { detectCourtReceipt } from './court-receipt-detector.js';
import { detectPdfSignature } from './pdf-signature-detector.js';

export async function enrichCanvasFields(
  db:          DatabaseConnection,
  docId:       number,
  ocrText:     string,
  storagePath: string,
): Promise<void> {
  const receipt = detectCourtReceipt(ocrText);

  const isPdf = storagePath.toLowerCase().endsWith('.pdf');
  const sig   = isPdf ? await detectPdfSignature(storagePath) : { signed: false };

  db.prepare(`
    UPDATE Documents
    SET is_court_receipt = ?,
        is_signed_pdf    = ?,
        court_receipt_detected_at = CASE WHEN ? = 1 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END
    WHERE id = ?
  `).run(
    receipt.detected ? 1 : 0,
    sig.signed       ? 1 : 0,
    receipt.detected ? 1 : 0,
    docId,
  );
}
