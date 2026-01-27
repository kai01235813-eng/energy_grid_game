import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BUILDING_TYPES } from '../constants/gameConfig';
import { Package, X, CheckCircle, AlertCircle } from 'lucide-react';

const StarterPackUI = ({ onClaimPack, gameState }) => {
  const [showModal, setShowModal] = useState(false);
  const [claimedBuildings, setClaimedBuildings] = useState([]);

  const handleClaim = () => {
    const result = onClaimPack();
    if (result.success) {
      setClaimedBuildings(result.buildings);
      setShowModal(true);
    }
  };

  const starterBuildings = Object.values(BUILDING_TYPES).filter(b => b.starterPack);

  if (gameState.starterPackUsed) {
    return null; // 이미 수령함
  }

  return (
    <>
      {/* 스타터팩 버튼 */}
      <motion.button
        initial={{ scale: 0, rotate: -180 }}
        animate={{ 
          scale: 1, 
          rotate: 0,
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={handleClaim}
        className="fixed bottom-8 right-8 z-30 bg-gradient-to-r from-cyber-blue to-cyber-purple text-white rounded-full p-6 shadow-2xl border-4 border-cyber-gold"
        style={{
          boxShadow: '0 0 40px rgba(0, 212, 255, 0.6), 0 0 80px rgba(157, 78, 221, 0.4)',
        }}
      >
        <motion.div
          animate={{ 
            rotate: [0, 10, -10, 0],
            y: [0, -5, 0],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Package className="w-12 h-12" />
        </motion.div>
        
        <motion.div
          className="absolute -top-2 -right-2 bg-cyber-red text-white text-xs font-bold rounded-full w-8 h-8 flex items-center justify-center"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          FREE
        </motion.div>
      </motion.button>

      {/* 스타터팩 모달 */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-cyber-dark border-4 border-cyber-gold rounded-2xl p-8 max-w-4xl w-full mx-4 relative overflow-hidden"
              style={{
                boxShadow: '0 0 60px rgba(255, 215, 0, 0.5)',
              }}
            >
              {/* 배경 파티클 */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(30)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 bg-cyber-gold rounded-full"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`,
                    }}
                    animate={{
                      y: [-20, 20, -20],
                      opacity: [0.2, 1, 0.2],
                    }}
                    transition={{
                      duration: 2 + Math.random(),
                      repeat: Infinity,
                      delay: Math.random() * 2,
                    }}
                  />
                ))}
              </div>

              {/* 닫기 버튼 */}
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-8 h-8" />
              </button>

              {/* 타이틀 */}
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-center mb-8"
              >
                <CheckCircle className="w-20 h-20 text-cyber-gold mx-auto mb-4" />
                <h2 className="text-5xl font-bold glow-gold mb-2">
                  스타터팩 획득!
                </h2>
                <p className="text-xl text-cyber-blue">
                  경남의 첫 번째 빛을 밝힐 준비가 되었습니다
                </p>
              </motion.div>

              {/* 건물 목록 */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                {claimedBuildings.map((building, index) => (
                  <motion.div
                    key={building.id}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-cyber-darker border-2 rounded-lg p-4 text-center"
                    style={{ borderColor: building.color }}
                  >
                    <div className="text-4xl mb-2">{building.icon}</div>
                    <h3 
                      className="font-bold mb-1"
                      style={{ color: building.color }}
                    >
                      {building.name}
                    </h3>
                    <p className="text-xs text-gray-400">{building.description}</p>
                  </motion.div>
                ))}
              </div>

              {/* 안내 메시지 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="bg-cyber-blue bg-opacity-10 border border-cyber-blue rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-cyber-blue flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="font-bold text-cyber-blue mb-2">다음 단계:</h4>
                    <ol className="text-sm text-gray-300 space-y-1 list-decimal list-inside">
                      <li>맵에서 발전소 위치를 클릭하여 배치하세요</li>
                      <li>순서대로 송전철탑 → 변전소 → 케이블 → 전신주 → 변압기를 연결하세요</li>
                      <li>마을에 전력이 공급되면 불이 켜집니다!</li>
                    </ol>
                  </div>
                </div>
              </motion.div>

              {/* 시작 버튼 */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowModal(false)}
                className="w-full mt-6 bg-gradient-to-r from-cyber-blue to-cyber-purple text-white font-bold text-lg py-4 rounded-lg"
                style={{
                  boxShadow: '0 0 30px rgba(0, 212, 255, 0.5)',
                }}
              >
                건설 시작하기
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default StarterPackUI;
