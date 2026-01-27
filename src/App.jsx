import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useEggUser } from './hooks/useEggUser';
import { useEggEngine } from './hooks/useEggEngine';
import RegionSelection from './components/RegionSelection';
import GyeongnamMap from './components/GyeongnamMap';
import StarterPackUI from './components/StarterPackUI';
import EconomyPanel from './components/EconomyPanel';
import GridReconnectedEffect from './components/GridReconnectedEffect';
import { Power, Zap } from 'lucide-react';

function App() {
  const { user, convertExpToCoins, spendCoins, selectRegion, gainExp } = useEggUser();
  const { 
    gameState, 
    claimStarterPack, 
    placeBuilding,
    connectBuildings,
    simulatePowerFlow,
    resetGame,
  } = useEggEngine(user.selectedRegion);

  const [showReconnectedEffect, setShowReconnectedEffect] = useState(false);
  const [buildingMode, setBuildingMode] = useState(null); // 현재 배치 중인 건물

  // 지역 선택 핸들러
  const handleRegionSelect = (regionId) => {
    selectRegion(regionId);
  };

  // 스타터팩 수령
  const handleClaimPack = () => {
    return claimStarterPack();
  };

  // 도시 클릭 시 건물 배치
  const handleCityClick = (city) => {
    if (buildingMode) {
      const building = gameState.buildings.find(b => b.id === buildingMode && !b.placed);
      if (building) {
        placeBuilding(building.id, { x: city.x, y: city.y });
        
        // 다음 건물로 자동 전환
        const nextBuilding = gameState.buildings.find(b => !b.placed);
        setBuildingMode(nextBuilding?.id || null);
      }
    }
  };

  // 전력 공급 테스트 (모든 건물 배치 완료 시)
  const handleActivateGrid = () => {
    const allPlaced = gameState.buildings.every(b => b.placed);
    if (allPlaced) {
      const result = simulatePowerFlow();
      if (result.success) {
        setShowReconnectedEffect(true);
        gainExp(500); // 보상
      }
    }
  };

  // 첫 번째 미배치 건물을 자동으로 선택
  useEffect(() => {
    if (gameState.starterPackUsed && !buildingMode) {
      const firstUnplaced = gameState.buildings.find(b => !b.placed);
      if (firstUnplaced) {
        setBuildingMode(firstUnplaced.id);
      }
    }
  }, [gameState.buildings, gameState.starterPackUsed, buildingMode]);

  // 지역 선택이 안 된 경우
  if (!user.selectedRegion) {
    return <RegionSelection onSelectRegion={handleRegionSelect} />;
  }

  const allBuildingsPlaced = gameState.buildings.length > 0 && gameState.buildings.every(b => b.placed);

  return (
    <div className="w-screen h-screen bg-cyber-darker relative overflow-hidden">
      {/* 배경 애니메이션 그리드 */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="w-full h-full" style={{
          backgroundImage: 'linear-gradient(#00d4ff 1px, transparent 1px), linear-gradient(90deg, #00d4ff 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }} />
      </div>

      {/* 경제 패널 */}
      <EconomyPanel 
        user={user}
        onConvertExp={convertExpToCoins}
        onSpendCoins={spendCoins}
      />

      {/* 메인 맵 */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-6xl h-full max-h-[800px]">
          <GyeongnamMap 
            selectedRegion={user.selectedRegion}
            gameState={gameState}
            onCityClick={handleCityClick}
          />
        </div>
      </div>

      {/* 스타터팩 UI */}
      {!gameState.starterPackUsed && (
        <StarterPackUI 
          onClaimPack={handleClaimPack}
          gameState={gameState}
        />
      )}

      {/* 건물 배치 패널 */}
      {gameState.starterPackUsed && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20">
          <div className="bg-cyber-dark bg-opacity-95 border-2 border-cyber-blue rounded-2xl p-6 min-w-[600px]">
            <h3 className="text-xl font-bold text-cyber-blue mb-4 text-center">
              건물 배치 현황
            </h3>
            
            <div className="flex gap-3 mb-4 overflow-x-auto">
              {gameState.buildings.map((building) => (
                <button
                  key={building.id}
                  onClick={() => !building.placed && setBuildingMode(building.id)}
                  disabled={building.placed}
                  className={`
                    flex-shrink-0 p-3 rounded-lg border-2 transition-all
                    ${building.placed 
                      ? 'bg-cyber-darker border-green-500 opacity-50' 
                      : buildingMode === building.id
                        ? 'bg-cyber-blue bg-opacity-20 border-cyber-blue scale-110'
                        : 'bg-cyber-darker border-gray-600 hover:border-cyber-blue'
                    }
                  `}
                >
                  <div className="text-3xl mb-1">{building.icon}</div>
                  <div className="text-xs text-center">
                    {building.placed ? '✓' : building.name}
                  </div>
                </button>
              ))}
            </div>

            {!allBuildingsPlaced && (
              <p className="text-sm text-gray-400 text-center">
                맵의 도시를 클릭하여 {gameState.buildings.find(b => b.id === buildingMode)?.name || '건물'}을 배치하세요
              </p>
            )}

            {allBuildingsPlaced && gameState.phase !== 'operational' && (
              <button
                onClick={handleActivateGrid}
                className="w-full bg-gradient-to-r from-cyber-gold to-cyber-red text-white font-bold text-lg py-4 rounded-lg flex items-center justify-center gap-3 animate-pulse"
                style={{
                  boxShadow: '0 0 40px rgba(255, 215, 0, 0.6)',
                }}
              >
                <Power className="w-6 h-6" />
                전력망 활성화
                <Zap className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 게임 상태 표시 */}
      <div className="absolute top-4 right-4 z-20 bg-cyber-dark bg-opacity-90 border-2 border-cyber-blue rounded-lg px-4 py-2">
        <p className="text-xs text-gray-400">게임 단계</p>
        <p className="text-sm font-bold text-cyber-blue">
          {gameState.phase === 'initial' && '⚫ 블랙아웃'}
          {gameState.phase === 'building' && '🔨 건설중'}
          {gameState.phase === 'operational' && '⚡ 운영중'}
        </p>
      </div>

      {/* Grid Reconnected 효과 */}
      <AnimatePresence>
        {showReconnectedEffect && (
          <GridReconnectedEffect 
            onComplete={() => setShowReconnectedEffect(false)}
          />
        )}
      </AnimatePresence>

      {/* 개발자 리셋 버튼 */}
      <button
        onClick={() => {
          if (window.confirm('게임을 리셋하시겠습니까?')) {
            resetGame();
            localStorage.removeItem('egg_user');
            window.location.reload();
          }
        }}
        className="absolute bottom-4 left-4 z-20 text-xs text-gray-600 hover:text-gray-400 transition-colors"
      >
        [DEV] Reset Game
      </button>
    </div>
  );
}

export default App;
