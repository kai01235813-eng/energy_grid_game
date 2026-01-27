import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, X, Trash2, Zap, DollarSign, 
  Eye, MapPin, Database, RefreshCw 
} from 'lucide-react';

const DevPanel = ({ 
  gameState, 
  onAddMoney, 
  onResetGame, 
  onForceLight,
  onMapClick 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [clickCoords, setClickCoords] = useState(null);

  const handleClearStorage = () => {
    if (window.confirm('localStorage를 완전히 삭제하시겠습니까?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <>
      {/* 개발자 모드 토글 버튼 */}
      <motion.button
        className="fixed top-20 right-4 z-50 bg-purple-900 border-2 border-purple-500 text-purple-200 p-3 rounded-lg shadow-lg hover:bg-purple-800 transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Terminal className="w-5 h-5" />
      </motion.button>

      {/* 개발자 패널 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            className="fixed top-20 right-4 z-50 w-96 bg-cyber-dark bg-opacity-95 border-2 border-purple-500 rounded-lg shadow-2xl backdrop-blur-md"
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between p-4 border-b border-purple-500">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-bold text-purple-400">Admin Panel</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-purple-400 hover:text-purple-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 상태 모니터링 */}
            <div className="p-4 border-b border-purple-800">
              <h4 className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
                <Database className="w-4 h-4" />
                Game State
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-gray-300">
                  <span>Phase:</span>
                  <span className="text-cyber-blue font-bold">{gameState?.phase || 'unknown'}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Buildings:</span>
                  <span className="text-green-400">{gameState?.buildings?.length || 0}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Connections:</span>
                  <span className="text-yellow-400">{gameState?.connections?.length || 0}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Demand Points:</span>
                  <span className="text-red-400">{gameState?.demandPoints?.length || 0}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Starter Pack:</span>
                  <span className={gameState?.starterPackUsed ? 'text-green-400' : 'text-gray-500'}>
                    {gameState?.starterPackUsed ? '✓ Used' : '✗ Not Used'}
                  </span>
                </div>
              </div>
            </div>

            {/* 좌표 디버깅 */}
            {clickCoords && (
              <div className="p-4 border-b border-purple-800 bg-purple-900 bg-opacity-30">
                <h4 className="text-sm font-bold text-purple-400 mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Last Click
                </h4>
                <div className="text-xs font-mono text-green-400">
                  x: {clickCoords.x.toFixed(2)}%, y: {clickCoords.y.toFixed(2)}%
                </div>
                <div className="text-xs font-mono text-gray-400 mt-1">
                  px: {clickCoords.px}px, py: {clickCoords.py}px
                </div>
              </div>
            )}

            {/* 데이터 조작 버튼들 */}
            <div className="p-4 space-y-3">
              <h4 className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Actions
              </h4>

              {/* EXP/코인 충전 */}
              <button
                onClick={onAddMoney}
                className="w-full bg-green-900 bg-opacity-50 border border-green-500 text-green-300 px-4 py-2 rounded-lg hover:bg-green-800 transition-colors flex items-center justify-center gap-2"
              >
                <DollarSign className="w-4 h-4" />
                +1000 EXP & Coins
              </button>

              {/* 강제 전력 공급 */}
              <button
                onClick={onForceLight}
                className="w-full bg-yellow-900 bg-opacity-50 border border-yellow-500 text-yellow-300 px-4 py-2 rounded-lg hover:bg-yellow-800 transition-colors flex items-center justify-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Force Power On
              </button>

              {/* 게임 리셋 */}
              <button
                onClick={onResetGame}
                className="w-full bg-red-900 bg-opacity-50 border border-red-500 text-red-300 px-4 py-2 rounded-lg hover:bg-red-800 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Reset Game State
              </button>

              {/* localStorage 삭제 */}
              <button
                onClick={handleClearStorage}
                className="w-full bg-purple-900 bg-opacity-50 border border-purple-500 text-purple-300 px-4 py-2 rounded-lg hover:bg-purple-800 transition-colors flex items-center justify-center gap-2"
              >
                <Database className="w-4 h-4" />
                Clear LocalStorage
              </button>
            </div>

            {/* 빌딩 리스트 */}
            {gameState?.buildings && gameState.buildings.length > 0 && (
              <div className="p-4 border-t border-purple-800 max-h-64 overflow-y-auto">
                <h4 className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Buildings ({gameState.buildings.length})
                </h4>
                <div className="space-y-2">
                  {gameState.buildings.map((building, idx) => (
                    <div 
                      key={building.id || idx}
                      className="text-xs bg-cyber-dark bg-opacity-50 p-2 rounded border border-gray-700"
                    >
                      <div className="flex justify-between">
                        <span className="text-cyber-blue font-bold">
                          {String(building?.type || 'Unknown')}
                        </span>
                        <span className={building?.placed ? 'text-green-400' : 'text-gray-500'}>
                          {building?.placed ? '✓ Placed' : '✗ Not Placed'}
                        </span>
                      </div>
                      {building?.position && (
                        <div className="text-gray-500 mt-1 font-mono">
                          [{building.position.x}, {building.position.y}]
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 맵 클릭 좌표 감지용 투명 레이어 (개발자 모드 활성화 시) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 pointer-events-auto"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            setClickCoords({ 
              x, 
              y, 
              px: Math.floor(e.clientX - rect.left),
              py: Math.floor(e.clientY - rect.top)
            });
            console.log(`Map Click: x=${x.toFixed(2)}%, y=${y.toFixed(2)}%`);
          }}
        />
      )}
    </>
  );
};

export default DevPanel;
