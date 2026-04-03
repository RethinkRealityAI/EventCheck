# Success Page & Guest Flow Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the success page to only show guest content when guests exist, add a hybrid ticket hub with individual downloads and per-guest registration links, harden PDF generation, and ensure FormPreview mirrors the full flow.

**Architecture:** All changes are in existing files — no new files created. PublicRegistration.tsx gets a new `guestTicketsData` state variable to persist guest info into the success page. The success page conditionally renders a guest ticket grid. FormPreview.tsx gets the same guest section. pdfGenerator.ts gets defensive fixes.

**Tech Stack:** React, TypeScript, jsPDF, Tailwind CSS, Supabase Edge Functions

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `components/PublicRegistration.tsx` | Modify | Success page redesign, store guest tickets in state, defensive payment guard, button text fix |
| `components/FormPreview.tsx` | Modify | Add guest ticket section to preview success page |
| `utils/pdfGenerator.ts` | Modify | maxWidth on text fields, null-safe fallbacks |

---

### Task 1: Add defensive guards and button text fix in PublicRegistration

**Files:**
- Modify: `components/PublicRegistration.tsx:21-23` (new state)
- Modify: `components/PublicRegistration.tsx:288` (payment guard)
- Modify: `components/PublicRegistration.tsx:1096-1108` (button text)

- [ ] **Step 1: Add `guestTicketsData` state variable**

At line 23, after the `previewPdfUrl` state, add:

```tsx
const [guestTicketsData, setGuestTicketsData] = useState<Array<{ name: string, attendee: Attendee, registrationUrl?: string }>>([]);
```

- [ ] **Step 2: Add defensive guard for payment in guest mode**

At line 288, change:

```tsx
if (ticketField && paymentTotal > 0) {
```

To:

```tsx
if (mode === 'purchaser' && ticketField && paymentTotal > 0) {
```

This prevents guests from ever being routed to the payment step.

- [ ] **Step 3: Fix submit button text for guest mode**

At lines 1096-1108, replace the button content:

```tsx
<button
  type="submit"
  disabled={loading}
  className="w-full py-4 text-white rounded-xl font-black uppercase tracking-widest transition shadow-lg flex justify-center items-center gap-2 transform hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:grayscale disabled:cursor-not-allowed"
  style={{ backgroundColor: form.settings?.formAccentColor || '#4F46E5' }}
>
  {loading ? (
    <Loader2 className="w-5 h-5 animate-spin" />
  ) : mode === 'guest' ? (
    <>Claim Your Ticket <ArrowRight className="w-5 h-5" /></>
  ) : (ticketField && paymentTotal > 0) ? (
    <>Proceed to Payment <ArrowRight className="w-5 h-5" /></>
  ) : (form.settings?.submitButtonText || 'Register Now')}
</button>
```

- [ ] **Step 4: Verify the changes render correctly**

Run: `npm run dev`

Test locally:
1. Visit a form as a purchaser — button says "Proceed to Payment" or "Register Now"
2. Visit with `?ref=<id>` — button says "Claim Your Ticket"

- [ ] **Step 5: Commit**

```bash
git add components/PublicRegistration.tsx
git commit -m "fix: add payment guard for guest mode and claim ticket button text"
```

---

### Task 2: Store guest tickets in state and persist to success page

**Files:**
- Modify: `components/PublicRegistration.tsx:438-496` (guest generation — store in state)
- Modify: `components/PublicRegistration.tsx:530` (set state after payment verification)

- [ ] **Step 1: Store guestTickets in state after they're built**

After the guest generation loop (after line 495, after the closing `}` of `if (ticketField?.ticketConfig)`), add:

```tsx
// Persist guest ticket data for success page rendering
setGuestTicketsData(guestTickets);
```

- [ ] **Step 2: Verify guestTicketsData is populated**

Run: `npm run dev`

Test: Purchase a multi-seat ticket. After payment completes, check React DevTools to confirm `guestTicketsData` is populated with the correct guest entries.

- [ ] **Step 3: Commit**

```bash
git add components/PublicRegistration.tsx
git commit -m "feat: persist guest ticket data in state for success page"
```

---

### Task 3: Redesign success page — adaptive layout with guest ticket grid

**Files:**
- Modify: `components/PublicRegistration.tsx:1195-1321` (entire success section)

- [ ] **Step 1: Replace the success section**

Replace the entire `{step === 'success' && generatedTicket && (` block (lines 1195-1321) with the following. This keeps the existing purchaser ticket card and conditionally adds the guest ticket grid below:

```tsx
{step === 'success' && generatedTicket && (
  <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in-up relative z-10">
    {/* ── Success Header ── */}
    <div
      className="w-full h-48 flex flex-col items-center justify-center text-white"
      style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5' }}
    >
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-lg animate-bounce-slow"
        style={{ backgroundColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
      >
        <Check className="w-10 h-10 text-white" style={{ color: form.settings?.successIconColor || '#10B981' }} />
      </div>
      <h3 className="text-3xl font-black px-4" style={{ color: form.settings?.successIconColor || '#10B981' }}>
        {form.settings?.successTitle || 'Registration Confirmed!'}
      </h3>
    </div>

    <div className="p-8 text-center">

      {/* ── Custom Thank You Message ── */}
      {form.thankYouMessage ? (
        <div
          className="prose prose-sm max-w-none text-gray-600 mb-6"
          dangerouslySetInnerHTML={{ __html: form.thankYouMessage }}
        />
      ) : (
        <>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">You're going!</h2>
          <p className="text-gray-500 mb-6">A confirmation email with your ticket{guestTicketsData.length > 0 ? 's' : ''} has been sent to <span className="font-semibold">{generatedTicket.email}</span>.</p>
        </>
      )}

      {/* ── Your Ticket Card ── */}
      {(form.settings?.showQrOnSuccess !== false) && (
        <div
          className="border border-gray-200 rounded-2xl p-8 shadow-md mb-8 max-w-sm mx-auto relative overflow-hidden transform transition hover:scale-[1.02] duration-300"
          style={{ backgroundColor: form.settings?.successFooterColor || '#F9FAFB' }}
        >
          <div
            className="absolute top-0 left-0 w-full h-1"
            style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5', opacity: 0.3 }}
          ></div>
          <h4 className="font-bold text-xl text-gray-900 mb-1">{form.title}</h4>
          <p className="text-xs text-gray-500 mb-6 uppercase tracking-widest font-semibold">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

          <div className="bg-white p-3 rounded-2xl inline-block mb-6 shadow-sm border border-gray-100">
            <QRCode value={generatedTicket.qrPayload} size={160} />
          </div>

          <div className="text-sm font-mono bg-white p-3 rounded-xl border border-gray-200 text-gray-700 mb-4 flex justify-between items-center">
            <span className="text-gray-400 text-[10px] uppercase font-bold">Ticket ID</span>
            <span className="font-bold">#{generatedTicket.id.slice(0, 8)}</span>
          </div>

          <div className="text-sm font-mono bg-white p-3 rounded-xl border border-gray-200 text-gray-700 mb-6 flex justify-between items-center">
            <span className="text-gray-400 text-[10px] uppercase font-bold">Attendee</span>
            <span className="font-semibold truncate ml-4">{generatedTicket.name}</span>
          </div>

          {(form.settings?.showTicketButtonOnSuccess !== false) && (
            <button
              onClick={downloadPdf}
              className="w-full py-4 text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg transition transform hover:scale-[1.02]"
              style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5' }}
            >
              <Download className="w-5 h-5 inline mr-2" /> Download Your Ticket
            </button>
          )}
        </div>
      )}

      {/* ── Guest Tickets Section (only if guests exist) ── */}
      {generatedTicket.isPrimary && mode === 'purchaser' && guestTicketsData.length > 0 && (
        <div className="mt-8 text-left">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-gray-900 text-lg">Guest Tickets ({guestTicketsData.length})</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                // Download all tickets — purchaser first, then each guest
                if (settings) {
                  const primaryDoc = generateTicketPDF(generatedTicket, settings, form);
                  primaryDoc.save(`${generatedTicket.name.replace(/[^a-zA-Z0-9 ]/g, '_')}_Ticket.pdf`);

                  guestTicketsData.forEach((gt, idx) => {
                    const doc = generateTicketPDF(gt.attendee, settings, form, gt.registrationUrl);
                    const safeName = gt.attendee.name.includes('Guest Ticket #')
                      ? `Guest_${idx + 2}`
                      : gt.attendee.name.replace(/[^a-zA-Z0-9 ]/g, '_');
                    doc.save(`${safeName}_Ticket.pdf`);
                  });
                }
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 transition"
            >
              <Download className="w-4 h-4" /> Download All Tickets
            </button>
          </div>

          <p className="text-sm text-gray-500 mb-4">
            Unclaimed guests can register using the link on their ticket, or be registered manually at check-in.
          </p>

          <div className="grid gap-4">
            {guestTicketsData.map((gt, idx) => {
              const isUnclaimed = gt.attendee.name.includes('Guest Ticket #');
              const displayName = isUnclaimed ? `Guest #${idx + 2}` : gt.attendee.name;
              const safeName = isUnclaimed
                ? `Guest_${idx + 2}`
                : gt.attendee.name.replace(/[^a-zA-Z0-9 ]/g, '_');

              return (
                <div
                  key={gt.attendee.id}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-4"
                >
                  {/* Mini QR */}
                  <div className="bg-white p-2 rounded-lg border border-gray-100 flex-shrink-0">
                    <QRCode value={gt.attendee.qrPayload} size={56} />
                  </div>

                  {/* Guest Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-900 truncate">{displayName}</span>
                      {isUnclaimed ? (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full flex-shrink-0">Unclaimed</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full flex-shrink-0">Registered</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 font-mono">#{gt.attendee.id.slice(0, 8)}</p>

                    {/* Registration link for unclaimed guests */}
                    {isUnclaimed && gt.registrationUrl && (
                      <div className="mt-2 flex gap-2 items-center">
                        <div className="flex-1 bg-white px-2 py-1.5 rounded border border-indigo-200 text-[10px] font-mono text-indigo-600 truncate">
                          {gt.registrationUrl}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(gt.registrationUrl!);
                            showNotification('Link copied!', 'success');
                          }}
                          className="p-1.5 bg-white border border-indigo-200 rounded hover:bg-indigo-50 transition flex-shrink-0"
                          title="Copy registration link"
                        >
                          <Download className="w-3.5 h-3.5 text-indigo-600 rotate-180" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Individual download */}
                  <button
                    type="button"
                    onClick={() => {
                      if (settings) {
                        const doc = generateTicketPDF(gt.attendee, settings, form, gt.registrationUrl);
                        doc.save(`${safeName}_Ticket.pdf`);
                      }
                    }}
                    className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition flex-shrink-0"
                    title={`Download ${displayName} ticket`}
                  >
                    <Download className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Fallback Buttons if QR is hidden ── */}
      {form.settings?.showQrOnSuccess === false && (
        <div className="flex flex-col gap-3 mb-8">
          {form.settings?.showTicketButtonOnSuccess !== false && (
            <button
              onClick={downloadPdf}
              className="w-full py-4 text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg transition"
              style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5' }}
            >
              <Download className="w-5 h-5 inline mr-2" /> Download PDF Ticket
            </button>
          )}
          <button
            onClick={() => setShowPreviewModal(true)}
            className="w-full py-4 bg-gray-100 text-gray-700 rounded-xl text-sm font-black uppercase tracking-widest transition"
          >
            <Eye className="w-4 h-4 inline mr-2" /> View Ticket Preview
          </button>
        </div>
      )}
    </div>

    <button
      onClick={() => window.location.reload()}
      className="text-gray-500 text-sm font-medium hover:text-gray-900 underline block mx-auto mb-6"
    >
      Start New Registration
    </button>
  </div>
)}
```

Key changes from the original:
- Container widened from `max-w-xl` to `max-w-2xl` to accommodate guest grid
- Email confirmation text is pluralized when guests exist ("tickets" vs "ticket")
- Ticket card adds attendee name display and truncated ID
- Guest section ONLY renders when `guestTicketsData.length > 0`
- Each guest card has: mini QR, name, status badge, ticket ID, individual download, and registration link (if unclaimed)
- "Download All Tickets" button triggers individual named downloads
- Old "Manage Your Guests" block is completely removed

- [ ] **Step 2: Verify single-ticket success page**

Run: `npm run dev`

Test: Register for a form with a single ticket (1 seat). Confirm:
- Success page shows only the purchaser ticket card
- No guest section appears
- Download button works

- [ ] **Step 3: Verify multi-seat success page**

Test: Purchase a multi-seat ticket (e.g., table for 4). Confirm:
- Purchaser ticket card appears at top
- Guest Tickets section appears with correct count
- Each guest card shows name, status badge, mini QR, download button
- Unclaimed guests show registration link with copy button
- Named guests show "Registered" badge with no registration link
- "Download All Tickets" triggers individual downloads with distinct filenames

- [ ] **Step 4: Commit**

```bash
git add components/PublicRegistration.tsx
git commit -m "feat: redesign success page with adaptive guest ticket grid"
```

---

### Task 4: Add guest ticket section to FormPreview success page

**Files:**
- Modify: `components/FormPreview.tsx:247` (store guestTickets in state)
- Modify: `components/FormPreview.tsx:889-977` (success section)

- [ ] **Step 1: Add state for guest tickets and persist after generation**

Near the top of the FormPreview component, find the existing state declarations and add:

```tsx
const [previewGuestTicketsData, setPreviewGuestTicketsData] = useState<Array<{ name: string, attendee: Attendee, registrationUrl?: string }>>([]);
```

After the guest generation loop (after line 293, after `if (ticketField?.ticketConfig)` block closes), add:

```tsx
setPreviewGuestTicketsData(guestTickets.map(gt => ({
  name: gt.name,
  attendee: gt.attendee,
  registrationUrl: gt.attendee.name.includes('Guest Ticket #')
    ? `${window.location.origin}/#/form/${form.id}?ref=${newAttendee.id}`
    : undefined,
})));
```

- [ ] **Step 2: Add guest ticket grid to FormPreview success page**

After the existing ticket card (after the closing `</div>` of the QR card section around line 953, before the fallback button section), add:

```tsx
{/* ── Guest Tickets Section (Preview) ── */}
{lastGeneratedAttendee?.isPrimary && previewGuestTicketsData.length > 0 && (
  <div className="mt-8 text-left px-2">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <UserPlus className="w-5 h-5 text-indigo-600" />
        <h3 className="font-bold text-gray-900 text-lg">Guest Tickets ({previewGuestTicketsData.length})</h3>
      </div>
      <button
        type="button"
        onClick={() => {
          if (appSettings && lastGeneratedAttendee) {
            const primaryDoc = generateTicketPDF(lastGeneratedAttendee, appSettings, form);
            primaryDoc.save(`${lastGeneratedAttendee.name.replace(/[^a-zA-Z0-9 ]/g, '_')}_Ticket.pdf`);

            previewGuestTicketsData.forEach((gt, idx) => {
              const doc = generateTicketPDF(gt.attendee, appSettings, form, gt.registrationUrl);
              const safeName = gt.attendee.name.includes('Guest Ticket #')
                ? `Guest_${idx + 2}`
                : gt.attendee.name.replace(/[^a-zA-Z0-9 ]/g, '_');
              doc.save(`${safeName}_Ticket.pdf`);
            });
          }
        }}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 transition"
      >
        <Download className="w-4 h-4" /> Download All
      </button>
    </div>

    <p className="text-sm text-gray-500 mb-4">
      Unclaimed guests can register using the link on their ticket, or be registered manually at check-in.
    </p>

    <div className="grid gap-3">
      {previewGuestTicketsData.map((gt, idx) => {
        const isUnclaimed = gt.attendee.name.includes('Guest Ticket #');
        const displayName = isUnclaimed ? `Guest #${idx + 2}` : gt.attendee.name;
        const safeName = isUnclaimed
          ? `Guest_${idx + 2}`
          : gt.attendee.name.replace(/[^a-zA-Z0-9 ]/g, '_');

        return (
          <div
            key={gt.attendee.id}
            className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-3"
          >
            <div className="bg-white p-1.5 rounded-lg border border-gray-100 flex-shrink-0">
              <QRCode value={gt.attendee.qrPayload} size={40} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-bold text-gray-900 text-sm truncate">{displayName}</span>
                {isUnclaimed ? (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full flex-shrink-0">Unclaimed</span>
                ) : (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full flex-shrink-0">Registered</span>
                )}
              </div>

              {isUnclaimed && gt.registrationUrl && (
                <div className="mt-1 flex gap-1.5 items-center">
                  <div className="flex-1 bg-white px-2 py-1 rounded border border-indigo-200 text-[10px] font-mono text-indigo-600 truncate">
                    {gt.registrationUrl}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(gt.registrationUrl!);
                    }}
                    className="p-1 bg-white border border-indigo-200 rounded hover:bg-indigo-50 transition flex-shrink-0"
                    title="Copy link"
                  >
                    <Download className="w-3 h-3 text-indigo-600 rotate-180" />
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (appSettings) {
                  const doc = generateTicketPDF(gt.attendee, appSettings, form, gt.registrationUrl);
                  doc.save(`${safeName}_Ticket.pdf`);
                }
              }}
              className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition flex-shrink-0"
              title={`Download ${displayName} ticket`}
            >
              <Download className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        );
      })}
    </div>
  </div>
)}
```

Also ensure `UserPlus` is imported at the top of FormPreview.tsx. Check the existing imports — if it's not there, add it to the lucide-react import.

- [ ] **Step 3: Widen the FormPreview success container**

Change the success container from `max-w-xl` to `max-w-2xl` (around line 891):

```tsx
<div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in">
```

- [ ] **Step 4: Reset guest state on "Test Another Response"**

Find the `resetPreview` function in FormPreview and add `setPreviewGuestTicketsData([])` to ensure the guest data is cleared between test runs.

- [ ] **Step 5: Verify in FormPreview**

Run: `npm run dev`

Test in the admin panel Form Preview:
1. Create a ticket with multiple seats
2. Submit with some guest names blank
3. Confirm success page shows guest ticket grid with correct data
4. Download individual guest PDFs — check filenames are distinct
5. Download All Tickets — confirm all files download
6. Copy a registration link — confirm it copies to clipboard
7. Open the registration link in a new tab — confirm guest mode loads correctly

- [ ] **Step 6: Commit**

```bash
git add components/FormPreview.tsx
git commit -m "feat: add guest ticket grid to FormPreview success page"
```

---

### Task 5: Harden PDF generation

**Files:**
- Modify: `utils/pdfGenerator.ts:55,135,145,196,202`

- [ ] **Step 1: Add null-safe fallbacks and maxWidth to text rendering**

In `utils/pdfGenerator.ts`, apply these changes:

**Line 55** — null-safe organization name:
```tsx
doc.text((pdfConfig.organizationName || 'Event').toUpperCase(), pageWidth - 15, 18, { align: 'right' });
```

**Line 59** — null-safe organization info:
```tsx
const orgInfoLines = (pdfConfig.organizationInfo || '').split('\n');
```

**Line 135** — add maxWidth and null fallback to attendee name:
```tsx
doc.text(attendee.name || 'Attendee', labelX, currentY, { maxWidth: 90 });
```

**Line 145** — add maxWidth and null fallback to ticket type:
```tsx
doc.text(attendee.ticketType || 'General Admission', labelX, currentY, { maxWidth: 90 });
```

**Line 196** — null-safe donation text (table donation):
```tsx
doc.text(`${attendee.donatedTables || 0} table${(attendee.donatedTables || 0) !== 1 ? 's' : ''} (${attendee.donatedSeats || 0} seat${(attendee.donatedSeats || 0) !== 1 ? 's' : ''})`, labelX, currentY);
```

**Line 202** — null-safe donation text (seat donation):
```tsx
doc.text(`${attendee.donatedSeats || 0} seat${(attendee.donatedSeats || 0) !== 1 ? 's' : ''}`, labelX, currentY);
```

**Line 209** — null-safe footer text:
```tsx
doc.text(pdfConfig.footerText || '', pageWidth / 2, 280, { align: 'center' });
```

- [ ] **Step 2: Verify PDF generation**

Run: `npm run dev`

Test:
1. Generate a ticket PDF for a primary attendee — check layout is correct, name doesn't overflow
2. Generate a guest placeholder PDF — check registration QR code appears
3. Generate a named guest PDF — check no registration QR, name displays correctly
4. Generate with a very long name (30+ chars) — confirm it wraps within bounds

- [ ] **Step 3: Commit**

```bash
git add utils/pdfGenerator.ts
git commit -m "fix: add maxWidth and null-safe fallbacks to PDF text rendering"
```

---

### Task 6: Fix email filename collisions

**Files:**
- Modify: `components/PublicRegistration.tsx:546-553` (purchaser email attachments)

- [ ] **Step 1: Add index to guest ticket filenames in email attachments**

Find the email attachment loop (around line 546):

```tsx
for (const gt of guestTickets) {
  const guestDoc = generateTicketPDF(gt.attendee, settings, form, gt.registrationUrl);
  attachments.push({
    filename: `${gt.name.replace(/[^a-zA-Z0-9 ]/g, '_')}_Ticket.pdf`,
    content: arrayBufferToBase64(guestDoc.output('arraybuffer')),
    contentType: 'application/pdf'
  });
}
```

Replace with:

```tsx
guestTickets.forEach((gt, idx) => {
  const guestDoc = generateTicketPDF(gt.attendee, settings, form, gt.registrationUrl);
  const isPlaceholder = gt.attendee.name.includes('Guest Ticket #');
  const safeName = isPlaceholder
    ? `Guest_${idx + 2}`
    : gt.attendee.name.replace(/[^a-zA-Z0-9 ]/g, '_');
  attachments.push({
    filename: `${safeName}_Ticket.pdf`,
    content: arrayBufferToBase64(guestDoc.output('arraybuffer')),
    contentType: 'application/pdf'
  });
});
```

Do the same for the individual guest email loop (around line 565):

```tsx
for (const gt of guestTickets) {
  if (gt.attendee.email && gt.attendee.email !== purchaserEmail && gt.attendee.email !== 'unknown@example.com') {
```

Replace the filename in the attachment inside this loop similarly — use consistent naming:

```tsx
guestTickets.forEach((gt, idx) => {
  if (gt.attendee.email && gt.attendee.email !== purchaserEmail && gt.attendee.email !== 'unknown@example.com') {
    const isPlaceholder = gt.attendee.name.includes('Guest Ticket #');
    const safeName = isPlaceholder
      ? `Guest_${idx + 2}`
      : gt.attendee.name.replace(/[^a-zA-Z0-9 ]/g, '_');
    const guestDoc = generateTicketPDF(gt.attendee, settings, form, gt.registrationUrl);
    await sendTicketEmail(settings, {
      to: gt.attendee.email,
      subject: `Your Ticket for ${form.title}`,
      name: gt.attendee.name,
      message: `You've been registered for ${form.title} by ${purchaserName}. Your ticket is attached.`,
      attachments: [{
        filename: `${safeName}_Ticket.pdf`,
        content: arrayBufferToBase64(guestDoc.output('arraybuffer')),
        contentType: 'application/pdf'
      }]
    });
  }
});
```

- [ ] **Step 2: Verify email flow**

Test: Purchase multi-seat tickets with SMTP configured. Confirm:
1. Purchaser receives email with all distinctly-named PDFs
2. Named guests with emails receive individual emails
3. No filename collisions

- [ ] **Step 3: Commit**

```bash
git add components/PublicRegistration.tsx
git commit -m "fix: use distinct filenames for guest ticket PDFs in emails"
```

---

### Task 7: Final integration test

- [ ] **Step 1: Test full purchaser flow — single ticket**

1. Open a form with a single-seat ticket
2. Fill in details, complete payment
3. Success page: only purchaser ticket card, no guest section
4. Download PDF — opens correctly with correct name

- [ ] **Step 2: Test full purchaser flow — multi-seat with unnamed guests**

1. Open a form with a multi-seat ticket (e.g., table of 4)
2. Fill in purchaser details, skip guest names
3. Complete payment
4. Success page: purchaser card + 3 guest cards with "Unclaimed" badges
5. Each guest card has a registration link with copy button
6. "Download All Tickets" produces 4 distinct PDFs
7. Individual download buttons work
8. Guest PDFs show registration QR code

- [ ] **Step 3: Test full purchaser flow — multi-seat with named guests**

1. Open a form with multi-seat ticket
2. Fill in purchaser details + 1 named guest, leave rest blank
3. Complete payment
4. Success page: named guest shows "Registered" badge (no reg link), unnamed shows "Unclaimed" with link
5. All downloads produce distinctly named files

- [ ] **Step 4: Test guest claiming flow**

1. Copy a registration link from the success page
2. Open in a new tab/incognito
3. Confirm form loads in guest mode — no ticket selection, no payment
4. Button says "Claim Your Ticket"
5. Fill in name and email, submit
6. Success page shows guest's ticket with QR code
7. Return to original tab — if you had the old success page open, the link should still work for remaining unclaimed guests

- [ ] **Step 5: Test FormPreview flow**

1. Open Form Preview in admin
2. Set up a multi-seat ticket, submit
3. Confirm guest ticket grid appears on preview success page
4. Download All and individual downloads work
5. Registration links are generated correctly
6. Click "Test Another Response" — confirm state resets cleanly

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "test: verify success page and guest flow refactor end-to-end"
```

Only commit if there are any remaining small fixes found during testing. If all tasks committed cleanly, skip this step.
