# Dashboard Enhancements Design Spec

## Overview

Enhance the admin dashboard (AttendeeList.tsx) with form-aware filtering, dynamic columns from form responses, column visibility controls, an improved attendee detail modal, manual attendee creation, and seating table assignment.

## 1. Form Selector & Default View

### UI
- Dropdown placed in the header bar next to "Registered Attendees" title.
- Options: "All Forms" (default fallback) + one entry per form from the `forms` table, showing form title.
- A star/pin icon button next to the dropdown. Clicking it saves the currently selected form as the default.
- On component mount, load the default form ID from `app_settings` and auto-select it.

### Data
- New column: `app_settings.default_dashboard_form_id` (text, nullable).
- AttendeeList receives a new prop `forms: Form[]` from App.tsx (fetched alongside attendees).
- When a form is selected, `filtered` array additionally filters by `a.formId === selectedFormId`.
- When "All Forms" is selected, no form-level filter is applied.

### Persistence
- Default form ID saved via `updateSettings({ default_dashboard_form_id: formId })` to `app_settings`.

## 2. Dynamic Form Question Columns

### When visible
- Only when a specific form is selected (not "All Forms").

### Column generation
- Read the selected form's `fields` array.
- For each field where `field.type !== 'ticket'`, create a table column with header = `field.label`.
- Cell value = `attendee.answers?.[field.id]`. Arrays joined with ", ". Null/undefined shown as "—".

### Column ordering
- Base columns first (Name, Event/Form, Ticket Type, Status, Registered, Actions), then dynamic columns in the order they appear in `form.fields`.

## 3. Column Visibility Toggle

### UI
- A "Columns" button in the toolbar (next to Export button) with a list/grid icon.
- Opens a popover/dropdown panel with:
  - Section: "Standard Columns" — checkboxes for each base column (Name, Event/Form, Ticket Type, Status, Registered).
  - Section: "Form Fields" — checkboxes for each dynamic column (only when a form is selected).
  - "Show All" / "Hide All" quick toggles at the top of each section.
- Columns toggled off disappear from the table immediately.

### Persistence
- Saved to `app_settings.dashboard_column_prefs` as a JSON object: `{ [formId: string]: { [columnKey: string]: boolean } }`.
- "All Forms" view uses key `"_all"`.
- On form selection change, load that form's column prefs. If none saved, all columns default to visible.

### Data
- New column: `app_settings.dashboard_column_prefs` (jsonb, nullable, default `{}`).

## 4. Form Responses Tab in Attendee Modal

### Current state
- The modal shows a single scrollable view with QR code, status, registration details, and form responses at the bottom.
- Form responses display raw field IDs like `field_1769494561009`.

### New design
- Add a tab bar at the top of the modal content area: **Details** | **Responses**.
- **Details tab**: Contains everything currently shown (QR, status, registration details, payment, donations, dietary, guest info) EXCEPT the form responses section.
- **Responses tab**: 
  - Resolves field IDs to human-readable labels by looking up the form's field definitions.
  - Displays each Q&A pair as a card: question label on top (small, muted), answer below (bold).
  - If no answers exist, shows an empty state: "No form responses recorded."
  - The form fields are looked up by matching `attendee.formId` to the forms list, then mapping `field.id` to `field.label`.

## 5. Manual Add Attendee

### UI
- "+ Add Attendee" button in the dashboard header area (near the Export button).
- Opens a modal with a form:
  - Form selector (which form/event to register under) — pre-filled if a form is already selected in the dashboard.
  - Name (required), Email (required).
  - Ticket Type — dropdown populated from the selected form's ticket config items. If no ticket config, free text input.
  - Payment Status — dropdown: Free, Paid, Pending.
  - Custom form fields — dynamically rendered from the selected form's `fields` array (same field types as the public form: text, email, textarea, select, radio, checkbox).
  - A toggle: "Mark as test record" (default off).
- On submit:
  - Generate a UUID for `id`, an invoice ID, a QR payload, set `registeredAt` to now, `isPrimary: true`.
  - Call `saveAttendee()` to upsert to the DB.
  - Show success notification, close modal, attendee appears in list on next refresh cycle.

## 6. Assign/Move Attendees to Seating Tables

### In Tables View
- Each unassigned primary attendee (not yet in a seating table) shows an "Assign Table" button.
- Clicking opens a small dropdown listing available seating tables for the current form (from `seating_tables` where `form_id` matches).
- Selecting a table updates `attendee.assigned_table_id` via `updateAttendee()`.
- Already-assigned attendees show their table name with a "Reassign" option.

### In Attendee Detail Modal
- A "Seating" section showing current table assignment (if any).
- A dropdown to assign/change the table.

## 7. Tab Reorder

Current: Live | Test | Donated | Tables
New: Live | Donated | Tables | Test

The Test tab moves to last position in the tab bar. No logic changes, just DOM order.

## Database Changes

Two new columns on `app_settings`:

```sql
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS default_dashboard_form_id text;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS dashboard_column_prefs jsonb DEFAULT '{}';
```

## File Changes

| File | Changes |
|------|---------|
| `components/AttendeeList.tsx` | Form selector, dynamic columns, column visibility, modal tabs, manual add, table assignment, tab reorder |
| `App.tsx` | Fetch forms list, pass as prop to AttendeeList |
| `services/storageService.ts` | `updateSettings()` to handle new fields (already generic, may need no changes) |
| `supabase/migrations/` | New migration for `app_settings` columns |

## Component Extraction

AttendeeList.tsx is already 977 lines. These additions will push it well past 1500. Extract into focused sub-components:

| Component | Responsibility |
|-----------|---------------|
| `AttendeeList.tsx` | Orchestrator: state, filtering, data flow |
| `AttendeeTable.tsx` | The standard table view with dynamic columns |
| `AttendeeModal.tsx` | Detail modal with Details/Responses tabs |
| `AddAttendeeModal.tsx` | Manual registration modal |
| `ColumnVisibilityDropdown.tsx` | Column toggle popover |
| `TableAssignment.tsx` | Seating table assignment dropdown |
