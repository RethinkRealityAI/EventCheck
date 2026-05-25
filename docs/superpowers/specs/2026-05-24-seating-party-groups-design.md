# Seating Configurator — Party Groups in Guest Sidebar

**Date:** 2026-05-24  
**Status:** Approved  
**Files touched:** `components/Seating/GuestSidebar.tsx` only

---

## Problem

The seating configurator's Guest Sidebar shows all unassigned attendees as a flat list. Attendees who are linked together — either via the manual guest-pairing feature or via the group registration flow — are indistinguishable from solo registrants. Admins must remember who belongs together and select them one by one.

## Goal

Restructure the unassigned list into party groups so admins can see linked attendees together and assign an entire party to a table in one click.

---

## Scope

- **In scope:** `GuestSidebar.tsx` UI restructuring. No schema changes, no new props beyond what the component already receives, no service calls.
- **Out of scope:** Changes to auto-assign logic (already group-aware), the 3D scene, or table management.

---

## Data model

`GuestSidebar` already receives the full `attendees: Attendee[]` array from `SeatingConfigurator`, which includes `primaryAttendeeId`, `isPrimary`, and `assignedTableId`. No new props are needed.

---

## Grouping logic

Run once per render on the unassigned attendee list (`attendees` without `assignedTableId`):

1. **Collect party groups.** For each unassigned attendee `g` with a `primaryAttendeeId`, bucket them under that primary's ID. Multiple guests with the same `primaryAttendeeId` land in the same bucket.

2. **Resolve the primary's name.** Look up `primaryAttendeeId` in the full `attendees` array (not just unassigned) so the header is always labelled even when the primary is already seated.

3. **Include the primary in the group if also unassigned.** If the primary is already assigned, the group header still shows their name but only unassigned guests appear as member rows.

4. **Solos.** Any unassigned attendee who has no `primaryAttendeeId` AND has no one pointing at them as their primary is a solo — displayed in a flat "Unattached" section below the groups.

5. **Search.** Filter applies across all members. A group is shown if at least one member matches; non-matching members are hidden within the group.

---

## UI structure

### Party group header row
- Dim indigo background (`bg-indigo-900/40 border border-indigo-700/30`)
- Left: 👥 icon + `"[Primary Name] Party · N remaining"`. If the primary is already seated, label reads `"[Primary Name]'s guests · N remaining"`.
- Right: **"Select Party"** button — adds all group members to `selectedGuests`. Flips to **"Deselect"** when all members are already selected.

### Member rows (inside a group)
- Same checkbox + quick-assign `[+]` button as existing rows.
- Faint `pl-4` left indent to signal hierarchy.
- Tiny pill: `Primary` (indigo) or `Guest` (slate) on the right side of the name.
- If the member matches the search, shown normally; if not, hidden.

### Unattached section
- Collapsible (chevron toggle), default open.
- Header: `"UNATTACHED (N)"` in same style as today's `"Unassigned (N)"`.
- Member rows identical to today — no indent, no pill.

### Select All button
Selects all unassigned attendees across both parties and solos, same as today.

### Bulk assign bar
Unchanged — activates when `selectedGuests.size > 0` and a table is selected.

---

## Edge cases

| Situation | Behaviour |
|---|---|
| Primary is already seated, guests are not | Group appears with header `"[Name]'s guests · N remaining"`. Only unassigned guests are listed as members. |
| All guests are already seated, primary is not | Primary appears as a solo in Unattached (no group to form). |
| Party size > table capacity | Admin selects party, bulk-assign bar caps at `spotsLeft` (existing behaviour). |
| Search matches primary but not guest | Group shown, only primary row visible inside it. |
| Search matches guest but not primary | Group shown with header (primary name from lookup), only matching guest row visible. |
| Attendee with no links | Appears in Unattached section. |

---

## Implementation notes

- All logic lives in a single `useMemo` inside `GuestSidebar` — compute `partyGroups: { primaryId: string; primaryName: string; primaryIsUnassigned: boolean; members: Attendee[] }[]` and `solos: Attendee[]`.
- `partyGroups` sorted by member count descending (largest parties first) so admins can seat big groups first.
- No new state variables required — `selectedGuests`, `search`, `showAssigned` are unchanged.
- The "Select Party" handler simply adds all `group.members.map(m => m.id)` to `selectedGuests` (or removes them if all already selected).
