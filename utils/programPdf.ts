import jsPDF from 'jspdf';
import {
  CONGRESS_DAYS,
  CONGRESS_PROGRAM,
  SESSION_KIND_LABEL,
  formatTime,
  type ProgramSession,
} from '../config/congressProgram';

/**
 * Downloadable Congress programme, built on the fly from
 * config/congressProgram.ts so the PDF always matches the in-app programme.
 * There is no uploaded PDF to keep in sync: every download is the current
 * version, stamped with the time it was generated.
 */

const NAVY: [number, number, number] = [20, 76, 125];
const CRIMSON: [number, number, number] = [200, 16, 46];
const INK: [number, number, number] = [30, 30, 34];
const MUTED: [number, number, number] = [105, 108, 115];
const RULE: [number, number, number] = [225, 227, 232];

/**
 * jsPDF's built-in Helvetica only covers WinAnsi. Spell out the few
 * characters the programme uses outside it so nothing prints as garbage.
 */
export function pdfSafe(text: string): string {
  return text
    .replace(/β/g, 'beta')
    .replace(/α/g, 'alpha')
    .replace(/[^\x00-\xFF–—‘’“”•…™]/g, '');
}

/** "Thursday 22 Oct 2026, 22:45 IST" — when this copy was generated. */
export function generatedStamp(now: Date): string {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const day = ist.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const time = ist.toISOString().slice(11, 16);
  return `${day}, ${time} IST`;
}

export interface ProgramPdfOptions {
  /** PNG data URL of the white congress logo, drawn on the header band. */
  logoDataUrl?: string;
  now?: Date;
  sessions?: ProgramSession[];
}

export function buildProgramPdf(opts: ProgramPdfOptions = {}): jsPDF {
  const sessions = opts.sessions ?? CONGRESS_PROGRAM;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const TIME_W = 26;
  const X = M + TIME_W;
  const TEXT_W = W - X - M;
  const BOTTOM = H - 16;
  const stamp = generatedStamp(opts.now ?? new Date());
  let y = 0;

  const header = (first: boolean) => {
    const h = first ? 40 : 14;
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, h, 'F');
    doc.setFillColor(...CRIMSON);
    doc.rect(0, h, W, 1.2, 'F');
    doc.setTextColor(255, 255, 255);
    if (first) {
      if (opts.logoDataUrl) {
        try {
          doc.addImage(opts.logoDataUrl, 'PNG', M, 8, 48, 16, undefined, 'FAST');
        } catch {
          /* logo is decorative */
        }
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.text('Congress Programme', W - M, 17, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text('4th International GANSID Congress · 23–25 October 2026 · Hyderabad', W - M, 24, { align: 'right' });
      doc.text(`Latest version, generated ${stamp}`, W - M, 30, { align: 'right' });
      y = h + 9;
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('GANSID Congress 2026 · Programme', M, 9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated ${stamp}`, W - M, 9, { align: 'right' });
      y = h + 9;
    }
  };

  const ensure = (needed: number) => {
    if (y + needed > BOTTOM) {
      doc.addPage();
      header(false);
    }
  };

  /** Wraps text to width and writes it line by line, breaking pages as needed. */
  const write = (text: string, x: number, width: number, size: number, style: 'normal' | 'bold' | 'italic', color: [number, number, number], gap = 0.6) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    const lh = size * 0.43;
    for (const line of doc.splitTextToSize(pdfSafe(text), width) as string[]) {
      ensure(lh);
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
      doc.text(line, x, y + lh * 0.8);
      y += lh;
    }
    y += gap;
  };

  header(true);

  for (const day of CONGRESS_DAYS) {
    const daySessions = sessions
      .filter((s) => s.day === day.day)
      .sort((a, b) => a.start.localeCompare(b.start) || a.room.localeCompare(b.room));
    if (!daySessions.length) continue;

    ensure(24);
    doc.setFillColor(...CRIMSON);
    doc.rect(M, y, 2, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...NAVY);
    doc.text(`${day.label} · ${day.date}`, M + 5, y + 6.5);
    y += 11;
    write(`Registration desk ${day.registrationDesk}`, M + 5, W - 2 * M, 8.5, 'normal', MUTED, 3);

    for (const s of daySessions) {
      const isBreak = s.kind === 'break' || s.kind === 'logistics';
      ensure(isBreak ? 7 : 16);
      const top = y;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...(isBreak ? MUTED : INK));
      doc.text(formatTime(s.start), M, y + 3.6);
      if (!isBreak) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(`to ${formatTime(s.end)}`, M, y + 7.4);
      }

      if (isBreak) {
        write(`${s.title} · ${s.room}`, X, TEXT_W, 9, 'italic', MUTED, 1.5);
      } else {
        const meta = [SESSION_KIND_LABEL[s.kind].toUpperCase(), s.room, s.sponsor].filter(Boolean).join('  ·  ');
        write(meta, X, TEXT_W, 7.5, 'bold', CRIMSON, 0.8);
        write(s.title, X, TEXT_W, 11, 'bold', INK, 1);

        if (s.abstracts?.length) {
          for (const a of s.abstracts) {
            ensure(9);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...NAVY);
            doc.text(a.start, X, y + 3);
            write(a.title, X + 11, TEXT_W - 11, 8.8, 'normal', INK, 0.2);
            write(a.presenters.join(', '), X + 11, TEXT_W - 11, 8.3, 'bold', MUTED, 1.2);
          }
        } else if (s.talks?.length) {
          for (const t of s.talks) write(`•  ${t}`, X + 2, TEXT_W - 2, 8.8, 'normal', INK, 0.4);
          y += 0.6;
        }

        if (s.speakers?.length && !s.abstracts?.length) {
          write(s.speakers.join(' · '), X, TEXT_W, 8.5, 'normal', MUTED, 0.6);
        }
        const hosts = [s.moderator && `Moderator: ${s.moderator}`, s.chair && `Chair: ${s.chair}`].filter(Boolean).join('   ');
        if (hosts) write(hosts, X, TEXT_W, 8.5, 'italic', MUTED, 0.6);
      }

      y = Math.max(y, top + (isBreak ? 5 : 9)) + 1.5;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      doc.line(X, y - 1.2, W - M, y - 1.2);
      y += 1;
    }
    y += 4;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('Programme subject to change. The GANSID Congress app always has the latest version.', M, H - 8);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 8, { align: 'right' });
  }

  return doc;
}

export const PROGRAM_PDF_FILENAME = 'GANSID-Congress-2026-Programme.pdf';
