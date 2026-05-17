// 11차 전기본 + 3차 스마트그리드 기본계획을 압축한 게임 데이터.
// 수치는 게임성을 위한 추상화 — 정책 키워드만 보존.

// map_bg.jpg 실제 픽셀 크기는 1088×976 (참고용 — 코드는 텍스처 실측치 사용)
export const MAP = {
  WIDTH: 1088,
  HEIGHT: 976,
};

// 실제 경남 8개 시 — 진짜 지리 기준 (창원 남중부, 거제 남동섬, 통영 거제서쪽, 양산 동단 등)
export const CITIES = [
  { id: 'changwon', name: '창원',  x: 640, y: 545, demand: 100, type: 'residential' }, // 남중부 마산만
  { id: 'jinju',    name: '진주',  x: 300, y: 510, demand: 50,  type: 'residential' }, // 서남부 내륙
  { id: 'tongyeong',name: '통영',  x: 530, y: 720, demand: 30,  type: 'residential' }, // 거제 서쪽 반도
  { id: 'haman',    name: '함안',  x: 470, y: 460, demand: 20,  type: 'residential' }, // 중부 (창원-진주 사이)
  { id: 'gimhae',   name: '김해',  x: 820, y: 520, demand: 70,  type: 'residential' }, // 부산 서쪽 인접
  { id: 'geoje',    name: '거제',  x: 790, y: 700, demand: 60,  type: 'residential' }, // 남동단 큰 섬
  { id: 'sacheon',  name: '사천',  x: 340, y: 600, demand: 30,  type: 'residential' }, // 남서 해안
  { id: 'yangsan',  name: '양산',  x: 910, y: 400, demand: 50,  type: 'residential' }, // 동단 (부산 북쪽)
];

// 대형고객 (22.9kV 직접 수전) — 실제 산단 위치 반영
export const LARGE_CUSTOMERS = [
  { id: 'changwon-ind', name: '창원국가산단',     x: 700, y: 575, demand: 80, type: 'industrial' }, // 창원 성산구
  { id: 'gimhae-ind',   name: '김해골든루트산단', x: 760, y: 565, demand: 60, type: 'industrial' }, // 김해 주촌면 (남서부)
  { id: 'geoje-ind',    name: '거제조선소',       x: 840, y: 720, demand: 70, type: 'industrial' }, // 거제 옥포 (한화오션)
  { id: 'yangsan-ind',  name: '양산물금산단',     x: 870, y: 450, demand: 50, type: 'industrial' }, // 양산 물금읍
];

export const BUILDINGS = {
  coal: {
    id: 'coal',
    name: '석탄화력',
    icon: '🏭',
    cost: 500,
    power: 200,
    env: -3,
    color: 0x4b5563,
    accent: 0x1f2937,
    desc: '11차 전기본: 단계적 폐지 대상',
    unlockEra: 0,
  },
  lng: {
    id: 'lng',
    name: 'LNG 복합',
    icon: '🔥',
    cost: 800,
    power: 180,
    env: -1,
    color: 0x3b82f6,
    accent: 0x1e40af,
    desc: '브릿지 전원 — 첨두부하 대응',
    unlockEra: 0,
  },
  nuclear: {
    id: 'nuclear',
    name: '원전 (SMR)',
    icon: '⚛️',
    cost: 3000,
    power: 800,
    env: 0,
    color: 0xfafafa,
    accent: 0xef4444,
    desc: '신한울·SMR — 무탄소 기저전원',
    unlockEra: 1,
  },
  solar: {
    id: 'solar',
    name: '태양광',
    icon: '☀️',
    cost: 600,
    power: 80,
    env: 2,
    color: 0xfacc15,
    accent: 0xa16207,
    desc: '재생에너지 21.6% 목표',
    unlockEra: 0,
    intermittent: true,
  },
  wind: {
    id: 'wind',
    name: '해상풍력',
    icon: '🌬️',
    cost: 1200,
    power: 150,
    env: 2,
    color: 0xe5e7eb,
    accent: 0x60a5fa,
    desc: '서해안 해상풍력 단지',
    unlockEra: 0,
    intermittent: true,
  },
  substation: {
    id: 'substation',
    name: '변전소',
    icon: '⚡',
    cost: 400,
    power: 0,
    env: 0,
    color: 0x9ca3af,
    accent: 0xfbbf24,
    desc: '주변 도시에 전력 공급 (반경 140px)',
    unlockEra: 0,
    isSubstation: true,
    range: 140,
  },
  tower: {
    id: 'tower',
    name: '송전철탑',
    icon: '🗼',
    cost: 150,
    power: 0,
    env: 0,
    color: 0xa1a1aa,
    accent: 0xef4444,
    desc: '전송망 확장 — 변전소·철탑 체인 (반경 100px)',
    unlockEra: 0,
    isTower: true,
    range: 100,
  },
};

// 재난 이벤트 정의
export const DISASTERS = {
  lightning: {
    id: 'lightning',
    icon: '⚡',
    name: '낙뢰',
    desc: '여름철 뇌우로 시설 손상',
  },
  helicopter: {
    id: 'helicopter',
    icon: '🚁',
    name: '헬기 충돌',
    desc: '저공비행 헬기가 철탑에 충돌',
  },
  wildfire: {
    id: 'wildfire',
    icon: '🔥',
    name: '산불',
    desc: '반경 내 시설 동시 손상',
  },
};

// 수리 비용 비율
export const REPAIR_COST_RATIO = 0.5;

// 11차 전력수급기본계획 (2024~2038) 기반 시간 메카닉
export const YEAR = {
  START: 2024,
  END: 2038,
  DURATION_MS: 40000,              // 1게임년 = 40초
  DEMAND_GROWTH_PER_YEAR: 0.019,   // 연 +1.9% 복리 (실수치: 2023→2038 +31%)
  AI_SURGE_YEAR: 2030,             // 산업부: AI/반도체 수요 2배 폭증
  AI_SURGE_MULTIPLIER: 1.20,       // 2030년 한 번에 +20% 추가 충격
};

// 3차 지능형전력망 기본계획 4대 분야를 5장 카드로 압축
export const RESEARCH = {
  hvdc: {
    id: 'hvdc',
    name: 'HVDC 송전',
    icon: '⚡',
    cost: 100,
    desc: '송전 손실 -50%. 동해안→수도권 직류 송전.',
    effect: { transmissionLoss: -0.5 },
  },
  ess: {
    id: 'ess',
    name: 'ESS 저장',
    icon: '🔋',
    cost: 80,
    desc: '재생에너지 변동성 안정화 +30%.',
    effect: { intermittentBoost: 0.3 },
  },
  ami: {
    id: 'ami',
    name: 'AMI 계량',
    icon: '📊',
    cost: 60,
    desc: '도시당 코인 수익 +20%.',
    effect: { incomeBoost: 0.2 },
  },
  v2g: {
    id: 'v2g',
    name: 'V2G',
    icon: '🚗',
    cost: 120,
    desc: '점등 도시당 추가 전력 +5MW.',
    effect: { v2gBonus: 5 },
  },
  vpp: {
    id: 'vpp',
    name: 'VPP',
    icon: '🌐',
    cost: 150,
    desc: '재생에너지 출력 +25%. 분산자원 통합.',
    effect: { renewableBoost: 0.25 },
  },
};

// 게임 이벤트 (React <-> Phaser 통신)
export const EVENTS = {
  STATE_CHANGED: 'state-changed',
  BUILDING_SELECTED: 'building-selected',
  BUILDING_PLACED: 'building-placed',
  CITY_LIT: 'city-lit',
  CITY_BLACKOUT: 'city-blackout',
  RESEARCH_UNLOCKED: 'research-unlocked',
  DISASTER: 'disaster',
  BUILDING_DAMAGED: 'building-damaged',
  REPAIR_REQUESTED: 'repair-requested',
  BUILDING_REPAIRED: 'building-repaired',
  YEAR_CHANGED: 'year-changed',
  AI_SURGE: 'ai-surge',
};
