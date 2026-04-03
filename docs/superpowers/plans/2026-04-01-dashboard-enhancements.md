# Dashboard Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the admin dashboard with form-aware filtering, dynamic columns, column visibility controls, a tabbed attendee modal with form responses, manual attendee creation, and seating table assignment.

**Architecture:** Extract AttendeeList.tsx (977 lines) into focused sub-components. Add two new columns to `app_settings` for persisted preferences. Pass `forms` list from App.tsx into AttendeeList. Dynamic columns derived from the selected form's field definitions.

**Tech Stack:** React, TypeScript, Tailwind CSS, Supabase (Postgres + edge functions), date-fns, lucide-react icons.

---

### Task 1: Database Migration — Add Settings Columns

**Files:**
- Create: `supabase/migrations/20260401_dashboard_settings.sql`

- [ ] **Step 1: Create migration file**

```sql
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS default_dashboard_form_id text,
  ADD COLUMN IF NOT EXISTS dashboard_column_prefs jsonb DEFAULT '{}';
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Run the SQL above against project `iigbgbgakevcgilucvbs`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260401_dashboard_settings.sql
git commit -m "feat: add dashboard settings columns to app_settings"
```

---

### Task 2: Update Types & Storage Service

**Files:**
- Modify: `types.ts` (lines 184-207 — AppSettings interface)
- Modify: `services/storageService.ts` (lines 220-278 — getSettings/saveSettings)

- [ ] **Step 1: Add new fields to AppSettings interface**

In `types.ts`, add to the `AppSettings` interface (after `pdfSettings`):

```typescript
  // Dashboard Preferences
  defaultDashboardFormId?: string;
  dashboardColumnPrefs?: Record<string, Record<string, boolean>>;
```

And update `DEFAULT_SETTINGS` to include:

```typescript
  defaultDashboardFormId: undefined,
  dashboardColumnPrefs: {},
```

- [ ] **Step 2: Update getSettings() to read new fields**

In `services/storageService.ts`, inside `getSettings()`, add to the `settings` object construction (after the `pdfSettings` line ~line 248):

```typescript
    defaultDashboardFormId: data.default_dashboard_form_id || undefined,
    dashboardColumnPrefs: (data.dashboard_column_prefs as Record<string, Record<string, boolean>>) || {},
```

- [ ] **Step 3: Update saveSettings() to write new fields**

In `services/storageService.ts`, inside `saveSettings()`, add to the `dbRecord` object (after `pdf_settings` line ~271):

```typescript
    default_dashboard_form_id: settings.defaultDashboardFormId || null,
    dashboard_column_prefs: settings.dashboardColumnPrefs || {},
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --jsx react-jsx`
Expected: Clean, no errors.

- [ ] **Step 5: Commit**

```bash
git add types.ts services/storageService.ts
git commit -m "feat: add dashboard preference fields to AppSettings"
```

---

### Task 3: Pass Forms to AttendeeList from App.tsx

**Files:**
- Modify: `App.tsx` (lines ~14, ~119, ~136, ~270)

- [ ] **Step 1: Import getForms**

At line 14 in `App.tsx`, add `getForms` to the import:

```typescript
import { getAttendees, checkInAttendee, getForms } from './services/storageService';
```

Also import the `Form` type:

```typescript
import { Attendee, Form } from './types';
```

- [ ] **Step 2: Add forms state and fetch**

In the `AdminLayout` component, after the `attendees` state (~line 119), add:

```typescript
const [forms, setForms] = useState<Form[]>([]);
```

In the `fetch` function inside the useEffect (~line 134), add after `setAttendees(data)`:

```typescript
        const formsData = await getForms();
        setForms(formsData);
```

- [ ] **Step 3: Pass forms prop to AttendeeList**

At ~line 270, update the AttendeeList usage:

```tsx
<AttendeeList attendees={attendees} forms={forms} isLoading={loading} />
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --jsx react-jsx`
Expected: Will fail because AttendeeList doesn't accept `forms` yet — that's fine, confirms our change is correct.

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "feat: fetch forms and pass to AttendeeList"
```

---

### Task 4: Extract AttendeeModal Component

**Files:**
- Create: `components/AttendeeModal.tsx`
- Modify: `components/AttendeeList.tsx`

- [ ] **Step 1: Create AttendeeModal.tsx**

Extract the detail modal (AttendeeList.tsx lines 642-910) into a new component. The modal gets a tabbed interface: Details | Responses.

```tsx
import React, { useState } from 'react';
import { Attendee, Form, FormField } from '../types';
import { User, X, Edit3, Trash2, Mail, CheckCircle, Clock, Check, Tag, Eye } from 'lucide-react';
import { format } from 'date-fns';
import QRCode from 'react-qr-code';
import { updateAttendee, deleteAttendee, getSettings } from '../services/storageService';
import { useNotifications } from './NotificationSystem';
import { sendEmail } from '../services/emailService';
import { generateEmailHtml } from '../utils/emailTemplates';

interface AttendeeModalProps {
  attendee: Attendee;
  forms: Form[];
  onClose: () => void;
  onDelete: (id: string) => void;
}

const AttendeeModal: React.FC<AttendeeModalProps> = ({ attendee, forms, onClose, onDelete }) => {
  const [resending, setResending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Attendee>>({});
  const [activeModalTab, setActiveModalTab] = useState<'details' | 'responses'>('details');
  const { showNotification } = useNotifications();

  // Resolve form field labels for this attendee's form
  const attendeeForm = forms.find(f => f.id === attendee.formId);
  const fieldLabelMap: Record<string, string> = {};
  if (attendeeForm) {
    attendeeForm.fields.forEach(f => {
      fieldLabelMap[f.id] = f.label;
    });
  }

  const handleResendEmail = async () => {
    setResending(true);
    try {
      const settings = await getSettings();
      const html = generateEmailHtml(settings, settings.emailBodyTemplate, attendee);
      await sendEmail(attendee.email, settings.emailSubject, html);
      showNotification(`Ticket resent to ${attendee.email}`, 'success');
    } catch (err: any) {
      console.error(err);
      showNotification(`Failed to resend email: ${err.message}`, 'error');
    } finally {
      setResending(false);
    }
  };

  const handleUpdateAttendee = async (id: string, updates: Partial<Attendee>) => {
    await updateAttendee(id, updates);
    setIsEditing(false);
    onClose();
  };

  const handleDeleteAttendee = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this registration? This cannot be undone.")) {
      await deleteAttendee(id);
      onDelete(id);
      showNotification('Registration deleted', 'info');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-200">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                {attendee.name}
                {attendee.isTest && (
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium border border-orange-200">TEST</span>
                )}
              </h3>
              <p className="text-sm text-gray-500 font-medium">{attendee.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditData(attendee); setIsEditing(true); }} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Edit Attendee">
              <Edit3 className="w-5 h-5" />
            </button>
            <button onClick={() => handleDeleteAttendee(attendee.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete Attendee">
              <Trash2 className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-white">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        {!isEditing && (
          <div className="flex border-b border-gray-100 bg-white">
            <button
              onClick={() => setActiveModalTab('details')}
              className={`flex-1 py-3 text-sm font-semibold text-center transition border-b-2 ${activeModalTab === 'details' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveModalTab('responses')}
              className={`flex-1 py-3 text-sm font-semibold text-center transition border-b-2 ${activeModalTab === 'responses' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              Responses
              {attendee.answers && Object.keys(attendee.answers).length > 0 && (
                <span className="ml-1.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {Object.keys(attendee.answers).length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isEditing ? (
            /* ── Edit Mode ── */
            <div className="space-y-6 animate-fade-in-up">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Full Name</label>
                  <input className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={editData.name || ''} onChange={e => setEditData({ ...editData, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Email Address</label>
                  <input className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={editData.email || ''} onChange={e => setEditData({ ...editData, email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Ticket Type</label>
                  <input className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={editData.ticketType || ''} onChange={e => setEditData({ ...editData, ticketType: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Payment Status</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white" value={editData.paymentStatus || ''} onChange={e => setEditData({ ...editData, paymentStatus: e.target.value as any })}>
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <input type="checkbox" id="checkInStatus" className="rounded text-indigo-600 focus:ring-indigo-500" checked={!!editData.checkedInAt} onChange={e => setEditData({ ...editData, checkedInAt: e.target.checked ? new Date().toISOString() : null })} />
                <label htmlFor="checkInStatus" className="text-gray-700 font-medium">Mark as Checked In</label>
              </div>
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button onClick={() => setIsEditing(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                <button onClick={() => handleUpdateAttendee(attendee.id, editData)} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-900/20">Save Changes</button>
              </div>
            </div>
          ) : activeModalTab === 'details' ? (
            /* ── Details Tab ── */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex flex-col items-center space-y-6">
                <div className="bg-white p-4 border border-gray-200 rounded-2xl shadow-sm">
                  <QRCode value={attendee.qrPayload} size={180} />
                </div>
                <div className="w-full space-y-3">
                  <div className="bg-slate-50 p-3 rounded-xl flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-medium">Status</span>
                    {attendee.checkedInAt ? (
                      <span className="text-green-600 font-bold flex items-center gap-1.5 bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3.5 h-3.5" /> Checked In</span>
                    ) : (
                      <span className="text-slate-500 font-medium bg-slate-200 px-2 py-0.5 rounded-full">Not Checked In</span>
                    )}
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-medium">Payment</span>
                    <span className={`font-bold capitalize px-2 py-0.5 rounded-full flex items-center gap-1.5 ${attendee.paymentStatus === 'paid' ? 'bg-green-50 text-green-600' : 'bg-slate-200 text-slate-700'}`}>
                      {attendee.paymentStatus || 'Free'}
                    </span>
                  </div>
                  <button onClick={handleResendEmail} disabled={resending} className="w-full py-3 bg-white border border-indigo-200 text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 transition flex items-center justify-center gap-2">
                    <Mail className="w-4 h-4" /> {resending ? 'Sending...' : 'Resend Ticket Email'}
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-4">Registration Details</h4>
                  <div className="space-y-4">
                    <div className="group">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Registration ID</label>
                      <div className="text-xs font-mono bg-slate-100 px-3 py-2 rounded-lg text-slate-600 select-all border border-slate-200">{attendee.id}</div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Ticket Type</label>
                      <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div> {attendee.ticketType}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Event Name</label>
                      <div className="text-sm font-medium text-slate-700">{attendee.formTitle}</div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Registered</label>
                        <div className="text-xs text-slate-900 font-medium">{format(new Date(attendee.registeredAt), 'PPP')}</div>
                      </div>
                      {attendee.checkedInAt && (
                        <div className="flex-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Checked In</label>
                          <div className="text-xs text-green-600 font-bold">{format(new Date(attendee.checkedInAt), 'p')}</div>
                        </div>
                      )}
                    </div>
                    {(attendee.invoiceId || attendee.transactionId) && (
                      <div className="pt-4 mt-4 border-t border-slate-100 space-y-3">
                        {attendee.invoiceId && (
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Invoice ID</label>
                            <div className="text-xs font-medium text-slate-700">{attendee.invoiceId}</div>
                          </div>
                        )}
                        {attendee.transactionId && (
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 text-blue-600">PayPal Transaction</label>
                            <div className="text-xs font-mono font-medium text-blue-700 select-all">{attendee.transactionId}</div>
                          </div>
                        )}
                      </div>
                    )}
                    {((attendee.donatedSeats && attendee.donatedSeats > 0) || (attendee.donatedTables && attendee.donatedTables > 0)) && (
                      <div className="pt-4 mt-4 border-t border-slate-100 space-y-3">
                        <div>
                          <label className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">
                            {attendee.donationType === 'table' ? 'Donated Tables' : 'Donated Seats'}
                          </label>
                          <div className="text-sm font-bold text-emerald-700">
                            {attendee.donationType === 'table' && (attendee.donatedTables || 0) > 0
                              ? `${attendee.donatedTables} table${(attendee.donatedTables || 0) !== 1 ? 's' : ''} (${attendee.donatedSeats} seat${(attendee.donatedSeats || 0) !== 1 ? 's' : ''})`
                              : `${attendee.donatedSeats} seat${(attendee.donatedSeats || 0) !== 1 ? 's' : ''}`}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {attendee.donationType === 'table' ? 'Full table(s) donated for others to attend' : 'Extra tickets donated for others to attend'}
                          </div>
                        </div>
                      </div>
                    )}
                    {attendee.dietaryPreferences && (
                      <div className="pt-4 mt-4 border-t border-slate-100">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Dietary Preferences</label>
                        <div className="text-sm text-slate-700">{attendee.dietaryPreferences}</div>
                      </div>
                    )}
                    {attendee.isPrimary === false && (
                      <div className="pt-4 mt-4 border-t border-slate-100">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">Guest Ticket</span>
                        {attendee.primaryAttendeeId && (
                          <span className="text-[10px] text-indigo-500 ml-2 font-medium">
                            Linked to: {attendee.primaryAttendeeId.substring(0, 8)}...
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── Responses Tab ── */
            <div className="animate-fade-in">
              {attendee.answers && Object.keys(attendee.answers).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(attendee.answers).map(([key, val]) => {
                    const label = fieldLabelMap[key] || key.replace('field_', '').replace(/_/g, ' ');
                    return (
                      <div key={key} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <span className="text-[11px] font-bold text-slate-400 block mb-1.5 uppercase tracking-wide">{label}</span>
                        <span className="text-sm text-slate-900 font-semibold block">
                          {Array.isArray(val) ? val.join(', ') : val === true ? 'Yes' : val === false ? 'No' : String(val || '—')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <Eye className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No form responses recorded</p>
                  <p className="text-xs mt-1">This attendee was added without filling out form questions.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendeeModal;
```

- [ ] **Step 2: Update AttendeeList.tsx to use AttendeeModal**

In `AttendeeList.tsx`:

1. Add import: `import AttendeeModal from './AttendeeModal';`
2. Add `forms` to the props interface:
   ```typescript
   interface AttendeeListProps {
     attendees: Attendee[];
     forms: Form[];
     isLoading?: boolean;
   }
   ```
3. Destructure `forms` from props: `const AttendeeList: React.FC<AttendeeListProps> = ({ attendees, forms, isLoading = false }) => {`
4. Add `Form` to the imports from `'../types'`.
5. Remove the `resending`, `isEditing`, `editData` state variables (moved to modal).
6. Remove `handleResendEmail`, `handleUpdateAttendee` functions (moved to modal).
7. Replace the entire modal JSX block (lines 642-910) with:
   ```tsx
   {selectedAttendee && (
     <AttendeeModal
       attendee={selectedAttendee}
       forms={forms}
       onClose={() => setSelectedAttendee(null)}
       onDelete={() => setSelectedAttendee(null)}
     />
   )}
   ```
8. Keep `handleDeleteAttendee` as is (used in the table row context menu if any), but the modal now has its own delete handler.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --jsx react-jsx`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add components/AttendeeModal.tsx components/AttendeeList.tsx
git commit -m "refactor: extract AttendeeModal with Details/Responses tabs"
```

---

### Task 5: Add Form Selector, Default View, and Tab Reorder

**Files:**
- Modify: `components/AttendeeList.tsx`
- Modify: `services/storageService.ts` (if needed for partial settings update)

- [ ] **Step 1: Add form selector state and settings loading**

In `AttendeeList.tsx`, add state:

```typescript
const [selectedFormId, setSelectedFormId] = useState<string>('_all');
const [settings, setSettings] = useState<AppSettings | null>(null);
```

Add a `useEffect` to load settings and set the default form:

```typescript
useEffect(() => {
  const loadSettings = async () => {
    const s = await getSettings();
    setSettings(s);
    if (s.defaultDashboardFormId) {
      setSelectedFormId(s.defaultDashboardFormId);
    }
  };
  loadSettings();
}, []);
```

Add imports for `getSettings`, `saveSettings` from `storageService`, and `AppSettings` from `types`. Also import `Star` from `lucide-react`.

- [ ] **Step 2: Update filter logic to include form filter**

Update the `filtered` array to also filter by form when one is selected:

```typescript
const matchesForm = selectedFormId === '_all' || a.formId === selectedFormId;
```

Add `matchesForm` to the return: `return matchesSearch && matchesTab && matchesStatus && matchesPayment && matchesForm;`

Also update `groupedByTable` to respect the form filter — add to the `liveAttendees` filter:

```typescript
const liveAttendees = attendees.filter(a => !a.isTest && (selectedFormId === '_all' || a.formId === selectedFormId));
```

- [ ] **Step 3: Add form selector UI**

In the header section (after the "Registered Attendees" heading, before the tab bar), add:

```tsx
<div className="flex items-center gap-2">
  <select
    value={selectedFormId}
    onChange={e => { setSelectedFormId(e.target.value); setCurrentPage(1); }}
    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-gray-700 max-w-[250px]"
  >
    <option value="_all">All Forms</option>
    {forms.map(f => (
      <option key={f.id} value={f.id}>{f.title}</option>
    ))}
  </select>
  {selectedFormId !== '_all' && (
    <button
      onClick={async () => {
        if (!settings) return;
        const updated = { ...settings, defaultDashboardFormId: selectedFormId };
        await saveSettings(updated);
        setSettings(updated);
        showNotification('Default dashboard view saved', 'success');
      }}
      className={`p-1.5 rounded-lg transition ${settings?.defaultDashboardFormId === selectedFormId ? 'text-amber-500 bg-amber-50' : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'}`}
      title={settings?.defaultDashboardFormId === selectedFormId ? 'This is your default view' : 'Set as default view'}
    >
      <Star className="w-4 h-4" fill={settings?.defaultDashboardFormId === selectedFormId ? 'currentColor' : 'none'} />
    </button>
  )}
</div>
```

- [ ] **Step 4: Reorder tabs — move Test to last**

Reorder the tab buttons so the order is: Live | Donated | Tables | Test.

Move the "Test" button block (currently second) to after the "Tables" button. Just cut and paste the JSX block — no logic changes needed.

- [ ] **Step 5: Verify TypeScript compiles and build passes**

Run: `npx tsc --noEmit --jsx react-jsx && npx vite build`
Expected: Clean.

- [ ] **Step 6: Commit**

```bash
git add components/AttendeeList.tsx
git commit -m "feat: add form selector with default view and reorder tabs"
```

---

### Task 6: Dynamic Form Question Columns and Column Visibility

**Files:**
- Create: `components/ColumnVisibilityDropdown.tsx`
- Modify: `components/AttendeeList.tsx`

- [ ] **Step 1: Create ColumnVisibilityDropdown component**

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { Columns3, Check, Eye, EyeOff } from 'lucide-react';

interface ColumnDef {
  key: string;
  label: string;
  group: 'standard' | 'form';
}

interface ColumnVisibilityDropdownProps {
  columns: ColumnDef[];
  visibleColumns: Record<string, boolean>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

const ColumnVisibilityDropdown: React.FC<ColumnVisibilityDropdownProps> = ({
  columns, visibleColumns, onToggle, onShowAll, onHideAll
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const standardCols = columns.filter(c => c.group === 'standard');
  const formCols = columns.filter(c => c.group === 'form');

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition bg-white"
      >
        <Columns3 className="w-4 h-4" />
        <span className="hidden sm:inline">Columns</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-fade-in">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Toggle Columns</span>
            <div className="flex gap-1">
              <button onClick={onShowAll} className="text-[10px] px-2 py-1 rounded bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100 transition flex items-center gap-1">
                <Eye className="w-3 h-3" /> All
              </button>
              <button onClick={onHideAll} className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-500 font-bold hover:bg-gray-200 transition flex items-center gap-1">
                <EyeOff className="w-3 h-3" /> None
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto p-2 space-y-1">
            {standardCols.length > 0 && (
              <>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 pt-2 pb-1">Standard</div>
                {standardCols.map(col => (
                  <button
                    key={col.key}
                    onClick={() => onToggle(col.key)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${visibleColumns[col.key] !== false ? 'bg-indigo-50/50 text-indigo-700 font-medium' : 'text-gray-400 hover:bg-gray-50'}`}
                  >
                    <span className="truncate">{col.label}</span>
                    {visibleColumns[col.key] !== false ? (
                      <Check className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded border border-gray-300 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </>
            )}
            {formCols.length > 0 && (
              <>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 pt-3 pb-1">Form Fields</div>
                {formCols.map(col => (
                  <button
                    key={col.key}
                    onClick={() => onToggle(col.key)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${visibleColumns[col.key] !== false ? 'bg-indigo-50/50 text-indigo-700 font-medium' : 'text-gray-400 hover:bg-gray-50'}`}
                  >
                    <span className="truncate">{col.label}</span>
                    {visibleColumns[col.key] !== false ? (
                      <Check className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded border border-gray-300 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ColumnVisibilityDropdown;
```

- [ ] **Step 2: Integrate dynamic columns and column visibility into AttendeeList**

In `AttendeeList.tsx`:

1. Import the new component: `import ColumnVisibilityDropdown from './ColumnVisibilityDropdown';`

2. Define the base columns and compute dynamic columns:

```typescript
const baseColumns = [
  { key: 'name', label: 'Name', group: 'standard' as const },
  { key: 'formTitle', label: 'Event/Form', group: 'standard' as const },
  { key: 'ticketType', label: 'Ticket Type', group: 'standard' as const },
  { key: 'status', label: 'Status', group: 'standard' as const },
  { key: 'registeredAt', label: 'Registered', group: 'standard' as const },
];

const selectedForm = forms.find(f => f.id === selectedFormId);
const dynamicColumns = selectedForm
  ? selectedForm.fields
      .filter(f => f.type !== 'ticket')
      .map(f => ({ key: `answer_${f.id}`, label: f.label, group: 'form' as const }))
  : [];

const allColumns = [...baseColumns, ...dynamicColumns];
```

3. Add column visibility state (loaded from settings):

```typescript
const columnPrefsKey = selectedFormId || '_all';
const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});

useEffect(() => {
  if (settings?.dashboardColumnPrefs?.[columnPrefsKey]) {
    setColumnVisibility(settings.dashboardColumnPrefs[columnPrefsKey]);
  } else {
    setColumnVisibility({});
  }
}, [columnPrefsKey, settings]);

const isColumnVisible = (key: string) => columnVisibility[key] !== false;

const handleToggleColumn = (key: string) => {
  setColumnVisibility(prev => {
    const next = { ...prev, [key]: prev[key] === false };
    persistColumnPrefs(next);
    return next;
  });
};

const handleShowAllColumns = () => {
  const next: Record<string, boolean> = {};
  allColumns.forEach(c => next[c.key] = true);
  setColumnVisibility(next);
  persistColumnPrefs(next);
};

const handleHideAllColumns = () => {
  const next: Record<string, boolean> = {};
  allColumns.forEach(c => next[c.key] = false);
  // Always keep name visible
  next['name'] = true;
  setColumnVisibility(next);
  persistColumnPrefs(next);
};

const persistColumnPrefs = async (prefs: Record<string, boolean>) => {
  if (!settings) return;
  const updated = {
    ...settings,
    dashboardColumnPrefs: { ...settings.dashboardColumnPrefs, [columnPrefsKey]: prefs }
  };
  await saveSettings(updated);
  setSettings(updated);
};
```

4. Add the `ColumnVisibilityDropdown` to the toolbar (next to Export button):

```tsx
<ColumnVisibilityDropdown
  columns={allColumns}
  visibleColumns={columnVisibility}
  onToggle={handleToggleColumn}
  onShowAll={handleShowAllColumns}
  onHideAll={handleHideAllColumns}
/>
```

5. Update the table header and body to render dynamically. Replace the hardcoded `<thead>` and cell rendering in the non-tables view with:

**Header:**
```tsx
<thead className="bg-gray-50 text-gray-900 font-medium">
  <tr>
    {isColumnVisible('name') && <th className="px-6 py-3">Name</th>}
    {isColumnVisible('formTitle') && <th className="px-6 py-3">Event/Form</th>}
    {isColumnVisible('ticketType') && <th className="px-6 py-3">Ticket Type</th>}
    {isColumnVisible('status') && <th className="px-6 py-3">Status</th>}
    {isColumnVisible('registeredAt') && <th className="px-6 py-3">Registered</th>}
    {dynamicColumns.filter(c => isColumnVisible(c.key)).map(col => (
      <th key={col.key} className="px-6 py-3 max-w-[200px]">
        <span className="truncate block" title={col.label}>{col.label}</span>
      </th>
    ))}
    <th className="px-6 py-3 text-right">Actions</th>
  </tr>
</thead>
```

**Body cells** — after the existing Registered cell and before the Actions cell, add dynamic cells:

```tsx
{dynamicColumns.filter(c => isColumnVisible(c.key)).map(col => {
  const fieldId = col.key.replace('answer_', '');
  const val = attendee.answers?.[fieldId];
  return (
    <td key={col.key} className="px-6 py-4 text-gray-500 text-xs max-w-[200px]">
      <span className="truncate block" title={typeof val === 'string' ? val : ''}>
        {val === undefined || val === null ? '—' : Array.isArray(val) ? val.join(', ') : String(val)}
      </span>
    </td>
  );
})}
```

Also wrap each existing cell with its visibility check. Update the `colSpan` on the loading/empty states to be dynamic: `colSpan={allColumns.filter(c => isColumnVisible(c.key)).length + 1}`.

- [ ] **Step 3: Verify TypeScript compiles and build passes**

Run: `npx tsc --noEmit --jsx react-jsx && npx vite build`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add components/ColumnVisibilityDropdown.tsx components/AttendeeList.tsx
git commit -m "feat: add dynamic form columns and column visibility toggle"
```

---

### Task 7: Add Attendee Modal (Manual Registration)

**Files:**
- Create: `components/AddAttendeeModal.tsx`
- Modify: `components/AttendeeList.tsx`

- [ ] **Step 1: Create AddAttendeeModal.tsx**

```tsx
import React, { useState } from 'react';
import { Form, FormField, Attendee } from '../types';
import { X, UserPlus, Loader2 } from 'lucide-react';
import { saveAttendee } from '../services/storageService';
import { useNotifications } from './NotificationSystem';

interface AddAttendeeModalProps {
  forms: Form[];
  preselectedFormId?: string;
  onClose: () => void;
}

const AddAttendeeModal: React.FC<AddAttendeeModalProps> = ({ forms, preselectedFormId, onClose }) => {
  const [formId, setFormId] = useState(preselectedFormId || (forms[0]?.id || ''));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [ticketType, setTicketType] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'free' | 'paid' | 'pending'>('free');
  const [isTest, setIsTest] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const { showNotification } = useNotifications();

  const selectedForm = forms.find(f => f.id === formId);
  const ticketField = selectedForm?.fields.find(f => f.type === 'ticket');
  const customFields = selectedForm?.fields.filter(f => f.type !== 'ticket') || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !formId) return;

    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const invoiceId = `INV-${Math.random().toString(10).substr(2, 6)}`;

      const attendee: Attendee = {
        id,
        formId,
        formTitle: selectedForm?.title || 'Unknown',
        name,
        email,
        ticketType: ticketType || 'Manual Entry',
        registeredAt: new Date().toISOString(),
        qrPayload: JSON.stringify({ id, invoiceId, formId, action: 'checkin' }),
        paymentStatus,
        invoiceId,
        isPrimary: true,
        isTest,
        answers,
      };

      await saveAttendee(attendee);
      showNotification(`${name} added successfully`, 'success');
      onClose();
    } catch (err: any) {
      showNotification(`Failed to add attendee: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: FormField) => {
    const value = answers[field.id] || '';

    if (field.type === 'textarea') {
      return (
        <textarea
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
          rows={2}
          placeholder={field.placeholder}
          value={value}
          onChange={e => setAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
        />
      );
    }

    if (field.type === 'select') {
      return (
        <select
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
          value={value}
          onChange={e => setAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
        >
          <option value="">Select...</option>
          {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    }

    if (field.type === 'radio') {
      return (
        <div className="flex flex-wrap gap-3">
          {(field.options || []).map(opt => (
            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name={field.id} value={opt} checked={value === opt}
                onChange={() => setAnswers(prev => ({ ...prev, [field.id]: opt }))}
                className="text-indigo-600 focus:ring-indigo-500" />
              {opt}
            </label>
          ))}
        </div>
      );
    }

    if (field.type === 'checkbox') {
      return (
        <div className="flex flex-wrap gap-3">
          {(field.options || []).map(opt => {
            const currentArr = Array.isArray(value) ? value : [];
            return (
              <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={currentArr.includes(opt)}
                  onChange={e => {
                    const next = e.target.checked ? [...currentArr, opt] : currentArr.filter((v: string) => v !== opt);
                    setAnswers(prev => ({ ...prev, [field.id]: next }));
                  }}
                  className="rounded text-indigo-600 focus:ring-indigo-500" />
                {opt}
              </label>
            );
          })}
        </div>
      );
    }

    // Default: text, email
    return (
      <input
        type={field.type === 'email' ? 'email' : 'text'}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
        placeholder={field.placeholder}
        value={value}
        onChange={e => setAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2.5 rounded-xl shadow-lg shadow-emerald-200">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Add Attendee</h3>
              <p className="text-sm text-gray-500">Manually register someone for an event.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Form Selector */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Event / Form</label>
            <select
              value={formId}
              onChange={e => { setFormId(e.target.value); setAnswers({}); setTicketType(''); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
              required
            >
              {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </div>

          {/* Core Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Full Name *</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Email *</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Ticket Type</label>
              {ticketField?.ticketConfig ? (
                <select value={ticketType} onChange={e => setTicketType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                  <option value="">Select...</option>
                  {ticketField.ticketConfig.items.map(item => (
                    <option key={item.id} value={item.name}>{item.name} ({item.price} {ticketField.ticketConfig!.currency})</option>
                  ))}
                </select>
              ) : (
                <input type="text" value={ticketType} onChange={e => setTicketType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  placeholder="e.g. General Admission" />
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Payment Status</label>
              <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm">
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          {/* Dynamic Form Fields */}
          {customFields.length > 0 && (
            <div className="pt-4 border-t border-gray-100 space-y-4">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Form Questions</span>
              {customFields.map(field => (
                <div key={field.id} className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  {renderField(field)}
                </div>
              ))}
            </div>
          )}

          {/* Test Toggle */}
          <div className="flex items-center gap-2 pt-2">
            <input type="checkbox" id="isTestToggle" checked={isTest} onChange={e => setIsTest(e.target.checked)}
              className="rounded text-orange-500 focus:ring-orange-500" />
            <label htmlFor="isTestToggle" className="text-sm text-gray-600">Mark as test record</label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg font-medium text-gray-600 hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 disabled:opacity-70">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {saving ? 'Adding...' : 'Add Attendee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddAttendeeModal;
```

- [ ] **Step 2: Add the button and state in AttendeeList.tsx**

Add state:
```typescript
const [showAddModal, setShowAddModal] = useState(false);
```

Add import: `import AddAttendeeModal from './AddAttendeeModal';`

Add button in the toolbar (before the Export button):
```tsx
<button
  onClick={() => setShowAddModal(true)}
  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-sm"
>
  <UserPlus className="w-4 h-4" />
  <span className="hidden sm:inline">Add</span>
</button>
```

Add modal JSX at the end of the component (before closing `</div>`):
```tsx
{showAddModal && (
  <AddAttendeeModal
    forms={forms}
    preselectedFormId={selectedFormId !== '_all' ? selectedFormId : undefined}
    onClose={() => setShowAddModal(false)}
  />
)}
```

- [ ] **Step 3: Verify TypeScript compiles and build passes**

Run: `npx tsc --noEmit --jsx react-jsx && npx vite build`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add components/AddAttendeeModal.tsx components/AttendeeList.tsx
git commit -m "feat: add manual attendee registration modal"
```

---

### Task 8: Seating Table Assignment

**Files:**
- Modify: `components/AttendeeList.tsx` (Tables view — add assign dropdown)
- Modify: `components/AttendeeModal.tsx` (add seating section)

- [ ] **Step 1: Add table assignment in the Tables view**

In `AttendeeList.tsx`, add state and import:

```typescript
import { getSeatingTables, updateAttendee } from '../services/storageService';
import { SeatingTable } from '../types';

const [seatingTables, setSeatingTables] = useState<SeatingTable[]>([]);
```

Add a useEffect to fetch seating tables when a form is selected:

```typescript
useEffect(() => {
  if (selectedFormId && selectedFormId !== '_all') {
    getSeatingTables(selectedFormId).then(setSeatingTables);
  } else {
    setSeatingTables([]);
  }
}, [selectedFormId]);
```

In the Tables view, for each primary attendee row, add an "Assign Table" cell. After the existing status column in the expanded table, add a new column "Table" to both the `<thead>` and `<tbody>`:

**Header** (add before the "Details" th):
```tsx
<th className="px-4 py-3">Seating Table</th>
```

**Body** (for both primary and guest rows, add before the "Details" td):
```tsx
<td className="px-4 py-3">
  <select
    value={attendee.assignedTableId || ''}
    onChange={async (e) => {
      e.stopPropagation();
      const tableId = e.target.value || null;
      await updateAttendee(attendee.id, { assignedTableId: tableId });
      showNotification(tableId ? 'Table assigned' : 'Table unassigned', 'success');
    }}
    onClick={e => e.stopPropagation()}
    className="text-xs px-2 py-1 border border-gray-200 rounded bg-white outline-none focus:ring-2 focus:ring-indigo-500 max-w-[140px]"
  >
    <option value="">Unassigned</option>
    {seatingTables.map(t => (
      <option key={t.id} value={t.id}>{t.name}</option>
    ))}
  </select>
</td>
```

Replace `attendee` with `primary` for the primary row and `g` for guest rows.

- [ ] **Step 2: Add seating section in AttendeeModal**

In `AttendeeModal.tsx`, accept seating tables as a prop:

```typescript
interface AttendeeModalProps {
  attendee: Attendee;
  forms: Form[];
  seatingTables: SeatingTable[];
  onClose: () => void;
  onDelete: (id: string) => void;
}
```

Add `SeatingTable` to imports from `'../types'`. Destructure `seatingTables` from props.

In the Details tab, add a seating section after the dietary preferences block (before the guest badge section):

```tsx
{seatingTables.length > 0 && (
  <div className="pt-4 mt-4 border-t border-slate-100">
    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Seating Table</label>
    <select
      value={attendee.assignedTableId || ''}
      onChange={async (e) => {
        const tableId = e.target.value || null;
        await updateAttendee(attendee.id, { assignedTableId: tableId });
        showNotification(tableId ? 'Table assigned' : 'Table unassigned', 'success');
      }}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
    >
      <option value="">Unassigned</option>
      {seatingTables.map(t => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  </div>
)}
```

Update the AttendeeModal usage in AttendeeList.tsx to pass `seatingTables`:

```tsx
<AttendeeModal
  attendee={selectedAttendee}
  forms={forms}
  seatingTables={seatingTables}
  onClose={() => setSelectedAttendee(null)}
  onDelete={() => setSelectedAttendee(null)}
/>
```

- [ ] **Step 3: Verify TypeScript compiles and build passes**

Run: `npx tsc --noEmit --jsx react-jsx && npx vite build`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add components/AttendeeList.tsx components/AttendeeModal.tsx
git commit -m "feat: add seating table assignment in Tables view and modal"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit --jsx react-jsx`
Expected: Clean, zero errors.

- [ ] **Step 2: Production build**

Run: `npx vite build`
Expected: Exit 0, builds successfully.

- [ ] **Step 3: Visual spot check**

Start dev server (`npx vite`), navigate to the dashboard, and verify:
- Form selector appears and filters attendees
- Star icon saves default view
- Dynamic columns appear when a form is selected
- Column visibility dropdown works
- Tabs are ordered: Live | Donated | Tables | Test
- Clicking the eye icon opens the modal with Details/Responses tabs
- Responses tab shows field labels (not raw IDs)
- Add Attendee button opens the modal and creates a record
- Tables view shows seating table assignment dropdown

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: dashboard enhancements - form selector, dynamic columns, column visibility, tabbed modal, manual add, table assignment"
```
