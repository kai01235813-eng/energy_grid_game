import { useState, useEffect, useCallback } from 'react';
import { BUILDING_TYPES, DEMAND_POINTS, REGIONS } from '../constants/gameConfig';

/**
 * useEggEngine - 게임 엔진 로직 (전력 흐름, 건물 배치, 효율 계산)
 */
export const useEggEngine = (selectedRegion) => {
  const [gameState, setGameState] = useState(() => {
    const saved = localStorage.getItem('egg_game_state');
    if (saved) {
      return JSON.parse(saved);
    }

    return {
      buildings: [],
      connections: [],
      cities: [],
      demandPoints: DEMAND_POINTS.map(p => ({ ...p })),
      starterPackUsed: false,
      phase: 'initial', // initial, building, operational
      totalPowerGenerated: 0,
      totalPowerDelivered: 0,
      efficiency: 100,
    };
  });

  // 게임 상태 저장
  useEffect(() => {
    localStorage.setItem('egg_game_state', JSON.stringify(gameState));
  }, [gameState]);

  // 스타터팩 지급
  const claimStarterPack = useCallback(() => {
    if (gameState.starterPackUsed) {
      return { success: false, message: '이미 스타터팩을 수령했습니다.' };
    }

    const starterBuildings = Object.values(BUILDING_TYPES)
      .filter(b => b.starterPack)
      .map((building, index) => ({
        id: `starter_${building.id}_${Date.now()}_${index}`,
        type: building.id,
        ...building,
        position: null,
        placed: false,
      }));

    setGameState(prev => ({
      ...prev,
      buildings: starterBuildings,
      starterPackUsed: true,
      phase: 'building',
    }));

    return { success: true, buildings: starterBuildings };
  }, [gameState.starterPackUsed]);

  // 건물 배치
  const placeBuilding = useCallback((buildingId, position) => {
    setGameState(prev => {
      const buildings = prev.buildings.map(b => 
        b.id === buildingId 
          ? { ...b, position, placed: true }
          : b
      );

      return { ...prev, buildings };
    });

    return { success: true };
  }, []);

  // 두 건물 연결
  const connectBuildings = useCallback((fromId, toId) => {
    const connection = {
      id: `conn_${Date.now()}`,
      from: fromId,
      to: toId,
      type: 'ac',
      efficiency: 100,
      active: true,
    };

    setGameState(prev => ({
      ...prev,
      connections: [...prev.connections, connection],
    }));

    return { success: true, connection };
  }, []);

  // 전력 손실 계산
  const calculatePowerLoss = useCallback((distance, buildingType) => {
    const building = BUILDING_TYPES[buildingType];
    if (!building || !building.lossRate) return 0;

    // 지역 버프 적용
    let lossRate = building.lossRate;
    if (selectedRegion && REGIONS[selectedRegion]?.buff?.type === 'efficiency') {
      lossRate *= REGIONS[selectedRegion].buff.value;
    }

    return distance * lossRate;
  }, [selectedRegion]);

  // HVDC 업그레이드
  const upgradeToHVDC = useCallback((connectionId) => {
    setGameState(prev => {
      const connections = prev.connections.map(c =>
        c.id === connectionId
          ? { ...c, type: 'hvdc', efficiency: 100 }
          : c
      );

      return { ...prev, connections };
    });

    return { success: true };
  }, []);

  // 전력 공급 시뮬레이션
  const simulatePowerFlow = useCallback(() => {
    // 간단한 시뮬레이션: 발전소 → 변전소 → 변압기 → 마을
    const powerPlants = gameState.buildings.filter(b => b.type === 'powerPlant' && b.placed);
    const transformers = gameState.buildings.filter(b => b.type === 'transformer' && b.placed);

    if (powerPlants.length === 0 || transformers.length === 0) {
      return { success: false, powered: [] };
    }

    // 모든 수요지에 전력 공급
    const updatedDemandPoints = gameState.demandPoints.map(dp => ({
      ...dp,
      power: dp.demand, // 단순화: 모든 수요 충족
    }));

    setGameState(prev => ({
      ...prev,
      demandPoints: updatedDemandPoints,
      phase: 'operational',
      totalPowerGenerated: 1000,
      totalPowerDelivered: 950,
      efficiency: 95,
    }));

    return { success: true, powered: updatedDemandPoints };
  }, [gameState.buildings, gameState.demandPoints]);

  // 게임 리셋
  const resetGame = useCallback(() => {
    setGameState({
      buildings: [],
      connections: [],
      demandPoints: DEMAND_POINTS.map(p => ({ ...p })),
      starterPackUsed: false,
      phase: 'initial',
      totalPowerGenerated: 0,
      totalPowerDelivered: 0,
      efficiency: 100,
    });
    localStorage.removeItem('egg_game_state');
  }, []);

  return {
    gameState,
    claimStarterPack,
    placeBuilding,
    connectBuildings,
    calculatePowerLoss,
    upgradeToHVDC,
    simulatePowerFlow,
    resetGame,
  };
};
