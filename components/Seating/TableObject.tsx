import React, { useState, useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { SeatingTable, Attendee } from '../../types';

// ── Shared geometries (created ONCE at module level) ──
const CHAIR_SEAT_GEO = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 8);
const CHAIR_BACK_GEO = new THREE.BoxGeometry(0.3, 0.35, 0.04);
const TABLE_ROUND_GEO = new THREE.CylinderGeometry(1.1, 1.1, 0.08, 16);
const TABLE_RECT_GEO = new THREE.BoxGeometry(2.2, 0.08, 1.2);
const TABLE_LEG_GEO = new THREE.CylinderGeometry(0.12, 0.2, 0.54, 6);
const RING_GEO = new THREE.RingGeometry(1.8, 2.1, 16);
const PERSON_BODY_GEO = new THREE.CylinderGeometry(0.12, 0.15, 0.45, 8);
const PERSON_HEAD_GEO = new THREE.SphereGeometry(0.1, 8, 8);

// ── Shared materials ──
const CHAIR_MAT = new THREE.MeshStandardMaterial({ color: '#a78bfa', roughness: 0.3, metalness: 0.4 });
const TABLE_LEG_MAT = new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.4, metalness: 0.6 });
const PERSON_MAT = new THREE.MeshStandardMaterial({ color: '#e0e7ff', roughness: 0.5 });

interface TableObjectProps {
    table: SeatingTable;
    isSelected: boolean;
    onClick: () => void;
    guests: Attendee[];
}

const Chair = React.memo(function Chair({ position, rotation, isOccupied }: { position: [number, number, number]; rotation: [number, number, number]; isOccupied: boolean }) {
    return (
        <group position={position} rotation={rotation}>
            <mesh geometry={CHAIR_SEAT_GEO} material={CHAIR_MAT} position={[0, 0.35, 0]} />
            <mesh geometry={CHAIR_BACK_GEO} material={CHAIR_MAT} position={[0, 0.55, -0.16]} />

            {isOccupied && (
                <group position={[0, 0.5, 0]}>
                    <mesh geometry={PERSON_BODY_GEO} material={PERSON_MAT} position={[0, 0.22, 0]} />
                    <mesh geometry={PERSON_HEAD_GEO} material={PERSON_MAT} position={[0, 0.55, 0]} />
                </group>
            )}
        </group>
    );
});

function TableObject({ table, isSelected, onClick, guests }: TableObjectProps) {
    const [hovered, setHovered] = useState(false);
    const occupancy = guests.length / table.capacity;

    const tableColor = useMemo(() => {
        if (table.vip) return '#818cf8';
        if (occupancy >= 1) return '#22c55e';
        if (occupancy > 0) return '#f59e0b';
        return '#6b7280';
    }, [occupancy, table.vip]);

    const tableMaterial = useMemo(() => new THREE.MeshStandardMaterial({
        color: tableColor,
        roughness: 0.2,
        metalness: 0.5,
        emissive: isSelected ? '#10b981' : '#000000', // Subtle green emissive when selected
        emissiveIntensity: isSelected ? 0.3 : 0,
    }), [tableColor, isSelected]);

    const showGlow = isSelected || hovered;
    // User requested green for selected tables
    const glowColor = isSelected ? '#22c55e' : '#818cf8';

    // Chair positions around table
    const chairPositions = useMemo(() => {
        const positions: { pos: [number, number, number]; rot: [number, number, number]; seatId: number }[] = [];
        const radius = table.shape === 'round' ? 1.5 : 1.6;
        for (let i = 0; i < table.capacity; i++) {
            const angle = (i / table.capacity) * Math.PI * 2;
            positions.push({
                pos: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
                rot: [0, -angle + Math.PI, 0],
                seatId: i + 1
            });
        }
        return positions;
    }, [table.capacity, table.shape]);

    const statusColor = occupancy >= 1 ? '#22c55e' : occupancy > 0 ? '#f59e0b' : '#9ca3af';

    return (
        <group
            position={[table.x, hovered || isSelected ? 0.15 : 0, table.z]}
            rotation={[0, table.rotation, 0]}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
        >
            {/* Selection ring */}
            {showGlow && (
                <mesh geometry={RING_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                    <meshBasicMaterial color={glowColor} transparent opacity={0.6} />
                </mesh>
            )}

            {/* Table surface */}
            <mesh
                geometry={table.shape === 'round' ? TABLE_ROUND_GEO : TABLE_RECT_GEO}
                material={tableMaterial}
                position={[0, 0.55, 0]}
            />

            {/* Table leg */}
            <mesh geometry={TABLE_LEG_GEO} material={TABLE_LEG_MAT} position={[0, 0.27, 0]} />

            {/* Chairs */}
            {chairPositions.map((chair, i) => {
                const isOccupied = guests.some(g => g.assignedSeat === chair.seatId);
                return (
                    <Chair key={i} position={chair.pos} rotation={chair.rot} isOccupied={isOccupied} />
                );
            })}

            {/* HTML label — zero GPU cost */}
            <Html
                position={[0, 1.8, 0]}
                center
                style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
                <div style={{
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                }}>
                    <div style={{
                        color: isSelected ? '#34d399' : '#e0e7ff', // Green text if selected
                        fontSize: '13px',
                        fontWeight: 700,
                        textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                        lineHeight: 1.2,
                    }}>
                        {table.name}
                        {table.vip && ' 👑'}
                    </div>
                    <div style={{
                        color: statusColor,
                        fontSize: '11px',
                        fontWeight: 600,
                        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                    }}>
                        {guests.length}/{table.capacity}
                    </div>
                </div>
            </Html>
        </group>
    );
}

export default React.memo(TableObject);
