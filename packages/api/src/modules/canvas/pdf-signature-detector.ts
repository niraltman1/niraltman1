import { readFile } from 'node:fs/promises';

export interface PdfSignatureResult {
  signed:     boolean;
  signerName: string | null;
}

const SIG_MARKERS = ['/Sig', '/ByteRange', 'AcroForm', '/SigFlags'];

export async function detectPdfSignature(pdfPath: string): Promise<PdfSignatureResult> {
  try {
    const buf     = await readFile(pdfPath);
    const content = buf.toString('binary', 0, Math.min(buf.length, 65536));
    const found   = SIG_MARKERS.some((m) => content.includes(m));
    return { signed: found, signerName: null };
  } catch {
    return { signed: false, signerName: null };
  }
}
