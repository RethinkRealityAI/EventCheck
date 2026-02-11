import React, { useState, useMemo } from 'react';
import { Search, UserPlus, Users, X, ChevronDown, ChevronUp, Shuffle, UserMinus, Table as TableIcon } from 'lucide-react';
import { Attendee, SeatingTable } from '../../types';

interface GuestSidebarProps {
    attendees: Attendee[];
    tables: SeatingTable[];
    selectedTableId: string | null;
    onAssignGuests: (guestIds: string[], tableId: string) => void;
    onUnassignGuest: (guestId: string) => void;
    onAutoAssign: () => void;
}

export default function GuestSidebar({
    attendees,
    tables,
    selectedTableId,
    onAssignGuests,
    onUnassignGuest,
    onAutoAssign
}: GuestSidebarProps) {
    const [search, setSearch] = useState('');
    const [selectedGuests, setSelectedGuests] = useState<Set<string>>(new Set());
    const [showAssigned, setShowAssigned] = useState(true);

    const unassigned = useMemo(() =>
        attendees.filter(a => !a.assignedTableId && a.name.toLowerCase().includes(search.toLowerCase())),
        [attendees, search]
    );

    const assigned = useMemo(() =>
        attendees.filter(a => a.assignedTableId),
        [attendees]
    );

    // Group assigned guests by table
    const assignedByTable = useMemo(() => {
        const grouped: Record<string, Attendee[]> = {};
        assigned.forEach(a => {
            if (a.assignedTableId) {
                if (!grouped[a.assignedTableId]) grouped[a.assignedTableId] = [];
                grouped[a.assignedTableId].push(a);
            }
        });
        return grouped;
    }, [assigned]);

    const selectedTable = tables.find(t => t.id === selectedTableId);
    const tableGuests = useMemo(() =>
        selectedTableId ? attendees.filter(a => a.assignedTableId === selectedTableId) : [],
        [attendees, selectedTableId]
    );
    const spotsLeft = selectedTable ? selectedTable.capacity - tableGuests.length : 0;

    const toggleGuest = (id: string) => {
        setSelectedGuests(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        if (selectedGuests.size === unassigned.length) {
            setSelectedGuests(new Set());
        } else {
            setSelectedGuests(new Set(unassigned.map(a => a.id)));
        }
    };

    const handleBulkAssign = () => {
        if (!selectedTableId || selectedGuests.size === 0) return;
        const ids = Array.from(selectedGuests).slice(0, spotsLeft);
        onAssignGuests(ids, selectedTableId);
        setSelectedGuests(new Set());
    };

    return (
        <div className="w-full h-full flex flex-col bg-slate-900 text-white overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-700/50">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-400" />
                    Guest List
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                    {unassigned.length} unassigned · {assigned.length} assigned
                </p>
            </div>

            {/* Search */}
            <div className="px-4 py-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search guests..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Action buttons */}
            <div className="px-4 pb-3 flex gap-2">
                <button
                    onClick={onAutoAssign}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                    <Shuffle className="w-3.5 h-3.5" />
                    Auto-Assign All
                </button>
                <button
                    onClick={selectAll}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                    {selectedGuests.size === unassigned.length ? 'Deselect' : 'Select All'}
                </button>
            </div>

            {/* Bulk assign bar */}
            {selectedGuests.size > 0 && selectedTableId && (
                <div className="mx-4 mb-3 p-3 bg-indigo-900/50 border border-indigo-600/30 rounded-lg">
                    <p className="text-xs text-indigo-300 mb-2">
                        {selectedGuests.size} guest{selectedGuests.size !== 1 ? 's' : ''} selected →{' '}
                        <strong>{selectedTable?.name}</strong> ({spotsLeft} spots left)
                    </p>
                    <button
                        onClick={handleBulkAssign}
                        disabled={spotsLeft <= 0}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                        <UserPlus className="w-3.5 h-3.5" />
                        Assign {Math.min(selectedGuests.size, spotsLeft)} to {selectedTable?.name}
                    </button>
                </div>
            )}

            {/* Main Tabs/Sections */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Unassigned section */}
                <div className="p-4">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                        Unassigned ({unassigned.length})
                    </p>
                    <div className="space-y-1">
                        {unassigned.length === 0 ? (
                            <p className="text-xs text-slate-600 italic">No unassigned guests found</p>
                        ) : (
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
                                        <p className="text-sm font-medium text-white truncate">{guest.name}</p>
                                        <p className="text-xs text-slate-400 truncate">{guest.email}</p>
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
                        )}
                    </div>
                </div>

                {/* Assigned section grouped by table */}
                <div className="border-t border-slate-700/50">
                    <button
                        onClick={() => setShowAssigned(!showAssigned)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors"
                    >
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Assigned Breakdown ({assigned.length})
                        </span>
                        {showAssigned ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronUp className="w-4 h-4 text-slate-500" />}
                    </button>

                    {showAssigned && (
                        <div className="px-4 pb-4 space-y-4">
                            {tables.filter(t => assignedByTable[t.id]?.length > 0).map(table => (
                                <div key={table.id} className="bg-slate-800/40 rounded-xl border border-slate-700/30 overflow-hidden">
                                    <div className="bg-slate-800/60 px-3 py-2 flex items-center justify-between border-b border-slate-700/30">
                                        <div className="flex items-center gap-2">
                                            <TableIcon className="w-3.5 h-3.5 text-indigo-400" />
                                            <span className="text-xs font-bold text-white">{table.name}</span>
                                        </div>
                                        <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                                            {assignedByTable[table.id].length}/{table.capacity}
                                        </span>
                                    </div>
                                    <div className="p-1 space-y-0.5">
                                        {assignedByTable[table.id].map(guest => (
                                            <div key={guest.id} className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-700/30 rounded group">
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-medium text-slate-200 truncate">{guest.name}</p>
                                                    <p className="text-[9px] text-slate-500 truncate">Seat {guest.assignedSeat}</p>
                                                </div>
                                                <button
                                                    onClick={() => onUnassignGuest(guest.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-red-400 rounded transition-opacity"
                                                >
                                                    <UserMinus className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {assigned.length === 0 && (
                                <p className="text-xs text-slate-600 italic text-center py-2">No guests assigned yet</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
