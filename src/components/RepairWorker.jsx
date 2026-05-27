import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';

// ────────── Repair worker — procedural cartoon mesh ──────────
// Replaced the Kenney FBX rig (skaterMaleA skin had an orange "face" that
// playtesters found unsettling at game scale) with a tiny stylised
// construction worker built from primitives:
//
//   • yellow safety helmet with brim + status lamp
//   • neutral head (no facial features — avoids the uncanny-valley issue)
//   • orange safety vest with reflective horizontal stripes
//   • swinging arms + legs on walking, alternating arm raises on working
//
// Side effects: 0 asset downloads (no FBX, no texture, no SkeletonUtils),
// much cheaper GPU load on mobile, and the worker now reads as a high-vis
// utility crew member matching the rest of the toy-grid art direction.

const COLORS = {
  vest: '#ff7a28',
  vestDark: '#d85a18',
  pants: '#2a3d52',
  boots: '#2a1f14',
  skin: '#d4a87a',
  helmet: '#ffd23f',
  helmetBrim: '#e5b830',
  stripe: '#fff0c8',
};

export default function RepairWorker({ position, lookAt, mode = 'idle' }) {
  const armLRef = useRef();
  const armRRef = useRef();
  const legLRef = useRef();
  const legRRef = useRef();
  const bodyRef = useRef();

  // Per-frame limb animation. Walking/returning swings arms + legs in
  // opposition; working alternates arms in a tool-swing pattern; idle holds
  // pose. Cheap — 5 ref mutations per frame, no geometry recompute.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const walking = mode === 'walking' || mode === 'returning';
    if (walking) {
      const swing = Math.sin(t * 9) * 0.7;
      if (armLRef.current) armLRef.current.rotation.x = swing;
      if (armRRef.current) armRRef.current.rotation.x = -swing;
      if (legLRef.current) legLRef.current.rotation.x = -swing * 0.7;
      if (legRRef.current) legRRef.current.rotation.x = swing * 0.7;
      if (bodyRef.current) {
        bodyRef.current.position.y = 0.45 + Math.abs(Math.sin(t * 9)) * 0.025;
      }
    } else if (mode === 'working') {
      // Both arms raised, alternating in a hammering / wrenching motion
      const tool = Math.sin(t * 5) * 0.4;
      if (armLRef.current) armLRef.current.rotation.x = -1.2 + tool;
      if (armRRef.current) armRRef.current.rotation.x = -1.2 - tool;
      if (legLRef.current) legLRef.current.rotation.x = 0;
      if (legRRef.current) legRRef.current.rotation.x = 0;
      if (bodyRef.current) bodyRef.current.position.y = 0.45;
    } else {
      // idle — settle to neutral pose, slight breathing bob
      const breath = Math.sin(t * 1.8) * 0.015;
      if (armLRef.current) armLRef.current.rotation.x = 0;
      if (armRRef.current) armRRef.current.rotation.x = 0;
      if (legLRef.current) legLRef.current.rotation.x = 0;
      if (legRRef.current) legRRef.current.rotation.x = 0;
      if (bodyRef.current) bodyRef.current.position.y = 0.45 + breath;
    }
  });

  // Heading toward the look-target on the xz plane. The procedural model
  // is built facing +Z so we use atan2(dx, dz) directly (no π flip needed,
  // unlike the FBX rig which faced -Z).
  const rotY = useMemo(() => {
    if (!lookAt) return 0;
    const dx = lookAt[0] - position[0];
    const dz = lookAt[2] - position[2];
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return 0;
    return Math.atan2(dx, dz);
  }, [lookAt, position]);

  const lampColor = mode === 'working' ? '#ff5252' : '#ff9060';

  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {/* legs — pivot at hip so rotation.x swings the leg forward/back */}
      <group ref={legLRef} position={[-0.08, 0.22, 0]}>
        <mesh position={[0, -0.11, 0]}>
          <boxGeometry args={[0.11, 0.22, 0.11]} />
          <meshLambertMaterial color={COLORS.pants} />
        </mesh>
        {/* boot */}
        <mesh position={[0, -0.24, 0.02]}>
          <boxGeometry args={[0.13, 0.06, 0.17]} />
          <meshLambertMaterial color={COLORS.boots} />
        </mesh>
      </group>
      <group ref={legRRef} position={[0.08, 0.22, 0]}>
        <mesh position={[0, -0.11, 0]}>
          <boxGeometry args={[0.11, 0.22, 0.11]} />
          <meshLambertMaterial color={COLORS.pants} />
        </mesh>
        <mesh position={[0, -0.24, 0.02]}>
          <boxGeometry args={[0.13, 0.06, 0.17]} />
          <meshLambertMaterial color={COLORS.boots} />
        </mesh>
      </group>

      {/* torso (body) — pivots from below so the walking bob feels natural */}
      <group ref={bodyRef} position={[0, 0.45, 0]}>
        {/* safety vest */}
        <mesh>
          <boxGeometry args={[0.32, 0.34, 0.20]} />
          <meshLambertMaterial color={COLORS.vest} />
        </mesh>
        {/* darker side panels for shading without lights */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.34, 0.06, 0.21]} />
          <meshLambertMaterial color={COLORS.vestDark} />
        </mesh>
        {/* reflective horizontal stripes (front + back) */}
        <mesh position={[0, 0.05, 0.101]}>
          <boxGeometry args={[0.33, 0.04, 0.002]} />
          <meshBasicMaterial color={COLORS.stripe} />
        </mesh>
        <mesh position={[0, 0.05, -0.101]}>
          <boxGeometry args={[0.33, 0.04, 0.002]} />
          <meshBasicMaterial color={COLORS.stripe} />
        </mesh>
        <mesh position={[0, -0.10, 0.101]}>
          <boxGeometry args={[0.33, 0.03, 0.002]} />
          <meshBasicMaterial color={COLORS.stripe} />
        </mesh>
        <mesh position={[0, -0.10, -0.101]}>
          <boxGeometry args={[0.33, 0.03, 0.002]} />
          <meshBasicMaterial color={COLORS.stripe} />
        </mesh>
      </group>

      {/* arms — anchor at shoulder so rotation.x swings the whole arm */}
      <group ref={armLRef} position={[-0.205, 0.6, 0]}>
        <mesh position={[0, -0.13, 0]}>
          <boxGeometry args={[0.08, 0.26, 0.08]} />
          <meshLambertMaterial color={COLORS.vest} />
        </mesh>
        {/* glove */}
        <mesh position={[0, -0.28, 0]}>
          <sphereGeometry args={[0.055, 8, 6]} />
          <meshLambertMaterial color={COLORS.boots} />
        </mesh>
      </group>
      <group ref={armRRef} position={[0.205, 0.6, 0]}>
        <mesh position={[0, -0.13, 0]}>
          <boxGeometry args={[0.08, 0.26, 0.08]} />
          <meshLambertMaterial color={COLORS.vest} />
        </mesh>
        <mesh position={[0, -0.28, 0]}>
          <sphereGeometry args={[0.055, 8, 6]} />
          <meshLambertMaterial color={COLORS.boots} />
        </mesh>
      </group>

      {/* head — featureless cap of skin tone, mostly covered by the helmet.
          No eyes/mouth = no uncanny look. */}
      <mesh position={[0, 0.74, 0]}>
        <sphereGeometry args={[0.10, 12, 10]} />
        <meshLambertMaterial color={COLORS.skin} />
      </mesh>

      {/* helmet — yellow hard hat with a wide brim and a small status lamp.
          Built from a half-sphere + a thin brim disc to read as a 안전모. */}
      <group position={[0, 0.78, 0]}>
        <mesh>
          <sphereGeometry
            args={[0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]}
          />
          <meshLambertMaterial color={COLORS.helmet} />
        </mesh>
        {/* brim — slightly larger cylinder slab around the head */}
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.155, 0.155, 0.025, 14]} />
          <meshLambertMaterial color={COLORS.helmetBrim} />
        </mesh>
        {/* status lamp on the front of the helmet — red while working,
            warm orange while walking/idle */}
        <mesh position={[0, 0.06, 0.11]}>
          <sphereGeometry args={[0.025, 8, 6]} />
          <meshBasicMaterial color={lampColor} />
        </mesh>
      </group>
    </group>
  );
}
