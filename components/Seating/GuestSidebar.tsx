import React, { useState, useMemo } from 'react';
import { Search, UserPlus, Users, X, ChevronDown, ChevronUp, Shuffle, UserMinus, Table as TableIcon, PanelRightClose, CheckCheck } from 'lucide-react';
import { Attendee, SeatingTable } from '../../types';
import { CATEGORY_META, resolveAttendeeCategory } from '../../utils/attendeeCategories';

interface PartyGroup {
    primaryId: string;
    primaryName: string;
    primaryIsUnassigned: boolean;
    members: Attendee[]; // unassigned members only
}

interface GuestSidebarProps {
    attendees: Attendee[];
    tables: SeatingTable[];
    selectedTableId: string | null;
    onAssignGuests: (guestIds: string[], tableId: string) => void;
    onUnassignGuest: (guestId: string) => void;
    onAutoAssign: () => void;
    onCollapse?: () => void;
}

export default function GuestSidebar({
    attendees,
    tables,
    selectedTableId,
    onAssignGuests,
    onUnassignGuest,
    onAutoAssign,
    onCollapse
}: GuestSidebarProps) {
    const [search, setSearch] = useState('');
    const [selectedGuests, setSelectedGuests] = useState<Set<string>>(new Set());
    const [showAssigned, setShowAssigned] = useState(true);
    const [showUnattached, setShowUnattached] = useState(true);

    // All unassigned attendees, unsearched — used for counts and selectAll
    const allUnassigned = useMemo(() =>
        attendees.filter(a => !a.assignedTableId),
        [attendees]
    );

    const assigned = useMemo(() =>
        attendees.filter(a => a.assignedTableId),
        [attendees]
    );

    // Build party groups from unassigned attendees
    const { partyGroups, solos } = useMemo(() => {
        // IDs of primaries that at least one unassigned guest points to
        const primaryIds = new Set(
            allUnassigned.filter(a => a.primaryAttendeeId).map(a => a.primaryAttendeeId!)
        );

        const groups: PartyGroup[] = [];
        const groupedIds = new Set<string>();

        for (const primaryId of primaryIds) {
            const unassignedGuests = allUnassigned.filter(a => a.primaryAttendeeId === primaryId);
            if (unassignedGuests.length === 0) continue;

            const primaryAttendee = allUnassigned.find(a => a.id === primaryId);
            const primaryName = attendees.find(a => a.id === primaryId)?.name ?? 'Unknown Party';

            const members: Attendee[] = [];
            if (primaryAttendee) {
                members.push(primaryAttendee);
                groupedIds.add(primaryAttendee.id);
            }
            members.push(...unassignedGuests);
            unassignedGuests.forEach(g => groupedIds.add(g.id));

            groups.push({
                primaryId,
                primaryName,
                primaryIsUnassigned: !!primaryAttendee,
                members,
            });
        }

        groups.sort((a, b) => b.members.length - a.members.length);

        const soloList = allUnassigned.filter(a => !groupedIds.has(a.id));
        return { partyGroups: groups, solos: soloList };
    }, [allUnassigned, attendees]);

    // Search-filtered views
    const q = search.toLowerCase();
    const filteredPartyGroups = useMemo(() => {
        if (!q) return partyGroups;
        return partyGroups
            .map(g => ({ ...g, members: g.members.filter(m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) }))
            .filter(g => g.members.length > 0 || g.primaryName.toLowerCase().includes(q));
    }, [partyGroups, q]);

    const filteredSolos = useMemo(() =>
        solos.filter(a => !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)),
        [solos, q]
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
        if (selectedGuests.size === allUnassigned.length) {
            setSelectedGuests(new Set());
        } else {
            setSelectedGuests(new Set(allUnassigned.map(a => a.id)));
        }
    };

    const toggleParty = (group: PartyGroup) => {
        const allSelected = group.members.every(m => selectedGuests.has(m.id));
        setSelectedGuests(prev => {
            const next = new Set(prev);
            if (allSelected) {
                group.members.forEach(m => next.delete(m.id));
            } else {
                group.members.forEach(m => next.add(m.id));
            }
            return next;
        });
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
            <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center justify-between flex-shrink-0">
                <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-indigo-400" />
                        Guests
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                        {allUnassigned.length} unassigned · {assigned.length} assigned
                    </p>
                </div>
                {onCollapse && (
                    <button
                        onClick={onCollapse}
                        className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                        title="Collapse panel"
                    >
                        <PanelRightClose className="w-4 h-4" />
                    </button>
                )}
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
                    {selectedGuests.size === allUnassigned.length && allUnassigned.length > 0 ? 'Deselect' : 'Select All'}
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
                {/* Unassigned section — grouped by party */}
                <div className="p-4 space-y-4">
                    {allUnassigned.length === 0 && (
                        <p className="text-xs text-slate-600 italic">No unassigned guests</p>
                    )}

                    {/* Party groups */}
                    {filteredPartyGroups.map(group => {
                        const allSelected = group.members.length > 0 && group.members.every(m => selectedGuests.has(m.id));
                        const someSelected = group.members.some(m => selectedGuests.has(m.id));
                        return (
                            <div key={group.primaryId} className="rounded-xl overflow-hidden border border-indigo-700/30">
                                {/* Group header */}
                                <div className="flex items-center justify-between px-3 py-2 bg-indigo-900/40">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Users className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                                        <span className="text-xs font-bold text-indigo-200 truncate">
                                            {group.primaryIsUnassigned
                                                ? `${group.primaryName} Party`
                                                : `${group.primaryName}'s guests`}
                                        </span>
                                        <span className="text-[10px] text-indigo-400 flex-shrink-0">
                                            · {group.members.length} remaining
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => toggleParty(group)}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors flex-shrink-0 ml-2 ${
                                            allSelected
                                                ? 'bg-indigo-600/40 text-indigo-200 hover:bg-indigo-600/60'
                                                : 'bg-indigo-800/60 text-indigo-300 hover:bg-indigo-700/60'
                                        }`}
                                        title={allSelected ? 'Deselect whole party' : 'Select whole party'}
                                    >
                                        <CheckCheck className="w-3 h-3" />
                                        {allSelected ? 'Deselect' : someSelected ? 'Select rest' : 'Select Party'}
                                    </button>
                                </div>

                                {/* Member rows */}
                                <div className="bg-slate-800/30 divide-y divide-slate-700/20">
                                    {group.members.map(guest => (
                                        <div
                                            key={guest.id}
                                            className={`flex items-center gap-2 pl-6 pr-2.5 py-2 cursor-pointer transition-all ${
                                                selectedGuests.has(guest.id)
                                                    ? 'bg-indigo-600/20'
                                                    : 'hover:bg-slate-800/60'
                                            }`}
                                            onClick={() => toggleGuest(guest.id)}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedGuests.has(guest.id)}
                                                readOnly
                                                className="w-4 h-4 rounded accent-indigo-600 flex-shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-sm font-medium text-white truncate">{guest.name}</p>
                                                    {guest.guestType === 'child' && (
                                                        <span className="text-[9px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded-full font-bold uppercase">Child</span>
                                                    )}
                                                    {(() => {
                                                        const cat = resolveAttendeeCategory(guest);
                                                        if (!cat) return null;
                                                        const m = CATEGORY_META[cat];
                                                        return (
                                                            <span
                                                                className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase border ${m.pillBgDark} ${m.pillTextDark} ${m.pillBorderDark} flex-shrink-0`}
                                                                title={m.label}
                                                            >
                                                                <span aria-hidden>{m.icon}</span>
                                                                {m.shortLabel}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs text-slate-400 truncate">{guest.email}</p>
                                                    {guest.dietaryPreferences && (
                                                        <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full" title={guest.dietaryPreferences}>🍽</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                                                    !guest.primaryAttendeeId
                                                        ? 'bg-indigo-500/20 text-indigo-300'
                                                        : 'bg-slate-600/50 text-slate-400'
                                                }`}>
                                                    {!guest.primaryAttendeeId ? 'Primary' : 'Guest'}
                                                </span>
                                                {selectedTableId && spotsLeft > 0 && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onAssignGuests([guest.id], selectedTableId!); }}
                                                        className="p-1 hover:bg-indigo-600/30 rounded transition-colors"
                                                        title="Assign to selected table"
                                                    >
                                                        <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {/* Unattached (solos) */}
                    {(filteredSolos.length > 0 || (partyGroups.length === 0 && solos.length > 0)) && (
                        <div>
                            <button
                                onClick={() => setShowUnattached(v => !v)}
                                className="w-full flex items-center justify-between mb-2 group"
                            >
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Unattached ({filteredSolos.length})
                                </p>
                                {showUnattached
                                    ? <ChevronUp className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                                    : <ChevronDown className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                                }
                            </button>
                            {showUnattached && (
                                <div className="space-y-1">
                                    {filteredSolos.length === 0 ? (
                                        <p className="text-xs text-slate-600 italic">No unattached guests found</p>
                                    ) : (
                                        filteredSolos.map(guest => (
                                            <div
                                                key={guest.id}
                                                className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-all ${
                                                    selectedGuests.has(guest.id)
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
                                                        {(() => {
                                                            const cat = resolveAttendeeCategory(guest);
                                                            if (!cat) return null;
                                                            const m = CATEGORY_META[cat];
                                                            return (
                                                                <span
                                                                    className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase border ${m.pillBgDark} ${m.pillTextDark} ${m.pillBorderDark} flex-shrink-0`}
                                                                    title={m.label}
                                                                >
                                                                    <span aria-hidden>{m.icon}</span>
                                                                    {m.shortLabel}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-xs text-slate-400 truncate">{guest.email}</p>
                                                        {guest.dietaryPreferences && (
                                                            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full" title={guest.dietaryPreferences}>🍽</span>
                                                        )}
                                                    </div>
                                                    {guest.ticketType && (
                                                        <p className="text-[10px] text-slate-500 truncate mt-0.5">{guest.ticketType}</p>
                                                    )}
                                                </div>
                                                {selectedTableId && spotsLeft > 0 && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onAssignGuests([guest.id], selectedTableId!); }}
                                                        className="p-1 hover:bg-indigo-600/30 rounded transition-colors"
                                                    >
                                                        <UserPlus className="w-4 h-4 text-indigo-400" />
                                                    </button>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}
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
        </div>
    );
}
