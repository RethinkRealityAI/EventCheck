import jsPDF from 'jspdf';
import { Attendee, AppSettings, Form } from '../types';

export const generateTicketPDF = (
  attendee: Attendee,
  settings: AppSettings,
  form?: Form
): jsPDF => {
  const doc = new jsPDF();

  // Merge global PDF settings with form-specific overrides
  const pdfConfig = {
    ...settings.pdfSettings,
    ...(form?.pdfSettings || {})
  };

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primaryColor = pdfConfig.primaryColor || '#4F46E5';

  // --- Background Image Handling ---
  if (pdfConfig.backgroundImage && pdfConfig.backgroundImage.length > 50) {
    try {
      const format = pdfConfig.backgroundImage.includes('image/jpeg') ? 'JPEG' : 'PNG';
      // Add image covering the entire page
      doc.addImage(pdfConfig.backgroundImage, format, 0, 0, pageWidth, pageHeight, undefined, 'FAST');

      // REMOVED BLUR/OVERLAY as requested
    } catch (e) {
      console.error("PDF Background Error:", e);
    }
  }

  // --- Header Background ---
  doc.setFillColor(primaryColor);
  doc.rect(0, 0, pageWidth, 50, 'F');

  let headerTextX = 20;

  // --- Logo Handling (Left Side) ---
  if (pdfConfig.logoUrl && pdfConfig.logoUrl.length > 50) {
    try {
      const format = pdfConfig.logoUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(pdfConfig.logoUrl, format, 15, 12, 25, 25, undefined, 'FAST');
      headerTextX = 45;
    } catch (e) {
      console.error("PDF Logo Error:", e);
    }
  }

  // --- Organization Info (Right Side) ---
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(pdfConfig.organizationName.toUpperCase(), pageWidth - 15, 18, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const orgInfoLines = pdfConfig.organizationInfo.split('\n');
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
  const bodyHeight = hasDonation ? 140 : 110;
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(20, bodyStartY, pageWidth - 40, bodyHeight, 3, 3);

  doc.setFillColor(primaryColor);
  doc.roundedRect(20, bodyStartY, 4, bodyHeight, 3, 3, 'F');

  // --- QR Code ---
  const qrBoxSize = 45;
  const qrX = pageWidth - 20 - qrBoxSize - 10;
  const qrY = bodyStartY + 10;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(attendee.qrPayload)}`;
  try {
    doc.addImage(qrUrl, 'PNG', qrX, qrY, qrBoxSize, qrBoxSize);
    doc.setFontSize(9);
    doc.setTextColor(primaryColor);
    doc.text("SCAN FOR ENTRY", qrX + qrBoxSize / 2, qrY + qrBoxSize + 5, { align: 'center' });
  } catch (e) {
    doc.setDrawColor(primaryColor);
    doc.rect(qrX, qrY, qrBoxSize, qrBoxSize);
    doc.text("QR ERROR", qrX, qrY + 20);
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
  doc.text(attendee.name, labelX, currentY);

  currentY += 15;
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(10);
  doc.text("TICKET TYPE", labelX, currentY);

  currentY += 6;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(14);
  doc.text(attendee.ticketType, labelX, currentY);

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
    const payY = bodyStartY + bodyHeight - 15;
    doc.setFontSize(9);
    doc.setTextColor(primaryColor);
    doc.text(`Paid via PayPal (${attendee.paymentAmount || 'Paid'})`, labelX, payY);
  }

  // --- Donated Seats Info (inside the box when present) ---
  if (hasDonation) {
    currentY += 15;
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("DONATED SEATS", labelX, currentY);

    currentY += 6;
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(14);
    doc.text(`${attendee.donatedSeats} seat${(attendee.donatedSeats || 0) !== 1 ? 's' : ''}`, labelX, currentY);
  }

  // --- Footer ---
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.text(pdfConfig.footerText, pageWidth / 2, 280, { align: 'center' });
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
