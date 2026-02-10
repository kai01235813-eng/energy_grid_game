import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, X, Trash2, Bug, RefreshCw, Eye, EyeOff,
  DollarSign, Award, Zap, AlertTriangle, Power, MapPin
} from 'lucide-react';

const DebugPanel = ({ 
  gameState, 
  onAddMoney, 
  onAddTechPoints, 
  onResetGame, 
  onClearBuildings,
  onToggleDebugInfo,
  showDebugInfo 
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const { buildings, powerLines, poweredCities, currentEra, budget, techPoints } = gameState;

  return (
    <>
      {/* 토글 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 right-4 z-40 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white p-3 rounded-lg shadow-lg transition-all border-2 border-gray-600"
      >
        <Settings className="w-6 h-6" />
      </button>

      {/* 패널 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 border-4 border-gray-600 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="bg-gradient-to-r from-gray-800 to-gray-900 border-b-4 border-gray-600 p-6 flex items-center justify-between sticky top-0">
                <div className="flex items-center gap-3">
                  <Settings className="w-8 h-8 text-gray-400" />
                  <h2 className="text-3xl font-bold text-white">설정 & 디버그</h2>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                {/* 게임 상태 */}
                <section>
                  <h3 className="text-xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    게임 상태
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-yellow-900/30 border-2 border-yellow-500 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="w-5 h-5 text-yellow-400" />
                        <span className="text-sm text-gray-400">예산</span>
                      </div>
                      <div className="text-2xl font-bold text-yellow-400">₩{budget}</div>
                    </div>
                    <div className="bg-purple-900/30 border-2 border-purple-500 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Award className="w-5 h-5 text-purple-400" />
                        <span className="text-sm text-gray-400">기술 포인트</span>
                      </div>
                      <div className="text-2xl font-bold text-purple-400">{techPoints}</div>
                    </div>
                    <div className="bg-blue-900/30 border-2 border-blue-500 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-5 h-5 text-blue-400" />
                        <span className="text-sm text-gray-400">시대</span>
                      </div>
                      <div className="text-lg font-bold text-blue-400">{currentEra?.name || 'N/A'}</div>
                    </div>
                    <div className="bg-green-900/30 border-2 border-green-500 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-5 h-5 text-green-400" />
                        <span className="text-sm text-gray-400">공급 도시</span>
                      </div>
                      <div className="text-2xl font-bold text-green-400">{poweredCities?.length || 0}/5</div>
                    </div>
                  </div>
                </section>

                {/* 디버그 정보 */}
                <section>
                  <h3 className="text-xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
                    <Bug className="w-5 h-5" />
                    디버그 정보
                  </h3>
                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">건설된 발전기:</span>
                      <span className="text-yellow-400 font-bold">
                        {buildings?.filter(b => b.type === 'generator').length || 0}개
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">건설된 송전탑:</span>
                      <span className="text-blue-400 font-bold">
                        {buildings?.filter(b => b.type === 'tower').length || 0}개
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">건설된 변전소:</span>
                      <span className="text-green-400 font-bold">
                        {buildings?.filter(b => b.type === 'substation').length || 0}개
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">전력선 연결:</span>
                      <span className="text-cyan-400 font-bold">
                        {powerLines?.length || 0}개
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">총 건물:</span>
                      <span className="text-white font-bold">
                        {buildings?.length || 0}개
                      </span>
                    </div>
                  </div>

                  {/* 디버그 정보 표시 토글 */}
                  <button
                    onClick={onToggleDebugInfo}
                    className={`mt-4 w-full py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
                      showDebugInfo
                        ? 'bg-green-600 hover:bg-green-500 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    {showDebugInfo ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                    {showDebugInfo ? '지도 디버그 정보 숨기기' : '지도 디버그 정보 표시'}
                  </button>
                </section>

                {/* 치트 기능 */}
                <section>
                  <h3 className="text-xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    치트 기능
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        onAddMoney(1000);
                      }}
                      className="bg-yellow-600 hover:bg-yellow-500 text-white py-3 px-4 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <DollarSign className="w-5 h-5" />
                      예산 +₩1000
                    </button>
                    <button
                      onClick={() => {
                        onAddTechPoints(100);
                      }}
                      className="bg-purple-600 hover:bg-purple-500 text-white py-3 px-4 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <Award className="w-5 h-5" />
                      기술 포인트 +100
                    </button>
                  </div>
                </section>

                {/* 위험 작업 */}
                <section>
                  <h3 className="text-xl font-bold text-red-400 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    위험 작업
                  </h3>
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        if (window.confirm('모든 건물을 제거하시겠습니까? (예산/포인트는 유지됩니다)')) {
                          onClearBuildings();
                        }
                      }}
                      className="w-full bg-orange-600 hover:bg-orange-500 text-white py-3 px-4 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-5 h-5" />
                      모든 건물 제거
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('게임을 완전히 초기화하시겠습니까? 모든 진행 상황이 삭제됩니다!')) {
                          onResetGame();
                        }
                      }}
                      className="w-full bg-red-600 hover:bg-red-500 text-white py-3 px-4 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-5 h-5" />
                      게임 완전 초기화
                    </button>
                  </div>
                </section>

                {/* 도움말 */}
                <section>
                  <div className="bg-blue-900/30 border-l-4 border-blue-500 p-4 rounded">
                    <h4 className="text-blue-400 font-bold mb-2 flex items-center gap-2">
                      <Power className="w-4 h-4" />
                      전력이 공급되지 않나요?
                    </h4>
                    <ul className="text-sm text-gray-300 space-y-1">
                      <li>1. 발전기 → 송전탑 → 변전소 순서로 건설했는지 확인</li>
                      <li>2. 송전탑이 발전기 범위(150m) 안에 있는지 확인</li>
                      <li>3. 변전소가 송전탑 범위(150m) 안에 있는지 확인</li>
                      <li>4. 변전소가 도시(🏙️) 근처(150m)에 있는지 확인</li>
                      <li>5. "지도 디버그 정보 표시"를 활성화하여 범위 확인</li>
                    </ul>
                  </div>
                </section>
              </div>

              {/* 하단 */}
              <div className="sticky bottom-0 bg-gray-900/95 border-t-2 border-gray-700 p-6">
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-bold transition-colors"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default DebugPanel;
