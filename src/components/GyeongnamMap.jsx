import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GYEONGNAM_CITIES, REGIONS } from '../constants/gameConfig';
import { Home, Factory, Zap, AlertCircle } from 'lucide-react';

const GyeongnamMap = ({ selectedRegion, gameState, onCityClick }) => {
  const [hoveredCity, setHoveredCity] = useState(null);
  const regionData = REGIONS[selectedRegion];

  // SVG 뷰박스 (경남 지도 단순화)
  const viewBox = "0 0 800 600";

  // 경남 외곽선 단순화 (대략적인 형태)
  const gyeongnamOutline = `
    M 200,250 
    L 250,200 
    L 350,180 
    L 450,200 
    L 550,220 
    L 620,280 
    L 650,380 
    L 600,480 
    L 550,540 
    L 450,560 
    L 350,550 
    L 280,520 
    L 220,450 
    L 180,350 
    Z
  `;

  return (
    <div className="relative w-full h-full bg-cyber-darker rounded-xl overflow-hidden border-2 border-cyber-dark">
      {/* 블랙아웃 상태 표시 */}
      {gameState.phase === 'initial' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-20"
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

      <svg viewBox={viewBox} className="w-full h-full">
        <defs>
          {/* 그라데이션 정의 */}
          <radialGradient id="cityGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={regionData?.color || '#00d4ff'} stopOpacity="0.8" />
            <stop offset="100%" stopColor={regionData?.color || '#00d4ff'} stopOpacity="0" />
          </radialGradient>

          {/* 블랙아웃 패턴 */}
          <pattern id="blackoutPattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="20" y2="20" stroke="#333" strokeWidth="1" />
            <line x1="20" y1="0" x2="0" y2="20" stroke="#333" strokeWidth="1" />
          </pattern>
        </defs>

        {/* 경남 지도 외곽선 */}
        <motion.path
          d={gyeongnamOutline}
          fill={gameState.phase === 'initial' ? 'url(#blackoutPattern)' : '#0a0e2780'}
          stroke={regionData?.color || '#00d4ff'}
          strokeWidth="3"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ 
            pathLength: 1, 
            opacity: gameState.phase === 'initial' ? 0.3 : 0.8,
          }}
          transition={{ duration: 2, ease: 'easeInOut' }}
        />

        {/* 배경 그리드 */}
        {gameState.phase !== 'initial' && (
          <g opacity="0.1">
            {[...Array(40)].map((_, i) => (
              <line
                key={`grid-v-${i}`}
                x1={i * 20}
                y1="0"
                x2={i * 20}
                y2="600"
                stroke="#00d4ff"
                strokeWidth="0.5"
              />
            ))}
            {[...Array(30)].map((_, i) => (
              <line
                key={`grid-h-${i}`}
                x1="0"
                y1={i * 20}
                x2="800"
                y2={i * 20}
                stroke="#00d4ff"
                strokeWidth="0.5"
              />
            ))}
          </g>
        )}

        {/* 도시 노드 */}
        {GYEONGNAM_CITIES.map((city, index) => {
          const isSelected = city.id === selectedRegion;
          const isPowered = gameState.phase === 'operational';
          const isBlackout = gameState.phase === 'initial';

          return (
            <g key={city.id}>
              {/* 도시 글로우 효과 */}
              {!isBlackout && (
                <motion.circle
                  cx={city.x}
                  cy={city.y}
                  r="30"
                  fill={`url(#cityGlow)`}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ 
                    opacity: isPowered ? [0.3, 0.6, 0.3] : 0.1,
                    scale: isPowered ? [1, 1.2, 1] : 0.8,
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: isPowered ? Infinity : 0,
                    delay: index * 0.1 
                  }}
                />
              )}

              {/* 도시 메인 노드 */}
              <motion.circle
                cx={city.x}
                cy={city.y}
                r={isSelected ? "12" : "8"}
                fill={isBlackout ? '#333' : (isSelected ? regionData.color : '#4dabf7')}
                stroke={isBlackout ? '#555' : '#00d4ff'}
                strokeWidth={isSelected ? "3" : "2"}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ 
                  opacity: 1, 
                  scale: hoveredCity === city.id ? 1.3 : 1,
                }}
                transition={{ delay: index * 0.1 }}
                onMouseEnter={() => setHoveredCity(city.id)}
                onMouseLeave={() => setHoveredCity(null)}
                onClick={() => onCityClick?.(city)}
                className="cursor-pointer"
              />

              {/* 선택된 지역 강조 */}
              {isSelected && (
                <motion.circle
                  cx={city.x}
                  cy={city.y}
                  r="15"
                  fill="none"
                  stroke={regionData.color}
                  strokeWidth="2"
                  animate={{ 
                    scale: [1, 1.5, 1],
                    opacity: [0.8, 0.3, 0.8],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}

              {/* 도시 라벨 */}
              <text
                x={city.x}
                y={city.y - 20}
                textAnchor="middle"
                fill={isBlackout ? '#555' : '#fff'}
                fontSize="14"
                fontWeight="bold"
                className={!isBlackout ? 'drop-shadow-lg' : ''}
              >
                {city.name}
              </text>

              {/* Hover 정보 */}
              <AnimatePresence>
                {hoveredCity === city.id && (
                  <motion.g
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                  >
                    <rect
                      x={city.x - 50}
                      y={city.y + 25}
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

        {/* 수요지 (마을/산업단지) */}
        {gameState.demandPoints.map((point, index) => {
          const isPowered = point.power > 0;
          const Icon = point.type === 'village' ? Home : Factory;

          return (
            <g key={point.id}>
              {/* 전력 공급 시 글로우 */}
              {isPowered && (
                <motion.circle
                  cx={point.x}
                  cy={point.y}
                  r="20"
                  fill={point.type === 'village' ? '#ffd70040' : '#ff336640'}
                  animate={{ 
                    scale: [1, 1.3, 1],
                    opacity: [0.5, 0.8, 0.5],
                  }}
                  transition={{ duration: 2, repeat: Infinity, delay: index * 0.2 }}
                />
              )}

              {/* 수요지 아이콘 영역 */}
              <circle
                cx={point.x}
                cy={point.y}
                r="10"
                fill={isPowered ? (point.type === 'village' ? '#ffd700' : '#ff3366') : '#333'}
                stroke={isPowered ? '#fff' : '#555'}
                strokeWidth="2"
              />
            </g>
          );
        })}

        {/* 건물 연결선 (추후 구현) */}
        {gameState.connections.map((conn) => {
          const fromBuilding = gameState.buildings.find(b => b.id === conn.from);
          const toBuilding = gameState.buildings.find(b => b.id === conn.to);
          
          if (!fromBuilding?.position || !toBuilding?.position) return null;

          const isHVDC = conn.type === 'hvdc';

          return (
            <motion.line
              key={conn.id}
              x1={fromBuilding.position.x}
              y1={fromBuilding.position.y}
              x2={toBuilding.position.x}
              y2={toBuilding.position.y}
              stroke={isHVDC ? '#00d4ff' : '#ff6b6b'}
              strokeWidth={isHVDC ? "4" : "2"}
              strokeDasharray={isHVDC ? "0" : "5,5"}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1 }}
            />
          );
        })}
      </svg>

      {/* 맵 범례 */}
      <div className="absolute bottom-4 left-4 bg-cyber-dark bg-opacity-90 rounded-lg p-3 border border-cyber-blue">
        <h3 className="text-xs font-bold text-cyber-blue mb-2">범례</h3>
        <div className="space-y-1 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyber-blue"></div>
            <span>주요 도시</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyber-gold"></div>
            <span>마을 (수요지)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyber-red"></div>
            <span>산업단지 (고수요)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GyeongnamMap;
