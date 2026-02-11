import React, { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import TableObject from './TableObject';
import { SeatingTable, Attendee } from '../../types';

interface Scene3DProps {
    tables: SeatingTable[];
    selectedTableId: string | null;
    onSelectTable: (id: string) => void;
    perspective: 'birds-eye' | '3d';
    attendees: Attendee[];
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

export default function Scene3D({ tables, selectedTableId, onSelectTable, perspective, attendees }: Scene3DProps) {
    const getGuestsForTable = (tableId: string) => {
        return attendees.filter(a => a.assignedTableId === tableId);
    };

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
            frameloop="demand"
            onCreated={({ gl }) => {
                gl.setClearColor('#1a1a2e');
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

            {/* Tables */}
            {tables.map((table) => (
                <TableObject
                    key={table.id}
                    table={table}
                    isSelected={selectedTableId === table.id}
                    onClick={() => onSelectTable(table.id)}
                    guests={getGuestsForTable(table.id)}
                />
            ))}
        </Canvas>
    );
}
