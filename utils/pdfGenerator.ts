import jsPDF from 'jspdf';
import { Attendee, AppSettings, Form } from '../types';

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

export const generateTicketPDF = async (
  attendee: Attendee,
  settings: AppSettings,
  form?: Form,
  registrationUrl?: string
): Promise<jsPDF> => {
  const doc = new jsPDF();

  // Merge global PDF settings with form-specific overrides
  const pdfConfig = {
    ...settings.pdfSettings,
    ...(form?.pdfSettings || {})
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
      console.error("PDF Background Error:", e);
    }
  }

  // --- Header Background ---
  doc.setFillColor(primaryColor);
  doc.rect(0, 0, pageWidth, 50, 'F');

  let headerTextX = 20;

  // --- Logo Handling (Left Side) ---
  const logoDataUrl = await toDataUrl(pdfConfig.logoUrl);
  if (logoDataUrl && logoDataUrl.length > 50) {
    try {
      const format = logoDataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(logoDataUrl, format, 15, 12, 25, 25, undefined, 'FAST');
      headerTextX = 45;
    } catch (e) {
      console.error("PDF Logo Error:", e);
    }
  }

  // --- Organization Info (Right Side) ---
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text((pdfConfig.organizationName || 'Event').toUpperCase(), pageWidth - 15, 18, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const orgInfoLines = (pdfConfig.organizationInfo || '').split('\n');
  doc.text(orgInfoLines, pageWidth - 15, 24, { align: 'right' });

  // --- Event Title ---
  const displayTitle = pdfConfig.eventTitle || attendee.formTitle || 'Event Registration';
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(displayTitle, headerTextX, 30);

  // --- Main Ticket Body Box ---
  const bodyStartY = 70;
  const hasDonation = attendee.donatedSeats && attendee.donatedSeats > 0;
  const isPlaceholder = registrationUrl && registrationUrl.length > 0;
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
      doc.text("SCAN FOR ENTRY", qrX + qrBoxSize / 2, qrY + qrBoxSize + 5, { align: 'center' });
    } else {
      throw new Error('QR fetch failed');
    }
  } catch (e) {
    doc.setDrawColor(primaryColor);
    doc.rect(qrX, qrY, qrBoxSize, qrBoxSize);
    doc.text("QR ERROR", qrX, qrY + 20);
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
      doc.text("TO REGISTER", regQrX + regQrBoxSize / 2, regQrY - 3, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(["Scan the QR code, or visit the link below:"], regQrX + regQrBoxSize / 2, regQrY + regQrBoxSize + 4, { align: 'center' });
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
      console.error("Reg QR Error", e);
    }
  }

  // --- Attendee Details ---
  let currentY = bodyStartY + 20;
  const labelX = 35;

  doc.setTextColor(150, 150, 150);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text("ATTENDEE", labelX, currentY);

  currentY += 8;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(20);
  doc.text(attendee.name || 'Attendee', labelX, currentY, { maxWidth: 90 });

  currentY += 15;
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(10);
  doc.text("TICKET TYPE", labelX, currentY);

  currentY += 6;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(14);
  doc.text(attendee.ticketType || 'General Admission', labelX, currentY, { maxWidth: 90 });

  currentY += 15;
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(10);
  doc.text("REGISTRATION ID", labelX, currentY);

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
  doc.text("DATE", labelX, currentY);

  currentY += 6;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(12);
  doc.text(formatDate(attendee.registeredAt), labelX, currentY);

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
      doc.text("DONATED TABLES", labelX, currentY);
      currentY += 6;
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(14);
      doc.text(`${attendee.donatedTables || 0} table${(attendee.donatedTables || 0) !== 1 ? 's' : ''} (${attendee.donatedSeats || 0} seat${(attendee.donatedSeats || 0) !== 1 ? 's' : ''})`, labelX, currentY);
    } else {
      doc.text("DONATED SEATS", labelX, currentY);
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
  doc.text("Generated by EventCheck", pageWidth / 2, 285, { align: 'center' });

  return doc;
};

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (e) {
    return dateStr;
  }
};
