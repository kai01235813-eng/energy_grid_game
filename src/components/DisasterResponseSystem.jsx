import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CloudRain, Flame, Zap, AlertTriangle, Activity, 
  Users, DollarSign, Wrench, TrendingUp, MapPin,
  Shield, Clock, Wind, CloudSnow, Navigation
} from 'lucide-react';

// 기상 이벤트 타입 정의
const WEATHER_EVENTS = {
  NORMAL: { id: 'normal', name: '정상', color: '#10b981', risk: 0, icon: Activity },
  HEAVY_RAIN: { id: 'heavy_rain', name: '집중호우', color: '#3b82f6', risk: 3, icon: CloudRain },
  WILDFIRE: { id: 'wildfire', name: '산불', color: '#ef4444', risk: 5, icon: Flame },
  LIGHTNING: { id: 'lightning', name: '낙뢰', color: '#f59e0b', risk: 4, icon: Zap },
  TYPHOON: { id: 'typhoon', name: '태풍', color: '#8b5cf6', risk: 5, icon: Wind },
  SNOW: { id: 'snow', name: '폭설', color: '#60a5fa', risk: 3, icon: CloudSnow },
};

// 경남 주요 변전소 가상 데이터
const SUBSTATIONS = [
  { id: 'changwon', name: '창원변전소', x: 420, y: 380, capacity: 1500, customers: 50000 },
  { id: 'jinju', name: '진주변전소', x: 280, y: 450, capacity: 1200, customers: 35000 },
  { id: 'tongyeong', name: '통영변전소', x: 520, y: 480, capacity: 800, customers: 20000 },
  { id: 'gimhae', name: '김해변전소', x: 450, y: 320, capacity: 1800, customers: 60000 },
  { id: 'masan', name: '마산변전소', x: 400, y: 420, capacity: 1000, customers: 30000 },
];

const DisasterResponseSystem = ({ gameState, onResourceUpdate }) => {
  const [currentWeather, setCurrentWeather] = useState(WEATHER_EVENTS.NORMAL);
  const [substationStatus, setSubstationStatus] = useState(
    SUBSTATIONS.map(s => ({ ...s, risk: 0, operational: true, load: Math.random() * 0.7 + 0.3 }))
  );
  const [aiRecommendations, setAiRecommendations] = useState([]);
  const [eventLog, setEventLog] = useState([]);
  const [resources, setResources] = useState({
    repairCrews: 5,
    budget: 100000,
    emergencyPower: 3,
  });
  const [totalBlackoutCustomers, setTotalBlackoutCustomers] = useState(0);
  const [timeToNextWeather, setTimeToNextWeather] = useState(20);

  // 로그 추가 함수
  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('ko-KR');
    setEventLog(prev => [{ message, type, timestamp, id: Date.now() }, ...prev].slice(0, 10));
  }, []);

  // AI 권고사항 생성
  const generateAIRecommendation = useCallback((weather, affectedStations) => {
    const recommendations = [];
    
    if (weather.id === 'wildfire') {
      recommendations.push({
        id: Date.now(),
        priority: 'critical',
        title: '산불 발생 비상대응',
        action: '영향권 변전소 즉시 차단 및 소방대 출동 요청',
        icon: Flame,
      });
    } else if (weather.id === 'lightning') {
      recommendations.push({
        id: Date.now(),
        priority: 'high',
        title: '낙뢰 피해 예방',
        action: 'DC 전환 또는 접지 시스템 점검 권장',
        icon: Shield,
      });
    } else if (weather.id === 'heavy_rain') {
      recommendations.push({
        id: Date.now(),
        priority: 'medium',
        title: '침수 대응',
        action: '지하 설비 배수 및 우회 경로 확보',
        icon: CloudRain,
      });
    } else if (weather.id === 'typhoon') {
      recommendations.push({
        id: Date.now(),
        priority: 'critical',
        title: '태풍 대비 긴급조치',
        action: '전선 긴장도 점검 및 수목 제거 작업',
        icon: Wind,
      });
    }

    if (affectedStations.length > 0) {
      recommendations.push({
        id: Date.now() + 1,
        priority: 'high',
        title: `${affectedStations.length}개 변전소 리스크 감지`,
        action: '수리 크루 긴급 배치 및 부하 재분배',
        icon: AlertTriangle,
      });
    }

    setAiRecommendations(recommendations);
  }, []);

  // 기상 변화 시뮬레이션 (20초마다)
  useEffect(() => {
    const weatherInterval = setInterval(() => {
      const weatherTypes = Object.values(WEATHER_EVENTS);
      const newWeather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
      setCurrentWeather(newWeather);
      setTimeToNextWeather(20);

      if (newWeather.id !== 'normal') {
        addLog(`⚠️ ${newWeather.name} 발생! 리스크 레벨 ${newWeather.risk}`, 'warning');
      } else {
        addLog('☀️ 기상 상황 정상화', 'success');
      }

      // 변전소 상태 업데이트
      setSubstationStatus(prev => prev.map(station => {
        const weatherRisk = newWeather.risk * (Math.random() * 0.5 + 0.5);
        const isAffected = weatherRisk > 2;
        
        if (isAffected && station.operational) {
          // 30% 확률로 정전 발생
          const blackout = Math.random() > 0.7;
          if (blackout) {
            addLog(`❌ ${station.name} 전력 차단!`, 'error');
            setTotalBlackoutCustomers(prev => prev + station.customers);
          }
          return { ...station, risk: weatherRisk, operational: !blackout };
        }
        
        return { ...station, risk: weatherRisk };
      }));

      // AI 권고 생성
      const affected = substationStatus.filter(s => s.risk > 2);
      generateAIRecommendation(newWeather, affected);
    }, 20000);

    return () => clearInterval(weatherInterval);
  }, [addLog, generateAIRecommendation, substationStatus]);

  // 카운트다운 타이머
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeToNextWeather(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 수리 크루 배치
  const deployRepairCrew = (stationId) => {
    if (resources.repairCrews <= 0) {
      addLog('수리 크루 부족!', 'error');
      return;
    }

    setResources(prev => ({ ...prev, repairCrews: prev.repairCrews - 1, budget: prev.budget - 5000 }));
    
    setSubstationStatus(prev => prev.map(s => {
      if (s.id === stationId && !s.operational) {
        addLog(`✅ ${s.name} 복구 완료`, 'success');
        setTotalBlackoutCustomers(prev => Math.max(0, prev - s.customers));
        setTimeout(() => {
          setResources(r => ({ ...r, repairCrews: r.repairCrews + 1 }));
        }, 5000);
        return { ...s, operational: true, risk: 0 };
      }
      return s;
    }));
  };

  // 긴급 전력 투입
  const useEmergencyPower = (stationId) => {
    if (resources.emergencyPower <= 0) {
      addLog('비상 전원 부족!', 'error');
      return;
    }

    setResources(prev => ({ 
      ...prev, 
      emergencyPower: prev.emergencyPower - 1,
      budget: prev.budget - 10000 
    }));
    
    setSubstationStatus(prev => prev.map(s => {
      if (s.id === stationId) {
        addLog(`⚡ ${s.name}에 비상 전원 투입`, 'success');
        return { ...s, operational: true, risk: Math.max(0, s.risk - 2) };
      }
      return s;
    }));
  };

  // 리스크 색상 계산
  const getRiskColor = (risk) => {
    if (risk >= 4) return '#ef4444'; // red
    if (risk >= 2) return '#f59e0b'; // yellow
    return '#10b981'; // green
  };

  return (
    <div className="w-full h-screen bg-cyber-darker p-6 overflow-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-cyber-blue mb-2 flex items-center gap-3">
          <Shield className="w-8 h-8" />
          AI 재난대응 지원시스템
          <span className="text-sm text-gray-400 ml-auto">KEPCO Digital Twin v2.0</span>
        </h1>
        <p className="text-gray-400 text-sm">실시간 기상 모니터링 및 전력망 재해 대응 시뮬레이션</p>
      </div>

      {/* 메인 대시보드 그리드 */}
      <div className="grid grid-cols-12 gap-4">
        {/* 현재 기상 상황 */}
        <motion.div 
          className="col-span-3 bg-cyber-dark border-2 rounded-lg p-4"
          style={{ borderColor: currentWeather.color }}
          animate={{ borderColor: currentWeather.color }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-white">현재 기상</h3>
            <currentWeather.icon className="w-6 h-6" style={{ color: currentWeather.color }} />
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold mb-2" style={{ color: currentWeather.color }}>
              {currentWeather.name}
            </div>
            <div className="text-sm text-gray-400 flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              다음 변화: {timeToNextWeather}초
            </div>
            <div className="mt-3 bg-cyber-darker rounded-lg p-2">
              <div className="text-xs text-gray-500 mb-1">위험도</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full"
                    style={{ backgroundColor: getRiskColor(currentWeather.risk) }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(currentWeather.risk / 5) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-white">{currentWeather.risk}/5</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* 자원 현황 */}
        <div className="col-span-3 bg-cyber-dark border-2 border-cyber-blue rounded-lg p-4">
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            자원 현황
          </h3>
          <div className="space-y-3">
            <div className="bg-cyber-darker rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-400">수리 크루</span>
                <span className="text-lg font-bold text-green-400">{resources.repairCrews}/5</span>
              </div>
              <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500"
                  style={{ width: `${(resources.repairCrews / 5) * 100}%` }}
                />
              </div>
            </div>
            <div className="bg-cyber-darker rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-400">예산</span>
                <span className="text-lg font-bold text-yellow-400">
                  ₩{(resources.budget / 1000).toFixed(0)}K
                </span>
              </div>
              <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-yellow-500"
                  style={{ width: `${(resources.budget / 100000) * 100}%` }}
                />
              </div>
            </div>
            <div className="bg-cyber-darker rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-400">비상 전원</span>
                <span className="text-lg font-bold text-blue-400">{resources.emergencyPower}/3</span>
              </div>
              <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500"
                  style={{ width: `${(resources.emergencyPower / 3) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 피해 현황 */}
        <div className="col-span-3 bg-cyber-dark border-2 border-red-500 rounded-lg p-4">
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Users className="w-5 h-5" />
            피해 현황
          </h3>
          <div className="text-center">
            <div className="text-5xl font-bold text-red-400 mb-2">
              {totalBlackoutCustomers.toLocaleString()}
            </div>
            <div className="text-sm text-gray-400">정전 고객 수</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="bg-cyber-darker rounded p-2">
                <div className="text-xs text-gray-500">가동 중</div>
                <div className="text-lg font-bold text-green-400">
                  {substationStatus.filter(s => s.operational).length}
                </div>
              </div>
              <div className="bg-cyber-darker rounded p-2">
                <div className="text-xs text-gray-500">정전</div>
                <div className="text-lg font-bold text-red-400">
                  {substationStatus.filter(s => !s.operational).length}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI 권고사항 */}
        <div className="col-span-3 bg-cyber-dark border-2 border-purple-500 rounded-lg p-4">
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            AI 권고
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            <AnimatePresence>
              {aiRecommendations.map(rec => (
                <motion.div
                  key={rec.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`bg-cyber-darker rounded-lg p-3 border-l-4 ${
                    rec.priority === 'critical' ? 'border-red-500' :
                    rec.priority === 'high' ? 'border-yellow-500' :
                    'border-blue-500'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <rec.icon className="w-4 h-4 flex-shrink-0 mt-1" />
                    <div>
                      <div className="text-sm font-bold text-white">{rec.title}</div>
                      <div className="text-xs text-gray-400 mt-1">{rec.action}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* 변전소 상태 맵 */}
        <div className="col-span-7 bg-cyber-dark border-2 border-cyber-blue rounded-lg p-4">
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            변전소 실시간 모니터링
          </h3>
          <div className="relative w-full h-96 bg-cyber-darker rounded-lg overflow-hidden">
            {/* 경남 지도 간략화 배경 */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 600">
              <rect width="800" height="600" fill="#0a0e27" />
              <path 
                d="M 200 200 Q 300 150 400 200 T 600 250 L 650 450 Q 500 500 350 480 L 250 420 Z" 
                fill="#1a1f3a" 
                stroke="#2a3f5a" 
                strokeWidth="2"
              />
            </svg>

            {/* 변전소 노드 */}
            {substationStatus.map((station) => (
              <motion.div
                key={station.id}
                className="absolute cursor-pointer group"
                style={{
                  left: `${(station.x / 800) * 100}%`,
                  top: `${(station.y / 600) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                whileHover={{ scale: 1.2 }}
              >
                {/* 리스크 글로우 */}
                <motion.div
                  className="absolute inset-0 rounded-full blur-xl"
                  style={{
                    width: '60px',
                    height: '60px',
                    background: `radial-gradient(circle, ${getRiskColor(station.risk)}80, transparent)`,
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

                {/* 노드 */}
                <div
                  className="relative z-10 w-10 h-10 rounded-full border-4 flex items-center justify-center"
                  style={{
                    borderColor: getRiskColor(station.risk),
                    backgroundColor: station.operational ? '#0a0e27' : '#1a0000',
                    boxShadow: `0 0 20px ${getRiskColor(station.risk)}`,
                  }}
                >
                  {station.operational ? (
                    <Zap className="w-5 h-5 text-yellow-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
                  )}
                </div>

                {/* 정보 툴팁 */}
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-cyber-dark border-2 border-cyber-blue rounded-lg p-3 min-w-[200px] opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                  <div className="text-white font-bold mb-2">{station.name}</div>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-400">상태:</span>
                      <span className={station.operational ? 'text-green-400' : 'text-red-400'}>
                        {station.operational ? '정상' : '정전'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">위험도:</span>
                      <span style={{ color: getRiskColor(station.risk) }}>
                        {station.risk.toFixed(1)}/5.0
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">부하율:</span>
                      <span className="text-cyan-400">{(station.load * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">고객 수:</span>
                      <span className="text-white">{station.customers.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  {!station.operational && (
                    <div className="mt-3 space-y-2">
                      <button
                        onClick={() => deployRepairCrew(station.id)}
                        className="w-full bg-green-900 hover:bg-green-800 text-green-300 px-3 py-1 rounded text-xs flex items-center justify-center gap-1"
                      >
                        <Wrench className="w-3 h-3" />
                        수리 크루 배치
                      </button>
                      <button
                        onClick={() => useEmergencyPower(station.id)}
                        className="w-full bg-blue-900 hover:bg-blue-800 text-blue-300 px-3 py-1 rounded text-xs flex items-center justify-center gap-1"
                      >
                        <Zap className="w-3 h-3" />
                        비상 전원 투입
                      </button>
                    </div>
                  )}
                </div>

                {/* 이름 라벨 */}
                <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 text-xs text-white font-bold whitespace-nowrap pointer-events-none">
                  {station.name}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* 이벤트 로그 */}
        <div className="col-span-5 bg-cyber-dark border-2 border-cyber-blue rounded-lg p-4">
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            실시간 이벤트 로그
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            <AnimatePresence>
              {eventLog.map(log => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={`bg-cyber-darker rounded-lg p-3 border-l-4 ${
                    log.type === 'error' ? 'border-red-500' :
                    log.type === 'warning' ? 'border-yellow-500' :
                    log.type === 'success' ? 'border-green-500' :
                    'border-blue-500'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 text-sm text-white">{log.message}</div>
                    <div className="text-xs text-gray-500 whitespace-nowrap">{log.timestamp}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 하단 통계 바 */}
      <div className="mt-4 grid grid-cols-4 gap-4">
        <div className="bg-cyber-dark border-2 border-green-500 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-green-400" />
            <div>
              <div className="text-xs text-gray-400">평균 시스템 안정성</div>
              <div className="text-2xl font-bold text-green-400">
                {((substationStatus.filter(s => s.operational).length / substationStatus.length) * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>
        <div className="bg-cyber-dark border-2 border-yellow-500 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-yellow-400" />
            <div>
              <div className="text-xs text-gray-400">평균 리스크 레벨</div>
              <div className="text-2xl font-bold text-yellow-400">
                {(substationStatus.reduce((acc, s) => acc + s.risk, 0) / substationStatus.length).toFixed(1)}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-cyber-dark border-2 border-blue-500 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-blue-400" />
            <div>
              <div className="text-xs text-gray-400">총 운영 비용</div>
              <div className="text-2xl font-bold text-blue-400">
                ₩{((100000 - resources.budget) / 1000).toFixed(0)}K
              </div>
            </div>
          </div>
        </div>
        <div className="bg-cyber-dark border-2 border-purple-500 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Navigation className="w-8 h-8 text-purple-400" />
            <div>
              <div className="text-xs text-gray-400">대응 완료율</div>
              <div className="text-2xl font-bold text-purple-400">
                {substationStatus.filter(s => s.operational).length}/{substationStatus.length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisasterResponseSystem;
