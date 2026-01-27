import React from 'react';
import { motion } from 'framer-motion';
import { REGIONS } from '../constants/gameConfig';
import { Zap, Factory, Lightbulb, Wind, Network } from 'lucide-react';

const RegionSelection = ({ onSelectRegion }) => {
  const regionIcons = {
    changwon: Factory,
    jinju: Lightbulb,
    tongyeong: Wind,
    haman: Network,
  };

  return (
    <div className="fixed inset-0 bg-cyber-darker flex items-center justify-center z-50">
      {/* 배경 애니메이션 */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-cyber-blue rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              opacity: [0.2, 1, 0.2],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: 2 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-8">
        {/* 타이틀 */}
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <motion.div
            className="flex items-center justify-center gap-4 mb-6"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Zap className="w-16 h-16 text-cyber-blue" strokeWidth={2.5} />
            <h1 className="text-7xl font-bold glow-blue">에너지그리드</h1>
            <Zap className="w-16 h-16 text-cyber-gold" strokeWidth={2.5} />
          </motion.div>
          <p className="text-2xl text-gray-400 mb-2">Energy Grid: Gyeongnam Edition</p>
          <p className="text-lg text-cyber-blue">경남의 어둠을 밝힐 에너지 가디언이 되어주세요</p>
        </motion.div>

        {/* 지역 선택 카드 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          <h2 className="text-3xl font-bold text-center mb-8 glow-gold">
            시작 거점을 선택하세요
          </h2>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.values(REGIONS).map((region, index) => {
              const Icon = regionIcons[region.id];
              
              return (
                <motion.button
                  key={region.id}
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  whileHover={{ 
                    scale: 1.05, 
                    boxShadow: `0 0 30px ${region.color}`,
                  }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onSelectRegion(region.id)}
                  className="relative bg-cyber-dark border-2 hover:border-4 rounded-xl p-6 transition-all group"
                  style={{ borderColor: region.color }}
                >
                  {/* 아이콘 */}
                  <div className="flex justify-center mb-4">
                    <div 
                      className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${region.color}20` }}
                    >
                      <Icon 
                        className="w-12 h-12"
                        style={{ color: region.color }}
                        strokeWidth={2}
                      />
                    </div>
                  </div>

                  {/* 지역명 */}
                  <h3 
                    className="text-2xl font-bold mb-2"
                    style={{ color: region.color }}
                  >
                    {region.name}
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">{region.description}</p>

                  {/* 버프 정보 */}
                  <div 
                    className="bg-opacity-20 rounded-lg p-3"
                    style={{ backgroundColor: region.color }}
                  >
                    <p className="text-xs text-gray-300 mb-1">특화 버프</p>
                    <p 
                      className="text-sm font-bold"
                      style={{ color: region.color }}
                    >
                      {region.buff.label}
                    </p>
                  </div>

                  {/* Hover 효과 */}
                  <motion.div
                    className="absolute inset-0 rounded-xl pointer-events-none"
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 0.1 }}
                    style={{ backgroundColor: region.color }}
                  />
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* 안내 문구 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="text-center mt-12 text-gray-500 text-sm"
        >
          <p>선택한 지역의 고유 버프가 게임 전반에 적용됩니다.</p>
          <p className="mt-2">현명하게 선택하세요, 에너지 가디언.</p>
        </motion.div>
      </div>
    </div>
  );
};

export default RegionSelection;
