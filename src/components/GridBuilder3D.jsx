import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import {
  HEX_R, hexToWorld, hexKey, edgeKey, hexDistance,
  generateMap, TILE_TYPES, BUILDING_KEYS, TRADITIONAL_KEYS, SMART_GRID_KEYS, SPECIAL_KEYS, simulate,
  demandMultiplier, computeFrequency, gridHealthFromFreq, freqStatus,
  NOMINAL_FREQ, SAFE_BAND, FREQ_MAX_DEV,
  EXPANSION_MILESTONES, INITIAL_RADIUS, MAX_RADIUS, radiusForScore,
  EVENT_DEFS, nextEventId, pickRandomEvent,
  WIND_SUPPLY_MULT,
  TERRAIN_INFO, canBuildOn,
  landValueAt, buildCost, INITIAL_MONEY, INCOME_PER_MWH,
  nimbyMultiplier,
  edgeUpgradeCost, REDUNDANCY_REFUND, FREQ_SMOOTH_TAU,
  renewableFactor, curtailFactor, applyEssDynamics,
  dataCenterStatus,
  findSunshineVillages,
  SUNSHINE_INCOME_PER_PANEL_PER_SEC, SUNSHINE_ACHIEVEMENT_BONUS,
} from './gridLogic';
import RepairWorker from './RepairWorker';

// ───────────────── Shared materials ─────────────────
// Lambert is ~3x cheaper per fragment than meshStandardMaterial's PBR.
// One material instance per role means WebGL only swaps state when actually
// changing material, not on every mesh. Emissive bits use MeshBasicMaterial
// — they need no shading; pure color is the cheapest shader.
const MAT = {
  steel:     new THREE.MeshLambertMaterial({ color: '#4a5872' }),
  steelDk:   new THREE.MeshLambertMaterial({ color: '#3a4452' }),
  concrete:  new THREE.MeshLambertMaterial({ color: '#4d5868' }),
  cool:      new THREE.MeshLambertMaterial({ color: '#5a6678' }),
  wood:      new THREE.MeshLambertMaterial({ color: '#8b6a44' }),
  plaster:   new THREE.MeshLambertMaterial({ color: '#e6cba0' }),
  roof:      new THREE.MeshLambertMaterial({ color: '#b86464' }),
  factory:   new THREE.MeshLambertMaterial({ color: '#7a8290' }),
  factoryDk: new THREE.MeshLambertMaterial({ color: '#444c5a' }),
  soil:      new THREE.MeshLambertMaterial({ color: '#3a2d22' }),
};

// ───────────────── Hex grid (InstancedMesh — 1 draw call) ─────────────────
// Hex base lives entirely in one instanced mesh. To get the "warm bloom"
// feeling without ANY dynamic point lights, we tint hex instance colors
// whenever a powered consumer/source is nearby — the *ground itself* glows
// warm. CPU cost: O(hexes) once per building/event change. GPU cost: zero.
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const COLOR_NORMAL    = new THREE.Color('#212d46');
const COLOR_HAS_BLD   = new THREE.Color('#2e3d5a');
const COLOR_WARM      = new THREE.Color('#7a5236'); // very subtle warm tint — the bulk of the "lit" feeling comes from atmospheric ambient warming, not from the ground tile itself (player asked: ground-brightening is uncomfortable)
const COLOR_RIVER     = new THREE.Color('#244a72');
const COLOR_MOUNTAIN  = new THREE.Color('#2e4a2a'); // mossy forest-mountain base — Korean mountains read as 녹산, not bare rock
const COLOR_FOREST    = new THREE.Color('#2a3b3e'); // mossy floor
const COLOR_LV_HIGH   = new THREE.Color('#6a4a3a'); // affluent (warm earth)
const COLOR_LV_LOW    = new THREE.Color('#1b2740'); // cheap outskirts (cool)

function hexAxialDistance(q1, r1, q2, r2) {
  return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2;
}

// ────────── Mobile / thermal-aware rendering profile ──────────
// Phones throttle hard when the GPU + radio are both hot. Three big wins:
//   1) cap DPR to 1 on touch devices (Lambert fragment cost is per-pixel)
//   2) drop MSAA (the panels are already low-poly)
//   3) cap render rate to ~30 fps via R3F's frameloop="demand" + a metered
//      invalidate(). Game physics still ticks every frame in our own RAF
//      loop; we just stop ASKING three.js to re-rasterise every frame.
// Detected once at module load — a portrait→landscape rotation doesn't
// suddenly change device class.
const IS_MOBILE = typeof navigator !== 'undefined'
  && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

// Viewport-driven compact mode. Used by the HUD to shrink panels + the
// palette so they stop overlapping on small landscapes (and on CSS-rotated
// portrait phones, where the effective landscape footprint can be tiny).
// Tracks live so rotating the device or resizing a desktop window updates.
function useIsCompact() {
  const compute = () => {
    if (typeof window === 'undefined') return false;
    const w = window.innerWidth, h = window.innerHeight;
    return Math.max(w, h) < 1000 || Math.min(w, h) < 600;
  };
  const [compact, setCompact] = useState(compute);
  useEffect(() => {
    const onResize = () => setCompact(compute());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return compact;
}
// DPR balance: phones often have native DPR 2~3. Pinning to 1 was great
// for thermals but made the canvas read as ~1/4 resolution → blurry. 1.5
// cap regains visible sharpness on edges + emissive panels while still
// using ~44% fewer pixels than full native 2.0. Pair with antialias on
// the smaller framebuffer for crisp building silhouettes.
const MOBILE_DPR = [1, 1.5];
const DESKTOP_DPR = [1, 2];
const MOBILE_FRAME_INTERVAL_MS = 1000 / 30; // 30 fps target on phones
// React-side dynamics push throttle — mobile gets a slower HUD update so the
// CPU sleeps more between frames. Desktop stays at the original 150 ms.
const DYN_PUSH_INTERVAL_MS = IS_MOBILE ? 220 : 150;

// Maximum hex count we'll ever need — sized for MAX_RADIUS. Pre-allocating
// the InstancedMesh buffer at this capacity (instead of growing it as the
// map expands) avoids the bug where new tiles past the original capacity
// would not raycast: R3F won't always grow an existing InstancedMesh's
// per-instance buffer when `args` changes, so the new tiles would render
// at identity (origin) and clicks beyond the original count would fail.
const MAX_TILES = 3 * MAX_RADIUS * (MAX_RADIUS + 1) + 1;

function HexGrid({ tiles, buildings, buildingsKeys, powered, landValueByKey, onTileClick, onHover, onLeave }) {
  const ref = useRef();

  // (re)position when tile set changes — river hexes sink to look like water
  useEffect(() => {
    if (!ref.current) return;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const [x, , z] = hexToWorld(t.q, t.r);
      const y = t.terrain === 'river' ? -0.42 : -0.28;
      _dummy.position.set(x, y, z);
      _dummy.updateMatrix();
      ref.current.setMatrixAt(i, _dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.count = tiles.length;
  }, [tiles]);

  // (re)color when buildings/powered/landValue changes — bakes both the
  // warmth field (powered glow) and the land-value tint (subtle wealth
  // indicator on plain land only) into per-instance colors.
  useEffect(() => {
    if (!ref.current) return;
    // Warmth: range glow around powered consumers/sources. Defensive against
    // buildings/powered being passed as undefined (during initial mount).
    const warmth = new Map();
    if (buildings && powered) {
      for (const [bk, b] of buildings) {
        if (!powered[bk]) continue;
        const def = TILE_TYPES[b.type];
        const consumer = (def.demand || 0) > 0;
        const source = (def.supply || 0) > 0;
        if (!consumer && !source) continue;
        const radius = consumer ? 2 : 1;
        const peak = consumer ? 0.45 : 0.25;
        for (let dq = -radius; dq <= radius; dq++) {
          for (let dr = -radius; dr <= radius; dr++) {
            if (Math.abs(dq + dr) > radius) continue;
            const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
            const w = peak * (1 - dist / (radius + 1));
            const k = hexKey(b.q + dq, b.r + dr);
            if (w > (warmth.get(k) || 0)) warmth.set(k, w);
          }
        }
      }
    }

    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const k = hexKey(t.q, t.r);

      // Terrain bases take precedence — they don't get warmth/landValue tint.
      if (t.terrain === 'river') {
        ref.current.setColorAt(i, COLOR_RIVER);
        continue;
      }
      if (t.terrain === 'mountain') {
        ref.current.setColorAt(i, COLOR_MOUNTAIN);
        continue;
      }
      if (t.terrain === 'forest') {
        ref.current.setColorAt(i, COLOR_FOREST);
        continue;
      }

      // Plain land: blend base → landValue tint → warmth.
      const base = buildingsKeys && buildingsKeys.has(k) ? COLOR_HAS_BLD : COLOR_NORMAL;
      _color.copy(base);
      if (landValueByKey) {
        const lv = landValueByKey.get(k);
        if (lv != null) {
          // Map 30..90 → -1..+1 toward LV_LOW/LV_HIGH. Subtle: max 0.18 lerp.
          const norm = Math.max(-1, Math.min(1, (lv - 60) / 30));
          const target = norm >= 0 ? COLOR_LV_HIGH : COLOR_LV_LOW;
          _color.lerp(target, Math.abs(norm) * 0.18);
        }
      }
      const w = warmth.get(k) || 0;
      if (w > 0) _color.lerp(COLOR_WARM, w);
      ref.current.setColorAt(i, _color);
    }
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [tiles, buildings, buildingsKeys, powered, landValueByKey]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, MAX_TILES]}
      onClick={(e) => {
        e.stopPropagation();
        const i = e.instanceId;
        if (i == null || !tiles[i]) return;
        onTileClick(tiles[i].q, tiles[i].r);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        const i = e.instanceId;
        if (i == null || !tiles[i]) return;
        onHover(hexKey(tiles[i].q, tiles[i].r));
      }}
      onPointerOut={() => onLeave()}
    >
      <cylinderGeometry args={[HEX_R, HEX_R, 0.56, 6]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

function HoverRing({ hovered }) {
  if (!hovered) return null;
  const [qs, rs] = hovered.split(',');
  const [x, , z] = hexToWorld(parseInt(qs, 10), parseInt(rs, 10));
  return (
    <mesh position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[HEX_R * 0.85, HEX_R * 0.96, 6]} />
      <meshBasicMaterial color="#ffd86b" transparent opacity={0.85} />
    </mesh>
  );
}

// Real ground beneath the hex grid. Single flat disc — cheap, opaque, looks
// like soil. The hexes' own thick prism sides hide the seam where they sit.
function LandFloor({ mapRadius }) {
  const radius = (mapRadius + 2) * Math.sqrt(3) * HEX_R + 4;
  return (
    <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} material={MAT.soil}>
      <circleGeometry args={[radius, 24]} />
    </mesh>
  );
}

// ───────────────── Terrain layer (산 · 숲) ─────────────────
// Two pairs of InstancedMesh objects — stone+snow for mountains, trunk+leaf
// for trees. River tiles are rendered implicitly by HexGrid (lowered y + blue
// color). Terrain meshes have raycast disabled so clicks fall through to the
// hex below, where the buildability check lives.
const TERRAIN_MAT = {
  // Korean mountains are predominantly forested (녹산), not bare rock. The
  // "stone" cone is now a deeper-green wooded slope, and the "snow" cap is a
  // lighter green-yellow ridge — keeps the two-tone silhouette while losing
  // the alpine look.
  mountainStone: new THREE.MeshLambertMaterial({ color: '#3a6634' }),
  mountainSnow:  new THREE.MeshLambertMaterial({ color: '#6fa05a' }),
  treeFoliage:   new THREE.MeshLambertMaterial({ color: '#3d6a3a' }),
  treeTrunk:     new THREE.MeshLambertMaterial({ color: '#5c4530' }),
};

const TREES_PER_FOREST = 3;
const FOREST_OFFSETS = [
  [-0.34, -0.22],
  [ 0.30, -0.26],
  [ 0.02,  0.32],
];

function _terrainHash(q, r, k = 0) {
  let h = (q * 374761393 + r * 668265263 + k * 1442695040) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) | 0;
  return ((h >>> 0) % 100000) / 100000;
}

const _noRaycast = () => {};

function TerrainLayer({ tiles }) {
  const stoneRef = useRef();
  const snowRef = useRef();
  const trunkRef = useRef();
  const leafRef = useRef();

  const counts = useMemo(() => {
    let mountain = 0, forest = 0;
    for (const t of tiles) {
      if (t.terrain === 'mountain') mountain++;
      else if (t.terrain === 'forest') forest++;
    }
    return { mountain, tree: forest * TREES_PER_FOREST };
  }, [tiles]);

  useEffect(() => {
    if (!stoneRef.current || !snowRef.current) return;
    let i = 0;
    for (const t of tiles) {
      if (t.terrain !== 'mountain') continue;
      const [x, , z] = hexToWorld(t.q, t.r);
      const h = _terrainHash(t.q, t.r);
      const scale = 0.85 + h * 0.55;
      const rot = h * Math.PI * 2;
      _dummy.position.set(x, 0.55 * scale, z);
      _dummy.rotation.set(0, rot, 0);
      _dummy.scale.set(scale, scale, scale);
      _dummy.updateMatrix();
      stoneRef.current.setMatrixAt(i, _dummy.matrix);
      _dummy.position.set(x, 0.95 * scale, z);
      _dummy.scale.set(scale * 0.42, scale * 0.42, scale * 0.42);
      _dummy.updateMatrix();
      snowRef.current.setMatrixAt(i, _dummy.matrix);
      i++;
    }
    stoneRef.current.count = i;
    snowRef.current.count = i;
    stoneRef.current.instanceMatrix.needsUpdate = true;
    snowRef.current.instanceMatrix.needsUpdate = true;
  }, [tiles, counts.mountain]);

  useEffect(() => {
    if (!trunkRef.current || !leafRef.current) return;
    let i = 0;
    for (const t of tiles) {
      if (t.terrain !== 'forest') continue;
      const [x, , z] = hexToWorld(t.q, t.r);
      for (let k = 0; k < TREES_PER_FOREST; k++) {
        const h = _terrainHash(t.q, t.r, k + 1);
        const scale = 0.7 + h * 0.55;
        const [ox, oz] = FOREST_OFFSETS[k];
        const jitter = (_terrainHash(t.q + 1, t.r + 1, k) - 0.5) * 0.12;
        _dummy.position.set(x + ox + jitter, 0.15 * scale, z + oz + jitter);
        _dummy.rotation.set(0, h * Math.PI * 2, 0);
        _dummy.scale.set(scale, scale, scale);
        _dummy.updateMatrix();
        trunkRef.current.setMatrixAt(i, _dummy.matrix);
        _dummy.position.set(x + ox + jitter, 0.55 * scale, z + oz + jitter);
        _dummy.scale.set(scale, scale * 1.2, scale);
        _dummy.updateMatrix();
        leafRef.current.setMatrixAt(i, _dummy.matrix);
        i++;
      }
    }
    trunkRef.current.count = i;
    leafRef.current.count = i;
    trunkRef.current.instanceMatrix.needsUpdate = true;
    leafRef.current.instanceMatrix.needsUpdate = true;
  }, [tiles, counts.tree]);

  // Capacity is fixed at the absolute upper bound (every tile a mountain,
  // every tile a 3-tree forest) so the buffers never need to grow when the
  // map expands. The per-mesh `.count` controls what's actually rendered.
  const capMountain = MAX_TILES;
  const capTree = MAX_TILES * TREES_PER_FOREST;

  return (
    <>
      <instancedMesh
        ref={stoneRef}
        args={[undefined, TERRAIN_MAT.mountainStone, capMountain]}
        raycast={_noRaycast}
        frustumCulled={false}
      >
        <coneGeometry args={[0.62, 1.1, 5]} />
      </instancedMesh>
      <instancedMesh
        ref={snowRef}
        args={[undefined, TERRAIN_MAT.mountainSnow, capMountain]}
        raycast={_noRaycast}
        frustumCulled={false}
      >
        <coneGeometry args={[0.5, 0.45, 5]} />
      </instancedMesh>
      <instancedMesh
        ref={trunkRef}
        args={[undefined, TERRAIN_MAT.treeTrunk, capTree]}
        raycast={_noRaycast}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.05, 0.07, 0.3, 5]} />
      </instancedMesh>
      <instancedMesh
        ref={leafRef}
        args={[undefined, TERRAIN_MAT.treeFoliage, capTree]}
        raycast={_noRaycast}
        frustumCulled={false}
      >
        <coneGeometry args={[0.22, 0.55, 5]} />
      </instancedMesh>
    </>
  );
}

// ───────────────── Building meshes (simplified) ─────────────────
// Each role kept under ~6 sub-meshes. Solid surfaces share Lambert from MAT.
// Emissive parts (glowing caps/windows) use Basic with a power-modulated
// color — cheapest possible shader, no light eval at all.

function makeGlowColor(baseHex, emissAmount) {
  // Lerp from dim base toward bright base for the "powered" feel.
  // emissAmount roughly in [0, 2.5]; >1 saturates the channel.
  const c = new THREE.Color(baseHex);
  const a = Math.min(1, emissAmount);
  return c.multiplyScalar(0.3 + a * 0.7).getStyle();
}

function PowerPlantMesh({ powered, health, pulse = 1 }) {
  const emiss = powered ? (0.6 + health * 1.4) * pulse : 0;
  const capColor = makeGlowColor('#ffb84d', emiss);
  return (
    <group>
      {/* base block */}
      <mesh position={[0, 0.3, 0]} material={MAT.concrete}>
        <boxGeometry args={[1.2, 0.6, 0.85]} />
      </mesh>
      {/* two cooling towers — closed cylinders, no double-sided */}
      <mesh position={[-0.32, 0.95, 0.05]} material={MAT.cool}>
        <cylinderGeometry args={[0.26, 0.34, 0.7, 8]} />
      </mesh>
      <mesh position={[0.32, 0.95, 0.05]} material={MAT.cool}>
        <cylinderGeometry args={[0.26, 0.34, 0.7, 8]} />
      </mesh>
      {/* glowing tops — single combined ring per tower */}
      <mesh position={[-0.32, 1.32, 0.05]}>
        <cylinderGeometry args={[0.26, 0.26, 0.04, 8]} />
        <meshBasicMaterial color={capColor} />
      </mesh>
      <mesh position={[0.32, 1.32, 0.05]}>
        <cylinderGeometry args={[0.26, 0.26, 0.04, 8]} />
        <meshBasicMaterial color={capColor} />
      </mesh>
    </group>
  );
}

function SubstationMesh({ powered, health, pulse = 1 }) {
  const emiss = powered ? (0.7 + health * 1.6) * pulse : 0;
  const glow = makeGlowColor('#7be6ff', emiss);
  return (
    <group>
      {/* platform */}
      <mesh position={[0, 0.06, 0]} material={MAT.steel}>
        <boxGeometry args={[1.3, 0.12, 1.3]} />
      </mesh>
      {/* single transformer bank — one wide box, 2 glowing bushings on top */}
      <mesh position={[0, 0.36, 0]} material={MAT.steelDk}>
        <boxGeometry args={[0.9, 0.5, 0.55]} />
      </mesh>
      <mesh position={[-0.25, 0.7, 0]}>
        <sphereGeometry args={[0.09, 6, 5]} />
        <meshBasicMaterial color={glow} />
      </mesh>
      <mesh position={[0.25, 0.7, 0]}>
        <sphereGeometry args={[0.09, 6, 5]} />
        <meshBasicMaterial color={glow} />
      </mesh>
      {/* lightning rod */}
      <mesh position={[0, 1.0, 0.3]} material={MAT.steel}>
        <cylinderGeometry args={[0.025, 0.025, 1.2, 5]} />
      </mesh>
      <mesh position={[0, 1.65, 0.3]}>
        <coneGeometry args={[0.05, 0.12, 6]} />
        <meshBasicMaterial color={glow} />
      </mesh>
    </group>
  );
}

function PylonMesh({ powered, health, pulse = 1 }) {
  // Pylon as a tapered hex prism (silhouette of a lattice tower) +
  // crossarm + 3 glowing insulators. 5 meshes total (was 16).
  const emiss = powered ? (0.5 + health * 1.0) * pulse : 0;
  const glow = makeGlowColor('#c0d4ff', emiss);
  return (
    <group>
      {/* lattice tower silhouette */}
      <mesh position={[0, 1.1, 0]} material={MAT.steel}>
        <cylinderGeometry args={[0.16, 0.34, 2.2, 6]} />
      </mesh>
      {/* top cross-arm */}
      <mesh position={[0, 2.3, 0]} material={MAT.steel}>
        <boxGeometry args={[0.85, 0.06, 0.1]} />
      </mesh>
      {/* 3 glowing insulators */}
      <mesh position={[-0.38, 2.4, 0]}>
        <sphereGeometry args={[0.07, 6, 5]} />
        <meshBasicMaterial color={glow} />
      </mesh>
      <mesh position={[0, 2.4, 0]}>
        <sphereGeometry args={[0.07, 6, 5]} />
        <meshBasicMaterial color={glow} />
      </mesh>
      <mesh position={[0.38, 2.4, 0]}>
        <sphereGeometry args={[0.07, 6, 5]} />
        <meshBasicMaterial color={glow} />
      </mesh>
    </group>
  );
}

function HouseMesh({ powered, health, pulse = 1, scale = 1 }) {
  // 4 meshes: walls + roof + 2 glowing window strips (front/back).
  // emiss saturates at ~1.0 via makeGlowColor, so larger numbers here just
  // mean it reaches full brightness faster as health rises.
  const emiss = powered ? (1.2 + health * 2.4) * pulse : 0;
  const winColor = makeGlowColor('#ffb060', emiss);
  return (
    <group scale={scale}>
      <mesh position={[0, 0.3, 0]} material={MAT.plaster}>
        <boxGeometry args={[0.7, 0.6, 0.55]} />
      </mesh>
      <mesh position={[0, 0.78, 0]} rotation={[0, Math.PI / 4, 0]} material={MAT.roof}>
        <coneGeometry args={[0.55, 0.36, 4]} />
      </mesh>
      <mesh position={[0, 0.3, 0.281]}>
        <planeGeometry args={[0.5, 0.22]} />
        <meshBasicMaterial color={winColor} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.3, -0.281]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.5, 0.22]} />
        <meshBasicMaterial color={winColor} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function VillageMesh({ powered, health, pulse = 1 }) {
  return (
    <group>
      <group position={[-0.32, 0, -0.18]}>
        <HouseMesh powered={powered} health={health} pulse={pulse} scale={0.75} />
      </group>
      <group position={[0.3, 0, -0.2]} rotation={[0, 0.5, 0]}>
        <HouseMesh powered={powered} health={health} pulse={pulse} scale={0.8} />
      </group>
      <group position={[0.02, 0, 0.28]} rotation={[0, -0.3, 0]}>
        <HouseMesh powered={powered} health={health} pulse={pulse} scale={0.85} />
      </group>
    </group>
  );
}

function UtilityPoleMesh({ powered, health, pulse = 1 }) {
  // 4 meshes: pole + crossarm + 1 glowing sphere on top (replacing 5 insulators).
  const emiss = powered ? (0.6 + health * 1.5) * pulse : 0;
  const glow = makeGlowColor('#ffdca8', emiss);
  return (
    <group>
      <mesh position={[0, 0.65, 0]} material={MAT.wood}>
        <cylinderGeometry args={[0.055, 0.07, 1.3, 6]} />
      </mesh>
      <mesh position={[0, 1.22, 0]} material={MAT.wood}>
        <boxGeometry args={[0.6, 0.05, 0.07]} />
      </mesh>
      <mesh position={[-0.25, 1.28, 0]}>
        <sphereGeometry args={[0.05, 5, 4]} />
        <meshBasicMaterial color={glow} />
      </mesh>
      <mesh position={[0.25, 1.28, 0]}>
        <sphereGeometry args={[0.05, 5, 4]} />
        <meshBasicMaterial color={glow} />
      </mesh>
    </group>
  );
}

function FactoryMesh({ powered, health, pulse = 1 }) {
  // 6 meshes total (was 17): hangar + roof cap + 2 window strips + 1 stack +
  // 1 glowing stack cap.
  const emiss = powered ? (0.6 + health * 1.8) * pulse : 0;
  const winColor = makeGlowColor('#7ee0ff', emiss);
  const stackTip = makeGlowColor('#ff8c44', emiss * 0.6);
  return (
    <group>
      <mesh position={[0, 0.4, 0]} material={MAT.factory}>
        <boxGeometry args={[1.25, 0.8, 0.95]} />
      </mesh>
      <mesh position={[0, 0.86, 0]} material={MAT.factoryDk}>
        <boxGeometry args={[1.2, 0.18, 0.95]} />
      </mesh>
      <mesh position={[0, 0.42, 0.476]}>
        <planeGeometry args={[1.0, 0.36]} />
        <meshBasicMaterial color={winColor} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.42, -0.476]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.0, 0.36]} />
        <meshBasicMaterial color={winColor} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.4, 1.15, -0.38]} material={MAT.steelDk}>
        <cylinderGeometry args={[0.08, 0.1, 1.0, 6]} />
      </mesh>
      <mesh position={[-0.4, 1.66, -0.38]}>
        <cylinderGeometry args={[0.08, 0.08, 0.04, 6]} />
        <meshBasicMaterial color={stackTip} />
      </mesh>
    </group>
  );
}

// ────── Smart-grid renderers ──────
// Solar — four panels on a low platform. The panel face uses MeshBasic with
// a powered-modulated cyan tint so the array reads as "active" at a glance.
function SolarMesh({ powered, health, pulse = 1 }) {
  const emiss = powered ? (0.5 + health * 1.6) * pulse : 0;
  const panelLit = makeGlowColor('#5fd0ff', emiss);
  return (
    <group>
      {/* gravel pad */}
      <mesh position={[0, 0.04, 0]} material={MAT.steelDk}>
        <boxGeometry args={[1.1, 0.08, 0.9]} />
      </mesh>
      {/* four tilted panels in 2×2 layout */}
      {[[-0.30, -0.20], [0.30, -0.20], [-0.30, 0.20], [0.30, 0.20]].map(([x, z], i) => (
        <group key={i} position={[x, 0.22, z]} rotation={[-Math.PI / 6, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.42, 0.02, 0.34]} />
            <meshBasicMaterial color={panelLit} />
          </mesh>
          {/* dark frame underneath the lit face */}
          <mesh position={[0, -0.015, 0]} material={MAT.steel}>
            <boxGeometry args={[0.45, 0.02, 0.36]} />
          </mesh>
        </group>
      ))}
      {/* junction box */}
      <mesh position={[0, 0.18, 0.5]} material={MAT.steel}>
        <boxGeometry args={[0.18, 0.22, 0.1]} />
      </mesh>
    </group>
  );
}

// Wind — tall mono-tower with three rotating blades. The rotor spins at a
// rate tied to `health` so a struggling grid visibly slows down.
function WindMesh({ powered, health, pulse = 1 }) {
  const ref = useRef();
  useFrame((_, dt) => {
    if (!ref.current) return;
    // Slow when unpowered (rotor freewheeling), fast when feeding the grid.
    const speed = powered ? (1.2 + health * 1.6) : 0.15;
    ref.current.rotation.z += dt * speed;
  });
  const emiss = powered ? (0.4 + health * 1.2) * pulse : 0;
  const tipColor = makeGlowColor('#ff5252', emiss);
  return (
    <group>
      {/* base pad */}
      <mesh position={[0, 0.05, 0]} material={MAT.concrete}>
        <cylinderGeometry args={[0.22, 0.28, 0.1, 12]} />
      </mesh>
      {/* tapered tower */}
      <mesh position={[0, 1.3, 0]} material={MAT.plaster}>
        <cylinderGeometry args={[0.06, 0.13, 2.4, 12]} />
      </mesh>
      {/* nacelle */}
      <mesh position={[0, 2.55, 0.08]} material={MAT.steelDk}>
        <boxGeometry args={[0.22, 0.18, 0.34]} />
      </mesh>
      {/* rotating blade assembly — 3 long blades 120° apart. Each blade is
          wrapped in its own rotated group with the mesh offset +y by half
          its length, so the blade extends outward from the hub instead of
          passing through it. */}
      <group ref={ref} position={[0, 2.55, 0.28]}>
        {[0, 1, 2].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]}>
            <mesh position={[0, 0.55, 0]}>
              <boxGeometry args={[0.06, 1.0, 0.02]} />
              <meshLambertMaterial color="#f0f4f8" />
            </mesh>
          </group>
        ))}
        {/* hub cap with aviation light */}
        <mesh position={[0, 0, 0.04]}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshBasicMaterial color={tipColor} />
        </mesh>
      </group>
    </group>
  );
}

// ESS — industrial container with a glowing SOC strip on the long side.
// We can't read the actual SOC easily from a shared mesh (it would force a
// per-instance prop), so we just animate the strip with a slow pulse.
function EssMesh({ powered, health, pulse = 1 }) {
  const emiss = powered ? (0.4 + health * 1.8) * pulse : 0;
  const stripColor = makeGlowColor('#9affc8', emiss);
  return (
    <group>
      {/* container body */}
      <mesh position={[0, 0.28, 0]} material={MAT.steel}>
        <boxGeometry args={[0.95, 0.55, 0.55]} />
      </mesh>
      {/* corrugated dark band */}
      <mesh position={[0, 0.50, 0]} material={MAT.steelDk}>
        <boxGeometry args={[0.97, 0.06, 0.57]} />
      </mesh>
      {/* SOC strip — front face */}
      <mesh position={[0, 0.30, 0.286]}>
        <planeGeometry args={[0.7, 0.08]} />
        <meshBasicMaterial color={stripColor} />
      </mesh>
      {/* SOC strip — back face */}
      <mesh position={[0, 0.30, -0.286]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.7, 0.08]} />
        <meshBasicMaterial color={stripColor} />
      </mesh>
      {/* corner pillars hint at a battery container */}
      {[[-0.46, -0.27], [0.46, -0.27], [-0.46, 0.27], [0.46, 0.27]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.28, z]} material={MAT.steelDk}>
          <boxGeometry args={[0.05, 0.55, 0.05]} />
        </mesh>
      ))}
    </group>
  );
}

// Hyperscale data-center mesh — windowless concrete monolith, dense rack
// activity LEDs on the front face, three rooftop cooling units. Purple
// accents distinguish it from the cyan-blue factory.
function DataCenterMesh({ powered, health, pulse = 1 }) {
  const emiss = powered ? (0.7 + health * 2.2) * pulse : 0;
  const rackGlow = makeGlowColor('#c878ff', emiss);
  const accentGlow = makeGlowColor('#e8c0ff', emiss * 0.7);
  return (
    <group>
      {/* main hall — taller and a bit wider than a factory */}
      <mesh position={[0, 0.45, 0]} material={MAT.factory}>
        <boxGeometry args={[1.35, 0.9, 0.95]} />
      </mesh>
      {/* dark flat roof line */}
      <mesh position={[0, 0.93, 0]} material={MAT.factoryDk}>
        <boxGeometry args={[1.38, 0.08, 0.97]} />
      </mesh>
      {/* server-rack activity strips — front face */}
      {[-0.42, -0.14, 0.14, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.45, 0.476]}>
          <planeGeometry args={[0.18, 0.66]} />
          <meshBasicMaterial color={rackGlow} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* same on the back face for parallax */}
      {[-0.42, -0.14, 0.14, 0.42].map((x) => (
        <mesh key={`bk-${x}`} position={[x, 0.45, -0.476]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.18, 0.66]} />
          <meshBasicMaterial color={accentGlow} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* rooftop cooling/chiller units */}
      {[-0.42, 0, 0.42].map((x, i) => (
        <group key={i} position={[x, 1.05, 0]}>
          <mesh material={MAT.steel}>
            <boxGeometry args={[0.24, 0.22, 0.42]} />
          </mesh>
          {/* warm exhaust glow on top of each unit */}
          <mesh position={[0, 0.13, 0]}>
            <boxGeometry args={[0.2, 0.03, 0.36]} />
            <meshBasicMaterial color={accentGlow} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const BUILDING_RENDERERS = {
  powerPlant: PowerPlantMesh,
  substation: SubstationMesh,
  pylon: PylonMesh,
  factory: FactoryMesh,
  utilityPole: UtilityPoleMesh,
  house: HouseMesh,
  village: VillageMesh,
  solar: SolarMesh,
  wind: WindMesh,
  ess: EssMesh,
  dataCenter: DataCenterMesh,
};

// No per-building pointLight — the warm-bloom feeling comes entirely from
// emissive materials on the building + tinted hex instance colors around it.
// This is the single biggest fragment-shader win: each removed point light
// previously made every visible meshStandardMaterial fragment do an extra
// light calculation.
const Building = React.memo(
  function Building({ q, r, type, powered, health, pulse, eventOnMe, onClick }) {
    const [x, , z] = hexToWorld(q, r);
    const Render = BUILDING_RENDERERS[type];
    const def = TILE_TYPES[type];
    return (
      <group
        position={[x, 0, z]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        <Render powered={powered} health={health} pulse={pulse} />
        {eventOnMe && (
          <EventMarker event={eventOnMe} height={def.height} />
        )}
      </group>
    );
  },
  (prev, next) => (
    prev.type === next.type
    && prev.powered === next.powered
    && prev.eventOnMe === next.eventOnMe
    && prev.q === next.q && prev.r === next.r
    && prev.onClick === next.onClick
    && Math.abs((prev.pulse || 1) - (next.pulse || 1)) < 0.05
    && Math.abs((prev.health || 0) - (next.health || 0)) < 0.05
  ),
);

// ───────────────── Event visuals ─────────────────
// Goal: read the situation at a glance, even with a busy grid. We use big
// silhouette + bright color + motion. Visuals should feel cartoony / "game"
// rather than realistic.

const CROW_MAT = new THREE.MeshLambertMaterial({ color: '#1c1c24' });
const CROW_WING_MAT = new THREE.MeshLambertMaterial({ color: '#2a2a34' });
const BEAK_MAT = new THREE.MeshBasicMaterial({ color: '#ffc060' });
const CROW_HALO_MAT = new THREE.MeshBasicMaterial({
  color: '#cdb8ff', transparent: true, opacity: 0.55,
});

// One animated crow with flapping wings. Local origin is the body center.
// Crow's "forward" is +X (head/beak), up is +Y, wings extend on ±Z. Wings
// flap by rotating each wing-group around its own X axis so the wing tip
// traces a YZ arc — i.e. proper up/down flap, not a yawing helicopter spin.
function CrowSprite({ phase = 0, scale = 1 }) {
  const grp = useRef();
  const lWing = useRef();
  const rWing = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (grp.current) {
      // tiny bob to sell perch jitter
      grp.current.position.y = Math.sin(t * 5.2) * 0.025;
      grp.current.rotation.y = Math.sin(t * 0.8) * 0.25;
    }
    if (lWing.current && rWing.current) {
      const flap = Math.sin(t * 11) * 0.65;
      // Mirror signs: rotating around +X by negative θ lifts the +Z wing tip
      // toward +Y, while positive θ lifts the -Z wing tip — so both wings
      // travel UP together when flap>0 and DOWN together when flap<0.
      lWing.current.rotation.x = -flap;
      rWing.current.rotation.x =  flap;
    }
  });
  return (
    <group ref={grp} scale={scale}>
      {/* body — slightly elongated */}
      <mesh material={CROW_MAT}>
        <sphereGeometry args={[0.18, 10, 8]} />
      </mesh>
      {/* head */}
      <mesh position={[0.14, 0.05, 0]} material={CROW_MAT}>
        <sphereGeometry args={[0.11, 8, 7]} />
      </mesh>
      {/* beak */}
      <mesh position={[0.27, 0.04, 0]} rotation={[0, 0, -Math.PI / 2]} material={BEAK_MAT}>
        <coneGeometry args={[0.05, 0.16, 5]} />
      </mesh>
      {/* glowing yellow eyes (cartoon menace) */}
      <mesh position={[0.20, 0.08, 0.06]}>
        <sphereGeometry args={[0.028, 6, 5]} />
        <meshBasicMaterial color="#ffe060" />
      </mesh>
      <mesh position={[0.20, 0.08, -0.06]}>
        <sphereGeometry args={[0.028, 6, 5]} />
        <meshBasicMaterial color="#ffe060" />
      </mesh>
      {/* tail */}
      <mesh position={[-0.18, 0.02, 0]} rotation={[0, 0, Math.PI / 2]} material={CROW_MAT}>
        <coneGeometry args={[0.07, 0.18, 5]} />
      </mesh>
      {/* left wing — anchor at root, flap around z */}
      <group ref={lWing} position={[0, 0.02, 0.12]}>
        <mesh position={[-0.04, 0, 0.12]} material={CROW_WING_MAT}>
          <boxGeometry args={[0.24, 0.03, 0.22]} />
        </mesh>
      </group>
      <group ref={rWing} position={[0, 0.02, -0.12]}>
        <mesh position={[-0.04, 0, -0.12]} material={CROW_WING_MAT}>
          <boxGeometry args={[0.24, 0.03, 0.22]} />
        </mesh>
      </group>
    </group>
  );
}

// Two crows orbit the perched one — sells "flock harassing the line".
// Heading derivation: tangent to the orbit is (-sin t, cos t). The crow's
// local +X (head) must point that way, so rotation.y = -t - π/2 (verified
// at t=0: position +X, velocity +Z, head must face +Z → rotation.y = -π/2).
// The previous formula (-t + π/2) had the crow flying tail-first.
function OrbitingCrow({ baseY, radius, speed, phase }) {
  const grp = useRef();
  useFrame(({ clock }) => {
    if (!grp.current) return;
    const t = clock.elapsedTime * speed + phase;
    grp.current.position.set(
      Math.cos(t) * radius,
      baseY + Math.sin(t * 2.2) * 0.18,
      Math.sin(t) * radius,
    );
    grp.current.rotation.y = -t - Math.PI / 2;
  });
  return (
    <group ref={grp}>
      <CrowSprite phase={phase * 3.1} scale={0.7} />
    </group>
  );
}

// Animated lightning bolt — pre-rendered zig-zag variants cycled rapidly for
// the crackle, a bright impact flash, and a real point light so the strike
// briefly illuminates the surrounding hexes.
const BOLT_VARIANT_COUNT = 6;
function LightningBolt({ targetHeight, startTime }) {
  // Build several zig-zag variants up front.
  const variants = useMemo(() => {
    const out = [];
    const segments = 8;
    const topY = 9.5;
    const botY = targetHeight + 0.1;
    for (let v = 0; v < BOLT_VARIANT_COUNT; v++) {
      const arr = [];
      for (let i = 0; i <= segments; i++) {
        const f = i / segments;
        const y = topY + (botY - topY) * f;
        // jitter shrinks as we approach the target so the bottom locks on
        const j = (1 - f * 0.85) * 0.45;
        const xJ = (Math.random() - 0.5) * j;
        const zJ = (Math.random() - 0.5) * j;
        arr.push([xJ, y, zJ]);
      }
      // force exact start/end on axis
      arr[0] = [arr[0][0] * 0.15, topY, arr[0][2] * 0.15];
      arr[arr.length - 1] = [0, botY, 0];
      out.push(arr);
    }
    return out;
  }, [targetHeight]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % BOLT_VARIANT_COUNT), 55);
    return () => clearInterval(id);
  }, []);

  // Impact flash — scales and fades on a short loop synced to crackle.
  const flashRef = useRef();
  const lightRef = useRef();
  useFrame(({ clock }) => {
    const age = (performance.now() - startTime) / 1000;
    const beat = (clock.elapsedTime * 8) % 1; // 0..1 cycle
    const pulse = Math.max(0.15, 1 - beat) * Math.max(0, 1 - age / 2.6);
    if (flashRef.current) {
      flashRef.current.scale.setScalar(0.45 + pulse * 0.9);
      flashRef.current.material.opacity = pulse * 0.95;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 4 + pulse * 9;
    }
  });

  return (
    <group>
      {/* main bright core */}
      <Line points={variants[idx]} color="#ffffff" lineWidth={4.2} transparent opacity={1} />
      {/* outer halo / second bolt for thickness */}
      <Line points={variants[(idx + 2) % BOLT_VARIANT_COUNT]} color="#9ed6ff" lineWidth={2.0} transparent opacity={0.7} />
      {/* third faint after-image */}
      <Line points={variants[(idx + 4) % BOLT_VARIANT_COUNT]} color="#c8e8ff" lineWidth={1.2} transparent opacity={0.4} />
      {/* impact flash */}
      <mesh ref={flashRef} position={[0, targetHeight + 0.15, 0]}>
        <sphereGeometry args={[0.5, 14, 10]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
      </mesh>
      {/* strike light */}
      <pointLight
        ref={lightRef}
        position={[0, targetHeight + 0.3, 0]}
        color="#ffffff"
        intensity={6}
        distance={9}
        decay={2}
      />
      {/* scorch ring on the ground beneath the hit */}
      <mesh position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.65, 18]} />
        <meshBasicMaterial color="#ff8040" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function EventMarker({ event, height }) {
  if (event.type === 'crow') {
    return (
      <group position={[0, height + 0.25, 0]}>
        {/* halo ring on top of the building */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} material={CROW_HALO_MAT}>
          <ringGeometry args={[0.32, 0.52, 18]} />
        </mesh>
        {/* perched main crow */}
        <CrowSprite />
        {/* two flying companions circling the perch */}
        <OrbitingCrow baseY={0.15} radius={0.55} speed={1.4} phase={0} />
        <OrbitingCrow baseY={0.30} radius={0.7} speed={1.1} phase={Math.PI} />
      </group>
    );
  }
  if (event.type === 'lightning') {
    return <LightningBolt targetHeight={height} startTime={event.startTime} />;
  }
  if (event.type === 'wildfire') {
    return <WildfireFx height={height} />;
  }
  return null;
}

// Wildfire visual — flickering flames at the base of the pylon plus a dark
// smoke column rising up the tower. Cheap: ~8 meshes + 1 pointLight whose
// intensity throbs with a sine wave for the fire shimmer.
function WildfireFx({ height }) {
  const flameRef = useRef();
  const smokeRef = useRef();
  const lightRef = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (flameRef.current) {
      // independent flicker per flame mesh
      for (let i = 0; i < flameRef.current.children.length; i++) {
        const c = flameRef.current.children[i];
        const s = 0.85 + 0.25 * Math.sin(t * (5 + i * 1.3) + i);
        c.scale.set(s, 0.7 + 0.4 * Math.sin(t * 3 + i), s);
      }
    }
    if (smokeRef.current) {
      smokeRef.current.rotation.y = t * 0.4;
      smokeRef.current.position.y = height * 0.7 + Math.sin(t * 0.8) * 0.05;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 3.5 + Math.sin(t * 7) * 1.5;
    }
  });
  return (
    <group>
      {/* flames clustered around the base */}
      <group ref={flameRef} position={[0, 0.15, 0]}>
        {[
          [ 0.18, 0,    0.05, '#ff3000'],
          [-0.16, 0.08, 0.10, '#ff7020'],
          [ 0.05, 0,   -0.16, '#ffa040'],
          [-0.04, 0.05,-0.04, '#ffd060'],
          [ 0.10, 0,    0.18, '#ff5018'],
        ].map(([x, y, z, c], i) => (
          <mesh key={i} position={[x, y, z]}>
            <coneGeometry args={[0.13, 0.42, 5]} />
            <meshBasicMaterial color={c} />
          </mesh>
        ))}
      </group>
      {/* smoke column up the pylon — translucent dark cone */}
      <mesh ref={smokeRef} position={[0, height * 0.7, 0]}>
        <coneGeometry args={[0.35, height * 1.1, 6]} />
        <meshBasicMaterial color="#2a2520" transparent opacity={0.55} />
      </mesh>
      {/* embers / heat haze */}
      <pointLight
        ref={lightRef}
        position={[0, 0.4, 0]}
        color="#ff5818"
        intensity={3.5}
        distance={6}
        decay={2}
      />
      {/* ground scorch */}
      <mesh position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.85, 22]} />
        <meshBasicMaterial color="#5a2010" transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

// ───────────────── Power lines ─────────────────
function buildCatenary(a, b, sagFactor, segments = 14) {
  const dist = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const sag = dist * sagFactor;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    const y = a[1] + (b[1] - a[1]) * t - sag * Math.sin(Math.PI * t);
    pts.push([x, y, z]);
  }
  return pts;
}

// Perpendicular horizontal offset between the two circuits of a redundant
// (double) line. Larger = clearer visually, smaller = closer to single line.
const REDUNDANT_LATERAL = 0.16;

// PowerLine — geometry built once. Wind effect is a cheap group-level y-bob
// via useFrame, no buffer rewrites. Memoized to skip re-render on dyn pulses.
// When `redundant`, we render TWO catenaries with a small lateral offset so
// the player can see at a glance that this corridor has dual circuits.
const PowerLine = React.memo(
  function PowerLine({ a, b, powered, health, isMain, pulse, windActive, redundant }) {
    // Lateral perpendicular vector in the horizontal plane.
    const perp = useMemo(() => {
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const len = Math.hypot(dx, dz) || 1;
      return [-dz / len, 0, dx / len];
    }, [a, b]);

    const points = useMemo(
      () => buildCatenary(a, b, isMain ? 0.08 : 0.14, 8),
      [a, b, isMain],
    );
    const pointsLeft = useMemo(() => {
      if (!redundant) return null;
      const o = REDUNDANT_LATERAL;
      return buildCatenary(
        [a[0] - perp[0] * o, a[1], a[2] - perp[2] * o],
        [b[0] - perp[0] * o, b[1], b[2] - perp[2] * o],
        isMain ? 0.08 : 0.14, 8,
      );
    }, [a, b, perp, isMain, redundant]);
    const pointsRight = useMemo(() => {
      if (!redundant) return null;
      const o = REDUNDANT_LATERAL;
      return buildCatenary(
        [a[0] + perp[0] * o, a[1], a[2] + perp[2] * o],
        [b[0] + perp[0] * o, b[1], b[2] + perp[2] * o],
        isMain ? 0.08 : 0.14, 8,
      );
    }, [a, b, perp, isMain, redundant]);

    const cableColor = useMemo(() => {
      if (!powered) return '#6a4a55';
      return new THREE.Color('#f4e0b8')
        .lerp(new THREE.Color('#5a6072'), 1 - health)
        .getStyle();
    }, [powered, health]);
    const lineWidth = isMain ? 1.8 : 1.4;
    const op = powered ? 0.5 + 0.25 * health * pulse : 0.35;

    const grp = useRef();
    const phase = useMemo(() => (a[0] + a[2] + b[0] + b[2]) * 0.3, [a, b]);

    useFrame(({ clock }) => {
      if (!grp.current) return;
      if (windActive) {
        grp.current.position.y = Math.sin(clock.elapsedTime * 3.2 + phase) * 0.08;
      } else if (grp.current.position.y !== 0) {
        grp.current.position.y = 0;
      }
    });

    return (
      <group ref={grp}>
        {redundant ? (
          <>
            <Line points={pointsLeft}  color={cableColor} lineWidth={lineWidth} transparent opacity={op} />
            <Line points={pointsRight} color={cableColor} lineWidth={lineWidth} transparent opacity={op} />
          </>
        ) : (
          <Line points={points} color={cableColor} lineWidth={lineWidth} transparent opacity={op} />
        )}
      </group>
    );
  },
  (prev, next) => (
    prev.powered === next.powered
    && prev.isMain === next.isMain
    && prev.windActive === next.windActive
    && prev.redundant === next.redundant
    && Math.abs((prev.health || 0) - (next.health || 0)) < 0.05
    && Math.abs((prev.pulse || 1) - (next.pulse || 1)) < 0.05
    && prev.a[0] === next.a[0] && prev.a[1] === next.a[1] && prev.a[2] === next.a[2]
    && prev.b[0] === next.b[0] && prev.b[1] === next.b[1] && prev.b[2] === next.b[2]
  ),
);

// Small, clickable midpoint badge — shows redundancy status and acts as the
// upgrade/downgrade toggle. Glows brighter on hover; tooltip in HUD shows
// the price (we don't render text in 3D space to keep the scene cheap).
function EdgeUpgradeBadge({ midpoint, redundant, onHover, onLeave, onClick }) {
  const [hovered, setHovered] = useState(false);
  const color = redundant ? '#7be6ff' : '#9aa6c0';
  const accent = redundant ? '#aef0ff' : '#c8d4e8';
  return (
    <group position={midpoint}>
      <mesh
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
          onHover && onHover();
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = '';
          onLeave && onLeave();
        }}
      >
        <sphereGeometry args={[hovered ? 0.16 : 0.11, 10, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={accent}
          emissiveIntensity={hovered ? 1.4 : (redundant ? 0.9 : 0.35)}
          transparent
          opacity={hovered ? 0.95 : 0.7}
        />
      </mesh>
      {redundant && (
        // Second pip beneath — visual cue that this is dual-circuit even at
        // a glance from far away.
        <mesh position={[0, -0.16, 0]}>
          <sphereGeometry args={[0.07, 8, 6]} />
          <meshStandardMaterial color={color} emissive={accent} emissiveIntensity={0.7} />
        </mesh>
      )}
    </group>
  );
}

// Redundancy is only meaningful on the 송전(transmission) backbone. In real
// Korean grids, 154 kV+ pylon-to-pylon lines are double-circuited for N-1;
// distribution feeders (전신주) and substation drops are single-circuit.
// We therefore restrict the upgrade badge — and the dual-circuit rendering —
// to edges where BOTH endpoints are pylons.
function isRedundancyEligible(typeA, typeB) {
  return typeA === 'pylon' && typeB === 'pylon';
}

function PowerNetwork({ edges, buildings, powered, health, pulse, windActive, redundantEdges, onHoverEdge, onLeaveEdge, onToggleRedundant }) {
  return edges.map(([aKey, bKey], i) => {
    const ba = buildings.get(aKey);
    const bb = buildings.get(bKey);
    if (!ba || !bb) return null;
    const defA = TILE_TYPES[ba.type];
    const defB = TILE_TYPES[bb.type];
    const [ax, , az] = hexToWorld(ba.q, ba.r);
    const [bx, , bz] = hexToWorld(bb.q, bb.r);
    const ay = defA.height * 0.95;
    const by = defB.height * 0.95;
    const aTrans = defA.tier !== 'distribution';
    const bTrans = defB.tier !== 'distribution';
    const isMain = aTrans && bTrans;
    const ok = powered[aKey] && powered[bKey];
    const ek = edgeKey(aKey, bKey);
    const eligible = isRedundancyEligible(ba.type, bb.type);
    // Stale entries from old games may exist in redundantEdges for non-pylon
    // edges; ignore them when the endpoints are no longer eligible.
    const isRedundant = eligible && !!(redundantEdges && redundantEdges.has(ek));
    // Midpoint of the catenary — sag dips it a bit so put the badge slightly
    // above the chord midpoint for click-ability.
    const midpoint = [(ax + bx) / 2, (ay + by) / 2 - 0.05, (az + bz) / 2];
    return (
      <React.Fragment key={`line-${i}`}>
        <PowerLine
          a={[ax, ay, az]}
          b={[bx, by, bz]}
          powered={ok}
          health={ok ? health : 0}
          isMain={isMain}
          pulse={pulse}
          windActive={windActive}
          redundant={isRedundant}
        />
        {eligible && (
          <EdgeUpgradeBadge
            midpoint={midpoint}
            redundant={isRedundant}
            onHover={() => onHoverEdge && onHoverEdge(aKey, bKey)}
            onLeave={() => onLeaveEdge && onLeaveEdge()}
            onClick={() => onToggleRedundant && onToggleRedundant(aKey, bKey)}
          />
        )}
      </React.Fragment>
    );
  });
}

// ───────────────── Line faults & repair workers ─────────────────
// Time budget for a single dispatch, in seconds. Walk → work → walk-back.
// Tuning: total < 12 s keeps player engagement up; work duration is the
// piece the player feels (line stays "휴전 중" the longest).
const REPAIR_WALK_SEC = 2.6;
const REPAIR_WORK_SEC = 5.0;
const REPAIR_TOTAL_SEC = REPAIR_WALK_SEC * 2 + REPAIR_WORK_SEC;

// ────── 지장전주 (utility-pole obstruction) ──────
// Three real-world causes drive different cost flows:
//   road_expansion  — 지자체가 비용 보전 → 플레이어에게 +보상
//   private_land    — 한전 부담 → 플레이어가 이설비 지출
//   building_access — 건축주 부담 → 플레이어에게 수익
// If the player ignores the marker until the event auto-expires, the pole is
// silently demolished (removed from buildings) AND a steep penalty applies.
const OBSTRUCTION_KINDS = ['road_expansion', 'private_land', 'building_access'];
const OBSTRUCTION_INFO = {
  road_expansion: { label: '도로 확장', emoji: '🛣️', color: '#7be6ff', reward: 500 },
  private_land:   { label: '사유지 재산권', emoji: '🏠', color: '#ffb074', reward: -150 },
  building_access:{ label: '건축 진출입로', emoji: '🚗', color: '#a0e8b8', reward: 300 },
};
const OBSTRUCTION_TIMEOUT_PENALTY = 400;
const OBSTRUCTION_RELOCATE_RANGE = 2;

// ────── Economy recovery ──────
// Refund ratio on demolition — high enough that selling unprofitable assets
// is a viable escape from bankruptcy, low enough that "build then refund"
// loops can't replace tactical planning.
const DEMOLISH_REFUND = 0.6;
// Hard floor on money. Drains (fault drain, upfront fees) stop deducting
// once we hit this. The player can still earn from any still-powered branch
// and demolish to recover above zero.
const MONEY_FLOOR = -500;
// When current money first drops below 0, fire a one-shot warning toast so
// the player notices BEFORE the floor kicks in.
const MONEY_WARN_THRESHOLD = 0;
// Score formula: rewards both staying solvent AND surviving long. 1 point
// per ₩, 5 points per second alive. So a 5-minute run with ₩400 money:
//   400 + (300 * 5) = 1900 score.
const SCORE_PER_SECOND = 5;
const LEADERBOARD_KEY = 'eg_leaderboard_v1';
const LEADERBOARD_SIZE = 5;

// Returns the worker's current world-space [x, y, z] given its mode/timeline.
function workerPosition(now, w) {
  const elapsed = (now - w.dispatchTime) / 1000;
  const [dx, dz] = w.depotPos;
  const [fx, fz] = w.faultMid;
  if (elapsed < REPAIR_WALK_SEC) {
    const t = elapsed / REPAIR_WALK_SEC;
    return [dx + (fx - dx) * t, 0, dz + (fz - dz) * t];
  }
  if (elapsed < REPAIR_WALK_SEC + REPAIR_WORK_SEC) {
    return [fx, 0, fz];
  }
  const t = Math.min(1, (elapsed - REPAIR_WALK_SEC - REPAIR_WORK_SEC) / REPAIR_WALK_SEC);
  return [fx + (dx - fx) * t, 0, dz + (fz - dz) * t];
}

// Worker avatar — handles its own per-frame position interpolation so the
// parent does not need to setState every frame. The `worker` prop is the
// snapshot at dispatch time; nothing here updates React state.
function WorkerAvatar({ worker }) {
  const grpRef = useRef();
  const [renderTick, setRenderTick] = useState(0);
  // We want lookAt to flip when walking vs returning. Cheapest: derive each
  // frame from current motion vector.
  const lookRef = useRef([worker.faultMid[0], 0, worker.faultMid[1]]);

  useFrame(() => {
    if (!grpRef.current) return;
    const now = performance.now();
    const [x, y, z] = workerPosition(now, worker);
    grpRef.current.position.set(x, y, z);
    // facing target depends on mode
    const elapsed = (now - worker.dispatchTime) / 1000;
    if (elapsed < REPAIR_WALK_SEC) {
      lookRef.current = [worker.faultMid[0], 0, worker.faultMid[1]];
    } else if (elapsed < REPAIR_WALK_SEC + REPAIR_WORK_SEC) {
      lookRef.current = [worker.faultMid[0], 0, worker.faultMid[1]];
    } else {
      lookRef.current = [worker.depotPos[0], 0, worker.depotPos[1]];
    }
  });

  // mode-derived for animation crossfade — recomputed each render tick
  // (parent forces a tick when transitioning), cheap.
  void renderTick;
  const now = performance.now();
  const elapsed = (now - worker.dispatchTime) / 1000;
  const animMode =
    elapsed < REPAIR_WALK_SEC ? 'walking'
    : elapsed < REPAIR_WALK_SEC + REPAIR_WORK_SEC ? 'working'
    : 'returning';

  // Force a mode-only refresh every ~0.2s so anim crossfade tracks state.
  useEffect(() => {
    const id = setInterval(() => setRenderTick((x) => (x + 1) & 0xff), 200);
    return () => clearInterval(id);
  }, []);

  return (
    <group ref={grpRef}>
      <RepairWorker
        position={[0, 0, 0]}
        lookAt={[
          lookRef.current[0] - workerPosition(performance.now(), worker)[0],
          0,
          lookRef.current[2] - workerPosition(performance.now(), worker)[2],
        ]}
        mode={animMode}
      />
      {animMode === 'working' && (
        <group position={[0, 1.1, 0]}>
          {/* working sparks */}
          <pointLight color="#ffd86b" intensity={2.4} distance={3.5} decay={2} />
          <mesh>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial
              color="#fff6c0"
              emissive="#fff6c0"
              emissiveIntensity={6}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

// Clickable warning sign that floats above a faulted line's midpoint.
// Disappears once a worker is dispatched (parent passes hasWorker).
// Small sparks effect — a single group whose 6 children we transform per
// frame to sell "live wire arcing". Cheap: 6 spheres + a single useFrame.
function FaultSparks() {
  const groupRef = useRef();
  useFrame(({ clock }) => {
    const grp = groupRef.current;
    if (!grp) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < grp.children.length; i++) {
      const child = grp.children[i];
      const phase = (i / 6) * Math.PI * 2 + t * 4.5 + i;
      const r = 0.12 + 0.06 * Math.sin(t * 7 + i);
      child.position.set(
        Math.cos(phase) * r,
        Math.sin(phase * 1.7) * 0.06,
        Math.sin(phase) * r,
      );
      const s = 0.5 + 0.5 * Math.abs(Math.sin(t * 9 + i * 1.7));
      child.scale.setScalar(s);
    }
  });
  return (
    <group ref={groupRef}>
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.04, 6, 5]} />
          <meshBasicMaterial color={i % 2 ? '#fffae0' : '#ff9444'} />
        </mesh>
      ))}
    </group>
  );
}

function FaultMarker({ midpoint, hasWorker, onDispatch }) {
  const ref = useRef();
  const tapeRef = useRef();
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = midpoint[1] + 0.6 + Math.sin(clock.elapsedTime * 3.5) * 0.08;
      ref.current.rotation.y = clock.elapsedTime * 1.6;
    }
    if (tapeRef.current) {
      // Slow rotation of the safety-tape banner so it's noticeable.
      tapeRef.current.rotation.y = clock.elapsedTime * 0.8;
    }
  });

  if (hasWorker) {
    // "휴전 작업 중" — caution-tape style ring (yellow + dark stripes), a
    // flashing dome above the fault, and a soft yellow ground halo to read
    // "WARNING: de-energised, do not touch".
    return (
      <group position={[midpoint[0], midpoint[1] + 0.55, midpoint[2]]}>
        {/* striped safety bar — 8 alternating yellow/black blocks in a ring */}
        <group ref={tapeRef}>
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const r = 0.38;
            return (
              <mesh
                key={i}
                position={[Math.cos(a) * r, 0, Math.sin(a) * r]}
                rotation={[0, -a, 0]}
              >
                <boxGeometry args={[0.05, 0.18, 0.20]} />
                <meshBasicMaterial color={i % 2 ? '#fff080' : '#181818'} />
              </mesh>
            );
          })}
        </group>
        {/* pulsing dome to grab attention */}
        <mesh position={[0, 0.28, 0]}>
          <sphereGeometry args={[0.14, 12, 10]} />
          <meshBasicMaterial color="#fff080" transparent opacity={0.85} />
        </mesh>
        <pointLight color="#ffd23f" intensity={1.6} distance={4.5} decay={2} />
      </group>
    );
  }
  return (
    <group
      ref={ref}
      position={[midpoint[0], midpoint[1] + 0.6, midpoint[2]]}
      onClick={(e) => { e.stopPropagation(); onDispatch(); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = ''; }}
    >
      {/* triangle warning sign */}
      <mesh>
        <coneGeometry args={[0.32, 0.06, 3]} />
        <meshStandardMaterial color="#ff5252" emissive="#ff5252" emissiveIntensity={2.6} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI]} position={[0, 0.05, 0]}>
        <coneGeometry args={[0.26, 0.05, 3]} />
        <meshStandardMaterial color="#fff080" emissive="#fff080" emissiveIntensity={2.0} />
      </mesh>
      <pointLight color="#ff5252" intensity={2.0} distance={4.5} decay={2} />
      {/* arcing sparks at the broken wire */}
      <FaultSparks />
    </group>
  );
}

// Helicopter wreck — dramatic burning hull at the crash midpoint. Renders on
// top of the regular FaultMarker so the player still gets the clickable ⚠.
function HelicopterWreck({ midpoint, hasWorker }) {
  const hullRef = useRef();
  const smokeRef = useRef();
  const lightRef = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (hullRef.current) {
      // small settling wobble — wreckage isn't moving but the flames
      // illuminate from changing angles
      hullRef.current.rotation.z = 0.35 + Math.sin(t * 1.3) * 0.04;
    }
    if (smokeRef.current) {
      smokeRef.current.rotation.y = t * 0.5;
      smokeRef.current.position.y = midpoint[1] + 0.95 + Math.sin(t * 0.7) * 0.06;
    }
    if (lightRef.current) {
      lightRef.current.intensity = hasWorker
        ? 1.6 + Math.sin(t * 2) * 0.4
        : 3.2 + Math.sin(t * 4.5) * 1.1;
    }
  });
  return (
    <group>
      {/* hull — tilted on the line, half-broken */}
      <group ref={hullRef} position={[midpoint[0], midpoint[1] - 0.05, midpoint[2]]}>
        <mesh>
          <boxGeometry args={[0.52, 0.18, 0.24]} />
          <meshLambertMaterial color="#2c2018" />
        </mesh>
        {/* tail boom */}
        <mesh position={[-0.32, 0.04, 0]} rotation={[0, 0, 0.4]}>
          <boxGeometry args={[0.28, 0.06, 0.06]} />
          <meshLambertMaterial color="#1f1812" />
        </mesh>
        {/* snapped rotor blade */}
        <mesh position={[0.08, 0.16, 0]} rotation={[0, 0.6, 0.5]}>
          <boxGeometry args={[0.52, 0.02, 0.04]} />
          <meshLambertMaterial color="#181410" />
        </mesh>
        {/* embers underneath */}
        <mesh position={[0, -0.04, 0]}>
          <sphereGeometry args={[0.18, 10, 8]} />
          <meshBasicMaterial color="#ff6020" />
        </mesh>
      </group>
      {/* dark smoke column rising above the wreck */}
      <mesh ref={smokeRef} position={[midpoint[0], midpoint[1] + 0.95, midpoint[2]]}>
        <coneGeometry args={[0.35, 1.8, 6]} />
        <meshBasicMaterial color="#1a1612" transparent opacity={0.65} />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[midpoint[0], midpoint[1] + 0.15, midpoint[2]]}
        color="#ff5818"
        intensity={3.2}
        distance={6}
        decay={2}
      />
    </group>
  );
}

// Floating status badge above a data-center. Color of the halo ring tells
// the player at a glance what kind of run their hyperscaler is having:
//   • green   — operational + RE100 (perfect grid)
//   • cyan    — operational + VPP (load-shifting active)
//   • purple  — operational, basic
//   • red     — radial (needs a loop) · pulses to grab attention
//   • grey    — offline (no power feed yet)
// Two small spheres next to the ring stand in for the badges themselves
// (green = RE100, cyan = VPP). Cheap to render — 1 ring + up to 2 spheres.
function DataCenterBadge({ position, status }) {
  const ringRef = useRef();
  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    if (status.state !== 'operational') {
      const t = clock.elapsedTime;
      const s = 1 + 0.18 * Math.sin(t * 4.5);
      ringRef.current.scale.setScalar(s);
    } else if (ringRef.current.scale.x !== 1) {
      ringRef.current.scale.setScalar(1);
    }
  });
  let ringColor = '#666';
  if (status.state === 'radial') ringColor = '#ff5050';
  else if (status.state === 'operational') {
    ringColor = status.re100 ? '#9affc8' : (status.vpp ? '#7be6ff' : '#c878ff');
  }
  return (
    <group position={[position[0], position[1] + 1.6, position[2]]}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.30, 0.46, 18]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.9} />
      </mesh>
      {status.re100 && (
        <mesh position={[-0.18, 0.10, 0]}>
          <sphereGeometry args={[0.08, 8, 6]} />
          <meshBasicMaterial color="#9affc8" />
        </mesh>
      )}
      {status.vpp && (
        <mesh position={[0.18, 0.10, 0]}>
          <sphereGeometry args={[0.08, 8, 6]} />
          <meshBasicMaterial color="#7be6ff" />
        </mesh>
      )}
    </group>
  );
}

// ────────── 지장전주 marker + relocation highlight ──────────
// Construction-cone marker that floats above an obstructed utility pole.
// Clicking enters relocation mode in the parent — the marker itself is
// just a clickable visual. Color and emoji vary by obstruction subtype.
function ObstructionMarker({ position, kind, remainingSec, onClick }) {
  const info = OBSTRUCTION_INFO[kind] || OBSTRUCTION_INFO.private_land;
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.y = position[1] + 1.0 + Math.sin(t * 3.2) * 0.10;
    ref.current.rotation.y = t * 1.4;
  });
  return (
    <group ref={ref} position={[position[0], position[1] + 1.0, position[2]]}>
      {/* construction cone */}
      <mesh
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = ''; }}
      >
        <coneGeometry args={[0.22, 0.46, 8]} />
        <meshStandardMaterial
          color={info.color}
          emissive={info.color}
          emissiveIntensity={2.0}
        />
      </mesh>
      {/* white reflective stripe */}
      <mesh position={[0, 0.0, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.06, 12, 1, true]} />
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
      </mesh>
      {/* small ground-level timer ring shows remaining time */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.95, 0]}>
        <ringGeometry args={[0.42, 0.5, 24, 1, 0, Math.PI * 2 * remainingSec]} />
        <meshBasicMaterial color={info.color} transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color={info.color} intensity={1.4} distance={3.5} decay={2} />
    </group>
  );
}

// Renders every active obstruction marker. The parent passes the relocation
// state so we can skip the marker on the pole currently being moved (avoids
// visual confusion during the click→click flow).
function ObstructionLayer({ obstructions, buildings, relocationMode, onMarkerClick }) {
  const now = performance.now();
  return obstructions.map((ev) => {
    if (!ev.target) return null;
    if (relocationMode && relocationMode.eventId === ev.id) return null;
    const b = buildings.get(ev.target);
    if (!b) return null;
    const [x, , z] = hexToWorld(b.q, b.r);
    const remain = Math.max(0, (ev.endTime - now) / 1000);
    const total = EVENT_DEFS.pole_obstruction.duration;
    return (
      <ObstructionMarker
        key={`obs-${ev.id}`}
        position={[x, 1.35, z]}
        kind={ev.obstructionKind || 'private_land'}
        remainingSec={Math.min(1, remain / total)}
        onClick={() => onMarkerClick(ev)}
      />
    );
  });
}

// Green halo on a hex eligible to receive the relocated pole. Pulses gently
// so the player's eye lands on it. Empty array if not in relocation mode.
function RelocationTargets({ relocationMode, buildings, terrainByKey, onPick }) {
  if (!relocationMode) return null;
  const candidates = [];
  const { fromQ, fromR } = relocationMode;
  for (let dq = -OBSTRUCTION_RELOCATE_RANGE; dq <= OBSTRUCTION_RELOCATE_RANGE; dq++) {
    for (let dr = -OBSTRUCTION_RELOCATE_RANGE; dr <= OBSTRUCTION_RELOCATE_RANGE; dr++) {
      if (Math.abs(dq + dr) > OBSTRUCTION_RELOCATE_RANGE) continue;
      if (dq === 0 && dr === 0) continue;
      const tq = fromQ + dq;
      const tr = fromR + dr;
      const tk = hexKey(tq, tr);
      if (buildings.has(tk)) continue;
      const terrain = terrainByKey ? terrainByKey.get(tk) : null;
      if (!canBuildOn(terrain, 'utilityPole')) continue;
      candidates.push({ q: tq, r: tr, k: tk });
    }
  }
  return candidates.map((c) => {
    const [x, , z] = hexToWorld(c.q, c.r);
    return (
      <PulsingTargetHalo
        key={`tg-${c.k}`}
        position={[x, 0.05, z]}
        onPick={() => onPick(c.q, c.r)}
      />
    );
  });
}

function PulsingTargetHalo({ position, onPick }) {
  const ringRef = useRef();
  const beamRef = useRef();
  // Visibility on mobile was poor — thin ring at y=0.05 with min-opacity
  // 0.45 was getting z-fought / aliased into invisibility on DPR≈1.5
  // displays. Fixes: raise off ground, disable depthWrite so it sits on
  // top of any hex/terrain mesh, fatter ring + smoother segments, much
  // higher base opacity, and add a tall vertical beam so the marker is
  // unmistakable even at very oblique mobile camera angles.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ringRef.current) {
      const phase = Math.sin(t * 2.6) * 0.5 + 0.5;
      ringRef.current.scale.setScalar(0.9 + phase * 0.12);
      ringRef.current.material.opacity = 0.7 + phase * 0.25;
    }
    if (beamRef.current) {
      beamRef.current.position.y = 0.5 + Math.sin(t * 1.8) * 0.08;
    }
  });
  return (
    <group
      position={[position[0], position[1], position[2]]}
      onClick={(e) => { e.stopPropagation(); onPick(); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = ''; }}
    >
      {/* ground ring — bright green, draws on top of hex/terrain */}
      <mesh ref={ringRef} position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <ringGeometry args={[HEX_R * 0.55, HEX_R * 0.92, 22]} />
        <meshBasicMaterial
          color="#9affc8"
          transparent
          opacity={0.85}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* vertical beam — visible from any camera angle, including low
          oblique angles common on mobile */}
      <mesh ref={beamRef} position={[0, 0.5, 0]} renderOrder={2}>
        <cylinderGeometry args={[0.10, 0.18, 0.95, 10]} />
        <meshBasicMaterial
          color="#9affc8"
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
      {/* invisible larger click hitbox for fat-finger taps on mobile */}
      <mesh position={[0, 0.4, 0]} visible={false}>
        <cylinderGeometry args={[HEX_R * 0.6, HEX_R * 0.6, 0.9, 6]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

// ────────── 햇빛소득마을 visual ──────────
// Minimal cluster marker — earlier version had a pillar, spinning sun, and
// bead crown which playtesters called "too much". Now just a faint golden
// ring on the ground (gently breathing) plus one soft warm pointLight so
// the panels themselves look a bit more lit. Achievement toast carries the
// "you did it!" feedback; the ring just marks the footprint persistently.
function SunshineVillage({ position }) {
  const ringRef = useRef();
  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const t = clock.elapsedTime;
    ringRef.current.material.opacity = 0.22 + Math.sin(t * 1.3) * 0.08;
  });
  return (
    <group position={position}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[0.85, 1.0, 24]} />
        <meshBasicMaterial color="#ffd86b" transparent opacity={0.3} />
      </mesh>
      {/* low-intensity warm light → panels read as slightly brighter than
          stand-alone solars, without flooding the scene */}
      <pointLight
        position={[0, 1.6, 0]}
        color="#ffd86b"
        intensity={1.0}
        distance={4.5}
        decay={2}
      />
    </group>
  );
}

// Map cluster centroid (q, r — may be fractional from averaging) into world
// coords by interpolating two synthetic neighbours.
function sunshineCentroidToWorld(centroid) {
  // hexToWorld is linear, so we can compute directly with the formula
  // instead of round-tripping through integer hex coordinates.
  const x = (3 / 2) * HEX_R * centroid.q;
  const z = Math.sqrt(3) * HEX_R * (centroid.r + centroid.q / 2);
  return [x, 0, z];
}

function SunshineVillageLayer({ villages }) {
  return villages.map((v) => (
    <SunshineVillage
      key={v.id}
      position={sunshineCentroidToWorld(v.centroid)}
      count={v.count}
    />
  ));
}

// Renders one DataCenterBadge per data-center in the grid.
function DataCenterBadgeLayer({ dcStatuses, buildings }) {
  const entries = [];
  for (const [k, status] of dcStatuses) {
    const b = buildings.get(k);
    if (!b) continue;
    const [x, , z] = hexToWorld(b.q, b.r);
    entries.push({ k, status, pos: [x, 0, z] });
  }
  return entries.map((e) => (
    <DataCenterBadge key={e.k} position={e.pos} status={e.status} />
  ));
}

// Top-level layer that resolves each faulted edge into its midpoint and
// wires up click → dispatch. line_fault and helicopter share this rendering.
function FaultLayer({ faultedEvents, buildings, workers, onDispatch }) {
  return faultedEvents.map((ev) => {
    if (!ev.target) return null;
    const [aKey, bKey] = ev.target.split('|');
    const ba = buildings.get(aKey);
    const bb = buildings.get(bKey);
    if (!ba || !bb) return null;
    const defA = TILE_TYPES[ba.type];
    const defB = TILE_TYPES[bb.type];
    const [ax, , az] = hexToWorld(ba.q, ba.r);
    const [bx, , bz] = hexToWorld(bb.q, bb.r);
    const ay = defA.height * 0.95;
    const by = defB.height * 0.95;
    const midpoint = [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2];
    const hasWorker = workers.some((w) => w.eventId === ev.id);
    return (
      <React.Fragment key={`fault-${ev.id}`}>
        <FaultMarker
          midpoint={midpoint}
          hasWorker={hasWorker}
          onDispatch={() => onDispatch(ev)}
        />
        {ev.type === 'helicopter' && (
          <HelicopterWreck midpoint={midpoint} hasWorker={hasWorker} />
        )}
      </React.Fragment>
    );
  });
}

// ───────────────── Scene + Lighting ─────────────────
// Linear lerp between two hex strings, returns a "#rrggbb" CSS color.
const _lerpColorA = new THREE.Color();
const _lerpColorB = new THREE.Color();
function lerpHex(aHex, bHex, t) {
  _lerpColorA.set(aHex);
  _lerpColorB.set(bHex);
  return '#' + _lerpColorA.lerp(_lerpColorB, t).getHexString();
}

// gridWarmth ∈ [0, 1] tells lighting how "alit" the city is. The atmospheric
// shift — cool twilight → warm yellow sodium glow — is what carries the
// "전력이 들어왔다" feeling. Per-hex tinting stays subtle so the ground
// itself doesn't compete for the player's attention during long play.
function DuskLighting({ stormy, gridWarmth = 0 }) {
  const k = stormy ? 0.65 : 1;
  const w = stormy ? gridWarmth * 0.55 : gridWarmth; // storms mute the bloom
  const ambientColor = lerpHex('#a8b0c8', '#ffe6a0', w);
  const ambientI    = (0.55 + 0.30 * w) * k;
  const hemiSky     = lerpHex('#aab8d8', '#ffe2a8', w);
  const hemiGround  = lerpHex('#d8884a', '#ffae5c', w);
  const hemiI       = (0.75 + 0.20 * w) * k;
  const sunColor    = stormy ? '#b8c4e0' : lerpHex('#ffc89a', '#ffd278', w);
  const sunI        = (1.25 + 0.20 * w) * k;
  const rimColor    = lerpHex('#7090d0', '#9aa0c0', w * 0.5);
  return (
    <>
      <ambientLight intensity={ambientI} color={ambientColor} />
      <hemisphereLight args={[hemiSky, hemiGround, hemiI]} />
      <directionalLight position={[7, 5, 4]} intensity={sunI} color={sunColor} />
      <directionalLight position={[-6, 4, -5]} intensity={0.45 * k} color={rimColor} />
    </>
  );
}

// Compute global grid warmth — fraction of capacity that's actually lit up.
// We weight by demand so a powered village (60 MW) counts more than a powered
// house (20 MW). Saturates at 8 effective consumer units so a small starter
// town can already feel warm.
function computeGridWarmth(buildings, powered) {
  let lit = 0;
  for (const [k, b] of buildings) {
    if (!powered[k]) continue;
    const def = TILE_TYPES[b.type];
    if (!def || !(def.demand > 0)) continue;
    lit += def.demand / 20; // 1 house = 1 unit
  }
  return Math.min(1, lit / 8);
}

function Scene({
  tiles, buildings, buildingsKeys, hovered, setHovered, onTileClick,
  sim, health, pulse, mapRadius,
  eventByBuilding, windActive,
  faultedEvents, workers, onDispatchRepair,
  landValueByKey,
  redundantEdges, onHoverEdge, onLeaveEdge, onToggleRedundant,
  dcStatuses, sunshineVillages,
  obstructionEvents, relocationMode, onObstructionMarkerClick,
  terrainByKey,
}) {
  // Stable callback identity for memoized Building components
  const handleHover = useMemo(() => (k) => setHovered(k), [setHovered]);
  const handleLeave = useMemo(() => () => setHovered(null), [setHovered]);

  // Atmosphere warms toward sodium-yellow as more demand is being met. Memo
  // depends on sim.powered identity, which only changes when the grid state
  // actually changes — not every dyn pulse.
  const gridWarmth = useMemo(
    () => computeGridWarmth(buildings, sim.powered),
    [buildings, sim.powered],
  );
  // Fog shifts toward warm amber too — sells the "evening city" haze and
  // softens the cool blue dusk so unpowered hexes don't look frozen.
  const fogColor = useMemo(() => {
    if (windActive) return lerpHex('#1e2848', '#3a3a48', gridWarmth * 0.4);
    return lerpHex('#1a2240', '#3a2d24', gridWarmth * 0.55);
  }, [windActive, gridWarmth]);

  return (
    <>
      <color attach="background" args={['#161e36']} />
      <fog attach="fog" args={[fogColor, 18, 55]} />
      <DuskLighting stormy={windActive} gridWarmth={gridWarmth} />
      <LandFloor mapRadius={mapRadius} />
      <TerrainLayer tiles={tiles} />

      <HexGrid
        tiles={tiles}
        buildings={buildings}
        buildingsKeys={buildingsKeys}
        powered={sim.powered}
        landValueByKey={landValueByKey}
        onTileClick={onTileClick}
        onHover={handleHover}
        onLeave={handleLeave}
      />
      <HoverRing hovered={hovered} />

      {[...buildings.entries()].map(([k, b]) => (
        <Building
          key={`b-${k}`}
          q={b.q} r={b.r} type={b.type}
          powered={!!sim.powered[k]}
          health={sim.powered[k] ? health : 0}
          pulse={pulse}
          eventOnMe={eventByBuilding.get(k) || null}
          onClick={() => onTileClick(b.q, b.r)}
        />
      ))}

      <PowerNetwork
        edges={sim.edges}
        buildings={buildings}
        powered={sim.powered}
        health={health}
        pulse={pulse}
        windActive={windActive}
        redundantEdges={redundantEdges}
        onHoverEdge={onHoverEdge}
        onLeaveEdge={onLeaveEdge}
        onToggleRedundant={onToggleRedundant}
      />

      <FaultLayer
        faultedEvents={faultedEvents}
        buildings={buildings}
        workers={workers}
        onDispatch={onDispatchRepair}
      />

      {dcStatuses && dcStatuses.size > 0 && (
        <DataCenterBadgeLayer dcStatuses={dcStatuses} buildings={buildings} />
      )}

      {sunshineVillages && sunshineVillages.length > 0 && (
        <SunshineVillageLayer villages={sunshineVillages} />
      )}

      {obstructionEvents && obstructionEvents.length > 0 && (
        <ObstructionLayer
          obstructions={obstructionEvents}
          buildings={buildings}
          relocationMode={relocationMode}
          onMarkerClick={onObstructionMarkerClick}
        />
      )}

      <RelocationTargets
        relocationMode={relocationMode}
        buildings={buildings}
        terrainByKey={terrainByKey}
        onPick={onTileClick}
      />

      {workers.map((w) => (
        <WorkerAvatar key={w.id} worker={w} />
      ))}

      <OrbitControls
        target={[0, 0.4, 0]}
        enablePan
        minDistance={5}
        maxDistance={50}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
    </>
  );
}

// ───────────────── Top-level component ─────────────────
export default function GridBuilder3D() {
  const [mapRadius, setMapRadius] = useState(INITIAL_RADIUS);
  const tiles = useMemo(() => generateMap(mapRadius), [mapRadius]);
  const [buildings, setBuildings] = useState(() => new Map());
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState('powerPlant');
  const [money, setMoney] = useState(INITIAL_MONEY);
  // Redundant (double-circuit) edges — Set of edgeKey strings. line_fault on
  // a redundant edge does NOT take down power; load is auto-transferred.
  const [redundantEdges, setRedundantEdges] = useState(() => new Set());

  // Fast O(1) terrain lookup by hex key — built once per map regen.
  const terrainByKey = useMemo(() => {
    const m = new Map();
    for (const t of tiles) m.set(hexKey(t.q, t.r), t.terrain || null);
    return m;
  }, [tiles]);
  const terrainLookup = useMemo(
    () => (q, r) => terrainByKey.get(hexKey(q, r)) || null,
    [terrainByKey],
  );

  // Land value per hex — recomputed when buildings change. Memoized so the
  // hex tint and hover tooltip share the same numbers.
  const landValueByKey = useMemo(() => {
    const m = new Map();
    for (const t of tiles) {
      if (t.terrain === 'mountain' || t.terrain === 'river') continue;
      m.set(hexKey(t.q, t.r), landValueAt(t.q, t.r, buildings, terrainLookup));
    }
    return m;
  }, [tiles, buildings, terrainLookup]);

  // Active random events. Each: { id, type, target, startTime, endTime }
  const [events, setEvents] = useState([]);

  // Disabled buildings (crow / lightning / wildfire targets) excluded from
  // simulate(). Wildfire disables a pylon for ~15s while the fire is active.
  const disabledKeys = useMemo(() => {
    const s = new Set();
    for (const e of events) {
      if ((e.type === 'crow' || e.type === 'lightning' || e.type === 'wildfire') && e.target) {
        s.add(e.target);
      }
    }
    return s;
  }, [events]);
  // Faulted edges — edgeKey strings — also excluded from power propagation,
  // but the wire itself stays rendered (player must see *where* the fault is).
  // Helicopter crashes drop into the same bucket as line_fault for repair
  // mechanics: clickable ⚠ marker → dispatch crew from nearest substation.
  const faultedEdges = useMemo(() => {
    const s = new Set();
    for (const e of events) {
      if ((e.type === 'line_fault' || e.type === 'helicopter') && e.target) s.add(e.target);
    }
    return s;
  }, [events]);
  const windActive = events.some((e) => e.type === 'wind');
  // Protection-coordination assumption: a transmission-line fault does NOT
  // cascade the way a naive open-circuit would. Real relays trip just the
  // faulted span and leave the surrounding network energised; in-game we
  // model that by passing `null` for disabledEdges to simulate(). The
  // fault still shows visually (FaultMarker, sparks, line tint) and still
  // costs money (upfront fee + ongoing drain on any actually-dark
  // consumers), but power keeps flowing through the rest of the grid.
  // Player feedback: previously a single line break could black-out an
  // entire radial branch, which felt unfair given protection equipment.
  const sim = useMemo(
    () => simulate(buildings, disabledKeys, null, terrainLookup, redundantEdges),
    [buildings, disabledKeys, terrainLookup, redundantEdges],
  );

  // ────── Repair worker dispatch ──────
  // workers: snapshot at dispatch time. WorkerAvatar uses useFrame to lerp
  // position from these snapshots — we never setState per frame.
  const [workers, setWorkers] = useState([]);
  const workersRef = useRef(workers);
  workersRef.current = workers;
  const workerIdRef = useRef(1);
  const completedWorkRef = useRef(new Set());

  // Active line_fault events surface to the scene so we can render markers
  // even on edges that were *previously* live but are now down.
  const faultedEvents = useMemo(
    () => events.filter(
      (e) => (e.type === 'line_fault' || e.type === 'helicopter') && e.target,
    ),
    [events],
  );

  const buildingsKeys = useMemo(() => new Set(buildings.keys()), [buildings]);

  // Mapping from building key → event affecting it (for in-scene markers)
  const eventByBuilding = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      if (e.target) m.set(e.target, e);
    }
    return m;
  }, [events]);

  // Active 지장전주 events surface to the scene so we can render markers
  // even on poles that are otherwise normal.
  const obstructionEvents = useMemo(
    () => events.filter((e) => e.type === 'pole_obstruction' && e.target),
    [events],
  );
  // Relocation mode — set when the player clicks an obstruction marker.
  // While non-null the next valid hex click moves the pole there; clicking
  // anywhere else (or the same marker again) cancels.
  const [relocationMode, setRelocationMode] = useState(null);

  // Sunshine villages — 3+ connected solar panels qualify as a 햇빛소득마을.
  // Recomputed whenever buildings change so adding/removing a panel updates
  // the cluster immediately. ref mirror gives the RAF loop O(1) access.
  const sunshineVillages = useMemo(
    () => findSunshineVillages(buildings),
    [buildings],
  );
  const sunshineVillagesRef = useRef(sunshineVillages);
  sunshineVillagesRef.current = sunshineVillages;
  // First-time-seen latch — fire the achievement toast only on a NEW village
  // ID. Persists across the run (cleared on resetAll).
  const achievedVillagesRef = useRef(new Set());

  // Achievement toast: when a brand-new village ID appears, celebrate it
  // once with a toast + one-off cash bonus. Subsequent renders with the same
  // ID are no-ops thanks to the latch.
  useEffect(() => {
    const seen = achievedVillagesRef.current;
    let bonusFired = 0;
    for (const v of sunshineVillages) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      bonusFired += SUNSHINE_ACHIEVEMENT_BONUS;
      setToast({
        msg: `☀️ 햇빛소득마을 완성! 태양광 ${v.count}기 단지 · +₩${SUNSHINE_ACHIEVEMENT_BONUS.toLocaleString()}`,
        until: performance.now() + 4200,
      });
    }
    if (bonusFired > 0) moneyRef.current += bonusFired;
  }, [sunshineVillages]);

  // Data-center status map: { dcKey → { state, re100, vpp, demandFactor, incomeBonus } }.
  // Recomputed only when buildings or grid topology actually change, not every
  // dyn pulse. The RAF loop reads this via a ref to apply VPP relief + RE100
  // income premium each frame, and the Scene reads it for floating status
  // badges above each data-center mesh.
  const dcStatuses = useMemo(() => {
    const m = new Map();
    for (const [k, b] of buildings) {
      if (b.type !== 'dataCenter') continue;
      m.set(k, dataCenterStatus(k, sim, buildings));
    }
    return m;
  }, [buildings, sim]);
  const dcStatusesRef = useRef(dcStatuses);
  dcStatusesRef.current = dcStatuses;

  // Dynamics state — re-rendered ~6 times/sec
  const [dyn, setDyn] = useState({
    t: 0,
    mult: 1,
    effDemand: 0,
    freq: NOMINAL_FREQ,
    health: 1,
    score: 0,
    pulse: 1,
    money: INITIAL_MONEY,
  });
  const [toast, setToast] = useState(null);

  const simRef = useRef(sim);
  simRef.current = sim;
  const windRef = useRef(windActive);
  windRef.current = windActive;
  const buildingsRef = useRef(buildings);
  buildingsRef.current = buildings;
  const scoreRef = useRef(0);
  const moneyRef = useRef(INITIAL_MONEY);
  const radiusRef = useRef(mapRadius);
  radiusRef.current = mapRadius;
  const eventsRef = useRef(events);
  eventsRef.current = events;
  // ────── Crisis + leaderboard refs ──────
  // playtimeRef counts seconds since the FIRST building was placed — not
  // since the page mounted. runStartedRef gates the increment so a player
  // can sit on the menu / read the advisor without burning rank points.
  // Reset on resetAll. crisisWarnedRef is a one-shot latch for the
  // "철거로 회수하세요" toast — re-armed once money recovers past +200.
  const playtimeRef = useRef(0);
  const runStartedRef = useRef(false);
  const crisisWarnedRef = useRef(false);
  // Combo timer — consecutive seconds the grid has stayed inside the safe
  // frequency band since the run began. Resets the instant the freq deviates,
  // which makes investing in resilience (이중화 · ESS · 환상망) cash out as
  // sustained bonus income rather than just "preventing damage".
  const comboTimerRef = useRef(0);
  // Per-ESS state of charge — { stored: MWh, capacity: MWh }. Lives in a ref
  // so applyEssDynamics() can mutate without rerendering 60×/s.
  const essStateRef = useRef(new Map());
  // Two-step demolish arming. A same-type click on an existing building only
  // demolishes if it follows another click on the SAME tile within the
  // window. Prevents accidental teardown while panning the camera.
  const pendingSellRef = useRef({ key: null, time: 0 });
  const SELL_CONFIRM_WINDOW_MS = 1500;
  // Best run loaded once on mount from localStorage; we only WRITE on reset
  // (= end of a run) so we don't thrash storage every frame.
  const [leaderboard, setLeaderboard] = useState(() => {
    try {
      const raw = localStorage.getItem(LEADERBOARD_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (_) { /* corrupted JSON — start fresh */ }
    return [];
  });
  // Frequency low-pass: real grids have rotor inertia so freq doesn't snap.
  // freqRef.current is the *displayed* freq (eased); each frame it drifts
  // toward the steady-state target computed from supply/demand.
  const freqRef = useRef(NOMINAL_FREQ);
  const freqTargetRef = useRef(NOMINAL_FREQ);
  const redundantEdgesRef = useRef(redundantEdges);
  redundantEdgesRef.current = redundantEdges;

  // Main RAF loop — dynamics, expansion, event spawning + expiry
  useEffect(() => {
    let raf;
    let last = performance.now();
    let t = 0;
    let lastUiPush = 0;
    let lastEventCheck = performance.now() + 8000; // grace period before first event
    let nextEventDelay = 18000 + Math.random() * 14000;

    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      // Physics time (t) always advances so demand/renewable cycles stay
      // continuous, but rank-scoring playtime only ticks after the run
      // actually begins (first building placed).
      if (runStartedRef.current) {
        playtimeRef.current += dt;
      }

      const s = simRef.current;
      const mult = demandMultiplier(t);
      // Apply VPP relief: each operational data-center with a smart-grid
      // neighbourhood shifts 30 % of its load off the grid (load-shifting to
      // local solar/wind/ESS). Radial/offline DCs contribute their full
      // nominal demand — they're still drawing power, just inefficiently.
      let vppRelief = 0;
      for (const [, status] of dcStatusesRef.current) {
        if (status.state === 'operational' && status.vpp) {
          vppRelief += TILE_TYPES.dataCenter.demand * (1 - status.demandFactor);
        }
      }
      const effDemand = Math.max(0, s.totals.demand - vppRelief) * mult;
      let supply = s.totals.supply;
      if (windRef.current) supply *= WIND_SUPPLY_MULT;

      // ────── Smart-grid pass ──────
      // s.totals.supply summed every plant at nameplate. For renewables that's
      // optimistic — actual output drifts with sun/wind. We subtract their
      // nameplate contribution and re-add the modulated value.
      let solarNameplate = 0;
      let windNameplate = 0;
      const essKeys = [];
      for (const [bk, b] of buildingsRef.current) {
        if (!s.powered[bk]) continue;
        if (b.type === 'solar') solarNameplate += TILE_TYPES.solar.supply;
        else if (b.type === 'wind') windNameplate += TILE_TYPES.wind.supply;
        else if (b.type === 'ess') essKeys.push(bk);
      }
      if (solarNameplate > 0 || windNameplate > 0) {
        supply -= solarNameplate + windNameplate;
        const solarActual = solarNameplate * renewableFactor('solar', t);
        const windActual = windNameplate * renewableFactor('wind', t);
        // Smart inverters curtail when supply already outruns demand.
        const trim = curtailFactor(supply + solarActual + windActual, effDemand);
        supply += (solarActual + windActual) * trim;
      }
      // ESS auto-charge/discharge nudges supply toward demand. Run AFTER
      // renewable curtailment so curtailment makes the first cut and ESS
      // soaks up the residual.
      if (essKeys.length > 0) {
        const imbalance = supply - effDemand;
        const essNet = applyEssDynamics(essKeys, essStateRef.current, imbalance, dt);
        supply += essNet;
      }
      // Steady-state target — what the freq would settle to if conditions held.
      const targetFreq = computeFrequency(supply, effDemand);
      // Low-pass toward target with time constant FREQ_SMOOTH_TAU. The visible
      // freq lags the math, which is more realistic (rotor inertia) AND gives
      // the player a moment to react before the gauge crosses a band.
      // Defensive snap: with literally zero buildings the grid has no inertia
      // to bleed off — pin to NOMINAL immediately so the gauge doesn't
      // linger at 62 Hz after the player wipes everything (playtesters
      // reported "다 지웠는데 주파수가 계속 떠 있어요").
      const lpKfreq = 1 - Math.exp(-dt / FREQ_SMOOTH_TAU);
      if (buildingsRef.current.size === 0) {
        freqRef.current = NOMINAL_FREQ;
      } else {
        freqRef.current += (targetFreq - freqRef.current) * lpKfreq;
      }
      freqTargetRef.current = targetFreq;
      const freq = freqRef.current;
      const health = gridHealthFromFreq(freq);
      const pulse = 0.9 + 0.1 * Math.sin((t * 2 * Math.PI) / 2.6);

      // ────── Outage cost ──────
      // Every active line_fault drains money proportional to the consumer
      // demand that's currently blacked out because of it. Rationale: 정전
      // = 한전이 보상금/위약금을 무는 사고 상황이다. We use a per-frame drain
      // so the player FEELS the bleed (HUD ticks down) until repair completes.
      // Drain stops once we hit MONEY_FLOOR — the player can still recover
      // by demolishing infrastructure (60% refund) or by earning from any
      // still-powered branch.
      const activeFaults = eventsRef.current.filter((e) => e.type === 'line_fault');
      if (activeFaults.length > 0 && moneyRef.current > MONEY_FLOOR) {
        let unpoweredDemand = 0;
        for (const [bk, b] of buildingsRef.current) {
          const def = TILE_TYPES[b.type];
          if (!def || (def.demand || 0) <= 0) continue;
          if (s.powered[bk]) continue; // only blacked-out consumers
          unpoweredDemand += def.demand;
        }
        if (unpoweredDemand > 0) {
          // ₩ per MW per second — modest enough that the player can recover.
          // 20 MW house blacked out for 5s = ₩200 drain.
          const drain = unpoweredDemand * 2.0 * dt;
          moneyRef.current = Math.max(MONEY_FLOOR, moneyRef.current - drain);
        }
      }

      // One-shot crisis warning the moment money first dips into the red,
      // so the player understands the rescue path before they hit the floor.
      if (moneyRef.current < MONEY_WARN_THRESHOLD && !crisisWarnedRef.current) {
        crisisWarnedRef.current = true;
        setToast({
          msg: `💸 자금 부족! 같은 타입으로 클릭해 설비를 철거하면 ${Math.round(DEMOLISH_REFUND * 100)}% 환불 — 정리해서 살아남으세요`,
          until: now + 4500,
        });
      } else if (moneyRef.current > MONEY_WARN_THRESHOLD + 200) {
        // Reset the latch once the player has comfortably recovered, so a
        // future crisis re-triggers the warning.
        crisisWarnedRef.current = false;
      }

      // Combo tracking — only while the run is live. Stable freq builds combo,
      // any excursion (caused by a fault, supply/demand imbalance, etc.) snaps
      // it back to zero. Capped at 2 minutes worth so the bonus has a ceiling.
      const stable = Math.abs(freq - NOMINAL_FREQ) <= SAFE_BAND;
      if (runStartedRef.current) {
        if (stable) comboTimerRef.current += dt;
        else        comboTimerRef.current = 0;
      }
      const comboBonus = Math.min(1.0, comboTimerRef.current / 120);
      const incomeMult = 1 + comboBonus;

      if (stable && supply > 0) {
        // Income should track ACTUAL delivered power — only powered consumers
        // count, weighted by NIMBY. Data centres get two extra modifiers:
        //   • VPP-active DCs contribute reduced demand (matches the effDemand
        //     calc above, so freq and income use the same number)
        //   • RE100-certified DCs pay a +20 % premium per delivered MWh
        //   • Radial DCs (no environment loop) earn only 30 % — penalty for a
        //     hyperscaler running on a single feeder.
        let deliveredDemand = 0;
        const bMap = buildingsRef.current;
        for (const [bk, b] of bMap) {
          const def = TILE_TYPES[b.type];
          if (!def || (def.demand || 0) <= 0) continue;
          if (!s.powered[bk]) continue;
          let buildingDemand = def.demand;
          let bonus = 1;
          if (b.type === 'dataCenter') {
            const status = dcStatusesRef.current.get(bk);
            if (status) {
              buildingDemand *= status.demandFactor;
              bonus = status.incomeBonus;
            }
          }
          deliveredDemand += buildingDemand * nimbyMultiplier(b.q, b.r, bMap) * bonus;
        }
        if (deliveredDemand > 0) {
          const dMWh = (deliveredDemand * mult * dt) / 60;
          scoreRef.current += dMWh;
          moneyRef.current += dMWh * INCOME_PER_MWH * incomeMult;
        }
        // 햇빛소득마을 ongoing payout — scales with total panels across all
        // villages, gated on each village having ≥half its panels powered
        // (otherwise the cluster isn't really "operating").
        const villages = sunshineVillagesRef.current;
        if (villages.length > 0) {
          let panelsOperating = 0;
          for (const v of villages) {
            let lit = 0;
            for (const mk of v.members) if (s.powered[mk]) lit++;
            if (lit * 2 >= v.count) panelsOperating += v.count;
          }
          if (panelsOperating > 0) {
            moneyRef.current += panelsOperating * SUNSHINE_INCOME_PER_PANEL_PER_SEC * dt;
          }
        }
      }

      const targetRadius = radiusForScore(scoreRef.current);
      if (targetRadius > radiusRef.current) {
        const newR = radiusRef.current + 1;
        radiusRef.current = newR;
        setMapRadius(newR);
        setToast({
          msg: newR >= MAX_RADIUS ? `🌟 최대 영역 도달! (r${newR})` : `🌱 새 영토 확장! (r${newR})`,
          until: now + 3200,
        });
      }

      // Expire events — check without allocating a new array per frame.
      let hasExpired = false;
      for (let i = 0; i < eventsRef.current.length; i++) {
        if (eventsRef.current[i].endTime <= now) { hasExpired = true; break; }
      }
      if (hasExpired) {
        // 지장전주 timeout — if a pole_obstruction expires without being
        // relocated, the pole is silently demolished (the construction
        // crew took it down anyway) AND the player eats a steep penalty
        // for not handling the request.
        const expiredObstructions = eventsRef.current.filter(
          (e) => e.type === 'pole_obstruction' && e.endTime <= now,
        );
        if (expiredObstructions.length > 0) {
          const polesToRemove = new Set();
          let totalPenalty = 0;
          for (const e of expiredObstructions) {
            if (e.target && buildingsRef.current.has(e.target)) {
              polesToRemove.add(e.target);
              totalPenalty += OBSTRUCTION_TIMEOUT_PENALTY;
            }
          }
          if (polesToRemove.size > 0) {
            setBuildings((prev) => {
              const next = new Map(prev);
              for (const k of polesToRemove) next.delete(k);
              return next;
            });
            moneyRef.current = Math.max(MONEY_FLOOR, moneyRef.current - totalPenalty);
            setToast({
              msg: `🚧 지장전주 미이설 ${polesToRemove.size}건 — 전신주 강제 철거 · −₩${totalPenalty.toLocaleString()}`,
              until: now + 3600,
            });
          }
        }
        setEvents((prev) => prev.filter((e) => e.endTime > now));
      }

      // Worker lifecycle — when the work phase finishes, restore the line
      // (drop the line_fault event); when the return phase finishes, drop
      // the worker. completedWorkRef guards against firing twice.
      const ws = workersRef.current;
      let workersDone = false;
      const eventsToRestore = [];
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i];
        const elapsed = (now - w.dispatchTime) / 1000;
        if (elapsed >= REPAIR_WALK_SEC + REPAIR_WORK_SEC
            && !completedWorkRef.current.has(w.id)) {
          completedWorkRef.current.add(w.id);
          eventsToRestore.push(w.eventId);
        }
        if (elapsed >= REPAIR_TOTAL_SEC) workersDone = true;
      }
      if (eventsToRestore.length > 0) {
        setEvents((prev) => prev.filter((e) => !eventsToRestore.includes(e.id)));
      }
      if (workersDone) {
        setWorkers((prev) =>
          prev.filter((w) => (now - w.dispatchTime) / 1000 < REPAIR_TOTAL_SEC),
        );
      }

      // Spawn new event — pass current edges so line_fault has somewhere to
      // land. Difficulty ramps the spawn rate: every minute the run survives,
      // events become ~10 % more frequent (compound), capped at 5×. So a
      // 17-minute survivor sees fault storms roughly every 5–8 s, while a
      // fresh run gets the original ~30 s breather.
      if (now - lastEventCheck > nextEventDelay) {
        lastEventCheck = now;
        const difficulty = Math.min(
          5,
          Math.pow(1.10, playtimeRef.current / 60),
        );
        nextEventDelay = (22000 + Math.random() * 18000) / difficulty;
        const pick = pickRandomEvent(buildingsRef.current, simRef.current.edges);
        if (pick) {
          // Only one weather event (wind or snow) at a time.
          const weatherAlready = eventsRef.current.some(
            (e) => e.type === 'wind' || e.type === 'snow',
          );
          const isWeather = pick.type === 'wind' || pick.type === 'snow';
          if (!(isWeather && weatherAlready)) {
            const ev = {
              id: nextEventId(),
              type: pick.type,
              target: pick.target,
              startTime: now,
              endTime: now + pick.duration * 1000,
            };
            // 지장전주 — attach a real-world cause so the marker can
            // display the right icon and the relocation payout differs.
            if (pick.type === 'pole_obstruction') {
              ev.obstructionKind = OBSTRUCTION_KINDS[Math.floor(Math.random() * OBSTRUCTION_KINDS.length)];
            }
            setEvents((prev) => [...prev, ev]);
            const def = EVENT_DEFS[pick.type];
            // If the fault landed on a redundant edge, surface 부하절체.
            const onRedundant = pick.type === 'line_fault'
              && pick.target
              && redundantEdgesRef.current.has(pick.target);
            // Upfront incident-handling fee for a real (non-redundant) outage.
            // Bigger than the per-second drain so the moment of failure stings.
            let upfront = 0;
            if (pick.type === 'line_fault' && !onRedundant) upfront = 200;
            else if (pick.type === 'helicopter' && !onRedundant) upfront = 500; // headline incident
            else if (pick.type === 'lightning') upfront = 350;     // bigger 사고
            else if (pick.type === 'wildfire') upfront = 300;      // pylon foul-out
            else if (pick.type === 'crow') upfront = 80;            // nuisance
            if (upfront > 0) {
              moneyRef.current = Math.max(MONEY_FLOOR, moneyRef.current - upfront);
            }
            const msg = onRedundant
              ? `${def.emoji} ${def.label} — 🔄 부하절체 완료 (무중단)`
              : upfront > 0
                ? `${def.emoji} ${def.label} 발생! 사고 처리비 −₩${upfront}`
                : `${def.emoji} ${def.label} 발생!`;
            setToast({ msg, until: now + 2800 });
          }
        }
      }

      // Throttle UI re-render to ~6.5 Hz. The visible pulse breathing is
      // still smooth at this rate (period is 2.6s) and dynamics math runs
      // every frame internally regardless.
      if (now - lastUiPush > 150) {
        lastUiPush = now;
        setDyn({
          t, mult, effDemand,
          freq, targetFreq: freqTargetRef.current,
          health, score: scoreRef.current, pulse,
          money: moneyRef.current,
          playtime: playtimeRef.current,
          rankScore: Math.max(
            0,
            Math.floor(moneyRef.current) + Math.floor(playtimeRef.current * SCORE_PER_SECOND),
          ),
          difficulty: Math.min(5, Math.pow(1.10, playtimeRef.current / 60)),
          combo: comboTimerRef.current,
          comboMult: incomeMult,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const remain = Math.max(0, toast.until - performance.now());
    const tid = setTimeout(() => setToast(null), remain);
    return () => clearTimeout(tid);
  }, [toast]);

  const onTileClick = (q, r) => {
    const k = hexKey(q, r);

    // ────── Relocation mode: target hex selected ──────
    // If we're in pole-relocation mode, the next valid tile click moves the
    // obstructed pole there. Validation mirrors RelocationTargets so the
    // player sees green halos exactly where they can click.
    if (relocationMode) {
      const { eventId, fromKey, fromQ, fromR, obstructionKind } = relocationMode;
      const d = hexDistance(fromQ, fromR, q, r);
      if (d === 0) {
        // Clicking the source pole cancels the relocation.
        setRelocationMode(null);
        setToast({ msg: '🚧 이설 취소', until: performance.now() + 1400 });
        return;
      }
      const target = buildings.get(k);
      const targetTerrain = terrainByKey.get(k) || null;
      const valid = d <= OBSTRUCTION_RELOCATE_RANGE
        && !target
        && canBuildOn(targetTerrain, 'utilityPole');
      if (!valid) {
        setToast({
          msg: '🚧 이설 가능 위치(녹색 후광)를 선택하세요',
          until: performance.now() + 1800,
        });
        return;
      }
      // Move the pole + dismiss the event + apply per-cause payout.
      const info = OBSTRUCTION_INFO[obstructionKind] || OBSTRUCTION_INFO.private_land;
      setBuildings((prev) => {
        const next = new Map(prev);
        const old = next.get(fromKey);
        if (!old) return prev;
        next.delete(fromKey);
        next.set(k, { ...old, q, r });
        return next;
      });
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      moneyRef.current = info.reward >= 0
        ? moneyRef.current + info.reward
        : Math.max(MONEY_FLOOR, moneyRef.current + info.reward);
      setRelocationMode(null);
      const sign = info.reward >= 0 ? '+' : '−';
      setToast({
        msg: `${info.emoji} ${info.label} 이설 완료 · ${sign}₩${Math.abs(info.reward).toLocaleString()}`,
        until: performance.now() + 2400,
      });
      return;
    }

    // Click-to-dismiss for building-targeted events that the player can
    // physically respond to: shoo away a crow, drop a fire crew on a wildfire.
    // (Lightning is instant — nothing to click on. Helicopter is line-side, so
    // it uses the FaultMarker dispatch system.)
    const ev = eventsRef.current.find(
      (e) => e.target === k && (e.type === 'crow' || e.type === 'wildfire'),
    );
    if (ev) {
      setEvents((prev) => prev.filter((e) => e.id !== ev.id));
      const msg = ev.type === 'crow'
        ? '🐦 푸드덕! 까마귀를 쫓았다'
        : '🚒 산불 진화 완료';
      setToast({ msg, until: performance.now() + 1800 });
      return;
    }

    const existing = buildings.get(k);
    // Same-type click on an existing building = demolish + 60% refund —
    // BUT requires a second confirming click on the same tile within
    // SELL_CONFIRM_WINDOW_MS. Without this, dragging the camera over an
    // existing building (which counts as a click on touch devices) would
    // silently demolish it, which was happening on mobile.
    if (existing && existing.type === selected) {
      const now = performance.now();
      const pending = pendingSellRef.current;
      const isConfirm = pending.key === k && (now - pending.time) < SELL_CONFIRM_WINDOW_MS;
      if (!isConfirm) {
        // First click — arm the sell, surface a "tap again" toast so the
        // player understands the new behaviour.
        pendingSellRef.current = { key: k, time: now };
        const def = TILE_TYPES[existing.type];
        const refundPreview = Math.floor((existing.cost || 0) * DEMOLISH_REFUND);
        setToast({
          msg: `🔻 한 번 더 ${def?.label || '설비'} 클릭 시 매각 (환불 ₩${refundPreview.toLocaleString()})`,
          until: now + SELL_CONFIRM_WINDOW_MS,
        });
        return;
      }
      // Second click within the window — execute the demolition.
      const refund = Math.floor((existing.cost || 0) * DEMOLISH_REFUND);
      if (refund > 0) moneyRef.current += refund;
      setBuildings((prev) => {
        const next = new Map(prev);
        next.delete(k);
        return next;
      });
      pendingSellRef.current = { key: null, time: 0 };
      const def = TILE_TYPES[existing.type];
      setToast({
        msg: refund > 0
          ? `🔻 ${def?.label || '설비'} 철거 · 환불 ₩${refund.toLocaleString()}`
          : `🔻 ${def?.label || '설비'} 철거`,
        until: performance.now() + 1600,
      });
      return;
    }

    // Different-type click on an existing tile is BLOCKED — the player has
    // to explicitly demolish first (click the same type as the existing
    // building to remove). This stops accidental free replacements during
    // panic clicking and forces deliberate edits.
    if (existing) {
      const existingDef = TILE_TYPES[existing.type];
      setToast({
        msg: `🚫 이미 ${existingDef?.label || '설비'}가 있어요 — 먼저 같은 타입으로 클릭해 철거하세요`,
        until: performance.now() + 2400,
      });
      return;
    }

    const terrain = terrainByKey.get(k) || null;
    if (!canBuildOn(terrain, selected)) {
      const info = TERRAIN_INFO[terrain];
      const msg = terrain === 'forest'
        ? '🌲 숲에는 전신주/송전탑/변전소/가정/마을만 가능'
        : `${info?.emoji || '🚫'} ${info?.label || '여기'}에는 건설 불가`;
      setToast({ msg, until: performance.now() + 1800 });
      return;
    }
    const lv = landValueByKey.get(k) ?? 50;
    const cost = buildCost(selected, lv);
    // No affordability gate — the player can build into the red. The ranking
    // formula (₩ + 시간 보너스) makes a deeply negative finish a low score
    // rather than a game-over, so building anyway is a legitimate strategy.
    moneyRef.current -= cost;
    if (moneyRef.current < 0) {
      setToast({
        msg: `💸 −₩${cost.toLocaleString()} · 적자 건설 (보유 ₩${Math.floor(moneyRef.current).toLocaleString()})`,
        until: performance.now() + 1800,
      });
    }

    // First successful placement starts the run clock. Idempotent — setting
    // true on later builds is a no-op.
    runStartedRef.current = true;

    // Store the actual cost paid so demolition can refund the right amount
    // even if land value (and hence current quoted cost) has changed since.
    setBuildings((prev) => {
      const next = new Map(prev);
      next.set(k, { q, r, type: selected, cost });
      return next;
    });
  };

  const resetAll = () => {
    // First, commit the current run to the leaderboard if it's notable.
    // We require ≥30s of playtime so accidental resets don't pollute the
    // board with ₩1200 / 0s entries.
    const t = playtimeRef.current;
    const m = moneyRef.current;
    const rank = Math.max(0, Math.floor(m) + Math.floor(t * SCORE_PER_SECOND));
    if (t >= 30 && rank > 0) {
      const entry = {
        score: rank,
        money: Math.floor(m),
        playtime: Math.floor(t),
        mwh: Number(scoreRef.current.toFixed(2)),
        date: Date.now(),
      };
      const next = [...leaderboard, entry]
        .sort((a, b) => b.score - a.score)
        .slice(0, LEADERBOARD_SIZE);
      const madeIt = next.includes(entry);
      try { localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(next)); } catch (_) {}
      setLeaderboard(next);
      if (madeIt) {
        setToast({
          msg: `🏆 랭킹 진입! ${rank.toLocaleString()}점 (${Math.floor(t / 60)}분 ${Math.floor(t % 60)}초)`,
          until: performance.now() + 4500,
        });
      }
    }
    setBuildings(new Map());
    setWorkers([]);
    setEvents([]);
    setRedundantEdges(new Set());
    completedWorkRef.current = new Set();
    crisisWarnedRef.current = false;
    playtimeRef.current = 0;
    runStartedRef.current = false;
    comboTimerRef.current = 0;
    scoreRef.current = 0;
    moneyRef.current = INITIAL_MONEY;
    freqRef.current = NOMINAL_FREQ;
    radiusRef.current = INITIAL_RADIUS;
    essStateRef.current = new Map();
    achievedVillagesRef.current = new Set();
    setRelocationMode(null);
    setMapRadius(INITIAL_RADIUS);
  };

  // Toggle dual-circuit (N-1 redundancy) on an existing edge. Charges
  // edgeUpgradeCost; refunds REDUNDANCY_REFUND × cost when removed.
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const onHoverEdge = (aKey, bKey) => {
    const ba = buildings.get(aKey);
    const bb = buildings.get(bKey);
    if (!ba || !bb) return;
    const d = hexDistance(ba.q, ba.r, bb.q, bb.r);
    const cost = edgeUpgradeCost(ba.type, bb.type, d);
    setHoveredEdge({ aKey, bKey, cost, redundant: redundantEdges.has(edgeKey(aKey, bKey)) });
  };
  const onLeaveEdge = () => setHoveredEdge(null);
  const onToggleRedundant = (aKey, bKey) => {
    const ek = edgeKey(aKey, bKey);
    const ba = buildings.get(aKey);
    const bb = buildings.get(bKey);
    if (!ba || !bb) return;
    const d = hexDistance(ba.q, ba.r, bb.q, bb.r);
    const cost = edgeUpgradeCost(ba.type, bb.type, d);
    if (redundantEdges.has(ek)) {
      const refund = Math.floor(cost * REDUNDANCY_REFUND);
      moneyRef.current += refund;
      setRedundantEdges((prev) => {
        const next = new Set(prev);
        next.delete(ek);
        return next;
      });
      setToast({ msg: `🔻 이중화 해제 · 환불 ₩${refund.toLocaleString()}`, until: performance.now() + 1800 });
    } else {
      // No affordability gate — same rule as building placement: 적자 진행 가능.
      moneyRef.current -= cost;
      setRedundantEdges((prev) => {
        const next = new Set(prev);
        next.add(ek);
        return next;
      });
      const suffix = moneyRef.current < 0
        ? ` (적자 ₩${Math.floor(moneyRef.current).toLocaleString()})`
        : '';
      setToast({
        msg: `⚡ 이중화 완료 · ₩${cost.toLocaleString()}${suffix}`,
        until: performance.now() + 1800,
      });
    }
  };

  // Tutorial-driven event spawn. Used by the interactive coach so each
  // fault-response step actually demonstrates its incident. Returns true
  // on success, false if there's no valid target (e.g., player skipped
  // ahead before placing a pylon for lightning). The event uses the same
  // event-id pool + state shape as the random spawner so the rest of the
  // game (drain, advisor, repair flow) treats it identically.
  const spawnTutorialEvent = (type) => {
    const buildings = buildingsRef.current;
    const sim = simRef.current;
    const def = EVENT_DEFS[type];
    if (!def) return false;
    let target = null;
    const extras = {};
    if (type === 'crow') {
      const pool = [...buildings.entries()].filter(
        ([, b]) => b.type === 'pylon' || b.type === 'utilityPole',
      );
      if (pool.length === 0) return false;
      target = pool[Math.floor(Math.random() * pool.length)][0];
    } else if (type === 'wildfire' || type === 'lightning') {
      const pool = [...buildings.entries()].filter(([, b]) => b.type === 'pylon');
      if (pool.length === 0) return false;
      target = pool[Math.floor(Math.random() * pool.length)][0];
    } else if (type === 'line_fault') {
      if (!sim.edges || sim.edges.length === 0) return false;
      const [a, b] = sim.edges[Math.floor(Math.random() * sim.edges.length)];
      target = edgeKey(a, b);
    } else if (type === 'helicopter') {
      const pylonEdges = (sim.edges || []).filter(
        ([a, b]) => buildings.get(a)?.type === 'pylon' && buildings.get(b)?.type === 'pylon',
      );
      const pool = pylonEdges.length > 0 ? pylonEdges : (sim.edges || []);
      if (pool.length === 0) return false;
      const [a, b] = pool[Math.floor(Math.random() * pool.length)];
      target = edgeKey(a, b);
    } else if (type === 'pole_obstruction') {
      const pool = [...buildings.entries()].filter(([, b]) => b.type === 'utilityPole');
      if (pool.length === 0) return false;
      target = pool[Math.floor(Math.random() * pool.length)][0];
      extras.obstructionKind = OBSTRUCTION_KINDS[Math.floor(Math.random() * OBSTRUCTION_KINDS.length)];
    } else {
      return false;
    }
    const now = performance.now();
    const ev = {
      id: nextEventId(),
      type,
      target,
      startTime: now,
      endTime: now + def.duration * 1000,
      ...extras,
    };
    setEvents((prev) => [...prev, ev]);
    setToast({
      msg: `${def.emoji} 튜토리얼 — ${def.label} 시연`,
      until: now + 2400,
    });
    return true;
  };

  // Enter relocation mode when the player clicks a 지장전주 marker. The
  // pole stays where it is until the player picks a destination hex (or
  // clicks the same pole again to cancel).
  const onObstructionMarkerClick = (ev) => {
    if (!ev || ev.type !== 'pole_obstruction' || !ev.target) return;
    const b = buildingsRef.current.get(ev.target);
    if (!b) return;
    setRelocationMode({
      eventId: ev.id,
      fromKey: ev.target,
      fromQ: b.q,
      fromR: b.r,
      obstructionKind: ev.obstructionKind || 'private_land',
    });
    const info = OBSTRUCTION_INFO[ev.obstructionKind || 'private_land'];
    setToast({
      msg: `🚧 ${info.label} — 녹색 후광 위치 클릭해 이설`,
      until: performance.now() + 2600,
    });
  };

  // Dispatch a repair crew from the nearest substation to a faulted line.
  // No-op if no substation exists, or the fault already has a crew assigned.
  const dispatchRepair = (ev) => {
    if (!ev || !ev.target) return;
    if (ev.type !== 'line_fault' && ev.type !== 'helicopter') return;
    if (workersRef.current.some((w) => w.eventId === ev.id)) return;

    const [aKey, bKey] = ev.target.split('|');
    const ba = buildingsRef.current.get(aKey);
    const bb = buildingsRef.current.get(bKey);
    if (!ba || !bb) return;
    const [ax, , az] = hexToWorld(ba.q, ba.r);
    const [bx, , bz] = hexToWorld(bb.q, bb.r);
    const faultMid = [(ax + bx) / 2, (az + bz) / 2];

    // Nearest substation = depot. Hex-distance via gridLogic so the choice
    // matches the player's mental model of "이 변전소가 더 가까워 보인다".
    let nearestKey = null;
    let nearestPos = null;
    let nearestD = Infinity;
    for (const [k, b] of buildingsRef.current.entries()) {
      if (b.type !== 'substation') continue;
      const [sx, , sz] = hexToWorld(b.q, b.r);
      const d = Math.hypot(sx - faultMid[0], sz - faultMid[1]);
      if (d < nearestD) {
        nearestD = d;
        nearestKey = k;
        nearestPos = [sx, sz];
      }
    }
    if (!nearestKey) {
      setToast({
        msg: '🛠 변전소가 있어야 복구반을 보낼 수 있어요',
        until: performance.now() + 2400,
      });
      return;
    }

    const worker = {
      id: workerIdRef.current++,
      eventId: ev.id,
      edgeId: ev.target,
      depotKey: nearestKey,
      depotPos: nearestPos,
      faultMid,
      dispatchTime: performance.now(),
    };
    setWorkers((prev) => [...prev, worker]);
    setToast({
      msg: '🔧 복구반 출동! 휴전 작업 진행',
      until: performance.now() + 2200,
    });
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [10, 14, 14], fov: 35 }}
        // Mobile: DPR pinned at 1, no MSAA, 30 fps cap → measurably cooler
        // device. Desktop: DPR up to 2 for retina sharpness, MSAA on,
        // unthrottled — the desktop GPU eats this for breakfast.
        dpr={IS_MOBILE ? MOBILE_DPR : DESKTOP_DPR}
        flat
        frameloop="always"
        // MSAA on both — at DPR 1.5 on mobile, the fragment cost stays
        // manageable while edges/wires read crisply. Earlier "AA off on
        // mobile" was the wrong knob to tune for thermals; DPR cap was.
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
      >
        <Scene
          tiles={tiles}
          buildings={buildings}
          buildingsKeys={buildingsKeys}
          hovered={hovered}
          setHovered={setHovered}
          onTileClick={onTileClick}
          sim={sim}
          health={dyn.health}
          pulse={dyn.pulse}
          mapRadius={mapRadius}
          eventByBuilding={eventByBuilding}
          windActive={windActive}
          faultedEvents={faultedEvents}
          workers={workers}
          onDispatchRepair={dispatchRepair}
          landValueByKey={landValueByKey}
          redundantEdges={redundantEdges}
          onHoverEdge={onHoverEdge}
          onLeaveEdge={onLeaveEdge}
          onToggleRedundant={onToggleRedundant}
          dcStatuses={dcStatuses}
          sunshineVillages={sunshineVillages}
          obstructionEvents={obstructionEvents}
          relocationMode={relocationMode}
          onObstructionMarkerClick={onObstructionMarkerClick}
          terrainByKey={terrainByKey}
        />
      </Canvas>
      <UI
        selected={selected}
        setSelected={setSelected}
        sim={sim}
        dyn={dyn}
        mapRadius={mapRadius}
        toast={toast}
        events={events}
        windActive={windActive}
        onReset={resetAll}
        count={buildings.size}
        hovered={hovered}
        terrainByKey={terrainByKey}
        landValueByKey={landValueByKey}
        buildings={buildings}
        hoveredEdge={hoveredEdge}
        redundantCount={redundantEdges.size}
        leaderboard={leaderboard}
        workers={workers}
        sunshineVillages={sunshineVillages}
        onSpawnTutorialEvent={spawnTutorialEvent}
      />
    </div>
  );
}

// ───────────────── UI / HUD ─────────────────

// Small panel that follows the cursor logically (anchored bottom-left of HUD)
// showing the hovered hex's terrain, land value, and the cost of placing the
// currently selected building. This is how the player learns the economy:
// move the mouse around, see ₩ change.
function HoverTooltip({ info, selected }) {
  const { terrain, lv, existing, buildable, cost } = info;
  const def = TILE_TYPES[selected];
  const terrainInfo = terrain ? TERRAIN_INFO[terrain] : null;
  const lvLabel = lv == null
    ? null
    : lv >= 80 ? '도심 (비쌈)'
    : lv >= 65 ? '주거지'
    : lv >= 40 ? '평범'
    : lv >= 25 ? '외곽 (쌈)'
    : '오지';
  const lvColor = lv == null
    ? '#aac'
    : lv >= 70 ? '#ff9090'
    : lv >= 55 ? '#ffd886'
    : lv >= 40 ? '#a0e8b8'
    : '#7be6ff';

  return (
    <div
      style={{
        position: 'absolute', left: 12, bottom: 96,
        background: 'rgba(12,16,32,0.92)',
        border: '1px solid #2a3a5e',
        borderRadius: 8, padding: '10px 12px',
        color: '#e6f7ff',
        fontFamily: 'system-ui', fontSize: 12,
        minWidth: 200, lineHeight: 1.5,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: 1, marginBottom: 4 }}>HOVER</div>
      {terrainInfo ? (
        <div style={{ color: '#ffd886', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          {terrainInfo.emoji} {terrainInfo.label}
        </div>
      ) : (
        <div style={{ color: '#a8d0ff', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          🟫 평지
        </div>
      )}
      {lv != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ opacity: 0.7 }}>땅값</span>
          <span style={{ color: lvColor, fontFamily: 'monospace', fontWeight: 600 }}>
            {lv} · {lvLabel}
          </span>
        </div>
      )}
      {existing ? (
        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.75 }}>
          이미 <b style={{ color: TILE_TYPES[existing.type].color }}>
            {TILE_TYPES[existing.type].label}
          </b> 있음 · 같은 종류로 클릭하면 제거
        </div>
      ) : !buildable ? (
        <div style={{ marginTop: 4, color: '#ff8fb4', fontSize: 11 }}>
          ⛔ {selected === 'powerPlant' || selected === 'factory'
            ? '발전소·공장은 평지에만 건설 가능'
            : terrain === 'forest'
              ? '숲에는 저압/변전소만 가능'
              : '여기엔 건설 불가'}
        </div>
      ) : cost != null ? (
        <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ opacity: 0.7 }}>{def?.label} 건설비</span>
          <span style={{ color: '#c8f0d8', fontFamily: 'monospace', fontWeight: 700 }}>
            ₩{cost.toLocaleString()}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function EdgeHoverTooltip({ edge, buildings }) {
  const { aKey, bKey, cost, redundant } = edge;
  const a = buildings.get(aKey);
  const b = buildings.get(bKey);
  if (!a || !b) return null;
  const aDef = TILE_TYPES[a.type], bDef = TILE_TYPES[b.type];
  return (
    <div
      style={{
        position: 'absolute', left: 12, bottom: 96,
        background: 'rgba(12,16,32,0.92)',
        border: `1px solid ${redundant ? '#7be6ff' : '#9aa6c0'}`,
        borderRadius: 8, padding: '10px 12px',
        color: '#e6f7ff',
        fontFamily: 'system-ui', fontSize: 12,
        minWidth: 240, lineHeight: 1.5,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: 1, marginBottom: 4 }}>회선</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        <span style={{ color: aDef.color }}>{aDef.label}</span>
        {' ↔ '}
        <span style={{ color: bDef.color }}>{bDef.label}</span>
      </div>
      {redundant ? (
        <>
          <div style={{ color: '#7be6ff', fontWeight: 600, marginBottom: 4 }}>
            ⚡ 이중화 회선 (N-1)
          </div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            선로 고장 발생 시 자동 부하절체로 무중단 공급. 클릭하면 해제됨 (₩{Math.floor(cost * REDUNDANCY_REFUND).toLocaleString()} 환불).
          </div>
        </>
      ) : (
        <>
          <div style={{ color: '#9aa6c0', marginBottom: 4 }}>단일회선</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>
            한 번 고장나면 복구 전까지 정전. 클릭 시 이중화 ↓
          </div>
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ opacity: 0.7 }}>이중화 비용</span>
            <span style={{ color: '#c8f0d8', fontFamily: 'monospace', fontWeight: 700 }}>
              ₩{cost.toLocaleString()}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function FreqGauge({ freq, targetFreq, compact }) {
  // Map freq to angle. nominal=60 → 0°. ±FREQ_MAX_DEV → ±90°.
  const norm = Math.max(-1, Math.min(1, (freq - NOMINAL_FREQ) / FREQ_MAX_DEV));
  const angle = norm * 90;
  // Target needle — shows where freq is heading. Teaching cue: needle leads,
  // target trails (or vice versa) → player learns to read the lag.
  const tNorm = targetFreq == null
    ? null
    : Math.max(-1, Math.min(1, (targetFreq - NOMINAL_FREQ) / FREQ_MAX_DEV));
  const tAngle = tNorm == null ? null : tNorm * 90;
  const status = freqStatus(freq);
  const color = status === 'stable' ? '#39ffa6' : status === 'warning' ? '#ffc640' : '#ff4d6d';
  const label = status === 'stable' ? '안정' : status === 'warning' ? '경고' : '블랙아웃';

  const R = 50;
  const cx = 60, cy = 62;
  const polar = (deg, r) => [cx + r * Math.cos((deg - 90) * Math.PI / 180), cy + r * Math.sin((deg - 90) * Math.PI / 180)];

  const arcSeg = (d1, d2, c, r = R) => {
    const [x1, y1] = polar(d1, r);
    const [x2, y2] = polar(d2, r);
    const large = Math.abs(d2 - d1) > 180 ? 1 : 0;
    const sweep = d2 > d1 ? 1 : 0;
    return <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`} stroke={c} strokeWidth={6} fill="none" strokeLinecap="round" />;
  };

  const safeAng = (SAFE_BAND / FREQ_MAX_DEV) * 90;
  const warnAng = (1.0 / FREQ_MAX_DEV) * 90;

  // Detect a divergence (target moving away from current) — that's what the
  // player needs to react to.
  const drifting = tAngle != null && Math.abs(tAngle - angle) > 4;

  // Compact: skip the SVG arc/needle entirely. The status colour on the Hz
  // number + the one-line balance summary below carry the same information.
  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ color, fontFamily: 'monospace', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>
          {freq.toFixed(2)}<span style={{ fontSize: 10, opacity: 0.7 }}>Hz</span>
        </span>
        <span style={{ color, fontSize: 10 }}>● {label}</span>
        {drifting && targetFreq != null && (
          <span style={{ fontSize: 9, color: '#7be6ff' }}>
            ↗{targetFreq.toFixed(1)}
          </span>
        )}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width="120" height="78" viewBox="0 0 120 78">
        {arcSeg(-90, -warnAng, '#ff4d6d')}
        {arcSeg(-warnAng, -safeAng, '#ffc640')}
        {arcSeg(-safeAng, safeAng, '#39ffa6')}
        {arcSeg(safeAng, warnAng, '#ffc640')}
        {arcSeg(warnAng, 90, '#ff4d6d')}
        {/* Target needle — dashed, shows where the system is heading */}
        {tAngle != null && (
          <line
            x1={cx} y1={cy}
            x2={polar(tAngle, R - 8)[0]} y2={polar(tAngle, R - 8)[1]}
            stroke={drifting ? '#7be6ff' : '#7be6ff'} strokeWidth={1.2}
            strokeDasharray="3 2" strokeLinecap="round" opacity={drifting ? 0.95 : 0.5}
          />
        )}
        {/* Live needle */}
        <line
          x1={cx} y1={cy}
          x2={polar(angle, R - 4)[0]} y2={polar(angle, R - 4)[1]}
          stroke="#fff" strokeWidth={2} strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={4} fill="#fff" />
      </svg>
      <div>
        <div style={{ color, fontFamily: 'monospace', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
          {freq.toFixed(2)} <span style={{ fontSize: 12, opacity: 0.7 }}>Hz</span>
        </div>
        <div style={{ color, fontSize: 11, marginTop: 2 }}>● {label}</div>
        {drifting && targetFreq != null && (
          <div style={{ fontSize: 10, color: '#7be6ff', marginTop: 3 }}>
            ↗ 목표 {targetFreq.toFixed(2)} Hz
          </div>
        )}
      </div>
    </div>
  );
}

// Count how many substations are operating on a radial (single-fed)
// transmission feed. In real practice these are the weak points of the grid —
// one upstream fault and the whole substation drops. The fix is to tie two
// substations together with a 송전선로 (pylon-to-pylon backbone) so they form
// a small loop (환상망). We surface this as an educational hint once any
// substation has ≤1 upstream transmission connection AND there's at least
// one other substation on the map to loop into.
function detectRadialSubstations(buildings, edges) {
  let substationCount = 0;
  const upstreamByKey = new Map();
  for (const [k, b] of buildings) {
    if (b.type === 'substation') {
      substationCount++;
      upstreamByKey.set(k, 0);
    }
  }
  if (substationCount < 2) return 0; // need a peer to loop to
  for (const [a, b] of edges) {
    const ba = buildings.get(a);
    const bb = buildings.get(b);
    if (!ba || !bb) continue;
    // count transmission-side feeds only (pylon / powerPlant / factory).
    // Distribution-side taps (utility pole etc) don't reduce radialness.
    if (ba.type === 'substation') {
      const otherDef = TILE_TYPES[bb.type];
      if (otherDef && otherDef.tier === 'transmission' && bb.type !== 'factory') {
        upstreamByKey.set(a, upstreamByKey.get(a) + 1);
      }
    }
    if (bb.type === 'substation') {
      const otherDef = TILE_TYPES[ba.type];
      if (otherDef && otherDef.tier === 'transmission' && ba.type !== 'factory') {
        upstreamByKey.set(b, upstreamByKey.get(b) + 1);
      }
    }
  }
  let radial = 0;
  for (const n of upstreamByKey.values()) if (n <= 1) radial++;
  return radial;
}

// Live operating advisor — picks the single most urgent action the player
// should take right now and presents it as a tip. Priority is fixed: safety
// (블랙아웃) > 사고 (정전·자금) > 계통 안정 (주파수·미점등) > 운영 팁. We render
// only the top-priority tip to avoid an info wall.
function operatingAdvice({ freq, money, faults, workers, buildings, powered, count, edges, events, sunshineVillages, strandedDemand }) {
  const dev = Math.abs(freq - NOMINAL_FREQ);
  const high = freq > NOMINAL_FREQ;

  // Topology issue — load exists but isn't reaching the grid. Surfaces
  // ABOVE freq warnings because the right advice is "connect it", not
  // "build more / remove a plant". This explains the "왜 수요를 계속
  // 짓는데도 주파수가 안 떨어지지?" symptom — new consumers aren't yet
  // wired into the powered network so they don't register as demand.
  if (strandedDemand && strandedDemand >= 20) {
    return {
      level: 'urgent',
      icon: '🔌',
      title: `${strandedDemand} MW 소비처가 그리드에서 끊김`,
      body: '가정/마을/공장을 더 지어도 변전소·전신주 체인까지 이어지지 않으면 부하로 잡히지 않아 주파수가 안 떨어집니다. 발전소 → 송전탑 → 변전소 → 전신주 → 가정 순서로 회선이 모두 연결됐는지 확인하세요.',
    };
  }

  // BLACKOUT zone — immediate threat to the run
  if (dev > 1.0) {
    return high
      ? {
          level: 'critical',
          icon: '🚨',
          title: '주파수 위험상승 — 블랙아웃 임박',
          body: '공급이 수요보다 훨씬 큽니다. 발전소를 하나 철거하거나, 가정/마을/공장을 빠르게 더 지어 수요를 늘리세요.',
        }
      : {
          level: 'critical',
          icon: '🚨',
          title: '주파수 급강하 — 블랙아웃 임박',
          body: '수요가 공급을 크게 초과합니다. 발전소를 추가하거나, 공장·마을을 한시적으로 철거해 부하를 줄이세요.',
        };
  }

  // Unhandled outage — every second of delay costs money
  const faultsWaiting = faults.filter(
    (e) => !workers.some((w) => w.eventId === e.id),
  );
  if (faultsWaiting.length > 0) {
    return {
      level: 'urgent',
      icon: '🔧',
      title: '선로 고장 — 복구반 미출동',
      body: '회선 위의 ⚠ 마커를 클릭하면 가장 가까운 변전소에서 작업자가 출동합니다. 정전이 지속되면 사고 처리비가 계속 차감됩니다.',
    };
  }

  // Active wildfire — the player can click the burning pylon to scramble a
  // fire crew. Otherwise it auto-clears in 15 s but bleeds drain the whole time.
  const wildfires = (events || []).filter((e) => e.type === 'wildfire' && e.target);
  if (wildfires.length > 0) {
    return {
      level: 'urgent',
      icon: '🔥',
      title: `산불 ${wildfires.length}건 진행 중`,
      body: '불타는 송전탑을 클릭하면 진화 헬기를 투입합니다. 방치하면 15초 뒤 자연 진화되지만 그동안 송전탑은 절연 파괴로 정전입니다.',
    };
  }

  // Pole obstruction notices — relocation work outstanding.
  const obstructions = (events || []).filter((e) => e.type === 'pole_obstruction');
  if (obstructions.length > 0) {
    return {
      level: 'warning',
      icon: '🚧',
      title: `지장전주 ${obstructions.length}건 — 이설 필요`,
      body: '🚧 콘 마커를 클릭하고, 녹색 후광이 뜬 인접 헥스를 다시 클릭해 전신주를 이설하세요. 도로 확장은 보상이, 사유지는 이설비가 발생합니다. 방치하면 전신주가 강제 철거됩니다.',
    };
  }

  // Money crisis
  if (money < 0) {
    return {
      level: 'urgent',
      icon: '💸',
      title: '자금 위기',
      body: '같은 타입으로 다시 클릭하면 설비를 60% 환불받고 철거합니다. 안 쓰는 송전탑·전신주부터 정리해 회생하세요.',
    };
  }

  // Stranded loads — consumers exist but they're not in any powered
  // component (e.g., a fault severed the only feed). Surface this BEFORE
  // freq drift because freq might still read stable-ish while every
  // building is dark — the topology is broken, not the balance.
  if (strandedDemand && strandedDemand >= 20) {
    return {
      level: 'urgent',
      icon: '🔌',
      title: `${strandedDemand} MW 소비처가 그리드에서 끊김`,
      body: '주파수와 무관하게 일부(또는 전체) 가정/마을이 정전입니다. 발전소→송전탑→변전소→전신주 체인 중 어디가 끊겼는지 확인하세요. 변전소가 빠지면 고압↔저압이 안 연결되고, 사고로 송전탑이 disabled 됐을 수 있습니다.',
    };
  }

  // Frequency drift — explain the rule
  if (dev > 0.5) {
    return high
      ? {
          level: 'warning',
          icon: '↑',
          title: `주파수 상승 (${freq.toFixed(2)} Hz)`,
          body: '공급 > 수요 상태입니다. 발전기 회전수가 빨라져 주파수가 올라갑니다. 가정/마을을 더 짓거나, 발전소 1기를 잠시 철거해 균형을 맞추세요.',
        }
      : {
          level: 'warning',
          icon: '↓',
          title: `주파수 하강 (${freq.toFixed(2)} Hz)`,
          body: '수요 > 공급 상태입니다. 발전기에 부하가 걸려 주파수가 떨어집니다. 발전소를 추가하거나, 공장 같은 큰 소비처를 잠시 철거하세요.',
        };
  }

  // Unpowered consumers despite stable freq — likely a topology problem
  let unpowered = 0;
  let totalConsumers = 0;
  for (const [k, b] of buildings) {
    const def = TILE_TYPES[b.type];
    if (!def || (def.demand || 0) <= 0) continue;
    totalConsumers++;
    if (!powered[k]) unpowered++;
  }
  if (unpowered > 0 && totalConsumers > 0) {
    return {
      level: 'warning',
      icon: '🔌',
      title: `미점등 설비 ${unpowered}곳`,
      body: '발전소 → 송전탑 → 변전소 → 전신주 → 가정 순서로 이어져야 합니다. 변전소가 빠지면 고압↔저압이 안 연결되고, 거리(range) 밖이면 회선이 안 생깁니다.',
    };
  }

  // First-time onboarding
  if (count === 0) {
    return {
      level: 'info',
      icon: '🚀',
      title: '발전소부터 시작',
      body: '발전소(고압) → 송전탑/변전소 → 전신주(저압) → 가정 순으로 배치하세요. 주파수 60.0±0.5 Hz 안에서만 수익이 누적됩니다.',
    };
  }

  // Sunshine village hint — player has enough solars but they're too far
  // apart to cluster. Suggests pulling them together so the achievement
  // triggers. Skipped when at least one village already exists.
  if ((!sunshineVillages || sunshineVillages.length === 0) && buildings) {
    let solarCount = 0;
    for (const [, b] of buildings) if (b.type === 'solar') solarCount++;
    if (solarCount >= 3) {
      return {
        level: 'info',
        icon: '☀️',
        title: `태양광 ${solarCount}기 — 단지 미형성`,
        body: '햇빛소득마을 단지 보너스를 받으려면 태양광 3기 이상을 서로 바로 인접한 헥스(거리 1)로 모아 설치하세요. 단지가 완성되면 황금 링과 함께 일회 보너스 + 패널당 분당 수익이 들어옵니다.',
      };
    }
  }

  // Radial substations — educational nudge toward 환상망 topology
  const radial = detectRadialSubstations(buildings, edges || []);
  if (radial > 0) {
    return {
      level: 'info',
      icon: '🔗',
      title: `라디알 변전소 ${radial}곳 — 환상망 권장`,
      body: '변전소가 한 줄로만 급전되면(라디알) 상류 회선 한 곳이 끊겨도 정전입니다. 다른 변전소와 송전탑으로 이어 환상망(loop)을 구성하면 한쪽이 끊겨도 우회 급전이 가능합니다 — 실제 154kV/345kV 계통이 이렇게 설계됩니다.',
    };
  }

  // Smooth sailing — nudge toward expansion / redundancy
  return {
    level: 'info',
    icon: '✓',
    title: '안정 운영 중',
    body: '주파수 안정 · 전 설비 점등. 새 가정/마을을 더 짓거나, 송전탑↔송전탑 회선의 가운데 점을 클릭해 N-1 이중화로 신뢰성을 높이세요.',
  };
}

const ADVISOR_STYLES = {
  critical: { border: 'rgba(255,82,82,0.7)', bg: 'rgba(60,18,22,0.92)', titleColor: '#ff9090' },
  urgent:   { border: 'rgba(255,180,90,0.7)', bg: 'rgba(46,30,16,0.92)', titleColor: '#ffd478' },
  warning:  { border: 'rgba(255,216,107,0.55)', bg: 'rgba(30,28,18,0.9)', titleColor: '#fff080' },
  info:     { border: 'rgba(125,184,255,0.4)', bg: 'rgba(12,16,32,0.88)', titleColor: '#7fc8ff' },
};

function OperatingAdvisor({ tip, compact }) {
  const s = ADVISOR_STYLES[tip.level] || ADVISOR_STYLES.info;
  // On compact viewports the advisor folds to title + icon only (tap to
  // expand). Saves vertical real estate next to the bottom palette which
  // would otherwise overlap. The body is reachable through the toast or
  // by switching to landscape PC.
  const [expanded, setExpanded] = useState(false);
  const showBody = !compact || expanded;
  const showHint = !compact;
  return (
    <div
      onClick={() => compact && setExpanded((v) => !v)}
      style={{
        position: 'absolute',
        top: compact ? 48 : 60,
        left: compact ? 6 : 12,
        background: s.bg, color: '#e6f0ff',
        padding: compact ? '6px 10px' : '12px 14px',
        borderRadius: 8,
        fontFamily: 'system-ui',
        fontSize: compact ? 11 : 12,
        maxWidth: compact ? 220 : 320,
        lineHeight: 1.5,
        border: `1px solid ${s.border}`,
        boxShadow: tip.level === 'critical'
          ? `0 0 18px ${s.border}` : 'none',
        transition: 'background 0.3s, border-color 0.3s',
        cursor: compact ? 'pointer' : 'default',
      }}
    >
      <div style={{
        color: s.titleColor, fontWeight: 700,
        fontSize: compact ? 12 : 13,
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: showBody ? 4 : 0,
      }}>
        <span style={{ fontSize: compact ? 14 : 16 }}>{tip.icon}</span>
        <span>{tip.title}</span>
      </div>
      {showBody && <div style={{ opacity: 0.92 }}>{tip.body}</div>}
      {showHint && (
        <div style={{
          marginTop: 8, paddingTop: 6,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          fontSize: 10, opacity: 0.55,
        }}>
          🖱️ 클릭=배치 · 같은 타입 두 번 클릭=철거(60% 환불) · 드래그=회전 · 휠=줌
        </div>
      )}
    </div>
  );
}

// Combo meter — fills as the grid stays inside SAFE_BAND, caps at 120 s for
// max bonus +100 %. Gold gradient when full, fading to dim when empty so the
// player can read at-a-glance how close they are to the cap.
function ComboMeter({ combo, bonus }) {
  const pct = Math.min(100, (combo / 120) * 100);
  const sec = Math.floor(combo);
  return (
    <div style={{ fontSize: 10, lineHeight: 1.4 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        color: bonus > 0 ? '#ffd86b' : '#7aa',
      }}>
        <span>🔥 콤보 {sec}초</span>
        <span style={{ fontFamily: 'monospace' }}>
          {bonus > 0 ? `+${Math.round(bonus * 100)}%` : '—'}
        </span>
      </div>
      <div style={{
        height: 4, background: '#1c2640', borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'linear-gradient(90deg, #ffd86b, #ff9040)',
          transition: 'width 0.2s',
        }} />
      </div>
    </div>
  );
}

// Difficulty meter — climbs +10 % per minute, caps at 5×. Reds out at high
// difficulty so the player feels the pressure visually.
function DifficultyMeter({ difficulty }) {
  const pct = Math.min(100, ((difficulty - 1) / 4) * 100);
  const hot = difficulty >= 2.5;
  return (
    <div style={{ fontSize: 10, lineHeight: 1.4 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        color: hot ? '#ff8080' : '#a0c8ff',
      }}>
        <span>⚠ 난이도</span>
        <span style={{ fontFamily: 'monospace' }}>×{difficulty.toFixed(2)}</span>
      </div>
      <div style={{
        height: 4, background: '#1c2640', borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: hot
            ? 'linear-gradient(90deg, #ff7050, #ff3050)'
            : 'linear-gradient(90deg, #7fc8ff, #ff9040)',
          transition: 'width 0.2s',
        }} />
      </div>
    </div>
  );
}

// ────────── Tutorial / rules modal ──────────
// One-time first-launch RULES reference + always-available "?" button.
// Distinct from the new interactive tutorial coach below — this modal is
// the searchable text reference, opened on demand. The interactive coach
// walks brand-new players through actually building each piece.
const TUTORIAL_KEY = 'eg_tutorial_seen_v2';

// Per-step interactive tutorial config. Each step waits until the player
// completes the requirement, then auto-advances. `requiresType` + count is
// the simplest check (does the buildings map have N of this type?).
// `requiresVillage` is a special check for the final 햇빛소득마을 step.
// (Progress is intentionally NOT persisted to localStorage — the coach
// re-runs every time the 3D mode mounts, per playtester request.)
const INTERACTIVE_STEPS = [
  {
    icon: '🏭',
    title: '발전소 짓기',
    body: '하단 팔레트 좌측의 <b>발전소</b> 카드를 탭하고, 빈 헥스를 클릭해 한 기를 설치하세요. 전력의 시작점입니다.',
    requiresType: 'powerPlant', count: 1,
    highlight: 'powerPlant',
  },
  {
    icon: '🗼',
    title: '송전탑 짓기',
    body: '발전소에서 나온 고압 전기를 옮기는 <b>송전탑</b>입니다. 발전소 옆 헥스에 한 기를 설치해 보세요. (송전탑은 사거리 2칸)',
    requiresType: 'pylon', count: 1,
    highlight: 'pylon',
  },
  {
    icon: '⚡',
    title: '변전소 짓기',
    body: '고압을 저압으로 바꾸는 <b>변전소</b>입니다. 송전탑 옆 헥스에 설치하세요. 가정에 전기를 보내려면 반드시 거쳐야 합니다.',
    requiresType: 'substation', count: 1,
    highlight: 'substation',
  },
  {
    icon: '📡',
    title: '전신주 짓기',
    body: '동네까지 22.9 kV로 분배하는 <b>전신주</b>입니다. 변전소 옆 헥스에 설치하세요.',
    requiresType: 'utilityPole', count: 1,
    highlight: 'utilityPole',
  },
  {
    icon: '🏠',
    title: '가정 짓기 — 첫 점등',
    body: '드디어 소비처입니다! <b>가정</b>을 전신주 옆에 설치해 보세요. 회선이 제대로 이어졌다면 창문에 불이 들어옵니다.',
    requiresType: 'house', count: 1,
    highlight: 'house',
  },
  {
    icon: '☀️',
    title: '햇빛소득마을 도전',
    body: '<b>태양광 3기</b>를 서로 바로 인접한 헥스에 설치하면 햇빛소득마을 보너스가 활성화됩니다. (태양광은 변전소나 송전탑에 연결해야 점등)',
    requiresVillage: true,
    highlight: 'solar',
  },
  {
    icon: '🧠',
    title: '스마트그리드 — 주파수 자동 안정화',
    body: (
      '실생활 발전기는 부하 변동에 즉시 따라가지 못해 주파수가 출렁입니다. 스마트그리드 설비가 이걸 자동으로 잡아 줍니다.<br/><br/>'
      + '<b>① 태양광·풍력 (출력제어 / curtailment)</b><br/>'
      + '공급이 수요를 초과하면 인버터가 출력을 스스로 깎습니다.<br/><br/>'
      + '<b>② ESS (자동 충·방전)</b><br/>'
      + '• 주파수 <b>60 Hz 위로 상승 → 충전</b> (잉여 흡수)<br/>'
      + '• 주파수 <b>60 Hz 아래로 하강 → 방전</b> (부족 보충)<br/>'
      + '변전소·전신주·데이터센터 옆에 두면 자동 작동합니다.<br/><br/>'
      + '<b>지금 해보기</b>: 6단계의 태양광은 이미 설치돼 있습니다. <b>풍력 + ESS</b>를 한 기씩 추가하세요. 세 가지(태양광·풍력·ESS)가 모두 갖춰지면 자동으로 다음 단계.'
    ),
    info: true,
    requiresAll: ['solar', 'wind', 'ess'],
  },
  {
    icon: '🐦',
    title: '사고 대응 ① · 까마귀 트립',
    body: (
      '<b>지금 발생!</b> 송전탑·전신주 1기에 까마귀가 앉았습니다.<br/><br/>'
      + '<b>피해</b>: 해당 설비가 9초간 작동 불능 → 다운스트림 정전 가능<br/>'
      + '<b>조치</b>: 까마귀가 보이는 설비를 직접 <b>탭</b>해서 쫓아 보세요.<br/>'
      + '<b>방치 시</b>: 9초 후 자동 dismiss (정전 동안 점등된 가정 수익 손실)<br/><br/>'
      + '<i>까마귀를 쫓으면 자동으로 다음 단계로 넘어갑니다.</i>'
    ),
    info: true,
    requiresEventType: 'crow',
  },
  {
    icon: '🔥',
    title: '사고 대응 ② · 산불',
    body: (
      '<b>지금 발생!</b> 송전탑 1기에 산불이 났습니다.<br/><br/>'
      + '<b>피해</b>: 절연 파괴로 송전탑 15초간 작동 불능 + 사고 처리비 <b>−₩300</b><br/>'
      + '<b>조치</b>: 불타는 송전탑을 <b>탭</b>해 진화 헬기 투입.<br/>'
      + '<b>방치 시</b>: 15초 후 자연 진화. 그동안 다운스트림 정전 + 추가 드레인<br/><br/>'
      + '<i>진화하면 자동으로 다음 단계로 넘어갑니다.</i>'
    ),
    info: true,
    requiresEventType: 'wildfire',
  },
  {
    icon: '⚡',
    title: '사고 대응 ③ · 낙뢰',
    body: (
      '<b>지금 발생!</b> 송전탑에 번개가 쳤습니다.<br/><br/>'
      + '<b>피해</b>: 3초간 즉시 트립 + 즉시 사고 처리비 <b>−₩350</b><br/>'
      + '<b>조치</b>: 자동 회복. 클릭으로 막을 수 없음 — "운"의 영역.<br/>'
      + '<b>예방</b>: 핵심 송전 백본을 이중화하면 다운스트림 정전을 막을 수 있음<br/><br/>'
      + '<i>3초 후 자동 회복되면 다음 단계로 넘어갑니다.</i>'
    ),
    info: true,
    requiresEventType: 'lightning',
  },
  {
    icon: '🔧',
    title: '사고 대응 ④ · 설비 고장 (선로 고장)',
    body: (
      '<b>지금 발생!</b> 전력 회선 한 구간에 고장이 발생했습니다.<br/><br/>'
      + '<b>피해</b>: 즉시 <b>−₩200</b> + 정전 소비처가 있으면 지속 드레인 (보호협조로 전체 정전은 막힘)<br/>'
      + '<b>조치</b>: 회선 위의 <b>⚠ 마커를 탭</b> → 가장 가까운 변전소에서 복구반 출동 → 휴전 작업 5초 → 복구.<br/>'
      + '<b>예방</b>: 송전탑↔송전탑 회선의 가운데 점 클릭으로 <b>이중화(N-1)</b><br/><br/>'
      + '<i>복구반 작업이 끝나면 자동으로 다음 단계로 넘어갑니다.</i>'
    ),
    info: true,
    requiresEventType: 'line_fault',
  },
  {
    icon: '🚁',
    title: '사고 대응 ⑤ · 헬기 추락',
    body: (
      '<b>지금 발생!</b> 154 kV 백본 회선에 헬기가 추락했습니다.<br/><br/>'
      + '<b>피해</b>: 즉시 <b>−₩500</b> (게임 내 가장 비싼 사고) + 검은 연기 시각화<br/>'
      + '<b>조치</b>: 회선의 <b>⚠ 마커를 탭</b>해 복구반 출동 (선로 고장과 동일 절차).<br/>'
      + '<b>특징</b>: 빈도는 낮지만 회복 안 하면 사고 처리비가 너무 큼. 우선 대응<br/><br/>'
      + '<i>복구반이 도착·작업하면 자동으로 다음 단계로 넘어갑니다.</i>'
    ),
    info: true,
    requiresEventType: 'helicopter',
  },
  {
    icon: '🚧',
    title: '사고 대응 ⑥ · 지장전주 이설',
    body: (
      '<b>지금 발생!</b> 전신주 1기에 이설 요청이 들어왔습니다.<br/><br/>'
      + '<b>피해</b>: 28초 안에 이설 안 하면 강제 철거 + <b>−₩400</b> + 다운스트림 정전<br/>'
      + '<b>조치 (2단계)</b>:<br/>'
      + '&nbsp;&nbsp;1) 콘 모양 마커를 <b>탭</b> → 주변 인접 헥스에 <b>녹색 후광</b> 표시<br/>'
      + '&nbsp;&nbsp;2) 녹색 후광 헥스를 <b>탭</b> → 전신주 이설 완료<br/>'
      + '<b>케이스별 정산</b>: 🛣 도로 확장 <b>+₩500</b>, 🏠 사유지 <b>−₩150</b>, 🚗 건축 <b>+₩300</b><br/><br/>'
      + '<i>이설 완료 시 자동으로 다음 단계로 넘어갑니다.</i>'
    ),
    info: true,
    requiresEventType: 'pole_obstruction',
  },
];

// Floating coach banner — fixed at the top center. ← 이전 / 다음 → / 스킵
// buttons let the player navigate freely. Build steps still auto-advance
// once their requirement is met, but ONLY when the player is on the
// "leading edge" of progress (not reviewing a previous step).
function TutorialCoachBanner({
  step, stepIndex, totalSteps,
  onSkip, onNext, onPrev,
  compact,
}) {
  const isInfo = !!step.info;
  return (
    <div
      style={{
        position: 'absolute',
        top: compact ? 4 : 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9000,
        background: 'rgba(10, 14, 39, 0.96)',
        border: '1px solid #00d4ff',
        borderRadius: 10,
        boxShadow: '0 0 18px rgba(0, 212, 255, 0.35)',
        color: '#e6f7ff',
        padding: compact ? '8px 10px' : '12px 14px',
        fontFamily: 'system-ui',
        maxWidth: compact ? 340 : (isInfo ? 540 : 460),
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}
    >
      <div style={{
        fontSize: compact ? 22 : 28,
        flexShrink: 0,
        marginTop: 1,
      }}>{step.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: '#00d4ff', fontSize: compact ? 11 : 12, fontWeight: 700,
          letterSpacing: 0.5, marginBottom: 2,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <span>단계 {stepIndex + 1}/{totalSteps} · {step.title}</span>
          {/* progress dots — compact-friendly visual progress indicator */}
          {!compact && (
            <span style={{ display: 'flex', gap: 3 }}>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <span key={i} style={{
                  width: 6, height: 6, borderRadius: 3,
                  background: i === stepIndex ? '#00d4ff' : (i < stepIndex ? '#3a5a7a' : '#1c2640'),
                }} />
              ))}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: compact ? 11 : 12,
            lineHeight: 1.55,
            color: '#cde',
            maxHeight: isInfo ? (compact ? 200 : 280) : undefined,
            overflowY: isInfo ? 'auto' : 'visible',
          }}
          dangerouslySetInnerHTML={{ __html: step.body }}
        />
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        flexShrink: 0, alignItems: 'stretch',
      }}>
        <button
          onClick={onNext}
          style={{
            background: '#00d4ff', color: '#0a0e27',
            border: 'none', borderRadius: 4,
            padding: '4px 10px', cursor: 'pointer',
            fontSize: 11, fontFamily: 'system-ui', fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
          title="다음 단계로"
        >다음 →</button>
        <button
          onClick={onPrev}
          disabled={stepIndex === 0}
          style={{
            background: 'transparent',
            color: stepIndex === 0 ? '#345' : '#7fc8ff',
            border: `1px solid ${stepIndex === 0 ? '#234' : '#7fc8ff'}`,
            borderRadius: 4,
            padding: '3px 10px',
            cursor: stepIndex === 0 ? 'not-allowed' : 'pointer',
            fontSize: 11, fontFamily: 'system-ui',
            whiteSpace: 'nowrap',
          }}
          title="이전 단계 다시 읽기"
        >← 이전</button>
        <button
          onClick={onSkip}
          style={{
            background: 'transparent', color: '#7aa',
            border: '1px solid #456', borderRadius: 4,
            padding: '2px 8px', cursor: 'pointer',
            fontSize: 10, fontFamily: 'system-ui',
          }}
          title="튜토리얼 건너뛰기"
        >스킵</button>
      </div>
    </div>
  );
}

// Completion celebration — shown after step 6 (sunshine village). Auto-
// dismisses on backdrop tap or "free play" button.
function TutorialCompleteModal({ onClose, compact }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0,
        zIndex: 10000,
        background: 'rgba(5, 8, 22, 0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, fontFamily: 'system-ui',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: compact ? 340 : 460,
          background: 'rgba(12,16,32,0.97)',
          border: '1px solid #ffd86b',
          borderRadius: 14,
          padding: compact ? '20px 22px' : '28px 32px',
          color: '#e6f7ff', textAlign: 'center',
          boxShadow: '0 0 40px rgba(255,216,107,0.3)',
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
        <div style={{
          color: '#ffd86b', fontWeight: 700,
          fontSize: compact ? 18 : 22, marginBottom: 8,
        }}>
          튜토리얼 완료!
        </div>
        <div style={{
          color: '#bcd', fontSize: compact ? 12 : 13, lineHeight: 1.65,
          marginBottom: 18,
        }}>
          이제 자유롭게 그리드를 확장하고 사고에 대응하며 점수를 모으세요.<br />
          상세 룰은 우상단 <b style={{ color: '#7fc8ff' }}>?</b> 버튼으로 언제든 다시 볼 수 있습니다.
        </div>
        <button
          onClick={onClose}
          style={{
            background: '#ffd86b', color: '#0a0e27',
            border: 'none', borderRadius: 8,
            padding: '10px 24px', cursor: 'pointer',
            fontSize: compact ? 13 : 14, fontWeight: 700,
            fontFamily: 'system-ui',
          }}
        >자유 플레이 시작 →</button>
      </div>
    </div>
  );
}
const TUTORIAL_SECTIONS = [
  {
    icon: '🎯',
    title: '목표',
    lines: [
      '발전 → 송전 → 변전 → 배전 → 가정까지 직접 설계하고,',
      '주파수 60.0±0.5 Hz를 유지하며 사고에 대응해 점수를 누적합니다.',
      '점수 = 자금 + (생존 시간 × 5). 초기화하면 랭킹에 등록됩니다.',
    ],
  },
  {
    icon: '🖱️',
    title: '조작',
    lines: [
      '클릭 = 선택한 타입으로 배치',
      '같은 타입으로 두 번 클릭 = 매각(60% 환불) · 카메라 조작 중 오작동 방지',
      '드래그 = 회전, 휠 = 줌',
    ],
  },
  {
    icon: '⚡',
    title: '전력 계통 연결 규칙',
    lines: [
      '발전소·송전탑·변전소·전신주는 같은 전압끼리만 직결',
      '변전소만이 고압 ↔ 저압을 잇는 유일한 다리',
      '발전기↔발전기, 소비처↔소비처 직결 불가 (실제 계통과 동일)',
      '주파수가 ±0.5 Hz 안일 때만 수익이 들어옵니다',
    ],
  },
  {
    icon: '🌞',
    title: '스마트그리드',
    lines: [
      '태양광·풍력: 자동 출력제어로 과공급 자동 감쇠',
      '소규모(1~2기)는 전신주·가정에 직접, 대규모(3기+ 단지)는 송전탑/변전소 필수',
      'ESS: 변전소·전신주·데이터센터에 연결 → 자동 충방전으로 주파수 보조',
      '태양광 3기를 바로 인접해(거리 1) 모으면 햇빛소득마을 → 일회 보너스 + 분당 수익',
    ],
  },
  {
    icon: '🏢',
    title: '데이터센터 (특수설비)',
    lines: [
      '−180 MW의 거대 부하 — 단일 변전소 라디알 급전 시 페널티',
      '변전소 2곳 이상 또는 송전탑 2회선 이상 환상망 구성 필요',
      '반경 2헥스 내 태양광+풍력+ESS 모두 = RE100 +20% 수익 가산',
      '반경 내 스마트그리드 2개+ = VPP 수요 30% 감면',
    ],
  },
  {
    icon: '🚨',
    title: '사고 대응',
    lines: [
      '🐦 까마귀 — 송전탑/전신주를 클릭해 쫓기',
      '🔥 산불 — 송전탑을 클릭해 진화',
      '⚡ 낙뢰 — 자동 회복(3초). 인접 헥스가 잠시 정전',
      '🔧 선로 고장 · 🚁 헬기 추락 — ⚠ 마커 클릭 → 변전소에서 작업자 출동',
      '🚧 지장전주 — 콘 클릭 → 녹색 후광 헥스 클릭으로 이설',
      '이중화(N-1): 송전탑↔송전탑 회선 중간 점 클릭 → 한쪽 끊겨도 부하절체로 무중단',
    ],
  },
  {
    icon: '🔥',
    title: '콤보 · 난이도 · 회생',
    lines: [
      '주파수 안정 유지 시간 = 콤보. 120초 만점 시 수익 ×2.0',
      '1분당 ×1.1 난이도 (사고 빈도 증가, 캡 5×)',
      '자금이 마이너스여도 건설 가능. 사고 드레인은 −₩500 하한선',
      '같은 타입 두 번 클릭으로 60% 환불 받아 회생',
    ],
  },
];

function TutorialModal({ onClose, compact }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(5, 8, 22, 0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: compact ? 12 : 24,
        fontFamily: 'system-ui',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: compact ? '100%' : 720,
          width: '100%',
          maxHeight: compact ? '100%' : '90vh',
          background: 'rgba(12, 16, 32, 0.97)',
          border: '1px solid #2a3a5e',
          borderRadius: compact ? 10 : 16,
          color: '#e6f7ff',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: compact ? '10px 14px' : '16px 22px',
          borderBottom: '1px solid #2a3a5e',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              color: '#00d4ff', fontWeight: 700,
              fontSize: compact ? 16 : 20, letterSpacing: 1,
            }}>
              ⚡ Energy Grid · 게임 규칙
            </div>
            <div style={{ color: '#7aa', fontSize: 11, marginTop: 2 }}>
              튜토리얼은 우상단 HUD의 ? 버튼으로 언제든 다시 열 수 있습니다
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', color: '#00d4ff',
              border: '1px solid #00d4ff', borderRadius: 6,
              padding: '6px 14px', cursor: 'pointer',
              fontSize: compact ? 11 : 13, fontWeight: 600,
              fontFamily: 'system-ui',
            }}
          >
            시작하기 →
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{
          padding: compact ? '12px 14px' : '18px 22px',
          overflowY: 'auto',
          fontSize: compact ? 11 : 13,
          lineHeight: 1.6,
        }}>
          {TUTORIAL_SECTIONS.map((s, i) => (
            <div key={i} style={{ marginBottom: compact ? 14 : 18 }}>
              <div style={{
                color: '#7fc8ff', fontWeight: 700,
                fontSize: compact ? 13 : 15,
                marginBottom: 6,
                display: 'flex', gap: 8, alignItems: 'center',
              }}>
                <span style={{ fontSize: compact ? 16 : 20 }}>{s.icon}</span>
                <span>{s.title}</span>
              </div>
              <ul style={{
                margin: 0, paddingLeft: compact ? 20 : 24,
                color: '#cde', opacity: 0.92,
              }}>
                {s.lines.map((line, j) => (
                  <li key={j} style={{ marginBottom: 3 }}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
          <div style={{
            color: '#456', fontSize: 10, textAlign: 'center',
            marginTop: 8, padding: 10,
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 6,
          }}>
            막히면 좌상단 안내(advisor) 카드가 현재 상황에 맞는 다음 행동을 알려줍니다.
          </div>
        </div>
      </div>
    </div>
  );
}

// Persisted ranking from localStorage. Sorted by `score` desc. The current
// run is shown as a ghost row so the player can see where they'd land if
// they reset right now.
function LeaderboardPanel({ entries, currentScore, currentPlaytime, currentMoney, onClose }) {
  const fmtTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };
  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  // Where would the current run rank if we committed now?
  const rankIfNow = entries.filter((e) => e.score > currentScore).length + 1;
  return (
    <div
      style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(12,16,32,0.96)', color: '#e6f7ff',
        padding: 22, borderRadius: 14,
        fontFamily: 'system-ui', fontSize: 13,
        minWidth: 340, maxWidth: 420,
        border: '1px solid #2a3a5e',
        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        zIndex: 100,
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 14,
      }}>
        <div style={{ color: '#ffd86b', fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>
          🏆 RANKING
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', color: '#7aa', border: '1px solid #456',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11,
          }}
        >닫기</button>
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 10 }}>
        오래 살아남고, 자금을 많이 보유할수록 점수가 높습니다 · 초기화 시 등록
      </div>
      {entries.length === 0 ? (
        <div style={{
          padding: 24, textAlign: 'center', color: '#7aa',
          background: 'rgba(0,0,0,0.25)', borderRadius: 8, fontSize: 12,
        }}>
          아직 등록된 기록이 없습니다.<br />
          30초 이상 플레이 후 초기화하면 등록됩니다.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          {entries.map((e, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr auto auto 36px',
              gap: 10, alignItems: 'baseline',
              padding: '6px 10px',
              background: i === 0 ? 'rgba(255,216,107,0.10)' : 'rgba(255,255,255,0.03)',
              borderRadius: 6,
              border: i === 0 ? '1px solid rgba(255,216,107,0.4)' : '1px solid transparent',
            }}>
              <span style={{
                color: i === 0 ? '#ffd86b' : '#7fc8ff',
                fontWeight: 700, fontFamily: 'monospace',
              }}>#{i + 1}</span>
              <span style={{ color: '#fff6a0', fontFamily: 'monospace', fontWeight: 600 }}>
                {e.score.toLocaleString()}
              </span>
              <span style={{ color: '#a0e8b8', fontSize: 11, fontFamily: 'monospace' }}>
                ₩{e.money.toLocaleString()}
              </span>
              <span style={{ color: '#a0c8ff', fontSize: 11, fontFamily: 'monospace' }}>
                {fmtTime(e.playtime)}
              </span>
              <span style={{ color: '#567', fontSize: 10, textAlign: 'right' }}>
                {fmtDate(e.date)}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* Current run preview */}
      <div style={{
        marginTop: 14, padding: '8px 10px',
        background: 'rgba(125,184,255,0.10)',
        border: '1px dashed rgba(125,184,255,0.4)',
        borderRadius: 6,
        display: 'grid', gridTemplateColumns: '1fr auto auto auto',
        gap: 10, alignItems: 'baseline', fontSize: 12,
      }}>
        <span style={{ color: '#a0c8ff' }}>지금 초기화하면 → #{rankIfNow}</span>
        <span style={{ color: '#fff6a0', fontFamily: 'monospace', fontWeight: 600 }}>
          {currentScore.toLocaleString()}
        </span>
        <span style={{ color: '#a0e8b8', fontSize: 11, fontFamily: 'monospace' }}>
          ₩{Math.floor(currentMoney).toLocaleString()}
        </span>
        <span style={{ color: '#a0c8ff', fontSize: 11, fontFamily: 'monospace' }}>
          {fmtTime(currentPlaytime)}
        </span>
      </div>
    </div>
  );
}

function UI({
  selected, setSelected, sim, dyn, mapRadius, toast, events, windActive, onReset, count,
  hovered, terrainByKey, landValueByKey, buildings,
  hoveredEdge, redundantCount, leaderboard, workers, sunshineVillages,
  onSpawnTutorialEvent,
}) {
  const [showBoard, setShowBoard] = useState(false);
  const compact = useIsCompact();
  // Rules modal — opened ONLY via the "?" button. The first-time experience
  // is now the interactive coach below, not this text reference.
  const [showTutorial, setShowTutorial] = useState(false);
  const closeTutorial = () => {
    setShowTutorial(false);
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (_) {}
  };

  // Interactive tutorial coach — per user request, ALWAYS starts at step 0
  // when the 3D Grid Builder mounts. No localStorage persistence; skip is
  // session-only. If the player re-enters the mode they'll see the
  // tutorial from the top again (skip button dismisses).
  //   0..(N-1) = active step
  //   N       = celebration modal
  //   N+1     = done (banner hidden)
  const [coachStep, setCoachStep] = useState(0);
  // High-water mark — highest step the player has reached this session.
  // Used so going back via "이전" lands in pure-read mode (no immediate
  // auto-advance even if the build requirement was already satisfied
  // before they went back).
  const coachHighWaterRef = useRef(0);
  // Per-step "we already triggered the demo event" latch so we don't keep
  // spawning a new crow every render while the player figures out the step.
  const tutorialEventSpawnedRef = useRef({});
  // Per-step "events array has confirmed the demo event is live" latch.
  // Separate from spawnedRef because setEvents is async — the auto-advance
  // useEffect that runs in the SAME render as the spawn would otherwise
  // see {ref=true, events=stale empty} and falsely decide the event was
  // already resolved, cascading through every fault step. activeRef flips
  // true only AFTER events has propagated the spawn.
  const tutorialEventActiveRef = useRef({});
  const goToStep = (next) => {
    if (next > coachHighWaterRef.current) coachHighWaterRef.current = next;
    setCoachStep(next);
  };
  const advanceCoach = () => goToStep(coachStep + 1);
  const goPrevCoach  = () => { if (coachStep > 0) goToStep(coachStep - 1); };
  const skipCoach    = () => goToStep(INTERACTIVE_STEPS.length + 1);

  // Fault tutorial steps spawn their demo event on enter. Once the player
  // resolves the event (or auto-clear fires for lightning), the auto-
  // advance check below detects it and moves on. Skipped during review
  // mode so re-visiting a completed step doesn't re-spawn.
  useEffect(() => {
    if (coachStep < 0 || coachStep >= INTERACTIVE_STEPS.length) return;
    if (coachStep < coachHighWaterRef.current) return;
    const def = INTERACTIVE_STEPS[coachStep];
    if (!def || !def.requiresEventType) return;
    if (tutorialEventSpawnedRef.current[coachStep]) return;
    if (typeof onSpawnTutorialEvent !== 'function') return;
    const ok = onSpawnTutorialEvent(def.requiresEventType);
    if (ok) tutorialEventSpawnedRef.current[coachStep] = true;
  }, [coachStep, onSpawnTutorialEvent]);

  // Flip activeRef[step] to true ONLY when events actually contains the
  // spawned demo event. This is the load-bearing fix for the race where
  // spawn + auto-advance ran in the same render — auto-advance would see
  // spawnedRef=true but events still empty (stale closure), conclude
  // "already resolved", and skip the step. With activeRef, we require
  // visual confirmation before the resolved check can fire.
  useEffect(() => {
    if (coachStep < 0 || coachStep >= INTERACTIVE_STEPS.length) return;
    const def = INTERACTIVE_STEPS[coachStep];
    if (!def || !def.requiresEventType) return;
    const isActive = (events || []).some((e) => e.type === def.requiresEventType);
    if (isActive) tutorialEventActiveRef.current[coachStep] = true;
  }, [coachStep, events]);

  // Auto-advance when the current step's requirement is met. Logic per
  // requirement type:
  //   requiresType / requiresVillage — building count / village formation
  //   requiresOneOf — at least one of the listed building types exists
  //   requiresEventType — the demo event was spawned AND has since cleared
  // Reviewing previous steps (coachStep < high-water) suppresses advance.
  useEffect(() => {
    if (coachStep < 0 || coachStep >= INTERACTIVE_STEPS.length) return;
    if (coachStep < coachHighWaterRef.current) return;
    const def = INTERACTIVE_STEPS[coachStep];
    if (!def) return;
    let done = false;
    let hasReq = false;
    if (def.requiresVillage) {
      hasReq = true;
      done = (sunshineVillages || []).length > 0;
    } else if (def.requiresType) {
      hasReq = true;
      let n = 0;
      for (const [, b] of buildings) if (b.type === def.requiresType) n++;
      done = n >= (def.count || 1);
    } else if (def.requiresOneOf) {
      hasReq = true;
      for (const [, b] of buildings) {
        if (def.requiresOneOf.indexOf(b.type) !== -1) { done = true; break; }
      }
    } else if (def.requiresAll) {
      hasReq = true;
      const need = new Set(def.requiresAll);
      for (const [, b] of buildings) need.delete(b.type);
      done = need.size === 0;
    } else if (def.requiresEventType) {
      hasReq = true;
      // Only count as done if the event was ACTUALLY seen as active at
      // some point — guarantees we don't skip due to a same-render race.
      if (tutorialEventActiveRef.current[coachStep]) {
        const stillActive = (events || []).some((e) => e.type === def.requiresEventType);
        done = !stillActive;
      }
    }
    if (!hasReq) return; // pure-info step → manual "다음 →"
    if (done) goToStep(coachStep + 1);
  }, [coachStep, buildings, sunshineVillages, events]);

  const showCoachBanner = coachStep >= 0 && coachStep < INTERACTIVE_STEPS.length;
  const showCoachComplete = coachStep === INTERACTIVE_STEPS.length;

  // Live advisor tip — recomputed whenever the relevant slice of state moves.
  // Deps kept narrow so we don't churn the tip every dyn pulse.
  const faultEvents = useMemo(
    () => (events || []).filter((e) => e.type === 'line_fault'),
    [events],
  );
  const advisorTip = useMemo(
    () => operatingAdvice({
      freq: dyn.freq,
      money: dyn.money,
      faults: faultEvents,
      workers: workers || [],
      buildings,
      powered: sim.powered,
      count,
      edges: sim.edges,
      events,
      sunshineVillages,
    }),
    [dyn.freq, dyn.money, faultEvents, workers, buildings, sim.powered, count, sim.edges, events, sunshineVillages],
  );
  // Hover tooltip data — depends on the currently hovered hex.
  const hoverInfo = useMemo(() => {
    if (!hovered) return null;
    const [qs, rs] = hovered.split(',');
    const q = parseInt(qs, 10), r = parseInt(rs, 10);
    const terrain = terrainByKey?.get(hovered) || null;
    const lv = landValueByKey?.get(hovered) ?? null;
    const existing = buildings?.get(hovered);
    const buildable = canBuildOn(terrain, selected);
    const cost = (!existing && buildable && lv != null)
      ? buildCost(selected, lv)
      : null;
    return { q, r, terrain, lv, existing, buildable, cost };
  }, [hovered, terrainByKey, landValueByKey, buildings, selected]);

  const supplyMult = windActive ? WIND_SUPPLY_MULT : 1;
  const effSupply = Math.round(sim.totals.supply * supplyMult);
  const supplyTinted = supplyMult < 1;
  const nextMilestone = useMemo(() => {
    for (const m of EXPANSION_MILESTONES) {
      if (dyn.score < m) return m;
    }
    return null;
  }, [dyn.score]);
  const balance = sim.totals.supply - dyn.effDemand;
  const balanceColor = Math.abs(dyn.freq - NOMINAL_FREQ) <= SAFE_BAND
    ? '#39ffa6'
    : balance < 0 ? '#ff4d6d' : '#ffc640';

  return (
    <>
      {/* Top-right HUD — compact mode shrinks widths and padding so the
          panel doesn't fight the bottom palette for screen real estate
          on small landscapes (or CSS-rotated portrait phones). */}
      <div
        style={{
          position: 'absolute',
          top: compact ? 6 : 12,
          right: compact ? 6 : 12,
          background: 'rgba(12,16,32,0.88)', color: '#e6f7ff',
          padding: compact ? 8 : 14,
          borderRadius: 10,
          fontFamily: 'system-ui',
          fontSize: compact ? 11 : 13,
          minWidth: compact ? 190 : 260,
          maxWidth: compact ? 220 : undefined,
          border: '1px solid #2a3a5e',
          backdropFilter: 'blur(8px)',
        }}
      >
        {!compact && (
          <div style={{ color: '#7fc8ff', fontWeight: 700, letterSpacing: 1, fontSize: 11, marginBottom: 8 }}>
            ⚡ GRID FREQUENCY
          </div>
        )}
        <FreqGauge freq={dyn.freq} targetFreq={dyn.targetFreq} compact={compact} />

        {!compact && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #2a3a5e', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 12 }}>
            <div style={{ opacity: 0.7 }}>
              공급
              {windActive && <span style={{ color: '#9ee8c0', marginLeft: 4 }}>🌪️</span>}
            </div>
            <div style={{ textAlign: 'right', color: supplyTinted ? '#a0c8ff' : '#ffd16b', fontFamily: 'monospace' }}>
              {effSupply} MW
            </div>
            <div style={{ opacity: 0.7 }}>실효 수요</div>
            <div style={{ textAlign: 'right', color: '#ff8fb4', fontFamily: 'monospace' }}>{dyn.effDemand.toFixed(0)} MW</div>
            <div style={{ opacity: 0.7 }}>여유</div>
            <div style={{ textAlign: 'right', color: balanceColor, fontFamily: 'monospace', fontWeight: 600 }}>
              {balance >= 0 ? '+' : ''}{balance.toFixed(0)} MW
            </div>
            <div style={{ opacity: 0.7 }}>수요 배율</div>
            <div style={{ textAlign: 'right', color: '#a8d0ff', fontFamily: 'monospace' }}>×{dyn.mult.toFixed(2)}</div>
          </div>
        )}
        {/* Compact-mode one-line balance summary — keeps the critical
            "are we generating enough?" signal without the 4-row table. */}
        {compact && (
          <div style={{
            marginTop: 6, paddingTop: 6, borderTop: '1px solid #2a3a5e',
            display: 'flex', justifyContent: 'space-between',
            fontSize: 10, fontFamily: 'monospace',
          }}>
            <span style={{ color: '#ffd16b' }}>{effSupply}</span>
            <span style={{ color: '#7aa' }}>→</span>
            <span style={{ color: '#ff8fb4' }}>{dyn.effDemand.toFixed(0)}</span>
            <span style={{ color: balanceColor, fontWeight: 700 }}>
              {balance >= 0 ? '+' : ''}{balance.toFixed(0)}MW
            </span>
          </div>
        )}

        <div style={{
          marginTop: 10, padding: 10,
          background: dyn.money < 0 ? 'rgba(255, 80, 80, 0.12)' : 'rgba(122, 220, 130, 0.08)',
          borderRadius: 6,
          border: `1px solid ${dyn.money < 0 ? 'rgba(255,90,90,0.5)' : 'rgba(122,220,130,0.35)'}`,
          transition: 'background 0.3s, border-color 0.3s',
        }}>
          <div style={{
            fontSize: 10,
            color: dyn.money < 0 ? '#ff9090' : '#a0e8b8',
            letterSpacing: 1, display: 'flex', justifyContent: 'space-between',
          }}>
            <span>FUNDS · 자금{dyn.money < 0 ? ' · 위기' : ''}</span>
            <span style={{ opacity: 0.7 }}>
              +₩{INCOME_PER_MWH}/MWh
              {dyn.comboMult > 1.001 && (
                <span style={{
                  color: '#ffd86b', marginLeft: 4, fontWeight: 700,
                }}>
                  ×{dyn.comboMult.toFixed(2)}
                </span>
              )}
            </span>
          </div>
          <div style={{
            fontSize: 22, fontFamily: 'monospace',
            color: dyn.money < 0 ? '#ffb0b0' : '#c8f0d8',
            fontWeight: 700, lineHeight: 1.1,
          }}>
            ₩{Math.floor(dyn.money).toLocaleString()}
          </div>
          {/* Combo + difficulty meters — hidden on compact since the
              ×N.NN multiplier next to the FUNDS header already conveys
              "combo active" without the extra vertical real-estate. */}
          {!compact && (
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              <ComboMeter combo={dyn.combo || 0} bonus={(dyn.comboMult || 1) - 1} />
              <DifficultyMeter difficulty={dyn.difficulty || 1} />
            </div>
          )}
          {!compact && (
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
              {dyn.money < 0
                ? '같은 타입 클릭으로 설비 철거 시 60% 환불'
                : '주파수 안정 유지 → 콤보 ↑ → 보너스 수익'}
            </div>
          )}
        </div>

        {/* Playtime + rank score — feeds the leaderboard on reset */}
        <div style={{
          marginTop: 8, padding: 10,
          background: 'rgba(125, 184, 255, 0.08)',
          borderRadius: 6, border: '1px solid rgba(125,184,255,0.3)',
        }}>
          <div style={{
            fontSize: 10, color: '#a0c8ff', letterSpacing: 1,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>RANK · 점수</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setShowTutorial(true)}
                title="게임 규칙 / 튜토리얼"
                style={{
                  background: 'transparent', color: '#7fc8ff',
                  border: '1px solid #7fc8ff', borderRadius: 4,
                  padding: '1px 8px', cursor: 'pointer', fontSize: 10,
                  fontFamily: 'system-ui', fontWeight: 700,
                }}
              >?</button>
              <button
                onClick={() => setShowBoard((v) => !v)}
                style={{
                  background: 'transparent', color: '#7fc8ff',
                  border: '1px solid #7fc8ff', borderRadius: 4,
                  padding: '1px 8px', cursor: 'pointer', fontSize: 10,
                  fontFamily: 'system-ui',
                }}
              >{showBoard ? '닫기' : '🏆'}</button>
            </div>
          </div>
          <div style={{
            fontSize: 18, fontFamily: 'monospace',
            color: '#d0e6ff', fontWeight: 700, lineHeight: 1.2,
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          }}>
            <span>{(dyn.rankScore || 0).toLocaleString()}</span>
            <span style={{ fontSize: 11, opacity: 0.75 }}>
              {Math.floor((dyn.playtime || 0) / 60)}:{String(Math.floor((dyn.playtime || 0) % 60)).padStart(2, '0')}
            </span>
          </div>
          {!compact && (
            <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
              ₩ + 5점/초 · 초기화 시 랭킹 등록
            </div>
          )}
        </div>

        {/* SCORE · MWh, 마일스톤 진행도, 빌딩 통계는 데스크탑에서만 노출.
            모바일 컴팩트에서는 HUD 전체 높이가 팔레트와 겹치는 주범이라
            비핵심 카드를 통째로 숨김. 핵심 지표(주파수·자금·점수)는 유지. */}
        {!compact && (
          <div style={{ marginTop: 8, padding: 10, background: 'rgba(255, 216, 107, 0.07)', borderRadius: 6, border: '1px solid rgba(255,216,107,0.3)' }}>
            <div style={{ fontSize: 10, color: '#ffd86b', letterSpacing: 1 }}>SCORE · 누적 공급량</div>
            <div style={{ fontSize: 22, fontFamily: 'monospace', color: '#fff6a0', fontWeight: 700, lineHeight: 1.1 }}>
              {dyn.score.toFixed(2)} <span style={{ fontSize: 11, opacity: 0.7 }}>MWh</span>
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>주파수가 ±0.5 Hz 안일 때만 적립</div>
          </div>
        )}

        {!compact && nextMilestone !== null && (
          <div style={{ marginTop: 8, fontSize: 10, opacity: 0.65 }}>
            다음 확장까지 <span style={{ color: '#a0e8b8' }}>{(nextMilestone - dyn.score).toFixed(1)} MWh</span>
            <div style={{ marginTop: 4, height: 3, background: '#1c2640', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (dyn.score / nextMilestone) * 100)}%`,
                background: 'linear-gradient(90deg, #ffd86b, #a0e8b8)',
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}
        <div style={{
          marginTop: compact ? 4 : 8,
          fontSize: compact ? 10 : 11,
          opacity: 0.55,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {compact ? (
            <span>r{mapRadius} · {count}동</span>
          ) : (
            <span>
              건물 {count} · 회선 {sim.edges.length}
              {redundantCount > 0 && <span style={{ color: '#7be6ff' }}> (이중화 {redundantCount})</span>}
              {' · '}영역 r{mapRadius}
            </span>
          )}
          <button
            onClick={onReset}
            style={{
              background: 'transparent', color: '#ff8fb4',
              border: '1px solid #ff8fb4', borderRadius: 4,
              padding: '2px 8px', cursor: 'pointer', fontSize: 10,
            }}
          >초기화</button>
        </div>
      </div>

      {/* active events strip */}
      {events.length > 0 && (
        <div
          style={{
            position: 'absolute', top: 12, left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex', gap: 8,
            fontFamily: 'system-ui',
          }}
        >
          {events.map((e) => {
            const def = EVENT_DEFS[e.type];
            const remain = Math.max(0, (e.endTime - performance.now()) / 1000);
            const total = def.duration;
            return (
              <div
                key={e.id}
                style={{
                  background: 'rgba(20,25,42,0.92)',
                  border: `1px solid ${def.color}`,
                  borderRadius: 10,
                  padding: '8px 12px',
                  color: def.color,
                  fontSize: 12,
                  fontWeight: 600,
                  minWidth: 140,
                  boxShadow: `0 0 16px ${def.color}33`,
                }}
              >
                <div>{def.emoji} {def.label}</div>
                <div style={{ marginTop: 6, height: 3, background: '#1c2640', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(remain / total) * 100}%`,
                    background: def.color,
                  }} />
                </div>
                {e.type === 'crow' && (
                  <div style={{ marginTop: 4, fontSize: 10, opacity: 0.75, fontWeight: 400 }}>
                    해당 전신주/송전탑을 클릭해서 쫓아내세요
                  </div>
                )}
                {e.type === 'wildfire' && (
                  <div style={{ marginTop: 4, fontSize: 10, opacity: 0.75, fontWeight: 400 }}>
                    송전탑 절연 파괴 — 15초 후 자연 진화
                  </div>
                )}
                {e.type === 'helicopter' && (
                  <div style={{ marginTop: 4, fontSize: 10, opacity: 0.75, fontWeight: 400 }}>
                    송전선로 절단 — 🔧 마커 클릭해 복구반 출동
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* expansion toast */}
      {toast && (
        <div
          style={{
            position: 'absolute', top: 24, left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(20,30,50,0.95)',
            color: '#fff6c8',
            padding: '14px 24px',
            borderRadius: 999,
            fontFamily: 'system-ui', fontSize: 14, fontWeight: 600,
            border: '1px solid #ffd86b',
            boxShadow: '0 0 24px rgba(255, 216, 107, 0.4)',
            animation: 'eg-toast-pop 0.4s ease-out',
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Top-left advisor — live tip based on current grid state */}
      <OperatingAdvisor tip={advisorTip} compact={compact} />

      {/* Leaderboard overlay — toggled by the 🏆 button in the RANK card. */}
      {showBoard && (
        <LeaderboardPanel
          entries={leaderboard}
          currentScore={dyn.rankScore || 0}
          currentPlaytime={dyn.playtime || 0}
          currentMoney={dyn.money}
          onClose={() => setShowBoard(false)}
        />
      )}

      {/* Rules reference — opens via the "?" button only. */}
      {showTutorial && (
        <TutorialModal onClose={closeTutorial} compact={compact} />
      )}

      {/* Interactive coach — shows every time the 3D mode mounts. Buttons:
          이전 (review prior step), 다음 → (advance manually), 스킵 (dismiss). */}
      {showCoachBanner && (
        <TutorialCoachBanner
          step={INTERACTIVE_STEPS[coachStep]}
          stepIndex={coachStep}
          totalSteps={INTERACTIVE_STEPS.length}
          onSkip={skipCoach}
          onNext={advanceCoach}
          onPrev={goPrevCoach}
          compact={compact}
        />
      )}
      {showCoachComplete && (
        <TutorialCompleteModal
          onClose={() => {
            goToStep(INTERACTIVE_STEPS.length + 1);
            // User asked for a fresh start after the tutorial — wipe the
            // practice grid so the actual run begins on a blank map with
            // INITIAL_MONEY etc.
            if (typeof onReset === 'function') onReset();
          }}
          compact={compact}
        />
      )}

      {/* Hover tooltip — info about the hex under the cursor */}
      {hoverInfo && !hoveredEdge && (
        <HoverTooltip info={hoverInfo} selected={selected} />
      )}
      {/* Edge hover tooltip — shown when the cursor is over a line badge */}
      {hoveredEdge && (
        <EdgeHoverTooltip edge={hoveredEdge} buildings={buildings} />
      )}

      {/* Bottom palette — split into traditional grid and smart-grid groups.
          The vertical divider keeps both visible at once so the player can
          flip between a coal-and-pylons playstyle and a renewables-plus-ESS
          one in the same run. */}
      <div
        style={{
          position: 'absolute',
          bottom: compact ? 6 : 14,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(12,16,32,0.92)',
          padding: compact ? '4px 6px' : '8px 12px',
          borderRadius: 14,
          fontFamily: 'system-ui',
          display: 'flex',
          gap: compact ? 6 : 12,
          alignItems: 'stretch',
          maxWidth: '98vw',
          overflowX: 'auto',
          border: '1px solid #2a3a5e',
          backdropFilter: 'blur(8px)',
        }}
      >
        <PaletteGroup
          title="전력계통"
          subtitle="발전 · 송전 · 변전 · 배전"
          accent="#9ec4ff"
          keys={TRADITIONAL_KEYS}
          selected={selected}
          setSelected={setSelected}
          compact={compact}
        />
        <div style={{ width: 1, background: 'rgba(125,184,255,0.25)' }} />
        <PaletteGroup
          title="스마트그리드"
          subtitle="신재생 · 자동 출력제어 · ESS"
          accent="#9affc8"
          keys={SMART_GRID_KEYS}
          selected={selected}
          setSelected={setSelected}
          compact={compact}
        />
        <div style={{ width: 1, background: 'rgba(200,120,255,0.25)' }} />
        <PaletteGroup
          title="특수설비"
          subtitle="환상망 + RE100 보너스"
          accent="#c878ff"
          keys={SPECIAL_KEYS}
          selected={selected}
          setSelected={setSelected}
          compact={compact}
        />
      </div>
    </>
  );
}

// Palette button group with a labelled header. All building cards are now
// FIXED width — long desc strings used to inflate smart-grid cards and push
// the special-facility group off-screen on narrower monitors. Uniform width
// + label-only ellipsis is the simplest fix.
const PALETTE_CARD_WIDTH = 88;
const PALETTE_CARD_WIDTH_COMPACT = 62;
function PaletteGroup({ title, subtitle, accent, keys, selected, setSelected, compact }) {
  const cardWidth = compact ? PALETTE_CARD_WIDTH_COMPACT : PALETTE_CARD_WIDTH;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 2 : 4 }}>
      <div style={{
        fontSize: compact ? 9 : 10, letterSpacing: 1, color: accent, fontWeight: 700,
        display: 'flex', alignItems: 'baseline', gap: 6,
        whiteSpace: 'nowrap', overflow: 'hidden',
      }}>
        <span>{title}</span>
        {/* subtitle is space-expensive — hide on compact */}
        {!compact && (
          <span style={{
            opacity: 0.5, fontWeight: 400, fontSize: 9,
            textOverflow: 'ellipsis', overflow: 'hidden',
          }}>{subtitle}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: compact ? 4 : 6 }}>
        {keys.map((k) => {
          const def = TILE_TYPES[k];
          const active = selected === k;
          return (
            <button
              key={k}
              onClick={() => setSelected(k)}
              style={{
                padding: compact ? '5px 3px' : '8px 6px',
                background: active ? def.color : 'transparent',
                color: active ? '#0a0e27' : '#e6f7ff',
                border: `1.5px solid ${def.color}`,
                borderRadius: 10,
                cursor: 'pointer',
                fontWeight: active ? 700 : 500,
                fontSize: compact ? 11 : 12,
                whiteSpace: 'nowrap',
                width: cardWidth,
                textAlign: 'center',
                boxShadow: active ? `0 0 16px ${def.color}55` : 'none',
                transition: 'all 0.15s',
                overflow: 'hidden',
              }}
              title={def.desc /* full desc on hover */}
            >
              <div style={{ fontSize: compact ? 11 : 13, fontWeight: active ? 700 : 600 }}>
                {def.label}
              </div>
              {/* desc is the major width-eater — drop on compact */}
              {!compact && (
                <div style={{
                  fontSize: 10, opacity: 0.78, marginTop: 3,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {def.desc}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
