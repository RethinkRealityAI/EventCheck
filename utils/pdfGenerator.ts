import jsPDF from 'jspdf';
import { Attendee, AppSettings, Form } from '../types';
import { drawTicketPdf } from '../supabase/functions/_shared/ticketPdf';

// In-memory cache of fetched image URLs → data URLs. jsPDF's addImage only
// handles data URLs reliably in the browser; an http URL (e.g. a Supabase
// Storage public URL) has to be fetched and encoded first. Cached so the
// same logo isn't fetched N times when building N guest tickets in a row.
const dataUrlCache = new Map<string, string>();

async function toDataUrl(src: string | undefined): Promise<string | undefined> {
  if (!src) return undefined;
  if (src.startsWith('data:')) return src;
  if (!/^https?:\/\//i.test(src)) return undefined;

  const cached = dataUrlCache.get(src);
  if (cached) return cached;

  try {
    const response = await fetch(src, { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    dataUrlCache.set(src, dataUrl);
    return dataUrl;
  } catch (e) {
    console.warn('toDataUrl: failed to fetch image', src, e);
    return undefined;
  }
}

/**
 * Browser adapter over the canonical renderer in
 * supabase/functions/_shared/ticketPdf.ts. The layout lives there so the Deno
 * edge runtime can draw the SAME ticket when it attaches one to an email —
 * previously the server could only send a bare QR PNG, which scanned but
 * looked nothing like a ticket (2026-08-18).
 */
export const generateTicketPDF = async (
  attendee: Attendee,
  settings: AppSettings,
  form?: Form,
  registrationUrl?: string
): Promise<jsPDF> => {
  const doc = new jsPDF();
  await drawTicketPdf(doc, attendee, settings, form, registrationUrl, { toDataUrl });
  return doc;
};

// ---------------------------------------------------------------------------
// Attendee-list PDF (bulk export)
// ---------------------------------------------------------------------------

export interface AttendeeListColumn {
  key: string;
  label: string;
}

export interface AttendeeListMeta {
  title: string;
  subtitle?: string;
  generatedAt: string;
  total: number;
}

/**
 * Render a tabular attendee export to a landscape PDF. Deliberately
 * dependency-free (no jspdf-autotable) — it lays out a simple, paginated
 * grid by hand so we don't add a plugin just for this. Column widths are
 * distributed evenly across the printable width and cell text is truncated to
 * fit; callers should keep the selected-column count reasonable (the export
 * modal's field picker naturally does).
 */
export const generateAttendeeListPDF = (
  rows: Array<Record<string, string>>,
  columns: AttendeeListColumn[],
  meta: AttendeeListMeta,
): jsPDF => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const tableWidth = pageWidth - marginX * 2;
  const cols = columns.length > 0 ? columns : [{ key: '_', label: '' }];
  const colWidth = tableWidth / cols.length;
  const rowHeight = 7;
  const headerFill: [number, number, number] = [79, 70, 229]; // indigo-600

  const drawHeaderBand = () => {
    // Title block at the very top of the first page.
    doc.setFillColor(...headerFill);
    doc.rect(0, 0, pageWidth, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(meta.title, marginX, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const line2 = [meta.subtitle, `${meta.total} record${meta.total !== 1 ? 's' : ''}`, `Generated ${meta.generatedAt}`]
      .filter(Boolean)
      .join('   ·   ');
    doc.text(line2, marginX, 17);
  };

  const drawColumnHeader = (y: number) => {
    doc.setFillColor(238, 240, 252);
    doc.rect(marginX, y, tableWidth, rowHeight, 'F');
    doc.setTextColor(50, 50, 70);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    cols.forEach((c, i) => {
      const x = marginX + i * colWidth + 1.5;
      doc.text(truncate(doc, c.label, colWidth - 3), x, y + rowHeight - 2.2);
    });
    return y + rowHeight;
  };

  const truncate = (d: jsPDF, text: string, maxWidth: number): string => {
    const clean = (text ?? '').replace(/\s+/g, ' ').trim();
    if (d.getTextWidth(clean) <= maxWidth) return clean;
    let out = clean;
    while (out.length > 1 && d.getTextWidth(out + '…') > maxWidth) {
      out = out.slice(0, -1);
    }
    return out + '…';
  };

  drawHeaderBand();
  let y = 26;
  y = drawColumnHeader(y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  rows.forEach((row, idx) => {
    if (y + rowHeight > pageHeight - 8) {
      doc.addPage();
      y = 10;
      y = drawColumnHeader(y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }
    if (idx % 2 === 1) {
      doc.setFillColor(248, 249, 252);
      doc.rect(marginX, y, tableWidth, rowHeight, 'F');
    }
    doc.setTextColor(40, 40, 50);
    cols.forEach((c, i) => {
      const x = marginX + i * colWidth + 1.5;
      doc.text(truncate(doc, row[c.key] ?? '', colWidth - 3), x, y + rowHeight - 2.2);
    });
    y += rowHeight;
  });

  // Footer page numbers.
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(7);
    doc.text(`Page ${p} of ${pageCount} · Generated by EventCheck`, pageWidth / 2, pageHeight - 3, { align: 'center' });
  }

  return doc;
};
