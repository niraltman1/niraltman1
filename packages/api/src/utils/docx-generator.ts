/**
 * DOCX Template Generator — Power of Attorney & Fee Agreements
 *
 * Uses docxtemplater with PizZip to fill Hebrew .docx templates with
 * data from the SQLite database.
 *
 * Template files live in: templates/docx/*.docx
 * Templates use {{{fieldName}}} placeholders (raw XML / triple-brace for HTML,
 * {fieldName} for plain text).
 *
 * Available templates:
 *   - power_of_attorney.docx  (ייפוי כוח)
 *   - fee_agreement.docx      (הסכם שכר טרחה)
 *
 * When a template file doesn't exist, a minimal in-memory DOCX is generated
 * from a plain-text fallback so the endpoint always returns a valid .docx.
 */

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', '..', '..', '..', 'templates', 'docx');

export type DocxTemplate = 'power_of_attorney' | 'fee_agreement';

export interface PowerOfAttorneyData {
  clientNameHe:     string;
  clientIdNumber:   string;
  clientAddress:    string;
  lawyerName:       string;
  lawyerBarNumber:  string;
  caseNumber:       string;
  caseDescription:  string;
  signDate:         string;  // DD/MM/YYYY
  firmName:         string;
}

export interface FeeAgreementData {
  clientNameHe:     string;
  clientIdNumber:   string;
  lawyerName:       string;
  lawyerBarNumber:  string;
  caseType:         string;
  feeAmount:        string;  // formatted number e.g. "15,000"
  feeCurrency:      string;  // "₪" or "USD"
  successBonus:     string;
  signDate:         string;
  firmName:         string;
  courtName:        string;
}

export type TemplateData = PowerOfAttorneyData | FeeAgreementData;

/**
 * Loads the .docx template file, fills placeholders, and returns a Buffer
 * containing the filled document ready to stream to the client.
 */
export function generateDocx(
  template:    DocxTemplate,
  data:        TemplateData,
): Buffer {
  const templatePath = join(TEMPLATES_DIR, `${template}.docx`);

  let zip: PizZip;

  if (existsSync(templatePath)) {
    const content = readFileSync(templatePath);
    zip = new PizZip(content);
  } else {
    // Fallback: create a stub .docx with plain-text placeholders replaced
    mkdirSync(TEMPLATES_DIR, { recursive: true });
    zip = buildFallbackDocx(template, data);
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks:    true,
  });

  doc.render(data as unknown as Record<string, unknown>);

  return doc.getZip().generate({ type: 'nodebuffer', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) as Buffer;
}

/**
 * Builds a minimal valid .docx ZIP when no template file exists.
 * The output is a plain OOXML document with field values listed.
 */
function buildFallbackDocx(template: DocxTemplate, data: TemplateData): PizZip {
  const TITLE = template === 'power_of_attorney' ? 'ייפוי כוח' : 'הסכם שכר טרחה';

  const rows = Object.entries(data)
    .map(([k, v]) => `<w:p><w:r><w:t>${escapeXml(k)}: ${escapeXml(String(v))}</w:t></w:r></w:p>`)
    .join('\n');

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
        <w:t>${escapeXml(TITLE)}</w:t></w:r></w:p>
    ${rows}
    <w:sectPr/>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const zip = new PizZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/document.xml', docXml);
  return zip;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
