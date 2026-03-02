import React, { useState, useMemo, Suspense } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SceneElement, SceneElementType } from '../../types';

// ── Mesh builders per element type ──

function StageMesh({ color }: { color: string }) {
    return (
        <group>
            <mesh position={[0, 0.15, 0]}>
                <boxGeometry args={[4, 0.3, 2.5]} />
                <meshStandardMaterial color={color} roughness={0.3} metalness={0.4} />
            </mesh>
            <mesh position={[0, 0.31, 1.2]}>
                <boxGeometry args={[4.1, 0.04, 0.08]} />
                <meshStandardMaterial color="#fbbf24" roughness={0.2} metalness={0.6} />
            </mesh>
        </group>
    );
}

function BoothMesh({ color }: { color: string }) {
    const cushionColor = new THREE.Color(color).offsetHSL(0, 0, -0.15);
    return (
        <group>
            <mesh position={[0, 0.45, -0.5]}>
                <boxGeometry args={[1.8, 0.9, 0.12]} />
                <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
            </mesh>
            <mesh position={[-0.9, 0.35, 0]}>
                <boxGeometry args={[0.12, 0.7, 1.1]} />
                <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
            </mesh>
            <mesh position={[0.9, 0.35, 0]}>
                <boxGeometry args={[0.12, 0.7, 1.1]} />
                <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
            </mesh>
            <mesh position={[0, 0.12, 0]}>
                <boxGeometry args={[1.6, 0.15, 0.9]} />
                <meshStandardMaterial color={`#${cushionColor.getHexString()}`} roughness={0.6} />
            </mesh>
        </group>
    );
}

function RectTableMesh({ color }: { color: string }) {
    return (
        <group>
            <mesh position={[0, 0.55, 0]}>
                <boxGeometry args={[2, 0.06, 1]} />
                <meshStandardMaterial color={color} roughness={0.2} metalness={0.5} />
            </mesh>
            {[[-0.85, 0, -0.4], [0.85, 0, -0.4], [-0.85, 0, 0.4], [0.85, 0, 0.4]].map((pos, i) => (
                <mesh key={i} position={[pos[0], 0.27, pos[2]]}>
                    <cylinderGeometry args={[0.04, 0.05, 0.54, 6]} />
                    <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.6} />
                </mesh>
            ))}
        </group>
    );
}

function BarrierMesh({ color }: { color: string }) {
    return (
        <group>
            <mesh position={[-0.9, 0.4, 0]}>
                <cylinderGeometry args={[0.05, 0.06, 0.8, 8]} />
                <meshStandardMaterial color="#9ca3af" roughness={0.2} metalness={0.8} />
            </mesh>
            <mesh position={[0.9, 0.4, 0]}>
                <cylinderGeometry args={[0.05, 0.06, 0.8, 8]} />
                <meshStandardMaterial color="#9ca3af" roughness={0.2} metalness={0.8} />
            </mesh>
            <mesh position={[0, 0.55, 0]}>
                <boxGeometry args={[1.7, 0.06, 0.04]} />
                <meshStandardMaterial color={color} roughness={0.5} />
            </mesh>
            <mesh position={[-0.9, 0.02, 0]}>
                <cylinderGeometry args={[0.12, 0.12, 0.04, 12]} />
                <meshStandardMaterial color="#6b7280" roughness={0.3} metalness={0.7} />
            </mesh>
            <mesh position={[0.9, 0.02, 0]}>
                <cylinderGeometry args={[0.12, 0.12, 0.04, 12]} />
                <meshStandardMaterial color="#6b7280" roughness={0.3} metalness={0.7} />
            </mesh>
        </group>
    );
}

function PlantMesh({ color }: { color: string }) {
    return (
        <group>
            <mesh position={[0, 0.18, 0]}>
                <cylinderGeometry args={[0.2, 0.25, 0.35, 10]} />
                <meshStandardMaterial color="#78716c" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.6, 0]}>
                <sphereGeometry args={[0.4, 10, 10]} />
                <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.4, 0]}>
                <cylinderGeometry args={[0.04, 0.05, 0.3, 6]} />
                <meshStandardMaterial color="#92400e" roughness={0.6} />
            </mesh>
        </group>
    );
}

function ColumnMesh({ color }: { color: string }) {
    return (
        <group>
            <mesh position={[0, 0.7, 0]}>
                <cylinderGeometry args={[0.18, 0.22, 1.4, 12]} />
                <meshStandardMaterial color={color} roughness={0.2} metalness={0.6} />
            </mesh>
            <mesh position={[0, 1.42, 0]}>
                <cylinderGeometry args={[0.28, 0.22, 0.08, 12]} />
                <meshStandardMaterial color={color} roughness={0.2} metalness={0.6} />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
                <cylinderGeometry args={[0.22, 0.28, 0.06, 12]} />
                <meshStandardMaterial color={color} roughness={0.2} metalness={0.6} />
            </mesh>
        </group>
    );
}

function DanceFloorMesh({ color }: { color: string }) {
    return (
        <group>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
                <planeGeometry args={[4, 4]} />
                <meshStandardMaterial
                    color={color}
                    roughness={0.1}
                    metalness={0.8}
                    emissive={color}
                    emissiveIntensity={0.15}
                />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                <ringGeometry args={[2.8, 2.85, 4]} />
                <meshStandardMaterial color="#fbbf24" roughness={0.2} metalness={0.6} />
            </mesh>
        </group>
    );
}

function BarMesh({ color }: { color: string }) {
    return (
        <group>
            <mesh position={[0, 0.5, 0]}>
                <boxGeometry args={[3, 1, 0.5]} />
                <meshStandardMaterial color={color} roughness={0.3} metalness={0.4} />
            </mesh>
            <mesh position={[1.5, 0.5, -0.5]}>
                <boxGeometry args={[0.5, 1, 1.5]} />
                <meshStandardMaterial color={color} roughness={0.3} metalness={0.4} />
            </mesh>
            <mesh position={[0, 1.02, 0]}>
                <boxGeometry args={[3.1, 0.05, 0.6]} />
                <meshStandardMaterial color="#1e1b4b" roughness={0.1} metalness={0.7} />
            </mesh>
        </group>
    );
}

// ── Custom GLB Model Loader ──
function CustomModelMesh({ url }: { url: string; color: string }) {
    const { scene } = useGLTF(url);
    const clonedScene = useMemo(() => {
        return scene.clone(true);
    }, [scene]);

    return <primitive object={clonedScene} />;
}

// Fallback placeholder for custom models (shown while loading or if no URL)
function CustomFallbackMesh({ color }: { color: string }) {
    return (
        <group>
            <mesh position={[0, 0.5, 0]}>
                <boxGeometry args={[0.8, 1, 0.8]} />
                <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} wireframe />
            </mesh>
            <mesh position={[0, 0.5, 0]}>
                <boxGeometry args={[0.6, 0.8, 0.6]} />
                <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} transparent opacity={0.5} />
            </mesh>
        </group>
    );
}

// ── Element type → mesh component ──
const MESH_MAP: Record<string, React.FC<{ color: string }>> = {
    'stage': StageMesh,
    'booth': BoothMesh,
    'rect-table': RectTableMesh,
    'barrier': BarrierMesh,
    'plant': PlantMesh,
    'column': ColumnMesh,
    'dance-floor': DanceFloorMesh,
    'bar': BarMesh,
};

// ── Selection ring geometry (reused) ──
const ELEMENT_RING_GEO = new THREE.RingGeometry(1.6, 1.9, 16);

interface SceneObjectProps {
    element: SceneElement;
    isSelected: boolean;
    onClick: () => void;
    customModelUrl?: string; // Public URL for custom models
}

function SceneObject({ element, isSelected, onClick, customModelUrl }: SceneObjectProps) {
    const [hovered, setHovered] = useState(false);
    const showGlow = isSelected || hovered;
    const glowColor = isSelected ? '#22c55e' : '#818cf8';

    // Determine which mesh to render
    const renderMesh = () => {
        if (element.elementType === 'custom' && customModelUrl) {
            return (
                <Suspense fallback={<CustomFallbackMesh color={element.color} />}>
                    <CustomModelMesh url={customModelUrl} color={element.color} />
                </Suspense>
            );
        }
        if (element.elementType === 'custom') {
            return <CustomFallbackMesh color={element.color} />;
        }
        const MeshComponent = MESH_MAP[element.elementType] || StageMesh;
        return <MeshComponent color={element.color} />;
    };

    return (
        <group
            position={[element.x, element.y, element.z]}
            rotation={[0, element.rotationY, 0]}
            scale={[element.scaleX, element.scaleY, element.scaleZ]}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
        >
            {/* Selection ring */}
            {showGlow && (
                <mesh geometry={ELEMENT_RING_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                    <meshBasicMaterial color={glowColor} transparent opacity={0.5} />
                </mesh>
            )}

            {renderMesh()}

            {/* Label */}
            <Html
                position={[0, 2, 0]}
                center
                style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
                <div style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <div style={{
                        color: isSelected ? '#34d399' : '#e0e7ff',
                        fontSize: '12px',
                        fontWeight: 700,
                        textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                        lineHeight: 1.2,
                    }}>
                        {element.label}
                    </div>
                    <div style={{
                        color: element.color,
                        fontSize: '9px',
                        fontWeight: 600,
                        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                        textTransform: 'capitalize',
                    }}>
                        {element.elementType === 'custom' ? '3D Model' : element.elementType.replace('-', ' ')}
                    </div>
                </div>
            </Html>
        </group>
    );
}

export default React.memo(SceneObject);
