import React, { useMemo } from 'react';
import { Info, MailX, Ticket as TicketIcon } from 'lucide-react';
import type { Attendee } from '../../types';
import { daysAttendingOf, distinctDays, shortDayLabel } from '../../utils/daysAttending';

/**
 * Standing instructions at the top of the DMHOs tab.
 *
 * These are government district medical teams (Mahabubnagar, Medchal-Malkajgiri,
 * Vikarabad and Hyderabad PHCs) invited through TSCS India. Most have no inbox
 * of their own — the addresses on file are largely shared district-office
 * inboxes — so TSCS asked that NOTHING be emailed. Each person holds one
 * printed ticket PER DAY, handed out at the registration counter on that day.
 *
 * Anyone landing on this tab (desk staff on the day included) needs that
 * context before touching a row, so it is stated here rather than in a doc.
 */
export default function DmhoNotice({ attendees }: { attendees: Attendee[] }) {
  const rows = useMemo(
    () => attendees.filter(a => a.attendeeCategory === 'dmho' && !a.isTest),
    [attendees],
  );
  const days = useMemo(() => distinctDays(rows), [rows]);

  const perDay = days.map(d => {
    const forDay = rows.filter(r => daysAttendingOf(r).includes(d));
    return { day: d, total: forDay.length, checkedIn: forDay.filter(r => !!r.checkedInAt).length };
  });

  const districts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const district = String(r.answers?.dmho_district || r.answers?.f_city || 'Unspecified');
      counts.set(district, (counts.get(district) ?? 0) + 1);
    }
    return [...counts.entries()].sort((x, y) => y[1] - x[1]);
  }, [rows]);

  return (
    <section
      aria-labelledby="dmho-notice-title"
      className="rounded-2xl border border-teal-200 bg-teal-50/80 p-4 sm:p-5 space-y-4"
      data-testid="dmho-notice"
    >
      <div className="flex items-start gap-3">
        <Info className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" aria-hidden />
        <div className="space-y-2 text-sm text-teal-950">
          <h2 id="dmho-notice-title" className="font-bold text-base">District Medical Team delegates (DMHOs)</h2>
          <p>
            Medical officers and staff from the District Medical &amp; Health Offices of Mahabubnagar,
            Medchal-Malkajgiri and Vikarabad (plus Hyderabad PHCs), invited through TSCS India.
            Registration is complimentary.
          </p>
          <ul className="space-y-1.5">
            <li className="flex gap-2">
              <TicketIcon className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" aria-hidden />
              <span>
                <strong>Physical tickets only — one per day attended.</strong> Hand each delegate the printed
                ticket for <em>that day</em> at the registration counter. Mr. Hemanth Kumar (TSCS coordinator)
                coordinates and facilitates their registration on site.
              </span>
            </li>
            <li className="flex gap-2">
              <MailX className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" aria-hidden />
              <span>
                <strong>Never email these delegates.</strong> Most addresses are shared district-office inboxes.
                The system refuses every email to them, and they are left out of bulk emails and
                "ask for details" sends.
              </span>
            </li>
          </ul>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white/80 border border-teal-100 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800 mb-2">Tickets by day</p>
            <ul className="space-y-1 text-sm">
              {perDay.map(d => (
                <li key={d.day} className="flex justify-between gap-3">
                  <span className="font-medium text-slate-800">{shortDayLabel(d.day)}</span>
                  <span className="text-slate-600 tabular-nums">
                    {d.total} ticket{d.total === 1 ? '' : 's'}
                    {d.checkedIn > 0 && <span className="text-emerald-700"> · {d.checkedIn} checked in</span>}
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-3 border-t border-teal-100 pt-1 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{rows.length}</span>
              </li>
            </ul>
          </div>
          <div className="rounded-xl bg-white/80 border border-teal-100 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800 mb-2">Tickets by district</p>
            <ul className="space-y-1 text-sm">
              {districts.map(([name, n]) => (
                <li key={name} className="flex justify-between gap-3">
                  <span className="text-slate-800">{name}</span>
                  <span className="text-slate-600 tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
