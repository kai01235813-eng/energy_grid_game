import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GYEONGNAM_CITIES, REGIONS } from '../constants/gameConfig';
import { Home, Factory, Zap, AlertCircle, Loader2 } from 'lucide-react';
import mapImage from '../../map_bg.jpg';

const GyeongnamMap = ({ selectedRegion, gameState, onCityClick }) => {
  const [hoveredCity, setHoveredCity] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const regionData = REGIONS[selectedRegion];

  // 이미지 프리로드
  React.useEffect(() => {
    const img = new Image();
    img.src = mapImage;
    img.onload = () => setImageLoaded(true);
    img.onerror = () => setImageLoaded(true); // 에러 시에도 진행
  }, []);

  // 로딩 중 화면
  if (!imageLoaded) {
    return (
      <div className="relative w-full h-full min-h-[600px] rounded-xl overflow-hidden border-2 border-cyber-blue shadow-2xl bg-cyber-dark flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-cyber-blue animate-spin mx-auto mb-4" />
          <p className="text-cyber-blue text-lg">지도 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="relative w-full h-full min-h-[600px] rounded-xl overflow-hidden border-2 border-cyber-blue shadow-2xl"
    >
      {/* 배경 지도 이미지 레이어 (z-index: 0) */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url(${mapImage})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {gameState?.phase === 'initial' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-30 backdrop-blur-sm"
        >
          <div className="text-center">
            <AlertCircle className="w-20 h-20 text-cyber-red mx-auto mb-4 animate-pulse" />
            <h2 className="text-4xl font-bold text-cyber-red glow-red mb-2">
              BLACKOUT
            </h2>
            <p className="text-gray-400 text-lg">경남 전력망이 차단되었습니다</p>
            <p className="text-cyber-blue text-sm mt-4">스타터팩을 수령하여 복구를 시작하세요</p>
          </div>
        </motion.div>
      )}

      <div 
        className="absolute inset-0 pointer-events-none z-1"
        style={{
          background: `linear-gradient(180deg, 
            rgba(0, 212, 255, 0.05) 0%, 
            rgba(10, 14, 39, 0.6) 50%, 
            rgba(0, 212, 255, 0.05) 100%
          )`,
          mixBlendMode: 'normal',
        }}
      />

      {GYEONGNAM_CITIES.map((city) => {
        const cityState = gameState?.cities?.find(c => c.id === city.id);
        const isPowered = cityState?.isPowered || false;
        const leftPercent = (city.x / 800) * 100;
        const topPercent = (city.y / 600) * 100;

        return (
          <motion.div
            key={city.id}
            className="absolute cursor-pointer z-10"
            style={{
              left: `${leftPercent}%`,
              top: `${topPercent}%`,
              transform: 'translate(-50%, -50%)',
              filter: 'drop-shadow(0 0 8px rgba(0, 212, 255, 0.6))',
            }}
            whileHover={{ scale: 1.2 }}
            onClick={() => onCityClick && onCityClick(city)}
            onMouseEnter={() => setHoveredCity(city.id)}
            onMouseLeave={() => setHoveredCity(null)}
          >
            <motion.div
              className={`w-4 h-4 rounded-full border-2 ${
                isPowered 
                  ? 'bg-cyber-blue border-cyber-blue shadow-[0_0_15px_rgba(0,212,255,0.8)]' 
                  : 'bg-gray-700 border-gray-500'
              }`}
              animate={isPowered ? {
                boxShadow: [
                  '0 0 15px rgba(0, 212, 255, 0.8)',
                  '0 0 25px rgba(0, 212, 255, 1)',
                  '0 0 15px rgba(0, 212, 255, 0.8)',
                ],
              } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            />
            
            <AnimatePresence>
              {hoveredCity === city.id && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-cyber-dark bg-opacity-95 rounded-lg p-2 border border-cyber-blue whitespace-nowrap z-30 backdrop-blur-sm"
                >
                  {/* 수정: name과 type이 문자열인지 확인 */}
                  <div className="text-xs font-bold text-cyber-blue">{String(city?.name || '도시')}</div>
                  <div className="text-xs text-gray-400">
                    {city?.type === 'industrial' ? '산업' : city?.type === 'tech' ? '기술' : '주거'}
                  </div>
                  <div className="text-xs text-yellow-400">
                    {isPowered ? '⚡ 전력공급' : '● 대기중'}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}

      {(gameState?.demandPoints || []).map((point, index) => {
        const isPowered = point.power > 0;
        const Icon = point.type === 'village' ? Home : Factory;
        const leftPercent = (point.x / 800) * 100;
        const topPercent = (point.y / 600) * 100;

        return (
          <motion.div
            key={index}
            className="absolute z-10"
            style={{
              left: `${leftPercent}%`,
              top: `${topPercent}%`,
              transform: 'translate(-50%, -50%)',
              filter: 'drop-shadow(0 0 6px rgba(74, 222, 128, 0.5))',
            }}
            whileHover={{ scale: 1.15 }}
          >
            <motion.div
              className={`p-2 rounded-lg border-2 ${
                isPowered
                  ? 'bg-green-900 bg-opacity-80 border-green-400'
                  : 'bg-red-900 bg-opacity-80 border-red-400'
              }`}
              animate={isPowered ? {
                boxShadow: [
                  '0 0 10px rgba(74, 222, 128, 0.5)',
                  '0 0 20px rgba(74, 222, 128, 0.8)',
                  '0 0 10px rgba(74, 222, 128, 0.5)',
                ],
              } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <Icon className={`w-4 h-4 ${isPowered ? 'text-green-300' : 'text-red-300'}`} />
            </motion.div>
            
            <div className="absolute top-10 left-1/2 transform -translate-x-1/2 text-center whitespace-nowrap">
              {/* 수정: name과 demand가 유효한 값인지 확인 */}
              <div className="text-xs font-bold text-white bg-black bg-opacity-70 px-2 py-1 rounded">
                {String(point?.name || '수요지')}
              </div>
              <div className="text-xs text-gray-400 bg-black bg-opacity-70 px-2 py-1 rounded mt-1">
                수요: {typeof point?.demand === 'number' ? point.demand.toFixed(0) : '0'}kW
              </div>
            </div>
          </motion.div>
        );
      })}

      {(gameState?.connections || []).map((conn, index) => {
        const from = gameState?.buildings?.find(b => b.id === conn.from);
        const to = gameState?.buildings?.find(b => b.id === conn.to);
        
        if (!from || !to) return null;

        const fromLeftPercent = (from.x / 800) * 100;
        const fromTopPercent = (from.y / 600) * 100;
        const toLeftPercent = (to.x / 800) * 100;
        const toTopPercent = (to.y / 600) * 100;

        return (
          <svg 
            key={index}
            className="absolute inset-0 w-full h-full pointer-events-none z-5"
          >
            <motion.line
              x1={`${fromLeftPercent}%`}
              y1={`${fromTopPercent}%`}
              x2={`${toLeftPercent}%`}
              y2={`${toTopPercent}%`}
              stroke={conn.isPowered ? '#00d4ff' : '#4b5563'}
              strokeWidth="4"
              strokeDasharray="5,5"
              initial={{ pathLength: 0 }}
              animate={{ 
                pathLength: 1,
                strokeOpacity: conn.isPowered ? [0.5, 1, 0.5] : 0.3,
              }}
              transition={{ 
                pathLength: { duration: 0.5 },
                strokeOpacity: { duration: 2, repeat: Infinity },
              }}
            />
          </svg>
        );
      })}

      {(gameState?.buildings || []).map((building) => {
        const leftPercent = (building.x / 800) * 100;
        const topPercent = (building.y / 600) * 100;

        return (
          <motion.div
            key={building.id}
            className="absolute z-15"
            style={{
              left: `${leftPercent}%`,
              top: `${topPercent}%`,
              transform: 'translate(-50%, -50%)',
              filter: 'drop-shadow(0 0 10px rgba(0, 212, 255, 0.8))',
            }}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            whileHover={{ scale: 1.2 }}
          >
            <div className={`p-3 rounded-lg border-2 ${
              building.isPowered
                ? 'bg-cyber-blue bg-opacity-20 border-cyber-blue'
                : 'bg-gray-700 bg-opacity-50 border-gray-500'
            }`}>
              <Zap className={`w-5 h-5 ${
                building.isPowered ? 'text-cyber-blue' : 'text-gray-500'
              }`} />
            </div>
            <div className="absolute top-12 left-1/2 transform -translate-x-1/2 text-center whitespace-nowrap">
              {/* 수정: type과 output이 문자열/숫자인지 확인 후 렌더링 */}
              <div className="text-xs font-bold text-cyber-blue bg-black bg-opacity-70 px-2 py-1 rounded">
                {String(building?.type || '건물')}
              </div>
              <div className="text-xs text-yellow-400 bg-black bg-opacity-70 px-2 py-1 rounded mt-1">
                {typeof building?.output === 'number' ? building.output : 0}kW
              </div>
            </div>
          </motion.div>
        );
      })}

      <div className="absolute bottom-4 left-4 bg-cyber-dark bg-opacity-95 rounded-lg p-4 border-2 border-cyber-blue z-20 backdrop-blur-sm">
        <h3 className="text-sm font-bold text-cyber-blue mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          범례
        </h3>
        <div className="space-y-2 text-xs text-gray-300">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyber-blue border border-cyber-blue"></div>
            <span>전력공급 도시</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-700 border border-gray-500"></div>
            <span>대기중 도시</span>
          </div>
          <div className="flex items-center gap-2">
            <Home className="w-3 h-3 text-green-400" />
            <span>마을 (수요지)</span>
          </div>
          <div className="flex items-center gap-2">
            <Factory className="w-3 h-3 text-green-400" />
            <span>산업단지 (수요지)</span>
          </div>
        </div>
      </div>

      {regionData && (
        <div className="absolute top-4 right-4 bg-cyber-dark bg-opacity-95 rounded-lg p-3 border-2 border-cyber-purple z-20 backdrop-blur-sm">
          <div className="text-sm font-bold text-cyber-purple mb-1">{regionData.name}</div>
          <div className="text-xs text-gray-400">{regionData.description}</div>
          <div className="mt-2 text-xs">
            <span className="text-yellow-400">버프: </span>
            {/* 수정: buff 객체가 아닌 buff.label 문자열만 렌더링 */}
            <span className="text-green-400">{regionData.buff?.label || '없음'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default GyeongnamMap;
