import React, { useState, useEffect, useCallback, Suspense, useMemo, useRef } from 'react';
import { Rows3, Plus, Trash2, Settings, Save, Loader2, Crown, Download, Box, Move, RotateCw, Maximize2, Upload, Package, Undo2, Redo2, Copy, Search, Users, PanelLeftClose, PanelRightClose, PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import Scene3D from './Scene3D';
import GuestSidebar from './GuestSidebar';
import { SeatingTable, Attendee, SeatingConfiguration, SeatingAssignment, SceneElement, SceneElementType, Custom3DModel } from '../../types';
import {
    getSeatingTables,
    saveSeatingTables,
    getAttendeesByForm,
    getSeatingConfigurations,
    saveSeatingConfiguration,
    deleteSeatingConfiguration,
    getSeatingAssignments,
    saveSeatingAssignments,
    getSceneElements,
    saveSceneElements,
    getForms,
    getCustom3DModels,
    uploadCustom3DModel,
    deleteCustom3DModel,
    getModelPublicUrl
} from '../../services/storageService';
import { Form } from '../../types';
import jsPDF from 'jspdf';
import ConfirmDialog from './ConfirmDialog';
import { useNotifications } from '../NotificationSystem';

const ELEMENT_TYPES: { value: SceneElementType; label: string; icon: string }[] = [
    { value: 'stage', label: 'Stage', icon: '🎤' },
    { value: 'booth', label: 'Booth', icon: '🪑' },
    { value: 'rect-table', label: 'Table (Deco)', icon: '🪵' },
    { value: 'barrier', label: 'Barrier', icon: '🚧' },
    { value: 'plant', label: 'Plant', icon: '🌿' },
    { value: 'column', label: 'Column', icon: '🏛️' },
    { value: 'dance-floor', label: 'Dance Floor', icon: '💃' },
    { value: 'bar', label: 'Bar Counter', icon: '🍸' },
    { value: 'custom', label: 'Custom 3D', icon: '📦' },
];

const DEFAULT_COLORS: string[] = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b',
    '#22c55e', '#06b6d4', '#3b82f6', '#78716c', '#1e1b4b',
];

// History for undo/redo
interface HistorySnapshot {
    tables: SeatingTable[];
    assignments: SeatingAssignment[];
    sceneElements: SceneElement[];
}
const MAX_HISTORY = 30;

export default function SeatingConfigurator() {
    const { showNotification } = useNotifications();

    // Data state
    const [forms, setForms] = useState<Form[]>([]);
    const [selectedFormId, setSelectedFormId] = useState<string>('');
    const [configurations, setConfigurations] = useState<SeatingConfiguration[]>([]);
    const [activeConfigId, setActiveConfigId] = useState<string>('');
    const [tables, setTables] = useState<SeatingTable[]>([]);
    const [attendees, setAttendees] = useState<Attendee[]>([]);
    const [assignments, setAssignments] = useState<SeatingAssignment[]>([]);
    const [sceneElements, setSceneElements] = useState<SceneElement[]>([]);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>('');

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

    // Filtered/Enhanced Attendees based on assignments
    const enhancedAttendees = useMemo(() => {
        return attendees.map(a => {
            const assignment = assignments.find(as => as.attendeeId === a.id);
            return {
                ...a,
                assignedTableId: assignment?.tableId || null,
                assignedSeat: assignment?.seatNumber || null
            };
        });
    }, [attendees, assignments]);

    const currentSnapshot = useMemo(() =>
        JSON.stringify({ tables, assignments, sceneElements }),
        [tables, assignments, sceneElements]
    );

    const hasUnsavedChanges = currentSnapshot !== lastSavedSnapshot && lastSavedSnapshot !== '';

    // UI state
    const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [perspective, setPerspective] = useState<'birds-eye' | '3d'>('3d');
    const [showConfig, setShowConfig] = useState(true);
    const [showGuests, setShowGuests] = useState(true);
    const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
    const [tableSearch, setTableSearch] = useState('');
    const [dialog, setDialog] = useState<{
        type: 'create-config' | 'clone-config' | 'confirm-regenerate' | 'delete-config';
        data?: any;
    } | null>(null);

    // Add hotkeys for transform mode + undo/redo
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
            if (e.key === 'r' || e.key === 'R') setTransformMode('rotate');
            if (e.key === 's' || e.key === 'S') setTransformMode('scale');
            if (e.key === 't' || e.key === 'T' || e.key === 'g' || e.key === 'G') setTransformMode('translate');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    // Configurator state
    const [tableCount, setTableCount] = useState(25);
    const [seatsPerTable, setSeatsPerTable] = useState(8);
    const [tableShape, setTableShape] = useState<'round' | 'rect'>('round');

    // Add Element state
    const [newElementType, setNewElementType] = useState<SceneElementType>('stage');
    const [newElementLabel, setNewElementLabel] = useState('');
    const [newElementColor, setNewElementColor] = useState('#6366f1');
    const [newElementModelId, setNewElementModelId] = useState<string>('');

    // Custom 3D Models
    const [customModels, setCustomModels] = useState<Custom3DModel[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Build URL map for custom models
    const customModelUrls = useMemo(() => {
        const map: Record<string, string> = {};
        customModels.forEach(m => {
            map[m.id] = getModelPublicUrl(m.filePath);
        });
        return map;
    }, [customModels]);

    // Load forms + custom models on init
    useEffect(() => {
        const loadInit = async () => {
            const [f, models] = await Promise.all([getForms(), getCustom3DModels()]);
            setForms(f);
            setCustomModels(models);
            if (f.length > 0) {
                const saved = localStorage.getItem('seatingDefaultFormId');
                const preferred = saved && f.find(form => form.id === saved);
                setSelectedFormId(preferred ? preferred.id : f[0].id);
            }
        };
        loadInit();
    }, []);

    // Load configurations when form changes
    useEffect(() => {
        if (!selectedFormId) return;
        const loadConfigs = async () => {
            const configs = await getSeatingConfigurations(selectedFormId);
            setConfigurations(configs);
            if (configs.length > 0) {
                setActiveConfigId(configs[0].id);
            } else {
                // Auto-create initial config if none exists
                const newConfig: SeatingConfiguration = {
                    id: crypto.randomUUID(),
                    formId: selectedFormId,
                    name: 'Initial Layout',
                    createdAt: new Date().toISOString()
                };
                await saveSeatingConfiguration(newConfig);
                setConfigurations([newConfig]);
                setActiveConfigId(newConfig.id);
            }
        };
        loadConfigs();
    }, [selectedFormId]);

    // Load tables + attendees + assignments + scene elements when active config changes
    useEffect(() => {
        if (!activeConfigId || !selectedFormId) return;
        const load = async () => {
            setLoading(true);
            const [t, a, as, se] = await Promise.all([
                getSeatingTables(selectedFormId, activeConfigId),
                getAttendeesByForm(selectedFormId),
                getSeatingAssignments(activeConfigId),
                getSceneElements(activeConfigId)
            ]);
            setTables(t);
            setAttendees(a);
            setAssignments(as);
            setSceneElements(se);
            setSelectedTableId(null);
            setSelectedElementId(null);
            setLoading(false);
            setLastSavedSnapshot(JSON.stringify({ tables: t, assignments: as, sceneElements: se }));
            // Push initial snapshot for undo baseline
            setTimeout(() => {
                pushHistory();
            }, 0);
        };
        load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConfigId, selectedFormId]);

    // Generate tables
    const generateTables = useCallback(() => {
        pushHistory();
        const cols = Math.ceil(Math.sqrt(tableCount));
        const spacing = 5;
        const newTables: SeatingTable[] = [];

        for (let i = 0; i < tableCount; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const x = (col - (cols - 1) / 2) * spacing;
            const z = (row - (Math.ceil(tableCount / cols) - 1) / 2) * spacing;

            newTables.push({
                id: crypto.randomUUID(),
                formId: selectedFormId,
                configurationId: activeConfigId,
                name: `Table ${i + 1}`,
                capacity: seatsPerTable,
                shape: tableShape,
                x,
                z,
                rotation: 0,
                vip: false,
                createdAt: new Date().toISOString()
            });
        }
        setTables(newTables);
        setSelectedTableId(null);
    }, [tableCount, seatsPerTable, tableShape, selectedFormId, activeConfigId, pushHistory]);

    // Create new configuration
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

    const cloneCurrentConfig = (name: string) => {
        setLoading(true);
        const newConfig: SeatingConfiguration = {
            id: crypto.randomUUID(),
            formId: selectedFormId,
            name,
            createdAt: new Date().toISOString()
        };
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

    const deleteCurrentConfig = async () => {
        if (configurations.length <= 1) return;
        await deleteSeatingConfiguration(activeConfigId);
        const remaining = configurations.filter(c => c.id !== activeConfigId);
        setConfigurations(remaining);
        setActiveConfigId(remaining[0].id);
    };

    const handleRegenerateClick = () => {
        if (tables.length > 0) {
            setDialog({ type: 'confirm-regenerate' });
        } else {
            generateTables();
        }
    };

    // Update selected table
    const updateSelectedTable = (updates: Partial<SeatingTable>) => {
        if (!selectedTableId) return;
        setTables(prev => prev.map(t =>
            t.id === selectedTableId ? { ...t, ...updates } : t
        ));
    };

    // Update selected element
    const updateSelectedElement = (updates: Partial<SceneElement>) => {
        if (!selectedElementId) return;
        setSceneElements(prev => prev.map(e =>
            e.id === selectedElementId ? { ...e, ...updates } : e
        ));
    };

    // Update element by ID (from 3D transform)
    const updateElementById = useCallback((id: string, updates: Partial<SceneElement>) => {
        setSceneElements(prev => prev.map(e =>
            e.id === id ? { ...e, ...updates } : e
        ));
    }, []);

    // Handle table drag
    const handleTableDrag = useCallback((id: string, x: number, z: number) => {
        setTables(prev => prev.map(t =>
            t.id === id ? { ...t, x, z } : t
        ));
    }, []);

    // Add scene element
    const addSceneElement = () => {
        pushHistory();
        if (newElementType === 'custom' && !newElementModelId) return;
        const label = newElementLabel.trim() || ELEMENT_TYPES.find(t => t.value === newElementType)?.label || 'Element';
        const element: SceneElement = {
            id: crypto.randomUUID(),
            configurationId: activeConfigId,
            elementType: newElementType,
            label,
            color: newElementColor,
            x: Math.random() * 10 - 5,
            y: 0,
            z: Math.random() * 10 - 5,
            rotationY: 0,
            scaleX: 1,
            scaleY: 1,
            scaleZ: 1,
            createdAt: new Date().toISOString(),
            customModelId: newElementType === 'custom' ? newElementModelId : undefined
        };
        setSceneElements(prev => [...prev, element]);
        setSelectedElementId(element.id);
        setSelectedTableId(null);
        setNewElementLabel('');
    };

    // Upload 3D model
    const handleModelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const model = await uploadCustom3DModel(file);
        if (model) {
            setCustomModels(prev => [model, ...prev]);
            setNewElementModelId(model.id);
            setNewElementType('custom');
        }
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Delete 3D model
    const handleDeleteModel = async (model: Custom3DModel) => {
        await deleteCustom3DModel(model);
        setCustomModels(prev => prev.filter(m => m.id !== model.id));
        if (newElementModelId === model.id) setNewElementModelId('');

        // Remove any placed elements that rely on this model to avoid foreign key errors on save
        setSceneElements(prev => prev.filter(e => e.customModelId !== model.id));

        if (selectedElementId) {
            const selectedElem = sceneElements.find(e => e.id === selectedElementId);
            if (selectedElem?.customModelId === model.id) {
                setSelectedElementId(null);
            }
        }
    };

    // Delete scene element
    const deleteSelectedElement = () => {
        pushHistory();
        if (!selectedElementId) return;
        setSceneElements(prev => prev.filter(e => e.id !== selectedElementId));
        setSelectedElementId(null);
    };

    // Save All
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
            setLastSavedSnapshot(JSON.stringify({ tables, assignments, sceneElements }));
        } catch (err) {
            showNotification('Failed to save layout. Please try again.', 'error');
            console.error('Save error:', err);
        } finally {
            setSaving(false);
        }
    };

    // Assign guests
    const handleAssignGuests = async (guestIds: string[], tableId: string) => {
        pushHistory();
        const table = tables.find(t => t.id === tableId);
        if (!table) return;

        const currentGuests = assignments.filter(as => as.tableId === tableId);
        let seatNumber = currentGuests.length;

        const newAssignments = [...assignments];

        for (const guestId of guestIds) {
            if (seatNumber >= table.capacity) break;
            seatNumber++;
            // Remove previous assignment for this guest in this config if exists
            const existingIdx = newAssignments.findIndex(as => as.attendeeId === guestId);
            if (existingIdx !== -1) newAssignments.splice(existingIdx, 1);

            newAssignments.push({
                id: crypto.randomUUID(),
                configurationId: activeConfigId,
                attendeeId: guestId,
                tableId,
                seatNumber
            });
        }

        setAssignments(newAssignments);
    };

    // Unassign guest
    const handleUnassignGuest = (guestId: string) => {
        pushHistory();
        setAssignments(prev => prev.filter(as => as.attendeeId !== guestId));
    };

    // Auto assign — group-aware: keeps purchaser parties together
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

        unassigned.forEach(a => {
            if (!grouped.has(a.id)) solos.push(a);
        });

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

        for (const party of parties) {
            let placed = false;
            for (const table of tables) {
                if (getAvailableSeats(table.id) >= party.length) {
                    party.forEach(g => assignToTable(g, table.id));
                    placed = true;
                    break;
                }
            }
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
            showNotification(`Assigned ${totalAssigned} guests. ${overflow} couldn't fit — add more tables or increase capacity.`, 'warning');
        } else {
            showNotification(`All ${totalAssigned} guests assigned successfully`, 'success');
        }
    };

    // PDF Export
    const handleExportPDF = () => {
        const doc = new jsPDF();
        const activeConfig = configurations.find(c => c.id === activeConfigId);
        const form = forms.find(f => f.id === selectedFormId);

        // Header
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, 210, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.text(form?.title || 'Seating Chart Report', 20, 20);
        doc.setFontSize(12);
        doc.text(`Configuration: ${activeConfig?.name || 'Default'}`, 20, 30);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 150, 30);

        let yPos = 50;

        // Group tables into rows (2 tables per row)
        for (let i = 0; i < tables.length; i += 2) {
            const rowTables = tables.slice(i, i + 2);

            let maxHeightInRow = 0;
            rowTables.forEach((table, index) => {
                const xPos = index === 0 ? 20 : 110;
                const tableGuests = assignments
                    .filter(as => as.tableId === table.id)
                    .map(as => attendees.find(a => a.id === as.attendeeId))
                    .filter(Boolean);

                // Table Header Box
                doc.setDrawColor(79, 70, 229);
                doc.setLineWidth(0.5);
                doc.setFillColor(248, 250, 252);
                doc.roundedRect(xPos, yPos, 80, 10 + (tableGuests.length * 7) + 5, 2, 2, 'FD');

                doc.setFillColor(table.vip ? 191 : 79, table.vip ? 155 : 70, table.vip ? 48 : 229);
                doc.rect(xPos, yPos, 80, 8, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(10);
                doc.text(`${table.name} ${table.vip ? '(VIP)' : ''}`, xPos + 5, yPos + 5.5);
                doc.text(`${tableGuests.length}/${table.capacity}`, xPos + 70, yPos + 5.5);

                doc.setTextColor(51, 65, 85);
                doc.setFontSize(8);
                tableGuests.forEach((guest, gIdx) => {
                    const assignment = assignments.find(as => as.attendeeId === guest?.id);
                    doc.text(`${assignment?.seatNumber}. ${guest?.name}`, xPos + 5, yPos + 15 + (gIdx * 7));
                });

                const tableHeight = 10 + (tableGuests.length * 7) + 5;
                if (tableHeight > maxHeightInRow) maxHeightInRow = tableHeight;
            });

            yPos += maxHeightInRow + 10;

            if (yPos > 250 && i + 2 < tables.length) {
                doc.addPage();
                yPos = 20;
            }
        }

        doc.save(`${form?.title}_${activeConfig?.name}_Seating.pdf`);
    };

    // Selections
    const handleSelectTable = useCallback((id: string) => {
        setSelectedTableId(id);
        setSelectedElementId(null);
    }, []);

    const handleSelectElement = useCallback((id: string | null) => {
        setSelectedElementId(id);
        if (id) setSelectedTableId(null);
    }, []);

    const selectedTable = tables.find(t => t.id === selectedTableId);
    const selectedElement = sceneElements.find(e => e.id === selectedElementId);
    const totalSeats = tables.reduce((sum, t) => sum + t.capacity, 0);
    const assignedCount = assignments.length;

    return (
        <div className="fixed inset-0 z-40 flex flex-col bg-slate-950 overflow-hidden">
            {/* Top Bar */}
            <div className="flex-shrink-0 bg-slate-900 border-b border-slate-700/50">
                {/* Row 1: Event/Layout selection + Stats */}
                <div className="flex items-center justify-between px-3 py-2 gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                        <h2 className="text-sm font-bold text-white flex items-center gap-1.5 flex-shrink-0">
                            <Rows3 className="w-4 h-4 text-indigo-400" />
                            Seating
                        </h2>

                        <select
                            value={selectedFormId}
                            onChange={(e) => {
                                setSelectedFormId(e.target.value);
                                localStorage.setItem('seatingDefaultFormId', e.target.value);
                            }}
                            className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0 max-w-[140px] truncate"
                        >
                            {forms.map(f => (
                                <option key={f.id} value={f.id}>{f.title}</option>
                            ))}
                        </select>

                        <div className="h-5 w-px bg-slate-700" />

                        <select
                            value={activeConfigId}
                            onChange={(e) => setActiveConfigId(e.target.value)}
                            className="bg-slate-800 border border-indigo-500/50 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0 max-w-[130px] truncate"
                        >
                            {configurations.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setDialog({ type: 'create-config' })}
                                className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700 transition-colors"
                                title="New Layout"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setDialog({ type: 'clone-config' })}
                                className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700 transition-colors"
                                title="Clone Layout"
                            >
                                <Copy className="w-3.5 h-3.5" />
                            </button>
                            {configurations.length > 1 && (
                                <button
                                    onClick={() => setDialog({ type: 'delete-config' })}
                                    className="p-1 bg-slate-800 hover:bg-red-900/50 text-slate-300 hover:text-red-400 rounded-md border border-slate-700 hover:border-red-500/30 transition-colors"
                                    title="Delete Layout"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Stats (inline compact) */}
                        <div className="hidden md:flex items-center gap-3 px-3 py-1 bg-slate-800/50 rounded-lg border border-slate-700/30 text-[10px]">
                            <span className="text-slate-500">{tables.length} <span className="text-white font-mono">tbl</span></span>
                            <span className="text-slate-500">{totalSeats} <span className="text-white font-mono">seats</span></span>
                            <span className="text-emerald-400 font-bold">{assignedCount} <span className="font-normal text-slate-500">assigned</span></span>
                        </div>

                        {/* View toggles */}
                        <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700/50">
                            <button
                                onClick={() => setPerspective('3d')}
                                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${perspective === '3d' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                3D
                            </button>
                            <button
                                onClick={() => setPerspective('birds-eye')}
                                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${perspective === 'birds-eye' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                                Plan
                            </button>
                        </div>

                        {/* Undo/Redo */}
                        <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700/50">
                            <button
                                onClick={undo}
                                disabled={historyIndex <= 0}
                                className="p-1.5 text-slate-400 hover:text-white disabled:text-slate-700 transition-colors rounded-md"
                                title="Undo (Ctrl+Z)"
                            >
                                <Undo2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={redo}
                                disabled={historyIndex >= history.length - 1}
                                className="p-1.5 text-slate-400 hover:text-white disabled:text-slate-700 transition-colors rounded-md"
                                title="Redo (Ctrl+Y)"
                            >
                                <Redo2 className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Actions */}
                        <button
                            onClick={handleExportPDF}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
                            title="Export PDF"
                        >
                            <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-bold rounded-lg transition-all shadow-lg ${
                                hasUnsavedChanges
                                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                            } disabled:bg-slate-700`}
                        >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            {saving ? '...' : hasUnsavedChanges ? 'Save' : 'Saved'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Config Panel (Left) */}
                {showConfig ? (
                    <div className="w-72 flex-shrink-0 bg-slate-900 border-r border-slate-700/50 overflow-y-auto custom-scrollbar flex flex-col z-10">
                        {/* Panel header with close */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50 flex-shrink-0">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                <Settings className="w-3.5 h-3.5 text-indigo-400" />
                                Configuration
                            </h3>
                            <button
                                onClick={() => setShowConfig(false)}
                                className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                                title="Collapse panel"
                            >
                                <PanelLeftClose className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-4 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                            {/* Generator Header */}
                            <div className="bg-indigo-600/10 rounded-2xl p-4 border border-indigo-500/20">
                                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Plus className="w-4 h-4" />
                                    Layout Generator
                                </h4>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Tables</label>
                                            <input
                                                type="number"
                                                value={tableCount}
                                                onChange={(e) => setTableCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                                                className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Seats</label>
                                            <input
                                                type="number"
                                                value={seatsPerTable}
                                                onChange={(e) => setSeatsPerTable(Math.max(2, Math.min(20, parseInt(e.target.value) || 2)))}
                                                className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Shape</label>
                                        <div className="flex bg-slate-800/50 rounded-xl p-1 border border-slate-700/50">
                                            <button
                                                onClick={() => setTableShape('round')}
                                                className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${tableShape === 'round' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                Round
                                            </button>
                                            <button
                                                onClick={() => setTableShape('rect')}
                                                className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${tableShape === 'rect' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                Rect
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleRegenerateClick}
                                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-xl shadow-indigo-600/20 active:scale-95"
                                    >
                                        Regenerate Layout
                                    </button>
                                </div>
                            </div>

                            {/* ═══ Add Scene Element ═══ */}
                            <div className="bg-violet-600/10 rounded-2xl p-4 border border-violet-500/20">
                                <h4 className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Box className="w-4 h-4" />
                                    Add Element
                                </h4>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Type</label>
                                        <select
                                            value={newElementType}
                                            onChange={(e) => setNewElementType(e.target.value as SceneElementType)}
                                            className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-violet-500"
                                        >
                                            {ELEMENT_TYPES.map(t => (
                                                <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {newElementType === 'custom' && (
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">3D Model</label>
                                            {customModels.length > 0 ? (
                                                <select
                                                    value={newElementModelId}
                                                    onChange={(e) => setNewElementModelId(e.target.value)}
                                                    className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-violet-500"
                                                >
                                                    <option value="">Select a model...</option>
                                                    {customModels.map(m => (
                                                        <option key={m.id} value={m.id}>
                                                            {m.name} ({(m.fileSize / 1024 / 1024).toFixed(1)}MB)
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <p className="text-[10px] text-slate-500">No models uploaded yet. Use the library below to upload.</p>
                                            )}
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Label</label>
                                        <input
                                            type="text"
                                            value={newElementLabel}
                                            onChange={(e) => setNewElementLabel(e.target.value)}
                                            placeholder={ELEMENT_TYPES.find(t => t.value === newElementType)?.label}
                                            className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-violet-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Color</label>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {DEFAULT_COLORS.map(c => (
                                                <button
                                                    key={c}
                                                    onClick={() => setNewElementColor(c)}
                                                    className={`w-6 h-6 rounded-full border-2 transition-all ${newElementColor === c ? 'border-white scale-125' : 'border-transparent hover:border-slate-500'}`}
                                                    style={{ backgroundColor: c }}
                                                />
                                            ))}
                                            <input
                                                type="color"
                                                value={newElementColor}
                                                onChange={(e) => setNewElementColor(e.target.value)}
                                                className="w-6 h-6 rounded-full border-0 cursor-pointer bg-transparent"
                                            />
                                        </div>
                                    </div>
                                    <button
                                        onClick={addSceneElement}
                                        disabled={!activeConfigId || (newElementType === 'custom' && !newElementModelId)}
                                        className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-700 text-white text-sm font-bold rounded-xl transition-all shadow-xl shadow-violet-600/20 active:scale-95"
                                    >
                                        Place Element
                                    </button>
                                </div>
                            </div>

                            {/* ═══ 3D Model Library ═══ */}
                            <div className="bg-amber-600/10 rounded-2xl p-4 border border-amber-500/20">
                                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Package className="w-4 h-4" />
                                    3D Model Library
                                </h4>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".glb,.gltf"
                                    onChange={handleModelUpload}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 mb-3 bg-amber-600/20 hover:bg-amber-600/30 disabled:bg-slate-700 text-amber-300 text-xs font-bold rounded-xl border border-amber-500/30 transition-all"
                                >
                                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                    {uploading ? 'Uploading...' : 'Upload .glb / .gltf'}
                                </button>
                                {customModels.length > 0 ? (
                                    <div className="space-y-1">
                                        {customModels.map(m => (
                                            <div key={m.id} className="flex items-center gap-2 px-3 py-2 bg-slate-800/30 rounded-lg">
                                                <Package className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                                <span className="text-xs text-white truncate flex-1">{m.name}</span>
                                                <span className="text-[9px] text-slate-500">{(m.fileSize / 1024 / 1024).toFixed(1)}MB</span>
                                                <button
                                                    onClick={() => handleDeleteModel(m)}
                                                    className="p-1 text-red-400 hover:text-red-300 transition-colors"
                                                    title="Delete model"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-slate-500 text-center py-2">
                                        Upload .glb or .gltf files to use as custom scene elements.
                                    </p>
                                )}
                            </div>

                            {/* ═══ Table Editor ═══ */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <Settings className="w-4 h-4" />
                                    Table Editor
                                </h4>
                                {selectedTable ? (
                                    <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/30 space-y-4 animate-in fade-in slide-in-from-left-2">
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Table Name</label>
                                            <input
                                                type="text"
                                                value={selectedTable.name}
                                                onChange={(e) => updateSelectedTable({ name: e.target.value })}
                                                className="w-full bg-slate-900/50 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Seats</label>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        pushHistory();
                                                        const newCap = Math.max(2, selectedTable.capacity - 1);
                                                        updateSelectedTable({ capacity: newCap });
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
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Notes</label>
                                            <textarea
                                                value={selectedTable.notes || ''}
                                                onChange={(e) => updateSelectedTable({ notes: e.target.value })}
                                                rows={2}
                                                className="w-full bg-slate-900/50 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 resize-none"
                                                placeholder="VIP requests, etc."
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => updateSelectedTable({ vip: !selectedTable.vip })}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl border transition-all ${selectedTable.vip ? 'bg-amber-500/10 border-amber-500/50 text-amber-500' : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:text-white'}`}
                                            >
                                                <Crown className={`w-3.5 h-3.5 ${selectedTable.vip ? 'fill-amber-500' : ''}`} />
                                                {selectedTable.vip ? 'VIP Member' : 'Mark VIP'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    pushHistory();
                                                    setTables(prev => prev.filter(t => t.id !== selectedTableId));
                                                    setSelectedTableId(null);
                                                }}
                                                className="p-2.5 text-red-400 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 rounded-xl transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-slate-600 text-center">
                                            <Move className="w-3 h-3 inline mr-1" />
                                            Drag table in 3D view to reposition
                                        </p>
                                    </div>
                                ) : selectedElement ? null : (
                                    <div className="py-12 px-6 text-center border-2 border-dashed border-slate-800 rounded-3xl">
                                        <p className="text-slate-500 text-xs leading-relaxed">
                                            Select a table or element in the 3D view to customize its properties.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* ═══ Element Editor ═══ */}
                            {selectedElement && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Box className="w-4 h-4" />
                                        Element Editor
                                    </h4>
                                    <div className="bg-violet-900/20 rounded-2xl p-4 border border-violet-500/20 space-y-4 animate-in fade-in slide-in-from-left-2">
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Label</label>
                                            <input
                                                type="text"
                                                value={selectedElement.label}
                                                onChange={(e) => updateSelectedElement({ label: e.target.value })}
                                                className="w-full bg-slate-900/50 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-violet-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Type</label>
                                            <div className="text-xs text-slate-300 bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700/50 capitalize">
                                                {ELEMENT_TYPES.find(t => t.value === selectedElement.elementType)?.icon}{' '}
                                                {selectedElement.elementType.replace('-', ' ')}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-slate-500 font-bold uppercase mb-2">Color</label>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {DEFAULT_COLORS.map(c => (
                                                    <button
                                                        key={c}
                                                        onClick={() => updateSelectedElement({ color: c })}
                                                        className={`w-6 h-6 rounded-full border-2 transition-all ${selectedElement.color === c ? 'border-white scale-125' : 'border-transparent hover:border-slate-500'}`}
                                                        style={{ backgroundColor: c }}
                                                    />
                                                ))}
                                                <input
                                                    type="color"
                                                    value={selectedElement.color}
                                                    onChange={(e) => updateSelectedElement({ color: e.target.value })}
                                                    className="w-6 h-6 rounded-full border-0 cursor-pointer bg-transparent"
                                                />
                                            </div>
                                        </div>
                                        <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700/20">
                                            <div className="flex justify-between items-center mb-2">
                                                <p className="text-[10px] text-slate-500 font-bold uppercase">Transform Mode</p>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                <button
                                                    onClick={() => setTransformMode('translate')}
                                                    className={`flex flex-col items-center justify-center py-2 rounded-lg border transition-colors ${transformMode === 'translate' ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:text-white'}`}
                                                >
                                                    <Move className="w-4 h-4 mb-1" />
                                                    <span className="text-[9px] font-bold uppercase tracking-wider">Move (T)</span>
                                                </button>
                                                <button
                                                    onClick={() => setTransformMode('rotate')}
                                                    className={`flex flex-col items-center justify-center py-2 rounded-lg border transition-colors ${transformMode === 'rotate' ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:text-white'}`}
                                                >
                                                    <RotateCw className="w-4 h-4 mb-1" />
                                                    <span className="text-[9px] font-bold uppercase tracking-wider">Rotate (R)</span>
                                                </button>
                                                <button
                                                    onClick={() => setTransformMode('scale')}
                                                    className={`flex flex-col items-center justify-center py-2 rounded-lg border transition-colors ${transformMode === 'scale' ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:text-white'}`}
                                                >
                                                    <Maximize2 className="w-4 h-4 mb-1" />
                                                    <span className="text-[9px] font-bold uppercase tracking-wider">Scale (S)</span>
                                                </button>
                                            </div>
                                            <p className="text-[9px] text-slate-600 mt-2 text-center">
                                                T = Move · R = Rotate · S = Scale · Ctrl+Z = Undo
                                            </p>
                                        </div>
                                        <button
                                            onClick={deleteSelectedElement}
                                            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            Remove Element
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ═══ Elements List ═══ */}
                            {sceneElements.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <Box className="w-4 h-4" />
                                        Scene Elements ({sceneElements.length})
                                    </h4>
                                    <div className="space-y-1">
                                        {sceneElements.map(el => (
                                            <button
                                                key={el.id}
                                                onClick={() => handleSelectElement(el.id)}
                                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${selectedElementId === el.id
                                                    ? 'bg-violet-600/20 border border-violet-500/40'
                                                    : 'bg-slate-800/30 hover:bg-slate-800/60 border border-transparent'
                                                    }`}
                                            >
                                                <div
                                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: el.color }}
                                                />
                                                <span className="text-xs font-medium text-white truncate flex-1">{el.label}</span>
                                                <span className="text-[9px] text-slate-500 capitalize">{el.elementType.replace('-', ' ')}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

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
                        </div>

                        {/* Layout Summary */}
                        <div className="p-4 bg-slate-950/50 border-t border-slate-700/50">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Legend</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { color: 'bg-slate-500', label: 'Empty' },
                                    { color: 'bg-amber-500', label: 'Partial' },
                                    { color: 'bg-emerald-500', label: 'Full' },
                                    { color: 'bg-indigo-500', label: 'VIP' },
                                    { color: 'bg-violet-500', label: 'Element' },
                                    { color: 'bg-green-500', label: 'Selected' },
                                ].map(({ color, label }) => (
                                    <div key={label} className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${color}`} />
                                        <span className="text-[10px] text-slate-400 font-medium uppercase">{label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setShowConfig(true)}
                        className="flex-shrink-0 w-8 flex flex-col items-center justify-center bg-slate-900 border-r border-slate-700/50 hover:bg-slate-800 transition-colors group z-10"
                        title="Open config panel"
                    >
                        <PanelLeftOpen className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                        <span className="text-[9px] text-slate-600 group-hover:text-slate-400 mt-2 [writing-mode:vertical-lr] tracking-widest uppercase font-bold">Config</span>
                    </button>
                )}

                {/* 3D View */}
                <div className="flex-1 relative bg-slate-950 overflow-hidden">
                    {loading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950 z-20">
                            <div className="text-center">
                                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto mb-4" />
                                <p className="text-slate-400 text-sm font-medium">Reconstructing Layout...</p>
                            </div>
                        </div>
                    ) : tables.length === 0 && sceneElements.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center p-8 z-20 bg-slate-950">
                            <div className="text-center max-w-sm">
                                <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-slate-800">
                                    <Rows3 className="w-10 h-10 text-slate-700" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-3">No Room Layout Data</h3>
                                <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                                    Use the config panel to generate tables and build your floor plan.
                                </p>
                                {!showConfig && (
                                    <button
                                        onClick={() => setShowConfig(true)}
                                        className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20"
                                    >
                                        Open Config Panel
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <Suspense fallback={null}>
                            <Scene3D
                                tables={tables}
                                selectedTableId={selectedTableId}
                                onSelectTable={handleSelectTable}
                                perspective={perspective}
                                attendees={enhancedAttendees}
                                sceneElements={sceneElements}
                                selectedElementId={selectedElementId}
                                onSelectElement={handleSelectElement}
                                onUpdateElement={updateElementById}
                                onTableDrag={handleTableDrag}
                                customModelUrls={customModelUrls}
                                transformMode={transformMode}
                            />
                        </Suspense>
                    )}
                </div>

                {/* Guest Sidebar */}
                {showGuests ? (
                    <div className="w-72 flex-shrink-0 border-l border-slate-700/50 shadow-2xl z-10">
                        <GuestSidebar
                            attendees={enhancedAttendees}
                            tables={tables}
                            selectedTableId={selectedTableId}
                            onAssignGuests={handleAssignGuests}
                            onUnassignGuest={handleUnassignGuest}
                            onAutoAssign={handleAutoAssign}
                            onCollapse={() => setShowGuests(false)}
                        />
                    </div>
                ) : (
                    <button
                        onClick={() => setShowGuests(true)}
                        className="flex-shrink-0 w-8 flex flex-col items-center justify-center bg-slate-900 border-l border-slate-700/50 hover:bg-slate-800 transition-colors group z-10"
                        title="Open guest panel"
                    >
                        <PanelRightOpen className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                        <span className="text-[9px] text-slate-600 group-hover:text-slate-400 mt-2 [writing-mode:vertical-lr] tracking-widest uppercase font-bold">Guests</span>
                    </button>
                )}
            </div>

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
        </div>
    );
}
