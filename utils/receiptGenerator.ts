import jsPDF from 'jspdf';
import { Attendee, AppSettings } from '../types';

export interface ReceiptOptions {
  status: 'paid' | 'pending';    // controls watermark/badge + copy
  hstLineAmount?: number;        // HST on booth only; 0 or undefined means no HST line
}

/**
 * Generate an itemized receipt PDF for a sponsor submission.
 * Separate from pdfGenerator.ts (which handles individual ticket PDFs).
 */
export const generateReceiptPDF = (
  attendee: Attendee,
  settings: AppSettings,
  options: ReceiptOptions
): jsPDF => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const primary = settings.pdfSettings.primaryColor || '#C8262A';
  const { status, hstLineAmount = 0 } = options;

  // Header bar
  doc.setFillColor(primary);
  doc.rect(0, 0, pageWidth, 44, 'F');

  // Logo
  if (settings.pdfSettings.logoUrl && settings.pdfSettings.logoUrl.length > 50) {
    try {
      const format = settings.pdfSettings.logoUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(settings.pdfSettings.logoUrl, format, 15, 10, 24, 24, undefined, 'FAST');
    } catch (e) { /* ignore logo errors, continue */ }
  }

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(status === 'paid' ? 'OFFICIAL RECEIPT' : 'PENDING PAYMENT RECEIPT', pageWidth - 15, 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(settings.pdfSettings.organizationName || 'Sickle Cell Awareness Group of Ontario', pageWidth - 15, 32, { align: 'right' });

  // Status banner for pending
  if (status === 'pending') {
    doc.setFillColor(255, 248, 220);
    doc.rect(15, 52, pageWidth - 30, 14, 'F');
    doc.setTextColor(140, 90, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('PENDING — Cheque not yet received', 20, 61);
  }

  // Sponsor info
  const company = attendee.companyInfo || { orgName: attendee.name };
  let y = status === 'pending' ? 80 : 62;
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('SPONSOR', 15, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(company.orgName || attendee.name, 15, y);
  y += 5;
  if (company.contactName) { doc.text(company.contactName, 15, y); y += 5; }
  if (company.email) { doc.text(company.email, 15, y); y += 5; }
  if (company.phone) { doc.text(company.phone, 15, y); y += 5; }

  // Receipt meta (right column)
  let yMeta = status === 'pending' ? 80 : 62;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('RECEIPT #', pageWidth - 60, yMeta);
  doc.text('DATE', pageWidth - 60, yMeta + 10);
  doc.setFont('helvetica', 'normal');
  doc.text((attendee.invoiceId || attendee.id).slice(0, 16).toUpperCase(), pageWidth - 15, yMeta, { align: 'right' });
  doc.text(new Date(attendee.registeredAt).toLocaleDateString('en-CA'), pageWidth - 15, yMeta + 10, { align: 'right' });
  if (attendee.transactionId) {
    doc.setFont('helvetica', 'bold');
    doc.text('TXN ID', pageWidth - 60, yMeta + 20);
    doc.setFont('helvetica', 'normal');
    doc.text(attendee.transactionId.slice(0, 20), pageWidth - 15, yMeta + 20, { align: 'right' });
  }

  // Itemized table
  y = Math.max(y, yMeta + 30) + 10;
  doc.setDrawColor(primary);
  doc.setLineWidth(0.5);
  doc.line(15, y, pageWidth - 15, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DESCRIPTION', 15, y);
  doc.text('QTY', pageWidth - 75, y, { align: 'right' });
  doc.text('UNIT', pageWidth - 50, y, { align: 'right' });
  doc.text('SUBTOTAL', pageWidth - 15, y, { align: 'right' });
  y += 3;
  doc.line(15, y, pageWidth - 15, y);
  y += 6;
  doc.setFont('helvetica', 'normal');

  const items = attendee.sponsorItems || [];
  let subtotal = 0;
  for (const item of items) {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.text(item.label, 15, y, { maxWidth: pageWidth - 95 });
    doc.text(String(item.qty), pageWidth - 75, y, { align: 'right' });
    doc.text(`$${item.unitPrice.toFixed(2)}`, pageWidth - 50, y, { align: 'right' });
    doc.text(`$${item.subtotal.toFixed(2)}`, pageWidth - 15, y, { align: 'right' });
    subtotal += item.subtotal;
    y += 7;
  }

  y += 3;
  doc.line(15, y, pageWidth - 15, y);
  y += 7;

  // Subtotal / HST / Total
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal', pageWidth - 50, y, { align: 'right' });
  doc.text(`$${subtotal.toFixed(2)}`, pageWidth - 15, y, { align: 'right' });
  y += 6;

  if (hstLineAmount > 0) {
    doc.text(`HST (${((settings.sponsorHstRate || 0.13) * 100).toFixed(0)}%)`, pageWidth - 50, y, { align: 'right' });
    doc.text(`$${hstLineAmount.toFixed(2)}`, pageWidth - 15, y, { align: 'right' });
    y += 6;
  }

  const grandTotal = subtotal + hstLineAmount;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL', pageWidth - 50, y, { align: 'right' });
  doc.text(`$${grandTotal.toFixed(2)} ${settings.currency || 'CAD'}`, pageWidth - 15, y, { align: 'right' });

  // Payment method block
  y += 15;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PAYMENT METHOD', 15, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  const pm = attendee.paymentMethod || 'unknown';
  const pmLabel = pm === 'paypal' || pm === 'card' ? 'PayPal / Credit Card' : pm === 'cheque' ? 'Cheque' : pm;
  doc.text(status === 'paid' ? `${pmLabel} — Paid` : `${pmLabel} — Pending`, 15, y);

  // Footer
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.text(settings.pdfSettings.footerText || '', pageWidth / 2, 280, { align: 'center' });
  doc.text('Thank you for supporting SCAGO.', pageWidth / 2, 285, { align: 'center' });

  return doc;
};
