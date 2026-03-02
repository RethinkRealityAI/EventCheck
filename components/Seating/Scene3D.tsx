import React, { useEffect, useRef, useCallback } from 'react';
import { Canvas, useThree, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, TransformControls, Html } from '@react-three/drei';
import TableObject from './TableObject';
import SceneObject from './SceneObject';
import { SeatingTable, Attendee, SceneElement } from '../../types';
import * as THREE from 'three';

interface Scene3DProps {
    tables: SeatingTable[];
    selectedTableId: string | null;
    onSelectTable: (id: string) => void;
    perspective: 'birds-eye' | '3d';
    attendees: Attendee[];
    // Scene elements
    sceneElements: SceneElement[];
    selectedElementId: string | null;
    onSelectElement: (id: string | null) => void;
    onUpdateElement: (id: string, updates: Partial<SceneElement>) => void;
    // Table dragging
    onTableDrag: (id: string, x: number, z: number) => void;
    // Custom model URLs (customModelId -> publicUrl)
    customModelUrls: Record<string, string>;
    // Transform mode for scene elements
    transformMode?: 'translate' | 'rotate' | 'scale';
}

function CameraController({ perspective }: { perspective: 'birds-eye' | '3d' }) {
    const { camera } = useThree();

    useEffect(() => {
        if (perspective === 'birds-eye') {
            camera.position.set(0, 45, 0.1);
        } else {
            camera.position.set(20, 18, 20);
        }
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
    }, [perspective, camera]);

    return (
        <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={perspective === '3d'}
            maxPolarAngle={perspective === 'birds-eye' ? 0.1 : Math.PI / 2.2}
            minPolarAngle={perspective === 'birds-eye' ? 0 : 0.2}
            maxDistance={80}
            minDistance={5}
        />
    );
}

// Simple grid drawn with basic lines — no drei Grid component
function SimpleGrid() {
    const size = 50;
    const divisions = 20;
    const step = size / divisions;
    const half = size / 2;
    const lines: React.JSX.Element[] = [];

    for (let i = 0; i <= divisions; i++) {
        const pos = -half + i * step;
        const opacity = i % 5 === 0 ? 0.3 : 0.1;
        lines.push(
            <line key={`x${i}`}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        array={new Float32Array([pos, 0.01, -half, pos, 0.01, half])}
                        count={2}
                        itemSize={3}
                    />
                </bufferGeometry>
                <lineBasicMaterial color="#4338ca" transparent opacity={opacity} />
            </line>,
            <line key={`z${i}`}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        array={new Float32Array([-half, 0.01, pos, half, 0.01, pos])}
                        count={2}
                        itemSize={3}
                    />
                </bufferGeometry>
                <lineBasicMaterial color="#4338ca" transparent opacity={opacity} />
            </line>
        );
    }
    return <group>{lines}</group>;
}

// ── Draggable Table wrapper ──
// Enables pointer-drag on the ground plane for tables (position-only, no rotation/scale)
function DraggableTable({
    table,
    isSelected,
    onClick,
    guests,
    onDrag,
}: {
    table: SeatingTable;
    isSelected: boolean;
    onClick: () => void;
    guests: Attendee[];
    onDrag: (x: number, z: number) => void;
}) {
    const groupRef = useRef<THREE.Group>(null!);
    const isDragging = useRef(false);
    const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    const intersectPoint = useRef(new THREE.Vector3());
    const offset = useRef(new THREE.Vector3());

    const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
        if (e.button !== 0) return; // left click only
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        isDragging.current = true;

        // Calculate offset between pointer hit and group position
        const ray = e.ray || new THREE.Ray();
        ray.intersectPlane(dragPlane.current, intersectPoint.current);
        offset.current.set(
            table.x - intersectPoint.current.x,
            0,
            table.z - intersectPoint.current.z
        );

        onClick(); // Select on drag start
    }, [table.x, table.z, onClick]);

    const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
        if (!isDragging.current) return;
        e.stopPropagation();

        const ray = e.ray || new THREE.Ray();
        ray.intersectPlane(dragPlane.current, intersectPoint.current);

        const newX = intersectPoint.current.x + offset.current.x;
        const newZ = intersectPoint.current.z + offset.current.z;

        // Snap to 0.5 grid for smooth feel
        const snappedX = Math.round(newX * 2) / 2;
        const snappedZ = Math.round(newZ * 2) / 2;

        onDrag(snappedX, snappedZ);
    }, [onDrag]);

    const handlePointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
        isDragging.current = false;
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    }, []);

    return (
        <group
            ref={groupRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            <TableObject
                table={table}
                isSelected={isSelected}
                onClick={onClick}
                guests={guests}
            />
        </group>
    );
}

// ── TransformControls wrapper for scene elements ──
function TransformableElement({
    element,
    isSelected,
    onClick,
    onUpdate,
    orbitRef,
    customModelUrl,
    mode,
}: {
    element: SceneElement;
    isSelected: boolean;
    onClick: () => void;
    onUpdate: (updates: Partial<SceneElement>) => void;
    orbitRef: React.RefObject<any>;
    customModelUrl?: string;
    mode?: 'translate' | 'rotate' | 'scale';
}) {
    const transformRef = useRef<any>(null);
    const groupRef = useRef<THREE.Group>(null!);

    // Sync group position/rotation/scale from element data
    useEffect(() => {
        if (groupRef.current) {
            groupRef.current.position.set(element.x, element.y, element.z);
            groupRef.current.rotation.set(0, element.rotationY, 0);
            groupRef.current.scale.set(element.scaleX, element.scaleY, element.scaleZ);
        }
    }, [element.x, element.y, element.z, element.rotationY, element.scaleX, element.scaleY, element.scaleZ]);

    // Disable OrbitControls while transforming
    useEffect(() => {
        if (!isSelected || !transformRef.current) return;
        const controls = transformRef.current;

        const onDraggingChanged = (event: { value: boolean }) => {
            if (orbitRef.current) {
                orbitRef.current.enabled = !event.value;
            }
        };

        controls.addEventListener('dragging-changed', onDraggingChanged);
        return () => controls.removeEventListener('dragging-changed', onDraggingChanged);
    }, [isSelected, orbitRef]);

    // Propagate transform changes on mouseUp
    useEffect(() => {
        if (!isSelected || !transformRef.current) return;
        const controls = transformRef.current;

        const onMouseUp = () => {
            if (!groupRef.current) return;
            const pos = groupRef.current.position;
            const rot = groupRef.current.rotation;
            const scl = groupRef.current.scale;
            onUpdate({
                x: Math.round(pos.x * 100) / 100,
                y: Math.round(pos.y * 100) / 100,
                z: Math.round(pos.z * 100) / 100,
                rotationY: Math.round(rot.y * 100) / 100,
                scaleX: Math.round(scl.x * 100) / 100,
                scaleY: Math.round(scl.y * 100) / 100,
                scaleZ: Math.round(scl.z * 100) / 100,
            });
        };

        controls.addEventListener('mouseUp', onMouseUp);
        return () => controls.removeEventListener('mouseUp', onMouseUp);
    }, [isSelected, onUpdate]);

    return (
        <>
            <group ref={groupRef}>
                <SceneObject element={element} isSelected={isSelected} onClick={onClick} customModelUrl={customModelUrl} />
            </group>
            {isSelected && (
                <TransformControls
                    ref={transformRef}
                    object={groupRef.current || undefined}
                    mode={mode || "translate"}
                    size={0.6}
                />
            )}
        </>
    );
}

export default function Scene3D({
    tables,
    selectedTableId,
    onSelectTable,
    perspective,
    attendees,
    sceneElements,
    selectedElementId,
    onSelectElement,
    onUpdateElement,
    onTableDrag,
    customModelUrls,
    transformMode = 'translate',
}: Scene3DProps) {
    const orbitRef = useRef<any>(null);

    const getGuestsForTable = (tableId: string) => {
        return attendees.filter(a => a.assignedTableId === tableId);
    };

    const handleCanvasClick = useCallback((e: any) => {
        // Deselect if clicking on empty space
        // (individual elements stopPropagation, so this only fires on miss)
    }, []);

    return (
        <Canvas
            camera={{ position: [20, 18, 20], fov: 50, near: 0.1, far: 200 }}
            style={{ background: '#1a1a2e' }}
            gl={{
                antialias: true,
                powerPreference: 'default',
                failIfMajorPerformanceCaveat: false,
            }}
            dpr={[1, 1.5]}
            frameloop="always"
            onCreated={({ gl }) => {
                gl.setClearColor('#1a1a2e');
            }}
            onPointerMissed={() => {
                onSelectElement(null);
            }}
        >
            <ambientLight intensity={0.5} />
            <directionalLight position={[15, 25, 15]} intensity={1} />
            <pointLight position={[-10, 15, -10]} intensity={0.3} color="#818cf8" />

            <CameraController perspective={perspective} />

            {/* Floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
                <planeGeometry args={[80, 80]} />
                <meshStandardMaterial color="#1e1b4b" roughness={0.8} />
            </mesh>

            <SimpleGrid />

            {/* Tables (draggable, position-only) */}
            {tables.map((table) => (
                <DraggableTable
                    key={table.id}
                    table={table}
                    isSelected={selectedTableId === table.id}
                    onClick={() => {
                        onSelectTable(table.id);
                        onSelectElement(null);
                    }}
                    guests={getGuestsForTable(table.id)}
                    onDrag={(x, z) => onTableDrag(table.id, x, z)}
                />
            ))}

            {/* Scene Elements (transformable — translate/rotate/scale) */}
            {sceneElements.map((element) => (
                <TransformableElement
                    key={element.id}
                    element={element}
                    isSelected={selectedElementId === element.id}
                    onClick={() => {
                        onSelectElement(element.id);
                    }}
                    onUpdate={(updates) => onUpdateElement(element.id, updates)}
                    orbitRef={orbitRef}
                    customModelUrl={element.customModelId ? customModelUrls[element.customModelId] : undefined}
                    mode={transformMode}
                />
            ))}
        </Canvas>
    );
}
