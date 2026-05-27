import React, { useEffect, useMemo, useRef } from 'react';
import { useFBX } from '@react-three/drei';
import { useLoader, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
// three r0.160 ships SkeletonUtils as individual named exports (no namespace
// object). Bring them in as a namespace import so SkeletonUtils.clone(...)
// keeps working the way the original code expected.
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// Kenney FBX rigs are authored in centimetres. The hex grid is metres-ish,
// so we scale the whole worker down. Tuned so the head sits roughly at a
// pylon's first brace level.
const WORKER_SCALE = 0.0045;

// Y-offset (in FBX-local cm) where the safety helmet sits — measured against
// the imported pivot. Worker is ~180 cm tall, head crown ~170 cm.
const HELMET_Y = 178;

function applyTexture(root, tex) {
  root.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.material = child.material.clone();
      child.material.map = tex;
      child.material.needsUpdate = true;
      child.castShadow = true;
    }
  });
}

// Single worker. `position` is in world units (metres). `lookAt` is an
// optional world-space target the worker should face. `mode` switches the
// idle ↔ run animation crossfade.
export default function RepairWorker({ position, lookAt, mode = 'idle' }) {
  const rawFbx = useFBX('/characters/characterMedium.fbx');
  const idleFbx = useFBX('/characters/idle.fbx');
  const runFbx = useFBX('/characters/run.fbx');
  const tex = useLoader(THREE.TextureLoader, '/characters/skaterMaleA.png');

  // Clone the rig per worker so multiple instances don't share a skeleton.
  // SkeletonUtils.clone is the supported way; plain .clone() would leave the
  // skinned meshes pointing at the original bones.
  const model = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false; // Kenney FBX UV convention
    const c = SkeletonUtils.clone(rawFbx);
    applyTexture(c, tex);
    return c;
  }, [rawFbx, tex]);

  // One mixer per worker instance.
  const mixerRef = useRef();
  const actionsRef = useRef({ idle: null, run: null });

  useEffect(() => {
    const mixer = new THREE.AnimationMixer(model);
    mixerRef.current = mixer;
    const idleClip = idleFbx.animations[0];
    const runClip = runFbx.animations[0];
    if (idleClip) {
      const a = mixer.clipAction(idleClip);
      a.play();
      actionsRef.current.idle = a;
    }
    if (runClip) {
      const a = mixer.clipAction(runClip);
      a.play();
      a.weight = 0;
      actionsRef.current.run = a;
    }
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    };
  }, [model, idleFbx, runFbx]);

  // Crossfade between idle and run based on `mode`. We keep both actions
  // playing and just blend their weights — cheaper and more responsive than
  // stop/start.
  useEffect(() => {
    const idle = actionsRef.current.idle;
    const run = actionsRef.current.run;
    if (!idle || !run) return;
    const wantRun = mode === 'walking' || mode === 'returning';
    const targetIdle = wantRun ? 0 : 1;
    const targetRun = wantRun ? 1 : 0;
    // simple snap; useFrame interpolates below for a soft transition
    idle.userData = { ...(idle.userData || {}), target: targetIdle };
    run.userData = { ...(run.userData || {}), target: targetRun };
  }, [mode]);

  useFrame((_, dt) => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    mixer.update(dt);
    const idle = actionsRef.current.idle;
    const run = actionsRef.current.run;
    if (idle && idle.userData?.target != null) {
      idle.weight += (idle.userData.target - idle.weight) * Math.min(1, dt * 6);
    }
    if (run && run.userData?.target != null) {
      run.weight += (run.userData.target - run.weight) * Math.min(1, dt * 6);
    }
  });

  // Heading toward look-target on the xz plane. atan2(dx, dz) is the Three.js
  // convention for rotation around Y (because the model faces -Z by default
  // after the FBX import, we add π to flip it forward).
  const rotY = useMemo(() => {
    if (!lookAt) return 0;
    const dx = lookAt[0] - position[0];
    const dz = lookAt[2] - position[2];
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return 0;
    return Math.atan2(dx, dz) + Math.PI;
  }, [lookAt, position]);

  return (
    <group position={position} rotation={[0, rotY, 0]} scale={WORKER_SCALE}>
      <primitive object={model} />
      {/* yellow safety helmet — boxy, Lego-ish */}
      <group position={[0, HELMET_Y, 0]}>
        <mesh>
          <boxGeometry args={[38, 18, 40]} />
          <meshStandardMaterial color="#ffd23f" roughness={0.4} metalness={0.1} />
        </mesh>
        {/* visor brim */}
        <mesh position={[0, -7, 14]}>
          <boxGeometry args={[44, 4, 10]} />
          <meshStandardMaterial color="#ffd23f" roughness={0.5} />
        </mesh>
        {/* tiny status lamp on the front */}
        <mesh position={[0, 4, 19]}>
          <sphereGeometry args={[3.5, 10, 10]} />
          <meshStandardMaterial
            color="#ff5252"
            emissive="#ff5252"
            emissiveIntensity={mode === 'working' ? 2.4 : 0.6}
          />
        </mesh>
      </group>
    </group>
  );
}

// Preload — avoids the first-spawn FBX parse stall when a fault is dispatched.
useFBX.preload('/characters/characterMedium.fbx');
useFBX.preload('/characters/idle.fbx');
useFBX.preload('/characters/run.fbx');
