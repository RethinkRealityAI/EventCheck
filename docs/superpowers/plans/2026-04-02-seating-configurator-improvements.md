# Seating Configurator UI/UX & Functionality Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the seating configurator to be intuitive, reliable, and powerful for gala seating management — fixing UX pain points, adding smart group-aware assignment, undo/redo, per-table capacity editing, confirmation dialogs, save feedback, and a polished overall experience.

**Architecture:** All changes are client-side React component improvements within the existing `components/Seating/` directory. No new Supabase tables or edge functions needed — existing storage service functions handle persistence. The notification system (`useNotifications`) already exists app-wide for toast feedback. State management stays local to `SeatingConfigurator` with a new undo/redo history stack.

**Tech Stack:** React, TypeScript, Tailwind CSS, Three.js (R3F), Lucide icons, existing `storageService.ts`, existing `NotificationSystem.tsx`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `components/Seating/SeatingConfigurator.tsx` | Modify | Add undo/redo, confirmation dialogs, save notifications, per-table capacity, table rotation slider, inline config naming, clone config, search/filter tables |
| `components/Seating/GuestSidebar.tsx` | Modify | Add group-aware auto-assign, drag-to-table visual cue, ticket type badges, dietary info display, unassign-all per table |
| `components/Seating/ConfirmDialog.tsx` | Create | Reusable confirmation modal (replaces `window.prompt` and adds destructive action warnings) |
| `components/Seating/TableObject.tsx` | Modify | Show dietary icons on seated guests, capacity indicator ring |

---

### Task 1: Add ConfirmDialog component

**Files:**
- Create: `components/Seating/ConfirmDialog.tsx`

- [ ] **Step 1: Create the ConfirmDialog component**

```tsx
// components/Seating/ConfirmDialog.tsx
import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    confirmVariant?: 'danger' | 'primary';
    onConfirm: () => void;
    onCancel: () => void;
    /** If provided, renders an input field and passes the value to onConfirmWithValue instead */
    inputMode?: {
        placeholder: string;
        defaultValue?: string;
        onConfirmWithValue: (value: string) => void;
    };
}

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    confirmVariant = 'primary',
    onConfirm,
    onCancel,
    inputMode,
}: ConfirmDialogProps) {
    const [inputValue, setInputValue] = useState(inputMode?.defaultValue || '');

    if (!open) return null;

    const handleConfirm = () => {
        if (inputMode) {
            if (!inputValue.trim()) return;
            inputMode.onConfirmWithValue(inputValue.trim());
        } else {
            onConfirm();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleConfirm();
        if (e.key === 'Escape') onCancel();
    };

    const btnColor = confirmVariant === 'danger'
        ? 'bg-red-600 hover:bg-red-700'
        : 'bg-indigo-600 hover:bg-indigo-700';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onKeyDown={handleKeyDown}>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in-95">
                <div className="flex items-start gap-3 mb-4">
                    {confirmVariant === 'danger' && (
                        <div className="p-2 bg-red-500/10 rounded-xl">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                        </div>
                    )}
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-white">{title}</h3>
                        <p className="text-sm text-slate-400 mt-1">{message}</p>
                    </div>
                    <button onClick={onCancel} className="p-1 text-slate-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {inputMode && (
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={inputMode.placeholder}
                        autoFocus
                        className="w-full bg-slate-900/50 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 mb-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                )}

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        className={`px-4 py-2 text-sm font-bold text-white rounded-xl transition-colors ${btnColor}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Seating/ConfirmDialog.tsx
git commit -m "feat(seating): add reusable ConfirmDialog component"
```

---

### Task 2: Add undo/redo history to SeatingConfigurator

**Files:**
- Modify: `components/Seating/SeatingConfigurator.tsx`

This adds a simple history stack that snapshots `tables`, `assignments`, and `sceneElements` state. Undo/redo buttons appear in the top bar. History is pushed on meaningful user actions (generate, assign, unassign, delete table, add/remove element).

- [ ] **Step 1: Add history state and helpers**

At the top of `SeatingConfigurator`, after existing state declarations (around line 75), add:

```tsx
import { Undo2, Redo2 } from 'lucide-react'; // add to existing import

// History for undo/redo
interface HistorySnapshot {
    tables: SeatingTable[];
    assignments: SeatingAssignment[];
    sceneElements: SceneElement[];
}

const MAX_HISTORY = 30;
```

Inside the component, after the `sceneElements` state (line 52), add:

```tsx
const [history, setHistory] = useState<HistorySnapshot[]>([]);
const [historyIndex, setHistoryIndex] = useState(-1);
const isUndoRedoing = useRef(false);

const pushHistory = useCallback(() => {
    if (isUndoRedoing.current) return;
    setHistory(prev => {
        const truncated = prev.slice(0, historyIndex + 1);
        const snapshot: HistorySnapshot = {
            tables: JSON.parse(JSON.stringify(tables)),
            assignments: JSON.parse(JSON.stringify(assignments)),
            sceneElements: JSON.parse(JSON.stringify(sceneElements)),
        };
        const next = [...truncated, snapshot].slice(-MAX_HISTORY);
        setHistoryIndex(next.length - 1);
        return next;
    });
}, [tables, assignments, sceneElements, historyIndex]);

const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    isUndoRedoing.current = true;
    const snapshot = history[historyIndex - 1];
    setTables(snapshot.tables);
    setAssignments(snapshot.assignments);
    setSceneElements(snapshot.sceneElements);
    setHistoryIndex(historyIndex - 1);
    setTimeout(() => { isUndoRedoing.current = false; }, 0);
}, [history, historyIndex]);

const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    isUndoRedoing.current = true;
    const snapshot = history[historyIndex + 1];
    setTables(snapshot.tables);
    setAssignments(snapshot.assignments);
    setSceneElements(snapshot.sceneElements);
    setHistoryIndex(historyIndex + 1);
    setTimeout(() => { isUndoRedoing.current = false; }, 0);
}, [history, historyIndex]);
```

- [ ] **Step 2: Add Ctrl+Z / Ctrl+Y keyboard shortcuts**

In the existing `handleKeyDown` useEffect (around line 78), add undo/redo shortcuts:

```tsx
if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
```

- [ ] **Step 3: Call pushHistory before state-changing actions**

Add `pushHistory()` calls at the start of these functions:
- `generateTables` — before `setTables(newTables)`
- `handleAssignGuests` — before `setAssignments(newAssignments)`
- `handleUnassignGuest` — before the `setAssignments` call
- `handleAutoAssign` — before `setAssignments(newAssignments)`
- `addSceneElement` — before `setSceneElements`
- `deleteSelectedElement` — before `setSceneElements`
- The table delete button handler (inside `updateSelectedTable` area)

- [ ] **Step 4: Add undo/redo buttons to the top bar**

In the top bar, before the PDF button (around line 564), add:

```tsx
<div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700/50">
    <button
        onClick={undo}
        disabled={historyIndex <= 0}
        className="p-1.5 text-slate-400 hover:text-white disabled:text-slate-700 transition-colors rounded-lg"
        title="Undo (Ctrl+Z)"
    >
        <Undo2 className="w-4 h-4" />
    </button>
    <button
        onClick={redo}
        disabled={historyIndex >= history.length - 1}
        className="p-1.5 text-slate-400 hover:text-white disabled:text-slate-700 transition-colors rounded-lg"
        title="Redo (Ctrl+Y)"
    >
        <Redo2 className="w-4 h-4" />
    </button>
</div>
```

- [ ] **Step 5: Push initial history snapshot when data loads**

At the end of the load effect (the one that loads tables/attendees/assignments/sceneElements, around line 170), after `setLoading(false)`, push the initial snapshot:

```tsx
// Push initial snapshot for undo baseline
setTimeout(() => {
    pushHistory();
}, 0);
```

- [ ] **Step 6: Commit**

```bash
git add components/Seating/SeatingConfigurator.tsx
git commit -m "feat(seating): add undo/redo history with keyboard shortcuts"
```

---

### Task 3: Replace prompt() with ConfirmDialog for config naming + add clone config

**Files:**
- Modify: `components/Seating/SeatingConfigurator.tsx`

- [ ] **Step 1: Add dialog state and import**

At the top of `SeatingConfigurator.tsx`, add the import:

```tsx
import ConfirmDialog from './ConfirmDialog';
```

Add dialog state after existing UI state:

```tsx
const [dialog, setDialog] = useState<{
    type: 'create-config' | 'clone-config' | 'confirm-regenerate' | 'delete-config' | 'rename-config';
    data?: any;
} | null>(null);
```

- [ ] **Step 2: Replace createNewConfig to use dialog**

Replace the existing `createNewConfig` function with:

```tsx
const createNewConfig = (name: string) => {
    setLoading(true);
    const newConfig: SeatingConfiguration = {
        id: crypto.randomUUID(),
        formId: selectedFormId,
        name,
        createdAt: new Date().toISOString()
    };
    saveSeatingConfiguration(newConfig).then(() => {
        setConfigurations(prev => [...prev, newConfig]);
        setActiveConfigId(newConfig.id);
        setTables([]);
        setAssignments([]);
        setSceneElements([]);
        setLoading(false);
    });
};
```

- [ ] **Step 3: Add clone config function**

```tsx
const cloneCurrentConfig = (name: string) => {
    setLoading(true);
    const newConfig: SeatingConfiguration = {
        id: crypto.randomUUID(),
        formId: selectedFormId,
        name,
        createdAt: new Date().toISOString()
    };
    // Deep-clone tables and assignments with new IDs pointing to new config
    const tableIdMap: Record<string, string> = {};
    const clonedTables = tables.map(t => {
        const newId = crypto.randomUUID();
        tableIdMap[t.id] = newId;
        return { ...t, id: newId, configurationId: newConfig.id };
    });
    const clonedAssignments = assignments.map(a => ({
        ...a,
        id: crypto.randomUUID(),
        configurationId: newConfig.id,
        tableId: tableIdMap[a.tableId] || a.tableId,
    }));
    const clonedElements = sceneElements.map(e => ({
        ...e,
        id: crypto.randomUUID(),
        configurationId: newConfig.id,
    }));

    saveSeatingConfiguration(newConfig).then(() => {
        setConfigurations(prev => [...prev, newConfig]);
        setActiveConfigId(newConfig.id);
        setTables(clonedTables);
        setAssignments(clonedAssignments);
        setSceneElements(clonedElements);
        setLoading(false);
    });
};
```

- [ ] **Step 4: Add confirmation for regenerate tables**

Wrap `generateTables` so it shows a confirm dialog when tables already exist:

```tsx
const handleRegenerateClick = () => {
    if (tables.length > 0) {
        setDialog({ type: 'confirm-regenerate' });
    } else {
        generateTables();
    }
};
```

Update the "Regenerate Layout" button's `onClick` to call `handleRegenerateClick` instead of `generateTables`.

- [ ] **Step 5: Add delete config**

```tsx
const deleteCurrentConfig = async () => {
    if (configurations.length <= 1) return; // Don't delete the last config
    await deleteSeatingConfiguration(activeConfigId);
    const remaining = configurations.filter(c => c.id !== activeConfigId);
    setConfigurations(remaining);
    setActiveConfigId(remaining[0].id);
};
```

- [ ] **Step 6: Render ConfirmDialog at the bottom of the component's return**

Just before the final closing `</div>`, add:

```tsx
{/* Dialogs */}
{dialog?.type === 'create-config' && (
    <ConfirmDialog
        open
        title="New Layout"
        message="Enter a name for this new seating configuration."
        confirmLabel="Create"
        onConfirm={() => {}}
        onCancel={() => setDialog(null)}
        inputMode={{
            placeholder: 'e.g. Layout 2',
            defaultValue: `Layout ${configurations.length + 1}`,
            onConfirmWithValue: (name) => { createNewConfig(name); setDialog(null); }
        }}
    />
)}
{dialog?.type === 'clone-config' && (
    <ConfirmDialog
        open
        title="Clone Layout"
        message={`Clone "${configurations.find(c => c.id === activeConfigId)?.name}" with all its tables, assignments, and elements.`}
        confirmLabel="Clone"
        onConfirm={() => {}}
        onCancel={() => setDialog(null)}
        inputMode={{
            placeholder: 'e.g. Layout 2 (Copy)',
            defaultValue: `${configurations.find(c => c.id === activeConfigId)?.name} (Copy)`,
            onConfirmWithValue: (name) => { cloneCurrentConfig(name); setDialog(null); }
        }}
    />
)}
{dialog?.type === 'confirm-regenerate' && (
    <ConfirmDialog
        open
        title="Regenerate Layout?"
        message={`This will replace all ${tables.length} existing tables and clear ${assignments.length} seat assignments. This action can be undone.`}
        confirmLabel="Regenerate"
        confirmVariant="danger"
        onConfirm={() => { generateTables(); setDialog(null); }}
        onCancel={() => setDialog(null)}
    />
)}
{dialog?.type === 'delete-config' && (
    <ConfirmDialog
        open
        title="Delete Layout?"
        message={`Permanently delete "${configurations.find(c => c.id === activeConfigId)?.name}" and all its tables and assignments. This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => { deleteCurrentConfig(); setDialog(null); }}
        onCancel={() => setDialog(null)}
    />
)}
```

- [ ] **Step 7: Update top bar config buttons**

Replace the single "+" button next to the layout selector with a button group:

```tsx
<button
    onClick={() => setDialog({ type: 'create-config' })}
    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
    title="New Layout"
>
    <Plus className="w-4 h-4" />
</button>
<button
    onClick={() => setDialog({ type: 'clone-config' })}
    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
    title="Clone Layout"
>
    <Copy className="w-4 h-4" />
</button>
{configurations.length > 1 && (
    <button
        onClick={() => setDialog({ type: 'delete-config' })}
        className="p-1.5 bg-slate-800 hover:bg-red-900/50 text-slate-300 hover:text-red-400 rounded-lg border border-slate-700 hover:border-red-500/30 transition-colors"
        title="Delete Layout"
    >
        <Trash2 className="w-4 h-4" />
    </button>
)}
```

Add `Copy` to the lucide-react import.

- [ ] **Step 8: Commit**

```bash
git add components/Seating/SeatingConfigurator.tsx
git commit -m "feat(seating): inline config dialogs, clone config, regenerate confirmation"
```

---

### Task 4: Add save notifications and per-table capacity editing

**Files:**
- Modify: `components/Seating/SeatingConfigurator.tsx`

- [ ] **Step 1: Add notification hook**

At the top of the component function:

```tsx
import { useNotifications } from '../NotificationSystem';
// Inside the component:
const { showNotification } = useNotifications();
```

- [ ] **Step 2: Add save success/error feedback**

Replace the `handleSave` function:

```tsx
const handleSave = async () => {
    if (!activeConfigId) return;
    setSaving(true);
    try {
        await Promise.all([
            saveSeatingTables(tables, selectedFormId, activeConfigId),
            saveSeatingAssignments(assignments, activeConfigId),
            saveSceneElements(sceneElements, activeConfigId)
        ]);
        showNotification('Layout saved successfully', 'success');
    } catch (err) {
        showNotification('Failed to save layout. Please try again.', 'error');
        console.error('Save error:', err);
    } finally {
        setSaving(false);
    }
};
```

- [ ] **Step 3: Add per-table capacity editing in the Table Editor panel**

In the Table Editor section (around line 773), after the table name input, add a capacity control:

```tsx
<div>
    <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Seats</label>
    <div className="flex items-center gap-2">
        <button
            onClick={() => {
                pushHistory();
                const newCap = Math.max(2, selectedTable.capacity - 1);
                updateSelectedTable({ capacity: newCap });
                // Remove excess assignments if reducing capacity
                const tableAssigned = assignments.filter(a => a.tableId === selectedTableId);
                if (tableAssigned.length > newCap) {
                    const toRemove = tableAssigned.slice(newCap);
                    setAssignments(prev => prev.filter(a => !toRemove.some(r => r.id === a.id)));
                }
            }}
            className="p-1.5 bg-slate-900/50 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
        >
            -
        </button>
        <span className="text-white text-sm font-mono w-8 text-center">{selectedTable.capacity}</span>
        <button
            onClick={() => {
                pushHistory();
                updateSelectedTable({ capacity: Math.min(20, selectedTable.capacity + 1) });
            }}
            className="p-1.5 bg-slate-900/50 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
        >
            +
        </button>
    </div>
</div>
```

- [ ] **Step 4: Add table rotation slider to the Table Editor**

After the capacity control:

```tsx
<div>
    <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Rotation</label>
    <input
        type="range"
        min={0}
        max={360}
        value={Math.round((selectedTable.rotation * 180) / Math.PI)}
        onChange={(e) => {
            const degrees = parseInt(e.target.value);
            updateSelectedTable({ rotation: (degrees * Math.PI) / 180 });
        }}
        className="w-full accent-indigo-500"
    />
    <div className="flex justify-between text-[9px] text-slate-600 mt-1">
        <span>0°</span>
        <span className="text-slate-400 font-mono">{Math.round((selectedTable.rotation * 180) / Math.PI)}°</span>
        <span>360°</span>
    </div>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add components/Seating/SeatingConfigurator.tsx
git commit -m "feat(seating): save notifications, per-table capacity editing, rotation slider"
```

---

### Task 5: Group-aware auto-assign in GuestSidebar

**Files:**
- Modify: `components/Seating/GuestSidebar.tsx`
- Modify: `components/Seating/SeatingConfigurator.tsx`

The current auto-assign fills tables sequentially with no regard for groups. For galas, purchasers and their guests (linked via `primaryAttendeeId`) should be seated together.

- [ ] **Step 1: Replace the auto-assign handler in SeatingConfigurator**

Replace `handleAutoAssign`:

```tsx
const handleAutoAssign = () => {
    pushHistory();
    const unassigned = attendees.filter(a => !assignments.some(as => as.attendeeId === a.id));
    if (unassigned.length === 0) {
        showNotification('All guests are already assigned', 'info');
        return;
    }

    // Group by purchaser party: primaryAttendeeId links guests to their purchaser
    const parties: Attendee[][] = [];
    const solos: Attendee[] = [];
    const grouped = new Set<string>();

    // Find purchasers (isPrimary or no primaryAttendeeId) and their guests
    const purchasers = unassigned.filter(a => a.isPrimary || !a.primaryAttendeeId);
    for (const purchaser of purchasers) {
        const guests = unassigned.filter(
            g => g.primaryAttendeeId === purchaser.id && g.id !== purchaser.id
        );
        if (guests.length > 0) {
            const party = [purchaser, ...guests];
            parties.push(party);
            party.forEach(p => grouped.add(p.id));
        }
    }

    // Remaining unassigned who aren't in any party
    unassigned.forEach(a => {
        if (!grouped.has(a.id)) solos.push(a);
    });

    // Sort parties largest-first for better bin-packing
    parties.sort((a, b) => b.length - a.length);

    const newAssignments = [...assignments];

    const assignToTable = (guest: Attendee, tableId: string) => {
        const existing = newAssignments.filter(a => a.tableId === tableId);
        newAssignments.push({
            id: crypto.randomUUID(),
            configurationId: activeConfigId,
            attendeeId: guest.id,
            tableId,
            seatNumber: existing.length + 1
        });
    };

    const getAvailableSeats = (tableId: string) => {
        const table = tables.find(t => t.id === tableId);
        if (!table) return 0;
        return table.capacity - newAssignments.filter(a => a.tableId === tableId).length;
    };

    // Place parties first — find a table with enough room for the whole party
    for (const party of parties) {
        let placed = false;
        for (const table of tables) {
            if (getAvailableSeats(table.id) >= party.length) {
                party.forEach(g => assignToTable(g, table.id));
                placed = true;
                break;
            }
        }
        // If no single table fits, split the party across tables as fallback
        if (!placed) {
            let remaining = [...party];
            for (const table of tables) {
                const available = getAvailableSeats(table.id);
                if (available <= 0) continue;
                const batch = remaining.splice(0, available);
                batch.forEach(g => assignToTable(g, table.id));
                if (remaining.length === 0) break;
            }
        }
    }

    // Place solos in remaining seats
    let soloIdx = 0;
    for (const table of tables) {
        const available = getAvailableSeats(table.id);
        for (let s = 0; s < available && soloIdx < solos.length; s++) {
            assignToTable(solos[soloIdx], table.id);
            soloIdx++;
        }
        if (soloIdx >= solos.length) break;
    }

    setAssignments(newAssignments);

    const totalAssigned = newAssignments.length - assignments.length;
    const overflow = unassigned.length - totalAssigned;
    if (overflow > 0) {
        showNotification(`Assigned ${totalAssigned} guests. ${overflow} guests couldn't fit — add more tables or increase capacity.`, 'warning');
    } else {
        showNotification(`All ${totalAssigned} guests assigned successfully`, 'success');
    }
};
```

- [ ] **Step 2: Add ticket type badge and dietary icon to GuestSidebar guest rows**

In `GuestSidebar.tsx`, update the unassigned guest card (around line 152) to show ticket type and dietary info:

```tsx
unassigned.map(guest => (
    <div
        key={guest.id}
        className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-all ${selectedGuests.has(guest.id)
            ? 'bg-indigo-600/20 border border-indigo-500/40'
            : 'bg-slate-800/50 hover:bg-slate-800 border border-transparent'
            }`}
        onClick={() => toggleGuest(guest.id)}
    >
        <input
            type="checkbox"
            checked={selectedGuests.has(guest.id)}
            readOnly
            className="w-4 h-4 rounded accent-indigo-600"
        />
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-white truncate">{guest.name}</p>
                {guest.guestType === 'child' && (
                    <span className="text-[9px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded-full font-bold uppercase">Child</span>
                )}
            </div>
            <div className="flex items-center gap-2">
                <p className="text-xs text-slate-400 truncate">{guest.email}</p>
                {guest.dietaryPreferences && (
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full" title={guest.dietaryPreferences}>
                        🍽
                    </span>
                )}
            </div>
            {guest.ticketType && (
                <p className="text-[10px] text-slate-500 truncate mt-0.5">{guest.ticketType}</p>
            )}
        </div>
        {selectedTableId && spotsLeft > 0 && (
            <button
                onClick={(e) => { e.stopPropagation(); onAssignGuests([guest.id], selectedTableId); }}
                className="p-1 hover:bg-indigo-600/30 rounded transition-colors"
            >
                <UserPlus className="w-4 h-4 text-indigo-400" />
            </button>
        )}
    </div>
))
```

- [ ] **Step 3: Add "Clear Table" button per table in assigned breakdown**

In the assigned-by-table section (around line 200), add a clear button in the table header:

```tsx
<div className="bg-slate-800/60 px-3 py-2 flex items-center justify-between border-b border-slate-700/30">
    <div className="flex items-center gap-2">
        <TableIcon className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-xs font-bold text-white">{table.name}</span>
    </div>
    <div className="flex items-center gap-2">
        <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
            {assignedByTable[table.id].length}/{table.capacity}
        </span>
        <button
            onClick={() => {
                assignedByTable[table.id].forEach(g => onUnassignGuest(g.id));
            }}
            className="p-1 text-slate-500 hover:text-red-400 transition-colors"
            title="Clear all from this table"
        >
            <X className="w-3 h-3" />
        </button>
    </div>
</div>
```

- [ ] **Step 4: Add capacity overflow warning**

At the bottom of the GuestSidebar, before the closing `</div>`, add a summary bar:

```tsx
{/* Summary */}
<div className="p-4 border-t border-slate-700/50 bg-slate-950/50">
    <div className="flex justify-between text-xs">
        <span className="text-slate-500">Total Capacity</span>
        <span className="text-white font-mono">
            {tables.reduce((s, t) => s + t.capacity, 0)} seats
        </span>
    </div>
    <div className="flex justify-between text-xs mt-1">
        <span className="text-slate-500">Total Guests</span>
        <span className={`font-mono ${attendees.length > tables.reduce((s, t) => s + t.capacity, 0) ? 'text-red-400' : 'text-emerald-400'}`}>
            {attendees.length}
        </span>
    </div>
    {attendees.length > tables.reduce((s, t) => s + t.capacity, 0) && (
        <p className="text-[10px] text-red-400 mt-2">
            ⚠ {attendees.length - tables.reduce((s, t) => s + t.capacity, 0)} guests won't fit. Add tables or increase capacity.
        </p>
    )}
</div>
```

- [ ] **Step 5: Commit**

```bash
git add components/Seating/SeatingConfigurator.tsx components/Seating/GuestSidebar.tsx
git commit -m "feat(seating): group-aware auto-assign, ticket badges, dietary info, clear table"
```

---

### Task 6: Table list and search in the left panel

**Files:**
- Modify: `components/Seating/SeatingConfigurator.tsx`

Currently there's no way to find or jump to a specific table from the config panel. This adds a searchable table list below the editors.

- [ ] **Step 1: Add table search state**

After existing state declarations:

```tsx
const [tableSearch, setTableSearch] = useState('');
```

- [ ] **Step 2: Add table list section at the bottom of the config panel**

After the Scene Elements list section (around line 935), add:

```tsx
{/* ═══ Table List ═══ */}
{tables.length > 0 && (
    <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Rows3 className="w-4 h-4" />
            Tables ({tables.length})
        </h4>
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
            <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Search tables..."
                className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
        </div>
        <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
            {tables
                .filter(t => t.name.toLowerCase().includes(tableSearch.toLowerCase()))
                .map(t => {
                    const tGuests = assignments.filter(a => a.tableId === t.id).length;
                    const occupancy = tGuests / t.capacity;
                    return (
                        <button
                            key={t.id}
                            onClick={() => { setSelectedTableId(t.id); setSelectedElementId(null); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${selectedTableId === t.id
                                ? 'bg-emerald-600/20 border border-emerald-500/40'
                                : 'bg-slate-800/30 hover:bg-slate-800/60 border border-transparent'
                            }`}
                        >
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                t.vip ? 'bg-indigo-500' : occupancy >= 1 ? 'bg-emerald-500' : occupancy > 0 ? 'bg-amber-500' : 'bg-slate-500'
                            }`} />
                            <span className="text-xs font-medium text-white truncate flex-1">
                                {t.name}
                                {t.vip && ' 👑'}
                            </span>
                            <span className={`text-[10px] font-mono ${occupancy >= 1 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                {tGuests}/{t.capacity}
                            </span>
                        </button>
                    );
                })}
        </div>
    </div>
)}
```

Add `Search` to the lucide-react import at the top of `SeatingConfigurator.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/Seating/SeatingConfigurator.tsx
git commit -m "feat(seating): add searchable table list in config panel"
```

---

### Task 7: Polish — toggle panel buttons, unsaved changes indicator, keyboard shortcut help

**Files:**
- Modify: `components/Seating/SeatingConfigurator.tsx`

- [ ] **Step 1: Add toggle buttons for sidebar panels**

In the top bar, after the perspective toggle (around line 562), add panel toggle buttons:

```tsx
<div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700/50">
    <button
        onClick={() => setShowConfig(!showConfig)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${showConfig ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
        title="Toggle Config Panel"
    >
        <Settings className="w-3.5 h-3.5" />
        Config
    </button>
    <button
        onClick={() => setShowGuests(!showGuests)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${showGuests ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
        title="Toggle Guest Panel"
    >
        <Users className="w-3.5 h-3.5" />
        Guests
    </button>
</div>
```

Add `Users` to the lucide-react import.

- [ ] **Step 2: Add unsaved changes indicator**

Add a `hasUnsavedChanges` tracker. After the `saving` state:

```tsx
const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>('');

const currentSnapshot = useMemo(() =>
    JSON.stringify({ tables, assignments, sceneElements }),
    [tables, assignments, sceneElements]
);

const hasUnsavedChanges = currentSnapshot !== lastSavedSnapshot && lastSavedSnapshot !== '';
```

Update `handleSave` to snapshot on successful save:

```tsx
// Inside handleSave, after the successful Promise.all:
setLastSavedSnapshot(JSON.stringify({ tables, assignments, sceneElements }));
```

Update the data load effect to set the initial saved snapshot:

```tsx
// At the end of the load effect, after setLoading(false):
setLastSavedSnapshot(JSON.stringify({ tables: t, assignments: as, sceneElements: se }));
```

Show the indicator on the Save button:

```tsx
<button
    onClick={handleSave}
    disabled={saving}
    className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-lg transition-all shadow-lg ${
        hasUnsavedChanges
            ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
            : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
    } disabled:bg-slate-700`}
>
    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
    {saving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Saved'}
</button>
```

- [ ] **Step 3: Add keyboard shortcut hint in the top bar**

Add a help tooltip near the transform mode section. In the element editor's transform mode section, append after the grid:

```tsx
<p className="text-[9px] text-slate-600 mt-2 text-center">
    T = Move · R = Rotate · S = Scale · Ctrl+Z = Undo
</p>
```

- [ ] **Step 4: Commit**

```bash
git add components/Seating/SeatingConfigurator.tsx
git commit -m "feat(seating): panel toggles, unsaved indicator, keyboard hints"
```

---

### Task 8: Improve TableObject with capacity ring indicator

**Files:**
- Modify: `components/Seating/TableObject.tsx`

- [ ] **Step 1: Add a progress ring around tables showing fill level**

In `TableObject.tsx`, after the selection ring (around line 93) and before the table surface, add a capacity ring that shows how full the table is:

```tsx
{/* Capacity fill ring — thin arc showing occupancy */}
{guests.length > 0 && !showGlow && (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[1.5, 1.6, 32, 1, 0, (occupancy * Math.PI * 2)]} />
        <meshBasicMaterial color={statusColor} transparent opacity={0.5} />
    </mesh>
)}
```

- [ ] **Step 2: Show dietary info icon next to occupied seats**

Update the `Chair` component to accept and display a dietary indicator. Modify the Chair signature:

```tsx
const Chair = React.memo(function Chair({ position, rotation, isOccupied, hasDietary }: { position: [number, number, number]; rotation: [number, number, number]; isOccupied: boolean; hasDietary?: boolean }) {
    return (
        <group position={position} rotation={rotation}>
            <mesh geometry={CHAIR_SEAT_GEO} material={CHAIR_MAT} position={[0, 0.35, 0]} />
            <mesh geometry={CHAIR_BACK_GEO} material={CHAIR_MAT} position={[0, 0.55, -0.16]} />

            {isOccupied && (
                <group position={[0, 0.5, 0]}>
                    <mesh geometry={PERSON_BODY_GEO} material={PERSON_MAT} position={[0, 0.22, 0]} />
                    <mesh geometry={PERSON_HEAD_GEO} material={PERSON_MAT} position={[0, 0.55, 0]} />
                    {hasDietary && (
                        <mesh position={[0.2, 0.7, 0]}>
                            <sphereGeometry args={[0.06, 8, 8]} />
                            <meshBasicMaterial color="#f59e0b" />
                        </mesh>
                    )}
                </group>
            )}
        </group>
    );
});
```

Update the Chair rendering in the map (around line 110):

```tsx
{chairPositions.map((chair, i) => {
    const occupant = guests.find(g => g.assignedSeat === chair.seatId);
    return (
        <Chair
            key={i}
            position={chair.pos}
            rotation={chair.rot}
            isOccupied={!!occupant}
            hasDietary={!!occupant?.dietaryPreferences}
        />
    );
})}
```

- [ ] **Step 3: Commit**

```bash
git add components/Seating/TableObject.tsx
git commit -m "feat(seating): capacity ring indicator and dietary markers on table objects"
```

---

### Task 9: Final integration pass

**Files:**
- Modify: `components/Seating/SeatingConfigurator.tsx`

- [ ] **Step 1: Ensure all imports are correct**

Verify the lucide-react import at the top of `SeatingConfigurator.tsx` includes all needed icons:

```tsx
import { Eye, Rows3, Plus, Trash2, Settings, Save, Loader2, RotateCcw, Crown, FileText, Download, Layout, CheckCircle2, Box, Palette, Tag, Move, RotateCw, Maximize2, Upload, Package, Undo2, Redo2, Copy, Search, Users } from 'lucide-react';
```

- [ ] **Step 2: Run the dev server and verify**

```bash
npm run dev
```

Verify:
1. Open the Seating Chart page
2. Generate tables — confirm dialog appears if tables exist
3. Undo/redo works (Ctrl+Z / Ctrl+Y and buttons)
4. Create/clone/delete configurations via inline dialogs (no browser prompt())
5. Per-table capacity +/- buttons work, rotation slider works
6. Auto-assign groups purchaser parties together
7. Save shows green notification, button turns amber when changes are unsaved
8. Table list in left panel is searchable
9. Panel toggle buttons show/hide config and guest panels
10. Tables show capacity ring and dietary markers in 3D view

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(seating): final integration — imports, type fixes"
```
