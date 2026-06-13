/**
 * Browser-side PDF and Word export utilities.
 * Both libraries are dynamically imported so they don't appear in the initial bundle.
 *
 * Supports Hebrew RTL text:
 *  - PDF  : jsPDF embeds Unicode text; modern viewers render Hebrew correctly.
 *  - Word : docx sets paragraph.bidirectional + run.rightToLeft → proper RTL in Word/LibreOffice.
 */

export interface ExportRow {
  label: string;
  value: string | null | undefined;
}

export interface ExportSection {
  title: string;
  rows:  ExportRow[];
}

export interface ExportPayload {
  /** Used as the downloaded filename (without extension). */
  filename: string;
  /** Top-level document title rendered at the start. */
  title:    string;
  /** Subtitle / description line. */
  subtitle?: string;
  sections: ExportSection[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

function safe(s: string | null | undefined): string {
  return s ?? '—';
}

function safeName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── PDF ───────────────────────────────────────────────────────────────────────

export async function exportToPDF(payload: ExportPayload): Promise<void> {
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', putOnlyUsedFonts: true });

  const MARGIN  = 20;
  const PAGE_W  = doc.internal.pageSize.getWidth();
  const PAGE_H  = doc.internal.pageSize.getHeight();
  const CONTENT = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  const newPageIfNeeded = (needed = 8): void => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('FACTUM-IL', MARGIN, y);
  doc.text(new Date().toLocaleDateString('he-IL'), PAGE_W - MARGIN, y, { align: 'right' });
  y += 8;

  doc.setDrawColor(180);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 7;

  doc.setFontSize(16);
  doc.setTextColor(30);
  doc.text(payload.title, PAGE_W - MARGIN, y, { align: 'right' });
  y += 7;

  if (payload.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(payload.subtitle, PAGE_W - MARGIN, y, { align: 'right' });
    y += 6;
  }

  y += 4;
  doc.setDrawColor(200);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;

  // ── Sections ─────────────────────────────────────────────────────────────
  for (const section of payload.sections) {
    newPageIfNeeded(12);

    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.setFont('helvetica', 'bold');
    doc.text(section.title, PAGE_W - MARGIN, y, { align: 'right' });
    y += 2;
    doc.setDrawColor(200);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'normal');

    for (const row of section.rows) {
      if (!row.value) continue;
      newPageIfNeeded(6);

      const labelX = MARGIN + CONTENT * 0.35;
      const valueX = PAGE_W - MARGIN;

      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(row.label, labelX, y, { align: 'right' });

      doc.setTextColor(30);
      const lines = doc.splitTextToSize(safe(row.value), CONTENT * 0.6);
      doc.text(lines as string[], valueX, y, { align: 'right' });
      y += Math.max(5, (lines as string[]).length * 5);
    }

    y += 4;
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`עמוד ${i} מתוך ${pageCount}`, PAGE_W / 2, PAGE_H - 10, { align: 'center' });
    doc.text('© FACTUM-IL — סודי עו"ד–לקוח', MARGIN, PAGE_H - 10);
  }

  doc.save(`${safeName(payload.filename)}.pdf`);
}

// ── Word ─────────────────────────────────────────────────────────────────────

export async function exportToWord(payload: ExportPayload): Promise<void> {
  const {
    Document, Packer, Paragraph, TextRun,
    Table, TableRow, TableCell,
    AlignmentType, WidthType, BorderStyle,
    HeadingLevel,
  } = await import('docx');

  const rtlPara = (text: string, opts?: { bold?: boolean; size?: number; color?: string }): typeof Paragraph.prototype => {
    return new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text,
          ...(opts?.bold !== undefined ? { bold: opts.bold } : {}),
          size:       (opts?.size ?? 11) * 2,
          ...(opts?.color !== undefined ? { color: opts.color } : {}),
          rightToLeft: true,
          font:       'David',
        }),
      ],
    });
  };

  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;

  const sectionToTable = (section: ExportSection) => {
    const rows = section.rows
      .filter((r) => r.value)
      .map((row) =>
        new TableRow({
          children: [
            new TableCell({
              width:    { size: 30, type: WidthType.PERCENTAGE },
              shading:  { fill: 'F5F5F0' },
              borders:  { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
              children: [
                new Paragraph({
                  bidirectional: true,
                  alignment:     AlignmentType.RIGHT,
                  children:      [new TextRun({ text: row.label, bold: true, size: 20, color: '555555', rightToLeft: true, font: 'David' })],
                }),
              ],
            }),
            new TableCell({
              width:    { size: 70, type: WidthType.PERCENTAGE },
              borders:  { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
              children: [
                new Paragraph({
                  bidirectional: true,
                  alignment:     AlignmentType.RIGHT,
                  children:      [new TextRun({ text: safe(row.value), size: 20, rightToLeft: true, font: 'David' })],
                }),
              ],
            }),
          ],
        }),
      );

    if (rows.length === 0) return [];

    return [
      rtlPara(section.title, { bold: true, size: 12, color: '1A3A5C' }) as unknown as InstanceType<typeof Paragraph>,
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows,
        borders: {
          top:           noBorder,
          bottom:        noBorder,
          left:          noBorder,
          right:         noBorder,
          insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E0E0E0' },
          insideVertical:   noBorder,
        },
      }),
      new Paragraph({ text: '' }),
    ];
  };

  const docChildren = [
    rtlPara('FACTUM-IL', { bold: true, size: 9, color: '888888' }) as unknown as InstanceType<typeof Paragraph>,
    rtlPara(payload.title, { bold: true, size: 18 }) as unknown as InstanceType<typeof Paragraph>,
    ...(payload.subtitle
      ? [rtlPara(payload.subtitle, { size: 11, color: '666666' }) as unknown as InstanceType<typeof Paragraph>]
      : []),
    rtlPara(new Date().toLocaleDateString('he-IL'), { size: 10, color: '888888' }) as unknown as InstanceType<typeof Paragraph>,
    new Paragraph({ text: '' }),
    ...payload.sections.flatMap((s) => sectionToTable(s) as unknown as InstanceType<typeof Paragraph>[]),
    new Paragraph({ text: '' }),
    rtlPara('© FACTUM-IL — סודי עו"ד–לקוח', { size: 9, color: 'AAAAAA' }) as unknown as InstanceType<typeof Paragraph>,
  ];

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1000, bottom: 1000, left: 1200, right: 1200 },
        },
      },
      children: docChildren,
    }],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${safeName(payload.filename)}.docx`);
}
