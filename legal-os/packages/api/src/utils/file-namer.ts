import { join, dirname } from 'path';

const SAFE_RE = /[<>:"/\\|?*\x00-\x1f]/g;

function sanitize(s: string, maxLen = 40): string {
  return s.replace(SAFE_RE, '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

/**
 * Build the canonical document name per Legal-OS naming convention:
 *   [YYYY-MM-DD] - [Document_Type] - [Client_Name].pdf
 */
export function buildDocumentName(
  date:       Date,
  docType:    string,
  clientName: string,
): string {
  const dateStr     = date.toISOString().slice(0, 10);
  const safeType    = sanitize(docType)    || 'מסמך';
  const safeClient  = sanitize(clientName) || 'לקוח';
  return `[${dateStr}] - [${safeType}] - [${safeClient}].pdf`;
}

/**
 * Resolve the destination path for a converted PDF under the client's folder.
 * clientFolder should be an absolute path to the client's storage directory.
 */
export function resolveDestinationPath(
  clientFolder: string,
  fileName:     string,
): string {
  return join(clientFolder, 'Legal', fileName);
}

/**
 * Sanitize a Hebrew or Latin string to be safe as a filename component.
 */
export { sanitize as sanitizeFilePart };

/**
 * Format a Date as ISO date (YYYY-MM-DD) in local time.
 */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
