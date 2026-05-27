// Flat-top hex grid math (axial coordinates q, r).
// Procedural CylinderGeometry(R, R, h, 6) renders flat-top by default,
// so we use the matching flat-top axial → world conversion.

export const HEX_R = 1.0;
const SQRT3 = Math.sqrt(3);

export function hexToWorld(q, r) {
  const x = (3 / 2) * HEX_R * q;
  const z = SQRT3 * HEX_R * (r + q / 2);
  return [x, 0, z];
}

export function hexKey(q, r) {
  return `${q},${r}`;
}

// Normalised id for an undirected edge between two building keys. Used by
// the line-fault / repair system so the same physical line gets the same id
// regardless of orientation, and so it survives a re-simulate (which may
// emit edges in a different order).
export function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function hexDistance(q1, r1, q2, r2) {
  const dq = q1 - q2;
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function generateMap(radius) {
  const tiles = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      tiles.push({ q, r, terrain: terrainAt(q, r) });
    }
  }
  return tiles;
}

// ---- Terrain ---------------------------------------------------------------
// terrainAt(q, r) is a pure deterministic function — same coords always yield
// the same terrain, so when the map expands existing tiles keep their terrain
// and only freshly revealed tiles get new ones.
//
// Types:
//   'mountain' — unbuildable. Decorative; shields immediate neighbors from
//                future lightning targeting (handled at event-pick).
//   'river'    — unbuildable. Adjacent hex → +12 landValue; an adjacent
//                powerPlant gains +20% supply (냉각수 효과).
//   'forest'   — buildable only by distribution/transformer tier (no plant
//                or factory). Adjacent hex → +6 landValue.
//   null       — plain land, unrestricted.

function _hash01(q, r) {
  let h = (q * 374761393 + r * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) | 0;
  return ((h >>> 0) % 100000) / 100000;
}

export function terrainAt(q, r) {
  const dist = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  // Keep the origin and its immediate ring clear so players always have a
  // playable starting pocket regardless of seed.
  if (dist <= 1) return null;

  const region = _hash01(Math.floor((q + 1000) / 3), Math.floor((r + 1000) / 3));
  const local = _hash01(q, r);

  if (region > 0.78 && local < 0.55) return 'mountain';

  // sinusoidal "river" band — single-hex thick, flows roughly diagonal
  const riverField = Math.sin(q * 0.55 + 1.3) * 2.3
    + Math.cos(r * 0.42 - 0.7) * 1.8
    - (q + r) * 0.18;
  if (Math.abs(riverField) < 0.35 && local > 0.25) return 'river';

  if (local < 0.16 + Math.min(0.10, dist * 0.02)) return 'forest';

  return null;
}

export const TERRAIN_INFO = {
  mountain: { label: '산', emoji: '⛰️', buildable: false },
  river: { label: '강', emoji: '🌊', buildable: false },
  forest: { label: '숲', emoji: '🌲', buildable: 'distribution' },
};

export function canBuildOn(terrain, buildingType) {
  if (!terrain) return true;
  const info = TERRAIN_INFO[terrain];
  if (!info) return true;
  if (info.buildable === false) return false;
  if (info.buildable === 'distribution') {
    const def = TILE_TYPES[buildingType];
    if (!def) return false;
    return def.tier === 'distribution' || def.tier === 'transformer';
  }
  return true;
}

// ---- Land value & economy --------------------------------------------------
// landValue is in arbitrary points; 50 is the neutral baseline. It rises with
// nearby population (집값 상승) and falls near nuisance industries (혐오시설).
// Used to (a) scale build cost — 땅값 비쌀수록 짓기 비쌈, and (b) modestly
// scale house/village demand — 집값 높은 동네는 전력 소비도 큼.
const HEX_NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

export function landValueAt(q, r, buildings, terrainLookup) {
  let v = 50;
  for (const [, b] of buildings) {
    const d = hexDistance(q, r, b.q, b.r);
    if (d === 0 || d > 2) continue;
    const w = d === 1 ? 1 : 0.5;
    if (b.type === 'house') v += 8 * w;
    else if (b.type === 'village') v += 18 * w;
    else if (b.type === 'powerPlant') v -= 22 * w;
    else if (b.type === 'factory') v -= 14 * w;
  }
  for (const [dq, dr] of HEX_NEIGHBORS) {
    const t = terrainLookup
      ? terrainLookup(q + dq, r + dr)
      : terrainAt(q + dq, r + dr);
    if (t === 'river') v += 12;
    else if (t === 'forest') v += 6;
    else if (t === 'mountain') v -= 4;
  }
  return Math.max(8, Math.min(140, Math.round(v)));
}

export const BUILD_COSTS = {
  powerPlant: 320,
  solar: 280,
  wind: 300,
  ess: 260,
  dataCenter: 900,
  substation: 130,
  pylon: 70,
  factory: 220,
  utilityPole: 35,
  house: 55,
  village: 140,
};

// How sensitive each building's cost is to land value. powerPlant swings the
// most ("build it in the boonies"), poles are roughly flat everywhere.
const COST_SENSITIVITY = {
  powerPlant: 1.0,
  solar: 0.9,    // big footprint — prefers outskirts
  wind: 1.1,     // NIMBY: loud, big, sensitive to land value
  ess: 0.5,      // urban-friendly, fits anywhere
  dataCenter: 0.4, // wants to be near transit/fibre — minimal land sensitivity
  factory: 0.85,
  substation: 0.6,
  village: 0.7,
  house: 0.6,
  pylon: 0.3,
  utilityPole: 0.2,
};

export function buildCost(type, landValue) {
  const base = BUILD_COSTS[type] ?? 100;
  const sens = COST_SENSITIVITY[type] ?? 0.5;
  const mult = 1 + ((landValue - 50) / 50) * sens;
  return Math.max(10, Math.round(base * mult));
}

export const INITIAL_MONEY = 1200;
export const INCOME_PER_MWH = 32;

export function demandMultiplierForLandValue(landValue) {
  return Math.max(0.75, Math.min(1.35, 1 + (landValue - 50) * 0.006));
}

// NIMBY: a consumer adjacent to a power plant or factory accumulates score
// at a reduced rate (residents are unhappy living next to a stack).
// Returns a per-consumer multiplier in [0.55, 1.0].
export function nimbyMultiplier(q, r, buildings) {
  let penalty = 0;
  for (const [, b] of buildings) {
    if (b.type !== 'powerPlant' && b.type !== 'factory') continue;
    const d = hexDistance(q, r, b.q, b.r);
    if (d === 0 || d > 2) continue;
    penalty += b.type === 'powerPlant' ? 0.18 : 0.12;
    if (d === 1) penalty += 0.08;
  }
  return Math.max(0.55, 1 - penalty);
}

// A plant adjacent to a river gets +20% effective supply (냉각수).
export function plantWaterBonus(q, r, terrainLookup) {
  for (const [dq, dr] of HEX_NEIGHBORS) {
    const t = terrainLookup
      ? terrainLookup(q + dq, r + dr)
      : terrainAt(q + dq, r + dr);
    if (t === 'river') return 1.20;
  }
  return 1.0;
}

// Power-grid roles. Each building has a voltage TIER that gates connectivity:
//   transmission — high voltage (발전소, 송전탑, 공장 등 고압 고객)
//   transformer  — substation, the only thing that bridges high↔low
//   distribution — low voltage (전신주, 가정, 마을)
// Two buildings can connect only if (same tier) OR (one of them is the
// transformer). On top of that, distance ≤ min(rangeA, rangeB) must hold.
export const TILE_TYPES = {
  powerPlant: {
    label: '발전소', kind: 'building', tier: 'transmission',
    supply: 120, range: 1,
    color: '#ffb84d', accent: '#fff1a8', height: 1.6,
    desc: '+120 MW · 고압',
  },
  substation: {
    label: '변전소', kind: 'building', tier: 'transformer',
    range: 3,
    color: '#33d6ff', accent: '#aef0ff', height: 1.4,
    desc: '중계 · 고압↔저압',
  },
  pylon: {
    label: '송전탑', kind: 'building', tier: 'transmission',
    range: 2,
    color: '#9ec4ff', accent: '#e0eaff', height: 2.0,
    desc: '간선 · 고압',
  },
  factory: {
    label: '공장', kind: 'building', tier: 'transmission',
    demand: 80, range: 1,
    color: '#8a98ad', accent: '#ffd49a', height: 1.5,
    desc: '−80 MW · 고압',
  },
  utilityPole: {
    label: '전신주', kind: 'building', tier: 'distribution',
    range: 1,
    color: '#e0c89a', accent: '#ffdca8', height: 1.35,
    desc: '지선 · 저압',
  },
  house: {
    label: '가정', kind: 'building', tier: 'distribution',
    demand: 20, range: 1,
    color: '#ff7eb6', accent: '#ffd6e8', height: 0.9,
    desc: '−20 MW · 저압',
  },
  village: {
    label: '마을', kind: 'building', tier: 'distribution',
    demand: 60, range: 1,
    color: '#ff5a7e', accent: '#ffc3d3', height: 1.0,
    desc: '−60 MW · 저압',
  },
  // ────── Final-tier landmark consumer ──────
  // AI 하이퍼스케일 데이터센터 — game's "boss" load. One unit alone is more
  // than 2× a factory. Properly designed grids reward it (RE100 + VPP
  // bonuses); a sloppy radial feed punishes it (idle penalty drain).
  dataCenter: {
    label: '데이터센터', kind: 'building', tier: 'transmission',
    demand: 180, range: 1,
    color: '#c878ff', accent: '#e8c0ff', height: 1.3,
    desc: '−180 MW · 환상망 필요',
  },
  // ────── Smart-grid additions ──────
  // Renewables and ESS have nominal `supply` for connectivity/UI purposes,
  // but their EFFECTIVE output is modulated each frame (see renewableFactor /
  // applyEssDynamics below). This lets simulate() stay a pure connectivity
  // pass while dynamics live in the RAF loop where they belong.
  solar: {
    label: '태양광', kind: 'building', tier: 'transmission',
    supply: 60, range: 1,
    color: '#ffd84a', accent: '#fff080', height: 0.5,
    desc: '+60 MW · 변전소 연계',
    renewable: 'solar',
  },
  wind: {
    label: '풍력', kind: 'building', tier: 'transmission',
    supply: 80, range: 1,
    color: '#aee0ff', accent: '#dff0ff', height: 2.6,
    desc: '+80 MW · 변전소 연계',
    renewable: 'wind',
  },
  ess: {
    label: 'ESS', kind: 'building', tier: 'transformer',
    range: 2,
    color: '#9affc8', accent: '#d8ffe6', height: 0.7,
    desc: '충방전 · 변전소 전용',
    essPower: 60,       // MW charge / discharge rate per unit
    essCapacity: 240,   // MWh storage
  },
};

// Palette categories — the UI renders three groups so smart-grid additions
// don't crowd the traditional power chain and the late-game data center has
// its own boss-tier slot. Order within each group is the "natural build
// order" (generator → trunk → distribution → loads).
export const TRADITIONAL_KEYS = [
  'powerPlant', 'pylon', 'substation', 'utilityPole',
  'house', 'village', 'factory',
];
export const SMART_GRID_KEYS = ['solar', 'wind', 'ess'];
export const SPECIAL_KEYS = ['dataCenter'];

// Flat list — preserved for code that just wants "every building type".
export const BUILDING_KEYS = [...TRADITIONAL_KEYS, ...SMART_GRID_KEYS, ...SPECIAL_KEYS];

// ────── Smart-grid dynamics ──────
// Renewables (solar/wind) modulate around their nameplate. The RAF loop
// scales their nominal supply by this factor each frame. `curtailFactor` is
// applied ON TOP when supply >> demand — the inverter trims output to help
// frequency settle (실제 신재생 출력제어 — curtailment).
export function renewableFactor(kind, t) {
  if (kind === 'solar') {
    // Day-night cycle synced to the 30 s demand wave. Peak at the midday of
    // the load curve, zero at "midnight" — but clamp the floor so a fresh
    // build doesn't immediately read as broken.
    return Math.max(0.1, Math.sin((t * 2 * Math.PI) / 30) * 0.5 + 0.5);
  }
  if (kind === 'wind') {
    // Two-frequency drift so wind feels gusty rather than sinusoidal.
    const a = Math.sin((t * 2 * Math.PI) / 22 + 0.7) * 0.35;
    const b = Math.sin((t * 2 * Math.PI) / 9 + 1.3) * 0.2;
    return Math.max(0.15, 0.55 + a + b);
  }
  return 1;
}

// Smart inverters trim output when supply outruns demand to keep freq down.
// Returns a multiplier in [0.25, 1]. The further supply exceeds demand, the
// harder the trim.
export function curtailFactor(supply, effDemand) {
  if (supply <= effDemand) return 1;
  const over = (supply - effDemand) / Math.max(effDemand, 1);
  if (over < 0.05) return 1;       // small margin — no curtailment
  if (over < 0.5) return 1 - over * 0.8;
  return 0.25;                     // floor — never throttle below 25 %
}

// ESS auto-charge/discharge. Mutates the state Map in place to avoid
// allocating per frame. `imbalance` is supply - effDemand (positive = excess
// supply → charge; negative = deficit → discharge). `essKeys` is the list of
// powered ESS building keys.
//
// Returns the net MW the ESS bank contributed:
//   positive value = ESS added supply (discharge)
//   negative value = ESS absorbed (charge)
//
// state: Map<key, { stored: MWh, capacity: MWh }>
export function applyEssDynamics(essKeys, state, imbalance, dt) {
  if (essKeys.length === 0) return 0;
  const def = TILE_TYPES.ess;
  const ratedPower = def.essPower;
  const capacity = def.essCapacity;
  let net = 0;
  for (const k of essKeys) {
    let s = state.get(k);
    if (!s) {
      // Initialise new ESS at 50 % SOC — typical commissioning state.
      s = { stored: capacity * 0.5, capacity };
      state.set(k, s);
    }
    if (imbalance > 1) {
      // Excess supply → charge. Limited by rated power and headroom.
      const headroom = s.capacity - s.stored;
      if (headroom > 0.01) {
        const draw = Math.min(ratedPower, imbalance);
        s.stored += (draw * dt) / 3600;   // MWh
        net -= draw;
        imbalance -= draw;
      }
    } else if (imbalance < -1) {
      // Deficit → discharge.
      if (s.stored > 0.01) {
        const give = Math.min(ratedPower, -imbalance);
        s.stored -= (give * dt) / 3600;
        net += give;
        imbalance += give;
      }
    }
    // Clamp against floating-point drift
    if (s.stored < 0) s.stored = 0;
    if (s.stored > s.capacity) s.stored = s.capacity;
  }
  return net;
}

// Connection rules — mirror real-world Korean grid topology with one extra
// nuance: renewables behave differently by scale.
//
//   [대규모 신재생 단지 ≥3기]
//        │  154 kV 송전선 (철탑)
//        ▼
//   [민자 변전소 → 한전 공용 변전소]
//        │
//        ▼
//   [전신주 → 전신주 → 가정/마을]
//
//   [소·중규모 신재생 1~2기, 옥상 PV·소형 풍력]
//        │  22.9 kV 또는 220 V
//        ▼  (전신주·가정 직결)
//   [전신주 → 가정/마을]
//
// Result: same-voltage links + substation as the only high↔low bridge,
// PLUS a small-scale shortcut for distributed renewables. Generators and
// consumers still can't bus directly to themselves.
const ESS_ALLOWED_TARGETS = new Set([
  'substation',     // 변전소 부지 BESS (largest deployment pattern)
  'utilityPole',    // 배전 말단 피크 저감용 (distributed energy storage)
  'dataCenter',     // 대규모 부하 평탄화 / UPS 역할
]);
const RENEW_LARGE_CLUSTER_THRESHOLD = 3;

// Hex-distance count of solar+wind buildings within radius 2 of (q, r),
// INCLUDING the building at the origin. Used to classify a renewable as
// small/medium (1-2) vs large cluster (3+).
export function renewableClusterCount(q, r, buildings) {
  let n = 0;
  for (const [, b] of buildings) {
    if (b.type !== 'solar' && b.type !== 'wind') continue;
    if (hexDistance(q, r, b.q, b.r) <= 2) n++;
  }
  return n;
}

// Build a map of { renewableKey → clusterSize } in one pass — saves the
// inner canConnect calls from re-scanning every other renewable each time.
export function buildRenewableClusterMap(buildings) {
  const m = new Map();
  for (const [k, b] of buildings) {
    if (b.type !== 'solar' && b.type !== 'wind') continue;
    m.set(k, renewableClusterCount(b.q, b.r, buildings));
  }
  return m;
}

// ────────── 햇빛소득마을 (Sunshine Income Village) ──────────
// Korean rural-development program: when a village collectively installs a
// large solar farm, the income is shared among residents. In this game it
// triggers when ≥3 SOLAR panels form a connected cluster (each within
// hex-distance 2 of another). Wind doesn't qualify — the policy is solar-
// specific. Each village earns its players a one-shot achievement bonus and
// ongoing trickle income while the cluster stays intact + grid-connected.
//
// Returns: [{ id, count, members: [keys], centroid: { q, r } }]
//   id  — stable hash of the sorted member-key list, so re-rendering doesn't
//         re-fire the achievement toast for the same village.
//   centroid — for placing the visual effect on the map.
const SUNSHINE_MIN_CLUSTER = 3;
// Strict adjacency (distance = 1). Panels must share a hex edge to count
// as the same cluster — a line of 3 (A↔B↔C) qualifies via transitive
// union, but a 1-hex gap breaks it. Designer call: "village" should feel
// like 단지 (압축 클러스터), not a loose group.
const SUNSHINE_LINK_DISTANCE = 1;
export function findSunshineVillages(buildings) {
  const solars = [];
  for (const [k, b] of buildings) {
    if (b.type === 'solar') solars.push({ key: k, q: b.q, r: b.r });
  }
  if (solars.length < SUNSHINE_MIN_CLUSTER) return [];

  // Union-find by hex proximity. Solar panels within SUNSHINE_LINK_DISTANCE
  // hexes of each other are treated as one farm.
  const parent = solars.map((_, i) => i);
  const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (let i = 0; i < solars.length; i++) {
    for (let j = i + 1; j < solars.length; j++) {
      if (hexDistance(solars[i].q, solars[i].r, solars[j].q, solars[j].r) <= SUNSHINE_LINK_DISTANCE) {
        union(i, j);
      }
    }
  }

  const groups = new Map();
  for (let i = 0; i < solars.length; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(solars[i]);
  }

  const villages = [];
  for (const members of groups.values()) {
    if (members.length < SUNSHINE_MIN_CLUSTER) continue;
    let cq = 0, cr = 0;
    for (const m of members) { cq += m.q; cr += m.r; }
    cq /= members.length;
    cr /= members.length;
    const id = members.map((m) => m.key).sort().join('|');
    villages.push({
      id,
      count: members.length,
      members: members.map((m) => m.key),
      centroid: { q: cq, r: cr },
    });
  }
  return villages;
}

// Per-second bonus income while a sunshine village is active and at least
// half of its members are powered. Scales with village size — bigger farms,
// bigger village payout.
export const SUNSHINE_INCOME_PER_PANEL_PER_SEC = 8;
// One-shot achievement bonus the first time a village forms.
export const SUNSHINE_ACHIEVEMENT_BONUS = 600;

export function canConnect(typeA, typeB, ctx = null) {
  const a = TILE_TYPES[typeA];
  const b = TILE_TYPES[typeB];
  if (!a || !b) return false;
  // 1) Generators do not bus to each other directly — they tie into the
  //    grid through a substation or transmission tower.
  if ((a.supply || 0) > 0 && (b.supply || 0) > 0) return false;
  // 2) Same logic on the load side: two consumers don't share a wire.
  if ((a.demand || 0) > 0 && (b.demand || 0) > 0) return false;
  // 3) ESS endpoints: substation (BESS), utilityPole (배전 말단 피크 저감),
  //    dataCenter (대규모 부하 평탄화).
  if (typeA === 'ess') return ESS_ALLOWED_TARGETS.has(typeB);
  if (typeB === 'ess') return ESS_ALLOWED_TARGETS.has(typeA);
  // 4) Renewable scale shortcut — small/medium clusters (1~2기) can attach
  //    directly to distribution (옥상 PV → 가정, 소형 풍력 → 전신주). Large
  //    clusters (≥3기 단지) lose this shortcut and must go through a
  //    substation or 154 kV pylon, matching real utility-scale practice.
  const cluster = ctx && ctx.renewableClusterMap;
  const aLarge = a.renewable && cluster
    && (cluster.get(ctx.keyA) || 0) >= RENEW_LARGE_CLUSTER_THRESHOLD;
  const bLarge = b.renewable && cluster
    && (cluster.get(ctx.keyB) || 0) >= RENEW_LARGE_CLUSTER_THRESHOLD;
  if (a.renewable && !aLarge && b.tier === 'distribution') return true;
  if (b.renewable && !bLarge && a.tier === 'distribution') return true;
  // 5) Standard tier rules — substation bridges, else same tier.
  if (a.tier === 'transformer' || b.tier === 'transformer') return true;
  return a.tier === b.tier;
}

// Score milestones (cumulative MWh) that unlock one extra hex ring each.
// Capped so the map never exceeds ~217 hexes — keeps draw-call work bounded.
export const EXPANSION_MILESTONES = [6, 18, 40, 75];
export const INITIAL_RADIUS = 4;
export const MAX_RADIUS = INITIAL_RADIUS + EXPANSION_MILESTONES.length;

export function radiusForScore(score) {
  let r = INITIAL_RADIUS;
  for (const m of EXPANSION_MILESTONES) {
    if (score >= m) r += 1;
  }
  return Math.min(r, MAX_RADIUS);
}

export function simulate(buildings, disabledKeys = null, disabledEdges = null, terrainLookup = null, redundantEdges = null) {
  const isDisabled = disabledKeys && disabledKeys.size > 0
    ? (k) => disabledKeys.has(k)
    : () => false;
  // N-1 redundancy: a redundant edge keeps power through a line_fault (load
  // transfers to the backup circuit). We still register the fault so the
  // visual marker + repair worker dispatch run as usual.
  const isRedundant = redundantEdges && redundantEdges.size > 0
    ? (a, b) => redundantEdges.has(edgeKey(a, b))
    : () => false;
  const isEdgeDown = disabledEdges && disabledEdges.size > 0
    ? (a, b) => disabledEdges.has(edgeKey(a, b)) && !isRedundant(a, b)
    : () => false;
  // Terrain-aware per-building bonuses: plants on a river get +20% supply,
  // houses/villages scale demand by their landValue (affluent areas use more).
  // Pylons, poles, substations are unaffected.
  const lookup = terrainLookup || terrainAt;
  const entries = [...buildings.entries()]
    .filter(([key]) => !isDisabled(key))
    .map(([key, b]) => {
      const def = TILE_TYPES[b.type];
      let supply = def.supply || 0;
      let demand = def.demand || 0;
      if (supply > 0 && b.type === 'powerPlant') {
        supply = Math.round(supply * plantWaterBonus(b.q, b.r, lookup));
      }
      if (demand > 0 && (b.type === 'house' || b.type === 'village')) {
        const lv = landValueAt(b.q, b.r, buildings, lookup);
        demand = Math.round(demand * demandMultiplierForLandValue(lv));
      }
      return {
        key, q: b.q, r: b.r, type: b.type,
        supply, demand,
        range: def.range || 1,
      };
    });

  // We split edges into:
  //   edges        — the physical wires that should be rendered (always)
  //   liveEdges    — the subset currently carrying current (used for union-find)
  // A faulted edge stays drawn (so the player sees where the break is) but
  // does NOT propagate power.
  const edges = [];
  const liveEdges = [];
  // Precompute renewable cluster sizes once so canConnect can apply the
  // small-vs-large scale rule in O(1) per pair instead of re-scanning.
  const renewableClusterMap = buildRenewableClusterMap(buildings);
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      const d = hexDistance(a.q, a.r, b.q, b.r);
      const ctx = { keyA: a.key, keyB: b.key, renewableClusterMap };
      if (d > 0 && d <= Math.min(a.range, b.range) && canConnect(a.type, b.type, ctx)) {
        edges.push([a.key, b.key]);
        if (!isEdgeDown(a.key, b.key)) liveEdges.push([a.key, b.key]);
      }
    }
  }

  const idx = new Map(entries.map((e, i) => [e.key, i]));
  const parent = entries.map((_, i) => i);
  const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (const [a, b] of liveEdges) union(idx.get(a), idx.get(b));

  const comps = new Map();
  entries.forEach((e, i) => {
    const root = find(i);
    if (!comps.has(root)) comps.set(root, { supply: 0, demand: 0, members: [] });
    const c = comps.get(root);
    c.supply += e.supply;
    c.demand += e.demand;
    c.members.push(e.key);
  });

  const powered = {};
  for (const c of comps.values()) {
    const ok = c.supply > 0 && c.supply >= c.demand;
    for (const key of c.members) powered[key] = ok;
  }

  // Frequency math needs to reflect ONLY the live grid — the supply and
  // demand that are actually connected. Previously totals summed every
  // entry, so a player whose downstream just got severed by a fault could
  // see "freq stable, every house dark" because the disconnected source +
  // disconnected load cancelled out in the totals. With this change a
  // severed segment immediately registers as over-frequency on the source
  // side, matching real-world rotor dynamics and giving the player a
  // legible signal that the topology — not the balance — is broken.
  let totalSupply = 0;
  let totalDemand = 0;
  for (const c of comps.values()) {
    const ok = c.supply > 0 && c.supply >= c.demand;
    if (ok) {
      totalSupply += c.supply;
      totalDemand += c.demand;
    } else {
      // Source islands (powerPlant alone, no loads) → c.supply > 0 but
      // c.demand may be 0. They're 'powered' by the rule above and DO
      // contribute their full supply with zero matching load, which
      // realistically drives over-frequency.
      if (c.supply > 0) totalSupply += c.supply;
      // c.demand from an unpowered component is "stranded" — it's load
      // the operator wants to serve but can't reach. We don't sum it
      // into totalDemand because there's no machine torque opposing the
      // generators; instead exporters track it separately as a hint.
    }
  }
  // Demand currently stranded (unpowered consumers). Used by the HUD /
  // advisor to surface the "왜 안정인데 다 정전?" situation explicitly.
  let strandedDemand = 0;
  for (const c of comps.values()) {
    const ok = c.supply > 0 && c.supply >= c.demand;
    if (!ok) strandedDemand += c.demand;
  }

  // Expose which connected component each building belongs to. Downstream
  // code (data-center "loop-fed" check) uses this to walk a single component
  // without re-running the union-find. Root index is implementation detail —
  // only equality matters to callers.
  const componentBy = {};
  for (let i = 0; i < entries.length; i++) {
    componentBy[entries[i].key] = find(i);
  }

  return {
    edges,
    powered,
    componentBy,
    totals: { supply: totalSupply, demand: totalDemand, strandedDemand },
  };
}

// ---- Data-center "loop-fed" + synergy helpers ------------------------------
// Real hyperscale data centers tie into the grid through redundant feeds
// (보통 두 변전소 또는 변전소 1곳 + 2회선 이상). We mirror that with two
// acceptance conditions:
//   (a) the data center's connected component contains ≥2 substations, or
//   (b) the component's single substation has ≥2 transmission-side feeds.
// Either way the upstream is N-1 capable. A radial single-feed substation
// fails this and the DC drops into the "idle" penalty state.
export function isDataCenterLoopFed(dcKey, sim, buildings) {
  if (!sim || !sim.componentBy) return false;
  const myRoot = sim.componentBy[dcKey];
  if (myRoot == null) return false;
  const subs = [];
  for (const key in sim.componentBy) {
    if (sim.componentBy[key] !== myRoot) continue;
    if (buildings.get(key)?.type === 'substation') subs.push(key);
  }
  if (subs.length >= 2) return true;
  if (subs.length === 1) {
    const sub = subs[0];
    let feeds = 0;
    for (const [a, b] of sim.edges) {
      if (a !== sub && b !== sub) continue;
      const otherKey = a === sub ? b : a;
      const otherDef = TILE_TYPES[buildings.get(otherKey)?.type];
      // Count only generation-side feeds (powerPlant/pylon/solar/wind/renewables).
      // Skip the DC itself and any consumer (factory, other DC).
      if (!otherDef || otherDef.tier !== 'transmission') continue;
      if (otherDef.demand > 0) continue;
      feeds++;
    }
    return feeds >= 2;
  }
  return false;
}

// Smart-grid neighbours within radius 2 of the data center.
//   re100 — has solar AND wind AND ess nearby (Apple/Google RE100 archetype)
//   vpp   — has ≥2 smart-grid units total (load-shifting flexibility)
export function dataCenterSynergies(dcKey, buildings) {
  const dc = buildings.get(dcKey);
  if (!dc) return { solar: 0, wind: 0, ess: 0, total: 0, re100: false, vpp: false };
  let solar = 0, wind = 0, ess = 0;
  for (const [, b] of buildings) {
    const d = hexDistance(dc.q, dc.r, b.q, b.r);
    if (d === 0 || d > 2) continue;
    if (b.type === 'solar') solar++;
    else if (b.type === 'wind') wind++;
    else if (b.type === 'ess') ess++;
  }
  const total = solar + wind + ess;
  return {
    solar, wind, ess, total,
    re100: solar > 0 && wind > 0 && ess > 0,
    vpp: total >= 2,
  };
}

// Per-frame summary the RAF loop uses to apply VPP demand reduction and
// RE100 income bonus, plus surface "왜 안 돌아가나" status to the HUD.
//   state ∈ 'offline' | 'radial' | 'operational'
//   demandFactor — multiplier on the DC's nominal demand (VPP shifts it down)
//   incomeBonus  — multiplier on income contributed by the DC (RE100 premium)
export function dataCenterStatus(dcKey, sim, buildings) {
  if (!sim.powered[dcKey]) {
    return { state: 'offline', re100: false, vpp: false, demandFactor: 1, incomeBonus: 1 };
  }
  if (!isDataCenterLoopFed(dcKey, sim, buildings)) {
    return { state: 'radial', re100: false, vpp: false, demandFactor: 1, incomeBonus: 0.3 };
  }
  const syn = dataCenterSynergies(dcKey, buildings);
  return {
    state: 'operational',
    re100: syn.re100,
    vpp: syn.vpp,
    smartCount: syn.total,
    demandFactor: syn.vpp ? 0.7 : 1,   // VPP shifts 30 % of load off the grid
    incomeBonus: syn.re100 ? 1.2 : 1,  // RE100 → 20 % premium
  };
}

// ---- Frequency / health model ----------------------------------------------
// Real grids run at 60 Hz (Korea). When supply > demand the rotors over-spin
// and frequency rises; supply < demand drags it down. This is a toy model:
// freq = 60 + clamp((supply - effDemand)/scale * 2.0, ±2.5)
//
// gridHealth ∈ [0,1] — 1.0 inside the safe ±0.3 Hz band, fades to 0 by ±1.5 Hz.
// Score (MWh) accumulates only while |freq - 60| < 0.5.

export const NOMINAL_FREQ = 60;
export const SAFE_BAND = 0.7;       // widened (was 0.5) — easier learning band
export const PERFECT_BAND = 0.3;
export const FREQ_MAX_DEV = 2.5;

// Low-pass time constant (seconds) used by the runtime to ease freq motion
// — real grids have rotor inertia, so freq doesn't snap. tau≈3s gives the
// player time to *see* a swing build and react.
export const FREQ_SMOOTH_TAU = 3.0;

// Cost to upgrade an existing edge to a redundant (double-circuit) line.
// Scales with distance and tier — long high-voltage runs cost the most.
export function edgeUpgradeCost(typeA, typeB, distance) {
  const a = TILE_TYPES[typeA];
  const b = TILE_TYPES[typeB];
  if (!a || !b) return 0;
  const isHV = a.tier !== 'distribution' && b.tier !== 'distribution';
  const perHex = isHV ? 90 : 45;
  return Math.round(perHex * Math.max(1, distance));
}
// Refund fraction when removing a redundancy upgrade (resale never full price).
export const REDUNDANCY_REFUND = 0.5;

// 45-second sine wave, ±25% load swing — gentler so new players have time to
// read the gauge, plan, and react. Real distribution swings are larger but
// this is a training sim; difficulty can be cranked back up later.
export function demandMultiplier(t) {
  return 1 + 0.25 * Math.sin((t * 2 * Math.PI) / 45);
}

export function computeFrequency(supply, effDemand) {
  if (supply === 0 && effDemand === 0) return NOMINAL_FREQ;
  const scale = Math.max(supply, effDemand, 1);
  const raw = ((supply - effDemand) / scale) * 2.0;
  const clamped = Math.max(-FREQ_MAX_DEV, Math.min(FREQ_MAX_DEV, raw));
  return NOMINAL_FREQ + clamped;
}

export function gridHealthFromFreq(freq) {
  const dev = Math.abs(freq - NOMINAL_FREQ);
  if (dev <= PERFECT_BAND) return 1;
  const t = (dev - PERFECT_BAND) / (1.5 - PERFECT_BAND);
  return Math.max(0, 1 - t);
}

export function freqStatus(freq) {
  const dev = Math.abs(freq - NOMINAL_FREQ);
  if (dev <= SAFE_BAND) return 'stable';
  if (dev <= 1.0) return 'warning';
  return 'blackout';
}

// ---- Random events ---------------------------------------------------------
// Spawned by the runtime loop. Each active event lives in state with id,
// type, target (building key or null for global), startTime, endTime.
//
// crow      — small bird perched on a pylon or utility pole; building is
//             treated as disconnected for the duration. Player can click the
//             building to shoo it.
// storm     — global; all power lines wobble visually + total supply scaled to
//             70% for the duration.
// lightning — instant strike on a random pylon; building disabled briefly.

export const EVENT_DEFS = {
  crow: {
    label: '까마귀 트립',
    emoji: '🐦',
    color: '#cdb8ff',
    duration: 9,
    weight: 5,
    pickTarget(buildings) {
      // Crows perch on both pylons (송전탑) and utility poles (전신주), but
      // 22.9 kV distribution poles are far more common around towns and
      // more bird-friendly — so utility poles get 4× the weight of pylons.
      // Falls back to whichever pool exists when the other is empty.
      const poles = [];
      const pylons = [];
      for (const entry of buildings.entries()) {
        if (entry[1].type === 'utilityPole') poles.push(entry);
        else if (entry[1].type === 'pylon') pylons.push(entry);
      }
      if (poles.length === 0 && pylons.length === 0) return null;
      const polesWeight = poles.length * 4;
      const pylonsWeight = pylons.length;
      const r = Math.random() * (polesWeight + pylonsWeight);
      const pickFrom = r < polesWeight ? poles : pylons;
      return pickFrom[Math.floor(Math.random() * pickFrom.length)][0];
    },
  },
  // Wildfire replaces the old "strong wind" weather event. Wind on its own
  // didn't meaningfully damage transmission infrastructure, but a wildfire
  // running up a hillside does — pylons foul out from smoke ionising the air
  // and steel heat-warps. Targets a single pylon, longer than lightning.
  wildfire: {
    label: '산불',
    emoji: '🔥',
    color: '#ff5818',
    duration: 15,
    weight: 2,
    pickTarget(buildings) {
      const pool = [...buildings.entries()].filter(([, b]) => b.type === 'pylon');
      if (pool.length === 0) return null;
      return pool[Math.floor(Math.random() * pool.length)][0];
    },
  },
  lightning: {
    label: '번개 강타',
    emoji: '⚡',
    color: '#fff080',
    duration: 3,
    weight: 1,
    pickTarget(buildings) {
      const pool = [...buildings.entries()].filter(([, b]) => b.type === 'pylon');
      if (pool.length === 0) return null;
      return pool[Math.floor(Math.random() * pool.length)][0];
    },
  },
  // 지장전주 — an existing utility pole is suddenly in the way of a real-
  // world activity and must be relocated. Three real-life causes drive the
  // payout direction:
  //   road_expansion  → 공공도로 확장 (지자체 비용 부담)   → +500 보상
  //   private_land    → 사유지 재산권 행사 (한전 비용 부담) → −150 이설비
  //   building_access → 건축 진출입로 확보 (신청자 부담)    → +300 수익
  // RAF spawn loop attaches the subtype (`obstructionKind`) after pickTarget
  // chooses which pole. If the player doesn't relocate within `duration`,
  // the pole is removed and a steep timeout penalty is applied.
  pole_obstruction: {
    label: '지장전주',
    emoji: '🚧',
    color: '#ffb74d',
    duration: 28,
    weight: 3,
    pickTarget(buildings) {
      const pool = [...buildings.entries()].filter(([, b]) => b.type === 'utilityPole');
      if (pool.length === 0) return null;
      return pool[Math.floor(Math.random() * pool.length)][0];
    },
  },
  // Rare but expensive — a low-flying inspection or transport helicopter
  // clips a transmission line. Behaves like a line_fault (needs repair-crew
  // dispatch from a substation), but prefers pylon-to-pylon transmission
  // backbone edges since that's where helicopters actually fly low. Larger
  // upfront 사고 처리비 reflects the headline-news scale of the accident.
  helicopter: {
    label: '헬기 추락',
    emoji: '🚁',
    color: '#ff3050',
    duration: 90,
    weight: 1,
    targetKind: 'edge',
    pickTarget(buildings, edges) {
      if (!edges || edges.length === 0) return null;
      const pylonEdges = edges.filter(([a, b]) => {
        const ba = buildings.get(a);
        const bb = buildings.get(b);
        return ba && bb && ba.type === 'pylon' && bb.type === 'pylon';
      });
      const pool = pylonEdges.length > 0 ? pylonEdges : edges;
      const [a, b] = pool[Math.floor(Math.random() * pool.length)];
      return edgeKey(a, b);
    },
  },
  // Slow ageing fault on a transmission / distribution line. Unlike crow or
  // lightning the target is an edgeKey ("a|b") not a building key, and the
  // event clears when a repair worker finishes — runtime treats `duration`
  // as a fall-back auto-clear so the player can't get stuck.
  line_fault: {
    label: '선로 고장',
    emoji: '🔧',
    color: '#ff8c4d',
    duration: 90,
    weight: 3,
    targetKind: 'edge',
    pickTarget(_buildings, edges) {
      if (!edges || edges.length === 0) return null;
      const [a, b] = edges[Math.floor(Math.random() * edges.length)];
      return edgeKey(a, b);
    },
  },
};

let _eid = 1;
export function nextEventId() { return _eid++; }

export function pickRandomEvent(buildings, edges = []) {
  // Every current event def returns null from pickTarget when its pool is
  // empty (no pylons → no lightning, no edges → no helicopter, etc.), so we
  // can filter generically by probing once. Extra `edges` args are harmless
  // for events whose pickTarget signature only takes `buildings`.
  const candidates = Object.entries(EVENT_DEFS).filter(
    ([, def]) => def.pickTarget(buildings, edges) !== null,
  );
  if (candidates.length === 0) return null;
  const totalWeight = candidates.reduce((s, [, d]) => s + d.weight, 0);
  let r = Math.random() * totalWeight;
  for (const [key, def] of candidates) {
    if (r < def.weight) {
      const target = def.pickTarget(buildings, edges);
      return { type: key, target, duration: def.duration, targetKind: def.targetKind || 'building' };
    }
    r -= def.weight;
  }
  return null;
}

// Supply efficiency multipliers per global event
export const WIND_SUPPLY_MULT = 0.8;     // strong wind shakes lines, slight loss
