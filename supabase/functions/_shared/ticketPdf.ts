// The branded ticket PDF — ONE layout, drawn identically in the browser and in
// the Deno edge runtime.
//
// WHY THIS MOVED HERE (2026-08-18)
// Staff confirmation emails were shipping the check-in QR as a bare PNG
// attachment. It scanned, but it looked like a screenshot, not a ticket — no
// logo, no colours, no name, no header or footer. The fix is to attach the same
// branded PDF the /#/tickets page produces, which means the SERVER has to be
// able to draw it.
//
// The long-standing assumption was that a server-side PDF wasn't viable because
// jsPDF is browser-oriented. That was re-tested on 2026-08-18 with a throwaway
// edge function: `npm:jspdf@2.5.1` bundles through `--use-api` and runs in the
// edge runtime, producing a valid PDF with a fetched PNG embedded. The only
// genuinely browser-bound piece was `FileReader`, which the caller now supplies
// via `deps.toDataUrl`.
//
// jsPDF itself is INJECTED rather than imported, because the two runtimes
// resolve it differently (`jspdf` via Vite vs `npm:jspdf` via Deno). Injecting
// the already-constructed document keeps this module runtime-agnostic and
// dependency-free.
//
// Types are structural for the same reason the module can't import ../../types:
// the edge bundler only uploads files under supabase/functions. The real
// Attendee/AppSettings/Form interfaces are supersets and satisfy these by shape.

import { resolveAttendeeDisplayName, type NameForm } from './attendeeDisplayName.ts';

/**
 * The subset of the jsPDF API this layout uses. Deliberately permissive on
 * argument types — jsPDF's own overloads differ slightly between the browser
 * bundle and the npm build, and pinning them here would only create friction
 * without catching real bugs.
 */
export interface JsPdfLike {
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
  setFillColor(...args: any[]): any;
  setDrawColor(...args: any[]): any;
  setTextColor(...args: any[]): any;
  setFontSize(size: number): any;
  setFont(family: string, style?: string): any;
  text(text: any, x: number, y: number, options?: any): any;
  textWithLink(text: string, x: number, y: number, options: any): any;
  rect(x: number, y: number, w: number, h: number, style?: string): any;
  roundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string): any;
  addImage(...args: any[]): any;
  output(type: string, options?: any): any;
  getTextWidth(text: string): number;
}

/**
 * Read intrinsic pixel dimensions out of a data: URL.
 *
 * Only PNG is parsed (IHDR is at a fixed offset, so this is exact and cheap).
 * Anything else returns null and the caller falls back to a fixed square box —
 * the historical behaviour. Needed because brand logos are wordmarks, not
 * squares: GANSID's is 1200x400, and forcing that into 25x25mm squashes it to
 * a third of its width.
 */
export function readPngSize(dataUrl: string | undefined): { w: number; h: number } | null {
  if (!dataUrl || !dataUrl.includes('image/png') || !dataUrl.includes('base64,')) return null;
  try {
    const b64 = dataUrl.slice(dataUrl.indexOf('base64,') + 7, dataUrl.indexOf('base64,') + 7 + 64);
    const bin = atob(b64);
    // PNG signature (8 bytes) + length(4) + 'IHDR'(4) => width at 16, height at 20.
    if (bin.charCodeAt(0) !== 0x89 || bin.slice(1, 4) !== 'PNG') return null;
    const be32 = (o: number) =>
      (bin.charCodeAt(o) << 24) | (bin.charCodeAt(o + 1) << 16) | (bin.charCodeAt(o + 2) << 8) | bin.charCodeAt(o + 3);
    const w = be32(16) >>> 0;
    const h = be32(20) >>> 0;
    return w > 0 && h > 0 ? { w, h } : null;
  } catch {
    return null;
  }
}

/** Scale (w,h) down to fit inside (maxW,maxH), preserving aspect ratio. */
export function fitWithin(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: maxW, h: maxH };
  const scale = Math.min(maxW / w, maxH / h);
  return { w: w * scale, h: h * scale };
}

export interface TicketPdfConfig {
  primaryColor?: string;
  backgroundImage?: string;
  logoUrl?: string;
  organizationName?: string;
  organizationInfo?: string;
  eventTitle?: string;
  /** Draw the title text beside the logo. Default true; false when the logo
   *  is a wordmark that already names the event. */
  showEventTitle?: boolean;
  footerText?: string;
}

export interface TicketAttendee {
  id: string;
  name?: string;
  ticketType?: string;
  qrPayload: string;
  registeredAt: string;
  transactionId?: string | null;
  paymentAmount?: string | null;
  isPrimary?: boolean;
  guestType?: string | null;
  formTitle?: string;
  donatedSeats?: number | null;
  donatedTables?: number | null;
  donationType?: string | null;
  answers?: Record<string, unknown> | null;
}

export interface TicketSettings {
  pdfSettings?: TicketPdfConfig;
}

export interface TicketForm extends NameForm {
  pdfSettings?: TicketPdfConfig;
}

export interface TicketPdfDeps {
  /**
   * Resolve an image reference to a data: URL. jsPDF's addImage only handles
   * data URLs reliably, so http(s) sources must be fetched and encoded first.
   * Implementations differ per runtime (FileReader in the browser,
   * arrayBuffer+btoa in Deno) and BOTH must return undefined rather than throw
   * on failure — a missing logo must never cost someone their ticket.
   */
  toDataUrl(src: string | undefined): Promise<string | undefined>;
}

export function formatTicketDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    // An unparseable date does NOT throw — it yields an Invalid Date whose
    // toLocaleDateString() is the literal string "Invalid Date". The original
    // try/catch never fired, so a bad timestamp would print "Invalid Date" on
    // the ticket instead of falling back to the raw value.
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Draw the ticket onto an existing jsPDF document.
 *
 * The caller owns document construction and output, so the browser can hand
 * back a jsPDF instance (for .save()/.output('arraybuffer')) while the edge
 * function takes the bytes straight to an email attachment.
 */
export async function drawTicketPdf(
  doc: JsPdfLike,
  attendee: TicketAttendee,
  settings: TicketSettings,
  form: TicketForm | undefined,
  registrationUrl: string | undefined,
  deps: TicketPdfDeps,
): Promise<void> {
  const { toDataUrl } = deps;

  // Merge global PDF settings with form-specific overrides
  const pdfConfig: TicketPdfConfig = {
    ...(settings.pdfSettings || {}),
    ...(form?.pdfSettings || {}),
  };

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primaryColor = pdfConfig.primaryColor || '#4F46E5';
  // Guest placeholder tickets get a distinct accent color for the left bar
  const accentColor = (!attendee.isPrimary && registrationUrl) ? '#C8262A' : primaryColor;

  // --- Background Image Handling ---
  const backgroundDataUrl = await toDataUrl(pdfConfig.backgroundImage);
  if (backgroundDataUrl && backgroundDataUrl.length > 50) {
    try {
      const format = backgroundDataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(backgroundDataUrl, format, 0, 0, pageWidth, pageHeight, undefined, 'FAST');
    } catch (e) {
      console.error('PDF Background Error:', e);
    }
  }

  // --- Header Background ---
  doc.setFillColor(primaryColor);
  doc.rect(0, 0, pageWidth, 50, 'F');

  let headerTextX = 20;

  // --- Logo Handling (Left Side) ---
  // Fitted to its real aspect ratio rather than forced into a 25x25 square.
  // Brand logos here are wordmarks (GANSID's is 3:1), and squashing one makes
  // the ticket look broken — which is half of why these tickets read as
  // unbranded. Falls back to the historical square box when dimensions can't
  // be read (non-PNG).
  const logoDataUrl = await toDataUrl(pdfConfig.logoUrl);
  let logoDrawn = false;
  if (logoDataUrl && logoDataUrl.length > 50) {
    try {
      const format = logoDataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
      const LOGO_MAX_W = 58;
      const LOGO_MAX_H = 22;
      const intrinsic = readPngSize(logoDataUrl);
      const box = intrinsic
        ? fitWithin(intrinsic.w, intrinsic.h, LOGO_MAX_W, LOGO_MAX_H)
        : { w: 25, h: 25 };
      // Vertically centre within the 50mm header band.
      const logoY = (50 - box.h) / 2;
      doc.addImage(logoDataUrl, format, 15, logoY, box.w, box.h, undefined, 'FAST');
      headerTextX = 15 + box.w + 8;
      logoDrawn = true;
    } catch (e) {
      console.error('PDF Logo Error:', e);
    }
  }

  // --- Organization Info (Right Side) ---
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text((pdfConfig.organizationName || 'Event').toUpperCase(), pageWidth - 15, 18, { align: 'right' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const orgNameW = doc.getTextWidth((pdfConfig.organizationName || 'Event').toUpperCase());

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const orgInfoLines = (pdfConfig.organizationInfo || '').split('\n');
  doc.text(orgInfoLines, pageWidth - 15, 24, { align: 'right' });
  const orgBlockW = Math.max(orgNameW, ...orgInfoLines.map(l => doc.getTextWidth(l)), 0);

  // --- Event Title ---
  // Shrink to fit the gap the logo and org block leave behind, and drop it
  // entirely if there is genuinely no room — a squeezed title overlapping the
  // org info looks worse than a header carried by the wordmark alone.
  const showTitle = pdfConfig.showEventTitle !== false;
  if (showTitle) {
    const displayTitle = pdfConfig.eventTitle || attendee.formTitle || 'Event Registration';
    const titleAvailW = (pageWidth - 15 - orgBlockW - 6) - headerTextX;
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    let titleSize = 22;
    doc.setFontSize(titleSize);
    while (titleSize > 10 && doc.getTextWidth(displayTitle) > titleAvailW) {
      titleSize -= 1;
      doc.setFontSize(titleSize);
    }
    if (doc.getTextWidth(displayTitle) <= titleAvailW) {
      // Baseline sits below the logo when one is present, level with it otherwise.
      doc.text(displayTitle, headerTextX, logoDrawn ? 32 : 30);
    }
  }

  // --- Main Ticket Body Box ---
  const bodyStartY = 70;
  const hasDonation = !!attendee.donatedSeats && attendee.donatedSeats > 0;
  // Only stamp the "TO REGISTER" QR on tickets whose recipient still has to
  // fill out their own details (placeholder guests / pending-claim staff).
  // Once a guest has claimed (guestType becomes `claimed`, `staff-claimed`,
  // or `exhibitor-staff-claimed`) we drop the registration QR so they don't
  // see a redundant "scan to register" block on the ticket they already own.
  const isPendingClaim = attendee.guestType === 'pending-claim'
    || attendee.guestType === 'staff-pending'
    || attendee.guestType === 'exhibitor-staff-pending';
  const isPlaceholder = !!registrationUrl && registrationUrl.length > 0 && isPendingClaim;
  const hasPayment = !!attendee.transactionId;
  const bodyHeight = isPlaceholder ? 160 : (hasDonation ? 150 : (hasPayment ? 125 : 110));

  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(20, bodyStartY, pageWidth - 40, bodyHeight, 3, 3);

  doc.setFillColor(accentColor);
  doc.roundedRect(20, bodyStartY, 4, bodyHeight, 3, 3, 'F');

  // --- QR Code (ENTRY) ---
  const qrBoxSize = 45;
  const qrX = pageWidth - 20 - qrBoxSize - 10;
  const qrY = bodyStartY + 10;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(attendee.qrPayload)}`;
  const qrDataUrl = await toDataUrl(qrUrl);
  try {
    if (qrDataUrl) {
      doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrBoxSize, qrBoxSize);
      doc.setFontSize(9);
      doc.setTextColor(primaryColor);
      doc.text('SCAN FOR ENTRY', qrX + qrBoxSize / 2, qrY + qrBoxSize + 5, { align: 'center' });
    } else {
      throw new Error('QR fetch failed');
    }
  } catch {
    doc.setDrawColor(primaryColor);
    doc.rect(qrX, qrY, qrBoxSize, qrBoxSize);
    doc.text('QR ERROR', qrX, qrY + 20);
  }

  // --- REGISTRATION QR CODE (If placeholder) ---
  if (isPlaceholder) {
    const regQrBoxSize = 30;
    const regQrX = qrX + (qrBoxSize - regQrBoxSize) / 2;
    const regQrY = qrY + qrBoxSize + 25;

    // Extended height to fit the plain-text URL below the helper copy.
    doc.setFillColor(243, 244, 246); // Light gray highlight
    doc.roundedRect(qrX - 5, regQrY - 10, qrBoxSize + 10, regQrBoxSize + 46, 2, 2, 'F');

    const regQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(registrationUrl!)}`;
    const regQrDataUrl = await toDataUrl(regQrUrl);
    try {
      if (regQrDataUrl) doc.addImage(regQrDataUrl, 'PNG', regQrX, regQrY, regQrBoxSize, regQrBoxSize);
      doc.setFontSize(8);
      doc.setTextColor(30, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.text('TO REGISTER', regQrX + regQrBoxSize / 2, regQrY - 3, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(['Scan the QR code, or visit the link below:'], regQrX + regQrBoxSize / 2, regQrY + regQrBoxSize + 4, { align: 'center' });
      // Plain-text URL so recipients who can't scan can type/click the link.
      // Strip the protocol for readability and wrap within the highlight box.
      const displayUrl = registrationUrl!.replace(/^https?:\/\//, '');
      doc.setFontSize(6);
      doc.setTextColor(59, 130, 246);
      doc.textWithLink(displayUrl, regQrX + regQrBoxSize / 2, regQrY + regQrBoxSize + 11, {
        url: registrationUrl!,
        align: 'center',
        maxWidth: qrBoxSize + 8,
      });
    } catch (e) {
      console.error('Reg QR Error', e);
    }
  }

  // --- Attendee Details ---
  let currentY = bodyStartY + 20;
  const labelX = 35;

  doc.setTextColor(150, 150, 150);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ATTENDEE', labelX, currentY);

  currentY += 8;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(20);
  doc.text(resolveAttendeeDisplayName(attendee, form), labelX, currentY, { maxWidth: 90 });

  currentY += 15;
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(10);
  doc.text('TICKET TYPE', labelX, currentY);

  currentY += 6;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(14);
  doc.text(attendee.ticketType || 'General Admission', labelX, currentY, { maxWidth: 90 });

  currentY += 15;
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(10);
  doc.text('REGISTRATION ID', labelX, currentY);

  currentY += 6;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(12);
  doc.setFont('courier', 'normal');
  doc.text(attendee.id, labelX, currentY);

  if (attendee.transactionId) {
    currentY += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Transaction: ${attendee.transactionId}`, labelX, currentY);
  }

  currentY += 15;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(10);
  doc.text('DATE', labelX, currentY);

  currentY += 6;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(12);
  doc.text(formatTicketDate(attendee.registeredAt), labelX, currentY);

  if (attendee.transactionId) {
    currentY += 10;
    doc.setFontSize(9);
    doc.setTextColor(primaryColor);
    doc.text(`Paid via PayPal (${attendee.paymentAmount || 'Paid'})`, labelX, currentY);
  }

  // --- Donated Seats/Tables Info (inside the box when present) ---
  if (hasDonation) {
    currentY += 15;
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');

    if (attendee.donationType === 'table' && (attendee.donatedTables || 0) > 0) {
      doc.text('DONATED TABLES', labelX, currentY);
      currentY += 6;
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(14);
      doc.text(`${attendee.donatedTables || 0} table${(attendee.donatedTables || 0) !== 1 ? 's' : ''} (${attendee.donatedSeats || 0} seat${(attendee.donatedSeats || 0) !== 1 ? 's' : ''})`, labelX, currentY);
    } else {
      doc.text('DONATED SEATS', labelX, currentY);
      currentY += 6;
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(14);
      doc.text(`${attendee.donatedSeats || 0} seat${(attendee.donatedSeats || 0) !== 1 ? 's' : ''}`, labelX, currentY);
    }
  }

  // --- Footer ---
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.text(pdfConfig.footerText || '', pageWidth / 2, 280, { align: 'center' });
  doc.text('Generated by EventCheck', pageWidth / 2, 285, { align: 'center' });
}

/** Filesystem-safe ticket filename, e.g. `Sameera_G_Ticket.pdf`. */
export function ticketPdfFilename(displayName: string): string {
  const safe = (displayName || 'Attendee').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  return `${safe || 'Attendee'}_Ticket.pdf`;
}

/**
 * Map a raw `attendees` DB row (snake_case) to the camelCase shape the ticket
 * layout expects.
 *
 * The edge function reads rows straight from PostgREST, while the browser
 * receives them already mapped by storageService. Keeping the translation here
 * — pure and unit-tested — means the server can't drift into drawing a ticket
 * with a blank name or a missing QR just because a column name was mistyped.
 */
export function ticketFromAttendeeRow(row: any, formTitle?: string): TicketAttendee {
  return {
    id: row.id,
    name: row.name ?? undefined,
    ticketType: row.ticket_type ?? undefined,
    // Fall back to the row id so a row with a null qr_payload still produces a
    // scannable ticket rather than an empty box — the scanner resolves by id.
    qrPayload: row.qr_payload || JSON.stringify({ id: row.id }),
    registeredAt: row.registered_at ?? new Date().toISOString(),
    transactionId: row.transaction_id ?? null,
    paymentAmount: row.payment_amount ?? null,
    isPrimary: row.is_primary ?? false,
    guestType: row.guest_type ?? null,
    formTitle: formTitle ?? undefined,
    donatedSeats: row.donated_seats ?? null,
    donatedTables: row.donated_tables ?? null,
    donationType: row.donation_type ?? null,
    answers: (row.answers ?? null) as Record<string, unknown> | null,
  };
}

/**
 * Base64-encode bytes for a nodemailer `content` field.
 *
 * Chunked deliberately: `String.fromCharCode(...bytes)` on a whole PDF blows
 * the call stack once the array is a few hundred KB, which is exactly the size
 * a ticket with an embedded logo reaches.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  }
  return btoa(binary);
}
