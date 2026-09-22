# Supabase Auth email templates

These are the transactional emails Supabase Auth sends directly — signup
confirmation, magic link, password recovery, invite, email change. They are
configured in the dashboard (**Authentication → Emails**), NOT by any code in
this repository, and nothing in CI renders or checks them.

They live here anyway, because the one time they drifted out of sync with
`supabase/functions/_shared/emailShell.ts` it cost 64 people their portal
accounts and nobody noticed for three months.

## What happened

The confirmation template styled its call-to-action as:

```css
.button { background: linear-gradient(135deg, #ba0028, #E0243C); color: white !important; }
```

Yahoo Mail, Outlook desktop and Gmail in several contexts cannot draw a CSS
gradient. They drop the whole `background` declaration — and keep `color`. The
button became white text on the white card: present, clickable, and invisible.
The footer, styled the same way, vanished with it, which is why the reported
screenshot showed a header, two paragraphs, and a large empty space.

Nobody could report "the button is broken", because from the recipient's side
there was no button. It showed up only as a steady 16% of signups that never
confirmed — 38% among Yahoo addresses.

## The rule

**Never write `background: linear-gradient(...)` in an email.** Split it:

```css
background-color: #ba0028;                                  /* always lands */
background-image: linear-gradient(135deg, #ba0028, #E0243C); /* decoration */
```

Anywhere light text sits on a coloured surface, the solid colour and the text
colour must travel together. `emailButtonStyle()` in
`supabase/functions/_shared/emailShell.ts` is the canonical implementation, and
`tests/emailShell.test.ts` fails if anyone collapses it back.

Two more habits that would have contained this:

- **Emit the styles inline as well as via a class.** Gmail's mobile app,
  Outlook.com and every forwarded message strip `<style>` entirely.
- **Always print the URL as text under the button.** A button can fail for
  reasons no test catches. A visible link cannot, and it turns a lockout into
  a minor annoyance.

## Applying a change

Paste the file into **Authentication → Emails → [template] → Message body** on
the project it belongs to, then save. There is no deploy step and no
migration — which is exactly why an edit made in the dashboard and never
brought back here is how these drift.

| File | Dashboard template | Project |
|---|---|---|
| `confirm-signup.html` | Confirm signup | GANSID (`gticuvgclbvhwvpzkuez`) |

The other GANSID templates (magic link, recovery, invite, email change) were
authored from the same markup and have not been captured here yet. Check each
one for the `background:` shorthand before trusting it, and add it to this
directory once corrected.
