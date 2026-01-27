import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GYEONGNAM_CITIES, REGIONS } from '../constants/gameConfig';
import { Home, Factory, Zap, AlertCircle } from 'lucide-react';
// 실제 경남 지도 이미지 임포트
import mapImage from '../../map_bg.jpg';

const GyeongnamMap = ({ selectedRegion, gameState, onCityClick }) => {
  const [hoveredCity, setHoveredCity] = useState(null);
  const regionData = REGIONS[selectedRegion];

  return (
    <div 
      className="relative w-full h-full rounded-xl overflow-hidden border-2 border-cyber-blue shadow-2xl"
      style={{
        // 실제 경남 지도를 배경으로 설정 (추상적 그리드 제거)
        backgroundImage: `url(${mapImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* 블랙아웃 오버레이 - 전력 차단 시 지도 위를 어둡게 덮음 */}
      {gameState.phase === 'initial' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-20 backdrop-blur-sm"
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

      {/* 사이버펑크 오버레이 레이어 - 실제 지도 위에 네온 효과 추가 */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(180deg, 
            rgba(0, 212, 255, 0.05) 0%, 
            rgba(10, 14, 39, 0.6) 50%, 
            rgba(0, 212, 255, 0.05) 100%
          )`,
          mixBlendMode: 'normal',
        }}
      />

      {/* 도시 노드 및 설비 배치 컨테이너 - 절대 좌표 기반 */}
      <div className="absolute inset-0">
        {/* 도시 노드 렌더링 - 퍼센트 기반 절대 좌표로 실제 지도 위에 배치 */}
        {GYEONGNAM_CITIES.map((city, index) => {
          const isSelected = city.id === selectedRegion;
          const isPowered = gameState.phase === 'operational';
          const isBlackout = gameState.phase === 'initial';

          return (
            <motion.div
              key={city.id}
              className="absolute cursor-pointer group"
              style={{
                // 실제 지도 이미지 위의 절대 좌표 (퍼센트 기반)
                // x, y 값을 800x600 기준에서 퍼센트로 변환
                left: `${(city.x / 800) * 100}%`,
                top: `${(city.y / 600) * 100}%`,
                transform: 'translate(-50%, -50%)', // 중앙 정렬
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => onCityClick?.(city)}
              onMouseEnter={() => setHoveredCity(city.id)}
              onMouseLeave={() => setHoveredCity(null)}
            >
              {/* 전력 공급 시 글로우 효과 */}
              {!isBlackout && isPowered && (
                <motion.div
                  className="absolute inset-0 rounded-full blur-xl"
                  style={{
                    width: '60px',
                    height: '60px',
                    background: `radial-gradient(circle, ${regionData?.color || '#00d4ff'}80, transparent)`,
                    transform: 'translate(-50%, -50%)',
                    left: '50%',
                    top: '50%',
                  }}
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.5, 0.8, 0.5],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}

              {/* 도시 노드 메인 원 */}
              <motion.div
                className={`
                  relative z-10 rounded-full border-2 flex items-center justify-center
                  ${isBlackout ? 'bg-gray-800 border-gray-600' : 'bg-cyber-dark border-cyber-blue'}
                  ${isSelected ? 'w-8 h-8 border-4' : 'w-6 h-6'}
                `}
                style={{
                  borderColor: isBlackout ? '#555' : (isSelected ? regionData?.color : '#00d4ff'),
                  backgroundColor: isBlackout ? '#333' : (isSelected ? `${regionData?.color}40` : '#0a0e2780'),
                  boxShadow: !isBlackout ? `0 0 20px ${isSelected ? regionData?.color : '#00d4ff'}80` : 'none',
                }}
                animate={{
                  scale: hoveredCity === city.id ? 1.3 : 1,
                }}
              >
                {isSelected && (
                  <Zap className="w-4 h-4" style={{ color: regionData?.color }} />
                )}
              </motion.div>

              {/* 선택된 지역 펄스 효과 */}
              {isSelected && (
                <motion.div
                  className="absolute inset-0 rounded-full border-2"
                  style={{
                    borderColor: regionData?.color,
                    width: '40px',
                    height: '40px',
                    transform: 'translate(-50%, -50%)',
                    left: '50%',
                    top: '50%',
                  }}
                  animate={{
                    scale: [1, 1.8, 1],
                    opacity: [0.8, 0, 0.8],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}

              {/* 도시 이름 라벨 */}
              <motion.div
                className={`
                  absolute top-full mt-2 whitespace-nowrap text-sm font-bold
                  ${isBlackout ? 'text-gray-600' : 'text-white drop-shadow-lg'}
                `}
                style={{
                  left: '50%',
                  transform: 'translateX(-50%)',
                  textShadow: !isBlackout ? '0 0 10px rgba(0, 0, 0, 0.8)' : 'none',
                }}
              >
                {city.name}
              </motion.div>

              {/* Hover 정보 툴팁 */}
              <AnimatePresence>
                {hoveredCity === city.id && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute left-1/2 -translate-x-1/2 bottom-full mb-8 bg-cyber-dark border-2 border-cyber-blue rounded-lg px-4 py-2 min-w-[120px] z-20"
                    style={{
                      boxShadow: '0 0 20px rgba(0, 212, 255, 0.5)',
                    }}
                  >
                    <div className="text-center">
                      <p className="text-cyber-blue text-xs mb-1">
                        {city.type === 'industrial' ? '🏭 산업지역' : 
                         city.type === 'tech' ? '💡 기술지역' : 
                         city.type === 'renewable' ? '🌊 신재생' :
                         city.type === 'network' ? '🔗 네트워크' : '🏘️ 주거지역'}
                      </p>
                      <p className="text-cyber-gold text-xs font-bold">
                        {isPowered ? '⚡ 전력공급중' : '● 대기중'}
                      </p>
                    </div>
                    {/* 툴팁 화살표 */}
                    <div 
                      className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0"
                      style={{
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: '6px solid #00d4ff',
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
                      width="100"
                      height="40"
                      rx="8"
                      fill="#0a0e27"
                      stroke="#00d4ff"
                      strokeWidth="2"
                    />
                    <text
                      x={city.x}
                      y={city.y + 45}
                      textAnchor="middle"
                      fill="#00d4ff"
                      fontSize="12"
                    >
                      {city.type === 'industrial' ? '산업' : city.type === 'tech' ? '기술' : '주거'}
                    </text>
                    <text
                      x={city.x}
                      y={city.y + 58}
                      textAnchor="middle"
                      fill="#ffd700"
                      fontSize="10"
                    >
                      {isPowered ? '⚡ 전력공급' : '● 대기중'}
                    </text>
                  </motion.g>
                )}
              </AnimatePresence>
            </g>
          );
        })}


        {/* 수요지 (마을/산업단지) - 실제 지도 위 절대 좌표 배치 */}
        {gameState.demandPoints.map((point, index) => {
          const isPowered = point.power > 0;
          const Icon = point.type === 'village' ? Home : Factory;

          return (
            <motion.div
              key={point.id}
              className="absolute"
              style={{
                // 퍼센트 기반 절대 좌표
                left: `${(point.x / 800) * 100}%`,
                top: `${(point.y / 600) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + index * 0.1 }}
            >
              {/* 전력 공급 시 글로우 효과 */}
              {isPowered && (
                <motion.div
                  className="absolute inset-0 rounded-full blur-lg"
                  style={{
                    width: '40px',
                    height: '40px',
                    background: point.type === 'village' 
                      ? 'radial-gradient(circle, #ffd70080, transparent)' 
                      : 'radial-gradient(circle, #ff336680, transparent)',
                    transform: 'translate(-50%, -50%)',
                    left: '50%',
                    top: '50%',
                  }}
                  animate={{
                    scale: [1, 1.4, 1],
                    opacity: [0.6, 1, 0.6],
                  }}
                  transition={{ duration: 2, repeat: Infinity, delay: index * 0.2 }}
                />
              )}

              {/* 수요지 아이콘 */}
              <div
                className={`
                  relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center
                  ${isPowered 
                    ? (point.type === 'village' ? 'bg-cyber-gold border-yellow-400' : 'bg-cyber-red border-red-400')
                    : 'bg-gray-800 border-gray-600'
                  }
                `}
                style={{
                  boxShadow: isPowered 
                    ? `0 0 15px ${point.type === 'village' ? '#ffd700' : '#ff3366'}80`
                    : 'none',
                }}
              >
                <Icon className="w-4 h-4" color={isPowered ? '#fff' : '#555'} />
              </div>

              {/* 수요지 이름 */}
              <div 
                className="absolute top-full mt-1 text-xs whitespace-nowrap font-semibold"
                style={{
                  left: '50%',
                  transform: 'translateX(-50%)',
                  color: isPowered 
                    ? (point.type === 'village' ? '#ffd700' : '#ff3366')
                    : '#666',
                  textShadow: isPowered ? '0 0 8px rgba(0, 0, 0, 0.8)' : 'none',
                }}
              >
                {point.name}
              </div>
            </motion.div>
          );
        })}

        {/* 건물 연결선 (송전선로) - SVG 레이어 */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {gameState.connections.map((conn) => {
            const fromBuilding = gameState.buildings.find(b => b.id === conn.from);
            const toBuilding = gameState.buildings.find(b => b.id === conn.to);
            
            if (!fromBuilding?.position || !toBuilding?.position) return null;

            const isHVDC = conn.type === 'hvdc';
            
            // 퍼센트 좌표를 픽셀로 변환
            const x1 = (fromBuilding.position.x / 800) * 100;
            const y1 = (fromBuilding.position.y / 600) * 100;
            const x2 = (toBuilding.position.x / 800) * 100;
            const y2 = (toBuilding.position.y / 600) * 100;

            return (
              <motion.line
                key={conn.id}
                x1={`${x1}%`}
                y1={`${y1}%`}
                x2={`${x2}%`}
                y2={`${y2}%`}
                stroke={isHVDC ? '#00d4ff' : '#ff6b6b'}
                strokeWidth={isHVDC ? "4" : "3"}
                strokeDasharray={isHVDC ? "0" : "8,4"}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.8 }}
                transition={{ duration: 1.5 }}
                style={{
                  filter: isHVDC 
                    ? 'drop-shadow(0 0 8px #00d4ff)' 
                    : 'drop-shadow(0 0 6px #ff6b6b)',
                }}
              />
            );
          })}
        </svg>
      </div>

      {/* 맵 범례 - 실제 지도 위 오버레이 */}
      <div className="absolute bottom-4 left-4 bg-cyber-dark bg-opacity-95 rounded-lg p-4 border-2 border-cyber-blue z-10 backdrop-blur-sm">
        <h3 className="text-sm font-bold text-cyber-blue mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          범례
        </h3>
        <div className="space-y-2 text-xs text-gray-300">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-cyber-blue border-2 border-white shadow-lg"></div>
            <span>주요 도시 노드</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-cyber-gold border-2 border-yellow-400 shadow-lg"></div>
            <span>마을 (저압수요)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-cyber-red border-2 border-red-400 shadow-lg"></div>
            <span>산업단지 (고압수요)</span>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-gray-700">
            <div className="w-8 h-1 bg-cyber-blue rounded shadow-lg"></div>
            <span>HVDC 송전선 (손실 0%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-1 bg-cyber-red rounded shadow-lg" style={{ 
              background: 'repeating-linear-gradient(90deg, #ff6b6b 0, #ff6b6b 6px, transparent 6px, transparent 10px)'
            }}></div>
            <span>AC 송전선 (손실 발생)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GyeongnamMap;
