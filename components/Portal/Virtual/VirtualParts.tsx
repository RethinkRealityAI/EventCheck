import { useState } from 'react';
import { Check, Copy, Video } from 'lucide-react';
import { formatMeetingId, type VirtualSession } from '../../../utils/virtualSessions';
import { BOGO_ADMIN_CONTACT } from '../../../utils/bogo';

/**
 * Shared building blocks for the virtual-presentation surfaces (home card,
 * Virtual presentation page, programme cards, session detail). Only ever
 * rendered for admins and virtual presenters — see VirtualSessionsContext.
 */

/** Small "Virtual" badge for session cards. */
export function VirtualBadge({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-[3px] font-display text-[11.5px] font-bold leading-tight',
        onDark ? 'bg-white/20 text-white ring-1 ring-white/30' : 'bg-[#5a3575]/10 text-[#5a3575] ring-1 ring-[#5a3575]/20',
      ].join(' ')}
    >
      <Video className="h-3 w-3" strokeWidth={2.25} aria-hidden />
      Virtual
    </span>
  );
}

/** "Join on Zoom" button plus the meeting ID with a copy control. */
export function ZoomJoin({ session, onDark = false }: { session: VirtualSession; onDark?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(session.zoomUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the link is still one tap away */
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <a
        href={session.zoomUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={[
          'inline-flex items-center gap-2 rounded-full px-4 py-2.5 font-display text-sm font-bold transition-transform duration-300 ease-viscous active:scale-[0.97]',
          onDark
            ? 'bg-white text-[#1a4880] shadow-[0_10px_24px_-14px_rgba(0,0,0,0.6)]'
            : 'bg-[#2D8CFF] text-white shadow-[0_12px_24px_-14px_rgba(45,140,255,0.9)]',
        ].join(' ')}
      >
        <Video className="h-4 w-4" aria-hidden />
        Join on Zoom
      </a>
      {session.meetingId && (
        <span className={`inline-flex items-center gap-1.5 font-body text-xs tabular-nums ${onDark ? 'text-white/80' : 'text-gansid-on-surface/55'}`}>
          Meeting ID {formatMeetingId(session.meetingId)}
          <button
            type="button"
            onClick={copy}
            aria-label="Copy Zoom link"
            className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${onDark ? 'hover:bg-white/15' : 'hover:bg-gansid-on-surface/[0.06]'}`}
          >
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * The panelist instructions. The Zoom link in the app is a fail-safe only:
 * presenters should use the panelist link emailed to them.
 */
export function PanelistNote({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="font-body text-xs leading-relaxed text-gansid-on-surface/60">
        Use the <strong>panelist link</strong> emailed to you. This link is a back-up: join as an attendee and we’ll promote you to panelist.
      </p>
    );
  }
  return (
    <div className="rounded-[18px] bg-[#2D8CFF]/[0.07] p-4 ring-1 ring-[#2D8CFF]/20">
      <p className="font-display text-[14px] font-bold text-gansid-on-surface">Use your panelist link</p>
      <p className="mt-1 font-body text-[13px] leading-relaxed text-gansid-on-surface/70">
        You’ve been invited as a <strong>panelist</strong> to each of your virtual sessions — the personal panelist link was emailed to you. Please use that link to join and present.
      </p>
      <p className="mt-2 font-body text-[13px] leading-relaxed text-gansid-on-surface/70">
        Haven’t received it? Reply to our email or write to{' '}
        <a href={`mailto:${BOGO_ADMIN_CONTACT}`} className="font-semibold text-gansid-secondary underline-offset-2 hover:underline">
          {BOGO_ADMIN_CONTACT}
        </a>
        . As a back-up, the <strong>Join on Zoom</strong> buttons below let you join as an attendee — we’ll promote you to panelist.
      </p>
    </div>
  );
}
