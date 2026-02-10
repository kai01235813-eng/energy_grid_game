import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Zap, Factory, Radio, Building2, TrendingUp, Shield,
  AlertTriangle, DollarSign, Award, ChevronRight, Power,
  Flame, Wind, Sun, Battery, Brain, Eye, FileText, Sparkles
} from 'lucide-react';

// 시대 정의
const ERAS = {
  DAWN: {
    id: 'dawn',
    name: '태동기 (1900s)',
    color: '#6b7280',
    bgColor: '#374151',
    description: '석탄 발전과 초기 송전 시대',
    requiredPower: 100,
    techPoints: 0,
    unlocks: ['coal_gen', 'basic_tower', 'basic_sub']
  },
  GROWTH: {
    id: 'growth',
    name: '성장기 (1960s)',
    color: '#3b82f6',
    bgColor: '#1e40af',
    description: '대형 발전소와 고압 송전 시대',
    requiredPower: 500,
    techPoints: 100,
    unlocks: ['oil_gen', 'high_tower', 'auto_sub', 'rag_tech']
  },
  INNOVATION: {
    id: 'innovation',
    name: '혁신기 (2020s)',
    color: '#10b981',
    bgColor: '#059669',
    description: '신재생 에너지와 AI 전력망 시대',
    requiredPower: 1500,
    techPoints: 300,
    unlocks: ['solar_gen', 'wind_gen', 'smart_tower', 'ai_sub', 'digital_twin', 'agentic_ai', 'ocr_idp']
  }
};

// 건물 타입 정의
const BUILDING_TYPES = {
  // 발전기
  coal_gen: {
    id: 'coal_gen',
    name: '석탄 발전기',
    type: 'generator',
    icon: '🏭',
    output: 50,
    cost: 100,
    era: 'dawn',
    color: '#6b7280',
    description: '초기 석탄 발전 시설'
  },
  oil_gen: {
    id: 'oil_gen',
    name: '석유 발전소',
    type: 'generator',
    icon: '⛽',
    output: 150,
    cost: 300,
    era: 'growth',
    color: '#f59e0b',
    description: '중대형 석유 화력 발전소'
  },
  solar_gen: {
    id: 'solar_gen',
    name: '태양광 발전소',
    type: 'generator',
    icon: '☀️',
    output: 100,
    cost: 400,
    era: 'innovation',
    color: '#fbbf24',
    description: '친환경 태양광 에너지'
  },
  wind_gen: {
    id: 'wind_gen',
    name: '풍력 발전소',
    type: 'generator',
    icon: '💨',
    output: 120,
    cost: 450,
    era: 'innovation',
    color: '#60a5fa',
    description: '해안 풍력 터빈'
  },
  
  // 송전철탑
  basic_tower: {
    id: 'basic_tower',
    name: '기본 송전탑',
    type: 'tower',
    icon: '🗼',
    range: 150,
    cost: 50,
    era: 'dawn',
    color: '#9ca3af',
    description: '초기 저압 송전 철탑'
  },
  high_tower: {
    id: 'high_tower',
    name: '고압 송전탑',
    type: 'tower',
    icon: '📡',
    range: 250,
    cost: 120,
    era: 'growth',
    color: '#60a5fa',
    description: '대용량 고압 송전 철탑'
  },
  smart_tower: {
    id: 'smart_tower',
    name: '스마트 송전탑',
    type: 'tower',
    icon: '🛰️',
    range: 300,
    cost: 200,
    era: 'innovation',
    color: '#10b981',
    description: 'IoT 센서 탑재 지능형 철탑'
  },
  
  // 변전소
  basic_sub: {
    id: 'basic_sub',
    name: '기본 변전소',
    type: 'substation',
    icon: '🏢',
    capacity: 100,
    cost: 150,
    era: 'dawn',
    color: '#6b7280',
    description: '수동 관리 기본 변전소'
  },
  auto_sub: {
    id: 'auto_sub',
    name: '자동화 변전소',
    type: 'substation',
    icon: '🏗️',
    capacity: 300,
    cost: 400,
    era: 'growth',
    color: '#3b82f6',
    description: '자동 전력 분배 변전소'
  },
  ai_sub: {
    id: 'ai_sub',
    name: 'AI 변전소',
    type: 'substation',
    icon: '🧠',
    capacity: 600,
    cost: 800,
    era: 'innovation',
    color: '#10b981',
    description: 'AI 예측 제어 스마트 변전소'
  }
};

// 기술 트리
const TECH_TREE = {
  rag_tech: {
    id: 'rag_tech',
    name: 'RAG 검색 증강',
    icon: FileText,
    cost: 50,
    era: 'growth',
    effect: '운영 매뉴얼 자동 검색으로 복구 시간 20% 단축',
    bonus: { repairSpeed: 1.2 }
  },
  digital_twin: {
    id: 'digital_twin',
    name: '디지털 트윈',
    icon: Eye,
    cost: 100,
    era: 'innovation',
    effect: '설비 고장 예측 확률 50% 증가',
    bonus: { failurePredict: 0.5 }
  },
  agentic_ai: {
    id: 'agentic_ai',
    name: 'Agentic AI',
    icon: Brain,
    cost: 150,
    era: 'innovation',
    effect: '사고 발생 시 자동 복구 시스템 활성화',
    bonus: { autoRepair: true }
  },
  ocr_idp: {
    id: 'ocr_idp',
    name: 'OCR/IDP 자동화',
    icon: Sparkles,
    cost: 80,
    era: 'innovation',
    effect: '문서 처리 자동화로 운영 비용 15% 절감',
    bonus: { costReduction: 0.15 }
  }
};

// 수요 지점 (도시)
const DEMAND_CITIES = [
  { id: 'city1', name: '창원시', x: 420, y: 380, demand: 200, icon: '🏙️' },
  { id: 'city2', name: '진주시', x: 280, y: 450, demand: 150, icon: '🏙️' },
  { id: 'city3', name: '통영시', x: 520, y: 480, demand: 100, icon: '🏘️' },
  { id: 'city4', name: '김해시', x: 450, y: 320, demand: 250, icon: '🏙️' },
  { id: 'city5', name: '마산시', x: 400, y: 420, demand: 120, icon: '🏘️' }
];

const EnergyGenesis = () => {
  const [currentEra, setCurrentEra] = useState(ERAS.DAWN);
  const [budget, setBudget] = useState(500);
  const [techPoints, setTechPoints] = useState(0);
  const [buildings, setBuildings] = useState([]);
  const [selectedBuildingType, setSelectedBuildingType] = useState(null);
  const [powerLines, setPowerLines] = useState([]);
  const [unlockedTechs, setUnlockedTechs] = useState([]);
  const [showTechTree, setShowTechTree] = useState(false);
  const [totalPowerOutput, setTotalPowerOutput] = useState(0);
  const [poweredCities, setPoweredCities] = useState([]);
  const [gameLog, setGameLog] = useState([]);
  const [failedBuildings, setFailedBuildings] = useState([]);

  // 로그 추가
  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('ko-KR');
    setGameLog(prev => [
      { message, type, timestamp, id: Date.now() },
      ...prev
    ].slice(0, 8));
  }, []);

  // 건물 배치
  const placeBuilding = useCallback((e) => {
    if (!selectedBuildingType) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const buildingDef = BUILDING_TYPES[selectedBuildingType];
    
    if (budget < buildingDef.cost) {
      addLog('예산이 부족합니다!', 'error');
      return;
    }

    const newBuilding = {
      id: Date.now(),
      type: selectedBuildingType,
      x,
      y,
      ...buildingDef,
      health: 100,
      connected: false
    };

    setBuildings(prev => [...prev, newBuilding]);
    setBudget(prev => prev - buildingDef.cost);
    addLog(`${buildingDef.name} 건설 완료 (${x.toFixed(0)}, ${y.toFixed(0)})`, 'success');

    // 변전소 건설 시 자동 연결
    if (buildingDef.type === 'substation') {
      setTimeout(() => autoConnectSubstation(newBuilding), 100);
    }
  }, [selectedBuildingType, budget, addLog]);

  // 변전소 자동 연결 (가장 가까운 송전탑과 연결)
  const autoConnectSubstation = useCallback((substation) => {
    const towers = buildings.filter(b => b.type === 'tower');
    const generators = buildings.filter(b => b.type === 'generator');

    if (towers.length === 0) {
      addLog('연결 가능한 송전탑이 없습니다!', 'warning');
      return;
    }

    const newLines = [];

    // 가장 가까운 송전탑 찾기
    let nearestTower = null;
    let minDistance = Infinity;

    towers.forEach(tower => {
      const distance = Math.sqrt(
        Math.pow(tower.x - substation.x, 2) + 
        Math.pow(tower.y - substation.y, 2)
      );

      if (distance <= tower.range && distance < minDistance) {
        minDistance = distance;
        nearestTower = tower;
      }
    });

    if (nearestTower) {
      newLines.push({
        id: `line-${Date.now()}-1`,
        from: nearestTower.id,
        to: substation.id,
        fromX: nearestTower.x,
        fromY: nearestTower.y,
        toX: substation.x,
        toY: substation.y,
        active: true
      });
      addLog(`${substation.name} ↔ 송전탑 연결 완료`, 'success');
    }

    // 송전탑과 발전기 연결
    generators.forEach(gen => {
      const distance = Math.sqrt(
        Math.pow(gen.x - (nearestTower?.x || 0), 2) + 
        Math.pow(gen.y - (nearestTower?.y || 0), 2)
      );

      if (nearestTower && distance <= nearestTower.range) {
        newLines.push({
          id: `line-${Date.now()}-${gen.id}`,
          from: gen.id,
          to: nearestTower.id,
          fromX: gen.x,
          fromY: gen.y,
          toX: nearestTower.x,
          toY: nearestTower.y,
          active: true
        });
      }
    });

    if (newLines.length > 0) {
      setPowerLines(prev => [...prev, ...newLines]);
    }
  }, [buildings, addLog]);

  // 전력 공급 계산
  useEffect(() => {
    const generators = buildings.filter(b => b.type === 'generator');
    const substations = buildings.filter(b => b.type === 'substation');

    // 총 발전량 계산
    const totalOutput = generators.reduce((sum, gen) => sum + gen.output, 0);
    setTotalPowerOutput(totalOutput);

    // 연결된 변전소를 통해 공급되는 도시 계산
    const powered = [];
    
    substations.forEach(sub => {
      const connectedLines = powerLines.filter(
        line => line.to === sub.id || line.from === sub.id
      );

      if (connectedLines.length > 0) {
        // 이 변전소 근처의 도시들에게 전력 공급
        DEMAND_CITIES.forEach(city => {
          const distance = Math.sqrt(
            Math.pow(city.x - sub.x, 2) + 
            Math.pow(city.y - sub.y, 2)
          );

          if (distance <= 150 && !powered.includes(city.id)) {
            powered.push(city.id);
          }
        });
      }
    });

    setPoweredCities(powered);

    // 수익 생성 (전력 공급 중인 도시에서)
    if (powered.length > 0) {
      const interval = setInterval(() => {
        const income = powered.length * 10;
        setBudget(prev => prev + income);
        setTechPoints(prev => prev + powered.length);
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [buildings, powerLines]);

  // 시대 진화 체크
  useEffect(() => {
    const totalDemand = DEMAND_CITIES.reduce((sum, city) => sum + city.demand, 0);
    const supplyRate = (totalPowerOutput / totalDemand) * 100;

    if (currentEra.id === 'dawn' && supplyRate >= 50 && techPoints >= 100) {
      addLog('🎉 성장기로 진화 가능!', 'success');
    } else if (currentEra.id === 'growth' && supplyRate >= 80 && techPoints >= 300) {
      addLog('🎉 혁신기로 진화 가능!', 'success');
    }
  }, [totalPowerOutput, techPoints, currentEra, addLog]);

  // 시대 진화
  const evolveEra = () => {
    if (currentEra.id === 'dawn' && techPoints >= 100) {
      setCurrentEra(ERAS.GROWTH);
      addLog('⚡ 성장기 돌입! 고압 송전 시대가 열렸습니다.', 'success');
    } else if (currentEra.id === 'growth' && techPoints >= 300) {
      setCurrentEra(ERAS.INNOVATION);
      addLog('🚀 혁신기 돌입! AI와 신재생 에너지 시대!', 'success');
    }
  };

  // 기술 구매
  const purchaseTech = (techId) => {
    const tech = TECH_TREE[techId];
    
    if (unlockedTechs.includes(techId)) {
      addLog('이미 연구한 기술입니다.', 'warning');
      return;
    }

    if (techPoints < tech.cost) {
      addLog('기술 포인트가 부족합니다!', 'error');
      return;
    }

    setTechPoints(prev => prev - tech.cost);
    setUnlockedTechs(prev => [...prev, techId]);
    addLog(`${tech.name} 연구 완료!`, 'success');
  };

  // 건물 고장 시뮬레이션 (랜덤)
  useEffect(() => {
    const failureInterval = setInterval(() => {
      if (buildings.length > 0 && Math.random() > 0.9) {
        const randomBuilding = buildings[Math.floor(Math.random() * buildings.length)];
        
        // Agentic AI가 있으면 자동 복구
        if (unlockedTechs.includes('agentic_ai')) {
          addLog(`🤖 AI가 ${randomBuilding.name} 자동 복구 완료`, 'success');
        } else {
          setFailedBuildings(prev => [...prev, randomBuilding.id]);
          addLog(`⚠️ ${randomBuilding.name} 고장 발생!`, 'error');
          
          // 디지털 트윈 예측
          if (unlockedTechs.includes('digital_twin') && Math.random() > 0.5) {
            addLog('🔮 디지털 트윈이 고장을 예측했습니다!', 'warning');
          }
        }
      }
    }, 15000);

    return () => clearInterval(failureInterval);
  }, [buildings, unlockedTechs, addLog]);

  // 가용 건물 필터
  const availableBuildings = Object.values(BUILDING_TYPES).filter(b => 
    currentEra.unlocks.includes(b.id)
  );

  // 총 수요
  const totalDemand = DEMAND_CITIES.reduce((sum, city) => sum + city.demand, 0);
  const supplyRate = Math.min((totalPowerOutput / totalDemand) * 100, 100);

  return (
    <div className="w-screen h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 text-white overflow-hidden">
      {/* 헤더 */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          {/* 타이틀 */}
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 mb-1">
              <Zap className="w-8 h-8 text-yellow-400" />
              Energy Genesis
            </h1>
            <div 
              className="text-sm font-bold px-3 py-1 rounded-full inline-block"
              style={{ backgroundColor: currentEra.bgColor, color: 'white' }}
            >
              {currentEra.name}
            </div>
          </div>

          {/* 통계 */}
          <div className="flex gap-4">
            <div className="bg-black/60 border-2 border-yellow-500 rounded-lg px-4 py-2">
              <div className="text-xs text-gray-400">예산</div>
              <div className="text-xl font-bold text-yellow-400 flex items-center gap-1">
                <DollarSign className="w-5 h-5" />
                ₩{budget.toLocaleString()}
              </div>
            </div>
            <div className="bg-black/60 border-2 border-blue-500 rounded-lg px-4 py-2">
              <div className="text-xs text-gray-400">전력 공급률</div>
              <div className="text-xl font-bold text-blue-400 flex items-center gap-1">
                <Power className="w-5 h-5" />
                {supplyRate.toFixed(0)}%
              </div>
            </div>
            <div className="bg-black/60 border-2 border-purple-500 rounded-lg px-4 py-2">
              <div className="text-xs text-gray-400">기술 포인트</div>
              <div className="text-xl font-bold text-purple-400 flex items-center gap-1">
                <Award className="w-5 h-5" />
                {techPoints}
              </div>
            </div>
          </div>

          {/* 시대 진화 버튼 */}
          {((currentEra.id === 'dawn' && techPoints >= 100) || 
            (currentEra.id === 'growth' && techPoints >= 300)) && (
            <motion.button
              onClick={evolveEra}
              className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 rounded-lg font-bold flex items-center gap-2"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              animate={{
                boxShadow: ['0 0 20px rgba(168, 85, 247, 0.5)', '0 0 40px rgba(236, 72, 153, 0.8)', '0 0 20px rgba(168, 85, 247, 0.5)']
              }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <TrendingUp className="w-5 h-5" />
              시대 진화
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          )}

          {/* 기술 트리 버튼 */}
          <button
            onClick={() => setShowTechTree(!showTechTree)}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Brain className="w-5 h-5" />
            기술 연구
          </button>
        </div>
      </div>

      {/* 메인 게임 영역 */}
      <div className="absolute inset-0 pt-32 pb-48">
        <div 
          className="relative w-full h-full bg-cover bg-center cursor-crosshair"
          onClick={placeBuilding}
          style={{
            backgroundImage: 'url(/map_bg.jpg)',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center'
          }}
        >
          {/* 전력선 */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
            {powerLines.map(line => (
              <motion.line
                key={line.id}
                x1={line.fromX}
                y1={line.fromY}
                x2={line.toX}
                y2={line.toY}
                stroke={line.active ? '#3b82f6' : '#6b7280'}
                strokeWidth="3"
                strokeDasharray="5,5"
                initial={{ pathLength: 0 }}
                animate={{ 
                  pathLength: 1,
                  strokeDashoffset: [0, -10]
                }}
                transition={{
                  pathLength: { duration: 0.5 },
                  strokeDashoffset: { duration: 1, repeat: Infinity, ease: 'linear' }
                }}
                filter="drop-shadow(0 0 4px rgba(59, 130, 246, 0.8))"
              />
            ))}
          </svg>

          {/* 도시 (수요 지점) */}
          {DEMAND_CITIES.map(city => {
            const isPowered = poweredCities.includes(city.id);
            return (
              <motion.div
                key={city.id}
                className="absolute"
                style={{
                  left: city.x,
                  top: city.y,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 8
                }}
                animate={{
                  filter: isPowered 
                    ? ['drop-shadow(0 0 10px rgba(34, 197, 94, 0.8))', 'drop-shadow(0 0 20px rgba(34, 197, 94, 1))', 'drop-shadow(0 0 10px rgba(34, 197, 94, 0.8))']
                    : 'drop-shadow(0 0 5px rgba(107, 114, 128, 0.5))'
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <div className={`text-4xl ${isPowered ? 'grayscale-0' : 'grayscale'}`}>
                  {city.icon}
                </div>
                <div className="text-xs font-bold text-center mt-1 bg-black/70 px-2 py-1 rounded">
                  {city.name}
                  <div className={`text-xs ${isPowered ? 'text-green-400' : 'text-red-400'}`}>
                    {isPowered ? '⚡ 공급중' : '💤 정전'}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {/* 건물들 */}
          {buildings.map(building => {
            const isFailed = failedBuildings.includes(building.id);
            return (
              <motion.div
                key={building.id}
                className="absolute cursor-pointer group"
                style={{
                  left: building.x,
                  top: building.y,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10
                }}
                whileHover={{ scale: 1.2 }}
                animate={isFailed ? {
                  filter: ['brightness(1)', 'brightness(0.5)', 'brightness(1)']
                } : {}}
                transition={isFailed ? { duration: 0.5, repeat: Infinity } : {}}
              >
                <div 
                  className="text-5xl"
                  style={{
                    filter: `drop-shadow(0 0 10px ${building.color})`
                  }}
                >
                  {building.icon}
                </div>
                
                {/* 건물 정보 툴팁 */}
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-black/90 border-2 rounded-lg p-2 min-w-[150px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ borderColor: building.color, zIndex: 50 }}
                >
                  <div className="text-white font-bold text-sm">{building.name}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {building.type === 'generator' && `출력: ${building.output}MW`}
                    {building.type === 'tower' && `범위: ${building.range}m`}
                    {building.type === 'substation' && `용량: ${building.capacity}MW`}
                  </div>
                  {isFailed && (
                    <div className="text-xs text-red-400 mt-1">⚠️ 고장</div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* 건물 선택 패널 */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black via-black/95 to-transparent p-6">
        <div className="max-w-screen-2xl mx-auto">
          {/* 건설 순서 안내 */}
          <div className="mb-4 text-center">
            <div className="inline-flex items-center gap-3 bg-blue-900/50 border-2 border-blue-500 rounded-lg px-6 py-3">
              <Factory className="w-6 h-6 text-yellow-400" />
              <span className="text-sm font-bold">발전기 건설</span>
              <ChevronRight className="w-5 h-5 text-gray-400" />
              <Radio className="w-6 h-6 text-blue-400" />
              <span className="text-sm font-bold">송전탑 건설</span>
              <ChevronRight className="w-5 h-5 text-gray-400" />
              <Building2 className="w-6 h-6 text-green-400" />
              <span className="text-sm font-bold">변전소 건설 (자동 연결)</span>
            </div>
          </div>

          {/* 건물 타입별 분류 */}
          <div className="grid grid-cols-3 gap-4">
            {/* 발전기 */}
            <div>
              <h3 className="text-sm font-bold text-yellow-400 mb-2 flex items-center gap-2">
                <Factory className="w-4 h-4" />
                발전기
              </h3>
              <div className="flex gap-2 flex-wrap">
                {availableBuildings.filter(b => b.type === 'generator').map(building => (
                  <motion.button
                    key={building.id}
                    onClick={() => setSelectedBuildingType(building.id)}
                    className={`relative bg-gradient-to-br from-gray-800 to-gray-900 border-2 rounded-lg p-3 min-w-[120px] transition-all ${
                      selectedBuildingType === building.id 
                        ? 'border-yellow-400 shadow-lg shadow-yellow-400/50' 
                        : 'border-gray-600 hover:border-yellow-400'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <div className="text-3xl mb-1">{building.icon}</div>
                    <div className="text-xs font-bold">{building.name}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      출력: {building.output}MW
                    </div>
                    <div className="text-xs text-yellow-400 font-bold mt-1">
                      ₩{building.cost}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* 송전탑 */}
            <div>
              <h3 className="text-sm font-bold text-blue-400 mb-2 flex items-center gap-2">
                <Radio className="w-4 h-4" />
                송전탑
              </h3>
              <div className="flex gap-2 flex-wrap">
                {availableBuildings.filter(b => b.type === 'tower').map(building => (
                  <motion.button
                    key={building.id}
                    onClick={() => setSelectedBuildingType(building.id)}
                    className={`relative bg-gradient-to-br from-gray-800 to-gray-900 border-2 rounded-lg p-3 min-w-[120px] transition-all ${
                      selectedBuildingType === building.id 
                        ? 'border-blue-400 shadow-lg shadow-blue-400/50' 
                        : 'border-gray-600 hover:border-blue-400'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <div className="text-3xl mb-1">{building.icon}</div>
                    <div className="text-xs font-bold">{building.name}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      범위: {building.range}m
                    </div>
                    <div className="text-xs text-yellow-400 font-bold mt-1">
                      ₩{building.cost}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* 변전소 */}
            <div>
              <h3 className="text-sm font-bold text-green-400 mb-2 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                변전소
              </h3>
              <div className="flex gap-2 flex-wrap">
                {availableBuildings.filter(b => b.type === 'substation').map(building => (
                  <motion.button
                    key={building.id}
                    onClick={() => setSelectedBuildingType(building.id)}
                    className={`relative bg-gradient-to-br from-gray-800 to-gray-900 border-2 rounded-lg p-3 min-w-[120px] transition-all ${
                      selectedBuildingType === building.id 
                        ? 'border-green-400 shadow-lg shadow-green-400/50' 
                        : 'border-gray-600 hover:border-green-400'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <div className="text-3xl mb-1">{building.icon}</div>
                    <div className="text-xs font-bold">{building.name}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      용량: {building.capacity}MW
                    </div>
                    <div className="text-xs text-yellow-400 font-bold mt-1">
                      ₩{building.cost}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 게임 로그 */}
      <div className="absolute top-32 right-4 z-20 w-80">
        <div className="bg-black/80 border-2 border-cyan-500 rounded-lg p-3">
          <h3 className="text-sm font-bold text-cyan-400 mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            시스템 로그
          </h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            <AnimatePresence>
              {gameLog.map(log => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={`text-xs p-2 rounded ${
                    log.type === 'error' ? 'bg-red-900/50 text-red-300' :
                    log.type === 'warning' ? 'bg-yellow-900/50 text-yellow-300' :
                    log.type === 'success' ? 'bg-green-900/50 text-green-300' :
                    'bg-blue-900/50 text-blue-300'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="flex-1">{log.message}</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{log.timestamp}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 기술 트리 패널 */}
      <AnimatePresence>
        {showTechTree && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 z-40 flex items-center justify-center"
            onClick={() => setShowTechTree(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-gradient-to-br from-gray-900 to-slate-900 border-4 border-cyan-500 rounded-2xl p-8 max-w-4xl w-full m-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
                <Brain className="w-8 h-8 text-cyan-400" />
                기술 연구 트리
                <span className="text-sm text-gray-400 ml-auto">
                  보유 포인트: {techPoints}
                </span>
              </h2>

              <div className="grid grid-cols-2 gap-4">
                {Object.values(TECH_TREE).filter(tech => 
                  tech.era === currentEra.id || 
                  (currentEra.id === 'innovation' && tech.era === 'growth')
                ).map(tech => {
                  const isUnlocked = unlockedTechs.includes(tech.id);
                  const canAfford = techPoints >= tech.cost;
                  const Icon = tech.icon;

                  return (
                    <motion.div
                      key={tech.id}
                      className={`relative bg-gradient-to-br rounded-xl p-6 border-2 ${
                        isUnlocked 
                          ? 'from-green-900 to-emerald-900 border-green-400'
                          : canAfford
                            ? 'from-gray-800 to-gray-900 border-cyan-400 cursor-pointer hover:border-cyan-300'
                            : 'from-gray-900 to-slate-900 border-gray-600 opacity-50'
                      }`}
                      whileHover={!isUnlocked && canAfford ? { scale: 1.02 } : {}}
                      onClick={() => !isUnlocked && canAfford && purchaseTech(tech.id)}
                    >
                      {isUnlocked && (
                        <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                          ✓ 연구완료
                        </div>
                      )}
                      
                      <div className="flex items-start gap-4">
                        <Icon className="w-12 h-12 text-cyan-400 flex-shrink-0" />
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-white mb-2">{tech.name}</h3>
                          <p className="text-sm text-gray-300 mb-3">{tech.effect}</p>
                          <div className="flex items-center justify-between">
                            <div className="text-lg font-bold text-purple-400">
                              {tech.cost} 포인트
                            </div>
                            {!isUnlocked && canAfford && (
                              <button className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                                연구하기
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <button
                onClick={() => setShowTechTree(false)}
                className="mt-6 w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-bold"
              >
                닫기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EnergyGenesis;
