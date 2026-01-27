// ===========================
// 게임 상수 및 설정
// ===========================

export const GAME_CONFIG = {
  EXP_TO_COIN_RATIO: 10, // 1 EXP = 10 Coin
  INITIAL_EXP: 1000,
  INITIAL_COINS: 0,
};

// 지역별 버프 시스템
export const REGIONS = {
  changwon: {
    id: 'changwon',
    name: '창원',
    nameEn: 'Changwon',
    description: '산업의 심장부',
    buff: {
      type: 'revenue',
      value: 1.2,
      label: '수익 +20%'
    },
    color: '#ffd700',
    position: { x: 420, y: 380 }
  },
  jinju: {
    id: 'jinju',
    name: '진주',
    nameEn: 'Jinju',
    description: '혁신 기술의 요람',
    buff: {
      type: 'construction',
      value: 0.85,
      label: '건설비 -15%'
    },
    color: '#00d4ff',
    position: { x: 280, y: 450 }
  },
  tongyeong: {
    id: 'tongyeong',
    name: '통영',
    nameEn: 'Tongyeong',
    description: '신재생 에너지 허브',
    buff: {
      type: 'efficiency',
      value: 0.5,
      label: '손실 -50%'
    },
    color: '#00ff88',
    position: { x: 520, y: 480 }
  },
  haman: {
    id: 'haman',
    name: '함안',
    nameEn: 'Haman',
    description: '네트워크 교통의 중심',
    buff: {
      type: 'speed',
      value: 1.5,
      label: '건설속도 +50%'
    },
    color: '#ff3366',
    position: { x: 340, y: 320 }
  }
};

// 스타터팩 건물 정의
export const BUILDING_TYPES = {
  powerPlant: {
    id: 'powerPlant',
    name: '발전소',
    nameEn: 'Power Plant',
    icon: '🏭',
    cost: 500,
    description: '전력의 시작점',
    starterPack: true,
    color: '#ffd700'
  },
  transmission: {
    id: 'transmission',
    name: '송전철탑',
    nameEn: 'Transmission Tower',
    icon: '🗼',
    cost: 200,
    description: 'AC 송전 (손실 발생)',
    starterPack: true,
    lossRate: 0.02, // 거리당 2% 손실
    color: '#ff6b6b'
  },
  substation: {
    id: 'substation',
    name: '변전소',
    nameEn: 'Substation',
    icon: '⚡',
    cost: 300,
    description: '전압 변환',
    starterPack: true,
    color: '#4dabf7'
  },
  cable: {
    id: 'cable',
    name: '전력케이블',
    nameEn: 'Power Cable',
    icon: '🔌',
    cost: 150,
    description: '중압 배전',
    starterPack: true,
    lossRate: 0.01,
    color: '#ff9f43'
  },
  pole: {
    id: 'pole',
    name: '전신주',
    nameEn: 'Utility Pole',
    icon: '📡',
    cost: 50,
    description: '저압 배전',
    starterPack: true,
    color: '#95a5a6'
  },
  transformer: {
    id: 'transformer',
    name: '변압기',
    nameEn: 'Transformer',
    icon: '🔋',
    cost: 100,
    description: '최종 전압 조정',
    starterPack: true,
    color: '#6c5ce7'
  },
  hvdc: {
    id: 'hvdc',
    name: 'HVDC 변환소',
    nameEn: 'HVDC Converter',
    icon: '⚡',
    cost: 1000,
    description: '직류 송전 (손실 0%)',
    starterPack: false,
    lossRate: 0,
    color: '#00d4ff'
  }
};

// 경남 주요 도시 좌표 (map.jpg 기반 단순화)
export const GYEONGNAM_CITIES = [
  { id: 'changwon', name: '창원', x: 420, y: 380, type: 'industrial' },
  { id: 'jinju', name: '진주', x: 280, y: 450, type: 'tech' },
  { id: 'tongyeong', name: '통영', x: 520, y: 480, type: 'renewable' },
  { id: 'haman', name: '함안', x: 340, y: 320, type: 'network' },
  { id: 'gimhae', name: '김해', x: 450, y: 320, type: 'residential' },
  { id: 'geoje', name: '거제', x: 580, y: 520, type: 'industrial' },
  { id: 'sacheon', name: '사천', x: 360, y: 520, type: 'residential' },
  { id: 'yangsan', name: '양산', x: 520, y: 280, type: 'residential' },
];

// 마을/산업단지 정의 (초기 어둠 상태)
export const DEMAND_POINTS = [
  { id: 'village1', name: '해안마을', x: 560, y: 500, power: 0, demand: 50, type: 'village' },
  { id: 'village2', name: '산골마을', x: 300, y: 420, power: 0, demand: 30, type: 'village' },
  { id: 'village3', name: '평야마을', x: 380, y: 350, power: 0, demand: 40, type: 'village' },
  { id: 'industrial1', name: '창원산단', x: 440, y: 400, power: 0, demand: 200, type: 'industrial' },
  { id: 'industrial2', name: '김해산단', x: 470, y: 340, power: 0, demand: 150, type: 'industrial' },
];
