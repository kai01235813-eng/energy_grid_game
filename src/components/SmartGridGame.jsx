import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PhaserCanvas from './PhaserCanvas';
import SmartGridTutorial from './SmartGridTutorial';
import { BUILDINGS, RESEARCH, EVENTS, REPAIR_COST_RATIO, YEAR } from '../game/gameData';
import { bus } from '../game/eventBus';

const INITIAL_COIN = 5000;

export default function SmartGridGame() {
  const sceneRef = useRef(null);
  const [coin, setCoin] = useState(INITIAL_COIN);
  const [research, setResearch] = useState({});
  const [rp, setRp] = useState(0);
  const [stats, setStats] = useState({
    supply: 0,
    demand: 0,
    env: 0,
    poweredCities: 0,
    totalCities: 0,
    poweredCustomers: 0,
    totalCustomers: 0,
    buildingCount: 0,
  });
  const [selected, setSelected] = useState(null);
  const [popup, setPopup] = useState(null);
  const [showResearch, setShowResearch] = useState(false);
  const [disasterAlert, setDisasterAlert] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [year, setYear] = useState(YEAR.START);
  const [aiSurge, setAiSurge] = useState(null);
  const [campaignEnd, setCampaignEnd] = useState(false);

  // bus 이벤트 구독
  useEffect(() => {
    const offState = bus.on(EVENTS.STATE_CHANGED, setStats);
    const offTick = bus.on('tick', ({ lit, ami }) => {
      const income = lit * (ami ? 12 : 10);
      setCoin((c) => c + income);
      setRp((r) => r + lit);
    });
    const offPlace = bus.on(EVENTS.BUILDING_PLACED, ({ x, y, buildingId }) => {
      const def = BUILDINGS[buildingId];
      if (!sceneRef.current) return;
      // 비용 검증
      setCoin((c) => {
        if (c < def.cost) {
          showPopup(`💸 코인 부족 — ${def.cost} 필요`);
          return c;
        }
        sceneRef.current.applyBuildingPlacement(x, y, buildingId);
        showPopup(`+${def.power} MW`);
        return c - def.cost;
      });
    });
    const offLit = bus.on(EVENTS.CITY_LIT, () => {
      showPopup('💡 도시 점등!', 'lit');
    });
    const offDisaster = bus.on(EVENTS.DISASTER, ({ type, name, target }) => {
      const icon = type === 'lightning' ? '⚡' : type === 'helicopter' ? '🚁' : '🔥';
      const id = Math.random();
      setDisasterAlert({ id, icon, name, target });
      setTimeout(() => setDisasterAlert((a) => (a?.id === id ? null : a)), 4500);
    });
    const offRepair = bus.on(EVENTS.REPAIR_REQUESTED, ({ buildingRef }) => {
      if (!sceneRef.current || !buildingRef) return;
      const cost = Math.floor(buildingRef.def.cost * REPAIR_COST_RATIO);
      setCoin((c) => {
        if (c < cost) {
          showPopup(`💸 수리 비용 ${cost} 부족`);
          return c;
        }
        sceneRef.current.repairBuilding(buildingRef);
        showPopup(`🔧 수리 완료 -${cost}`);
        return c - cost;
      });
    });
    const offZoom = bus.on('zoom-changed', ({ zoom }) => setZoom(zoom));
    const offYear = bus.on(EVENTS.YEAR_CHANGED, ({ year, isEnd }) => {
      setYear(year);
      if (isEnd) setCampaignEnd(true);
    });
    const offSurge = bus.on(EVENTS.AI_SURGE, ({ year }) => {
      const id = Math.random();
      setAiSurge({ id, year });
      setTimeout(() => setAiSurge((a) => (a?.id === id ? null : a)), 6000);
    });
    return () => { offState(); offTick(); offPlace(); offLit(); offDisaster(); offRepair(); offZoom(); offYear(); offSurge(); };
  }, []);

  const adjustZoom = (factor) => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    const oldZoom = scene.zoom;
    const newZoom = Math.max(0.6, Math.min(2.5, oldZoom * factor));
    if (newZoom === oldZoom) return;
    // 화면 중앙 기준 줌
    const cx = scene.scale.width / 2;
    const cy = scene.scale.height / 2;
    const cwx = (cx - scene.world.x) / oldZoom;
    const cwy = (cy - scene.world.y) / oldZoom;
    scene.zoom = newZoom;
    scene.world.setScale(newZoom);
    scene.world.x = cx - cwx * newZoom;
    scene.world.y = cy - cwy * newZoom;
    setZoom(newZoom);
  };

  const resetZoom = () => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    scene.zoom = 1;
    scene.world.setScale(1);
    scene.world.x = 0;
    scene.world.y = 0;
    setZoom(1);
  };

  const showPopup = (text, kind = 'info') => {
    const id = Math.random();
    setPopup({ id, text, kind });
    setTimeout(() => setPopup((p) => (p?.id === id ? null : p)), 1200);
  };

  const handleSelectBuilding = (id) => {
    setSelected(id);
    bus.emit(EVENTS.BUILDING_SELECTED, id);
  };

  const handleResearch = (id) => {
    if (research[id]) return;
    const r = RESEARCH[id];
    if (rp < r.cost) {
      showPopup(`🔬 RP 부족 — ${r.cost} 필요`);
      return;
    }
    setRp((p) => p - r.cost);
    setResearch((prev) => ({ ...prev, [id]: true }));
    bus.emit(EVENTS.RESEARCH_UNLOCKED, id);
    showPopup(`🚀 ${r.name} 해금!`, 'lit');
  };

  const supplyRatio = stats.demand > 0 ? Math.min(stats.supply / stats.demand, 1.5) : 0;
  const totalConsumers = stats.totalCities + stats.totalCustomers;
  const totalLit = stats.poweredCities + stats.poweredCustomers;
  const cityRatio = totalConsumers > 0 ? totalLit / totalConsumers : 0;
  const undersupply = stats.demand > 0 && stats.supply < stats.demand;
  const yearProgress = Math.min(1, (year - YEAR.START) / (YEAR.END - YEAR.START));

  return (
    <div style={styles.root}>
      <PhaserCanvas onSceneReady={(s) => { sceneRef.current = s; }} />

      {/* HUD 상단 */}
      {/* 캠페인 시계 */}
      <motion.div
        style={{
          ...styles.yearBox,
          borderColor: campaignEnd ? '#a78bfa' : year >= YEAR.AI_SURGE_YEAR ? '#ef4444' : '#475569',
        }}
        animate={undersupply ? { boxShadow: ['0 0 0 0 rgba(239,68,68,0.5)', '0 0 0 8px rgba(239,68,68,0)', '0 0 0 0 rgba(239,68,68,0)'] } : {}}
        transition={{ duration: 1, repeat: undersupply ? Infinity : 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>제11차 전기본</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: year >= YEAR.AI_SURGE_YEAR ? '#fbbf24' : '#00d4ff' }}>
            {year}년
          </span>
          <span style={{ fontSize: 10, color: '#64748b' }}>/ {YEAR.END}</span>
        </div>
        <div style={styles.yearProgressBg}>
          <motion.div style={{ ...styles.yearProgressFill, width: `${yearProgress * 100}%` }} animate={{ width: `${yearProgress * 100}%` }} />
        </div>
      </motion.div>

      <motion.div
        style={styles.hud}
        animate={undersupply ? { borderColor: ['#334155', '#ef4444', '#334155'] } : {}}
        transition={{ duration: 0.8, repeat: undersupply ? Infinity : 0 }}
      >
        <Stat icon="💰" label="코인" value={coin.toLocaleString()} color="#fbbf24" />
        <Stat icon="🔬" label="RP" value={rp} color="#a78bfa" />
        <Stat icon="⚡" label="공급/수요" value={`${stats.supply}/${stats.demand}MW`} color={supplyRatio >= 1 ? '#34d399' : '#f87171'} blink={undersupply} />
        <Stat icon="💡" label="점등 도시" value={`${stats.poweredCities}/${stats.totalCities}`} color="#fde047" />
        <Stat icon="🏭" label="대형고객" value={`${stats.poweredCustomers}/${stats.totalCustomers}`} color="#fbbf24" />
        <Stat icon="🌱" label="환경" value={stats.env} color={stats.env >= 0 ? '#34d399' : '#f87171'} />
      </motion.div>

      {/* 진행도 바 */}
      <div style={styles.progressWrap}>
        <div style={styles.progressLabel}>도시 점등률</div>
        <div style={styles.progressBg}>
          <motion.div
            style={{ ...styles.progressFill, width: `${cityRatio * 100}%` }}
            animate={{ width: `${cityRatio * 100}%` }}
          />
        </div>
        <div style={styles.progressText}>{Math.round(cityRatio * 100)}%</div>
      </div>

      {/* 건물 팔레트 — 하단 */}
      <div style={styles.palette}>
        {Object.values(BUILDINGS).map((b) => {
          const isSel = selected === b.id;
          const canAfford = coin >= b.cost;
          return (
            <button
              key={b.id}
              onClick={() => handleSelectBuilding(b.id)}
              style={{
                ...styles.paletteBtn,
                outline: isSel ? '2px solid #00d4ff' : '2px solid transparent',
                opacity: canAfford ? 1 : 0.5,
              }}
              title={b.desc}
            >
              <div style={styles.paletteIcon}>{b.icon}</div>
              <div style={styles.paletteName}>{b.name}</div>
              <div style={{ ...styles.paletteCost, color: canAfford ? '#fbbf24' : '#f87171' }}>
                💰 {b.cost}
              </div>
              {b.power > 0 && <div style={styles.palettePower}>+{b.power}MW</div>}
              {b.isSubstation && <div style={styles.palettePower}>반경 {b.range}px</div>}
            </button>
          );
        })}
        <button
          onClick={() => { setSelected(null); bus.emit(EVENTS.BUILDING_SELECTED, null); }}
          style={{
            ...styles.paletteBtn,
            background: selected === null ? '#1e3a8a' : '#1f2937',
            outline: selected === null ? '2px solid #00d4ff' : '2px solid transparent',
          }}
        >
          <div style={styles.paletteIcon}>🖐️</div>
          <div style={styles.paletteName}>드래그</div>
          <div style={styles.palettePower}>지도이동</div>
        </button>
      </div>

      {/* 줌 컨트롤 */}
      <div style={styles.zoomBox}>
        <button onClick={() => adjustZoom(1.25)} style={styles.zoomBtn} title="줌 인 (마우스 휠 위)">＋</button>
        <div style={styles.zoomLabel}>{Math.round(zoom * 100)}%</div>
        <button onClick={() => adjustZoom(0.8)} style={styles.zoomBtn} title="줌 아웃 (마우스 휠 아래)">－</button>
        <button onClick={resetZoom} style={{ ...styles.zoomBtn, fontSize: 11 }} title="원래 크기">⟲</button>
      </div>

      {/* 연구 패널 토글 */}
      <button onClick={() => setShowResearch((v) => !v)} style={styles.researchToggle}>
        🔬 연구 ({Object.keys(research).length}/5)
      </button>

      <AnimatePresence>
        {showResearch && (
          <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            style={styles.researchPanel}
          >
            <h3 style={{ color: '#a78bfa', margin: '0 0 12px 0' }}>3차 스마트그리드 연구</h3>
            {Object.values(RESEARCH).map((r) => {
              const owned = !!research[r.id];
              const canAfford = rp >= r.cost;
              return (
                <button
                  key={r.id}
                  onClick={() => handleResearch(r.id)}
                  disabled={owned}
                  style={{
                    ...styles.researchCard,
                    background: owned ? '#064e3b' : '#1f2937',
                    cursor: owned ? 'default' : 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 18 }}>{r.icon} {r.name}</span>
                    <span style={{ color: owned ? '#34d399' : canAfford ? '#fbbf24' : '#f87171', fontSize: 12 }}>
                      {owned ? '✓ 완료' : `🔬 ${r.cost}`}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{r.desc}</div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 안내 텍스트 */}
      {stats.buildingCount === 0 && (
        <div style={styles.hint}>
          ↓ 하단에서 건물을 선택해 경남 지도 위에 배치하세요. 변전소(노란 반경) 안에 있는 도시가 충분한 공급을 받으면 점등됩니다 💡
        </div>
      )}

      {/* 재난 알림 배너 */}
      <AnimatePresence>
        {disasterAlert && (
          <motion.div
            key={disasterAlert.id}
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={styles.disasterBanner}
          >
            <span style={{ fontSize: 26 }}>{disasterAlert.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24' }}>
                재난 발생: {disasterAlert.name}
              </div>
              <div style={{ fontSize: 11, color: '#fecaca' }}>
                {disasterAlert.target} — 손상된 시설을 클릭해 수리하세요 (원가 50%)
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 토스트 팝업 */}
      <AnimatePresence>
        {popup && (
          <motion.div
            key={popup.id}
            initial={{ opacity: 0, y: 20, scale: 0.5 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              ...styles.popup,
              color: popup.kind === 'lit' ? '#fde047' : '#fff',
              textShadow: popup.kind === 'lit' ? '0 0 20px #fde047' : 'none',
            }}
          >
            {popup.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI/반도체 폭증 (2030) 배너 */}
      <AnimatePresence>
        {aiSurge && (
          <motion.div
            key={aiSurge.id}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={styles.surgeBanner}
          >
            <div style={{ fontSize: 30 }}>🤖⚡</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fbbf24' }}>
                {aiSurge.year}년 — AI · 반도체 전력수요 폭증
              </div>
              <div style={{ fontSize: 11, color: '#fecaca', marginTop: 4 }}>
                산업부 11차 전기본: "2030년 데이터센터·반도체 수요 2023년 대비 2배"<br/>
                모든 수용가 수요 +20%. 발전·송전 보강 시급!
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 캠페인 종료 (2038) */}
      <AnimatePresence>
        {campaignEnd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={styles.endOverlay}
          >
            <div style={styles.endCard}>
              <div style={{ fontSize: 12, color: '#a78bfa', letterSpacing: 2 }}>CAMPAIGN END</div>
              <div style={{ fontSize: 36, fontWeight: 800, marginTop: 8 }}>2038년</div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 8, lineHeight: 1.6 }}>
                11차 전기본 종착점에 도달했습니다.<br/>
                점등 {totalLit}/{totalConsumers} · 환경 {stats.env} · 코인 {coin.toLocaleString()}
              </div>
              <button onClick={() => location.reload()} style={styles.endBtn}>다시 시작</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 출처 표기 */}
      <div style={styles.citation}>
        출처: 산업통상자원부 「제11차 전력수급기본계획」 (2025.2 확정)
      </div>

      {/* 튜토리얼 — 첫 진입 시 자동 시작, 이후 좌하단 ❓로 재시작 */}
      <SmartGridTutorial />
    </div>
  );
}

function Stat({ icon, label, value, color, blink = false }) {
  return (
    <div style={styles.stat}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>{label}</div>
        <motion.div
          style={{ fontSize: 16, color, fontWeight: 700 }}
          animate={blink ? { opacity: [1, 0.4, 1] } : {}}
          transition={{ duration: 0.8, repeat: blink ? Infinity : 0 }}
        >
          {value}
        </motion.div>
      </div>
    </div>
  );
}

const styles = {
  root: {
    position: 'fixed',
    inset: 0,
    background: '#050816',
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    overflow: 'hidden',
    userSelect: 'none',
  },
  hud: {
    position: 'absolute',
    top: 12,
    left: 12,
    display: 'flex',
    gap: 12,
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid #334155',
    borderRadius: 12,
    padding: '8px 14px',
    backdropFilter: 'blur(8px)',
    zIndex: 10,
  },
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 10px',
    borderRight: '1px solid #334155',
  },
  progressWrap: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 240,
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid #334155',
    borderRadius: 12,
    padding: 10,
    zIndex: 10,
  },
  progressLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 4 },
  progressBg: {
    width: '100%',
    height: 12,
    background: '#1e293b',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #fbbf24, #fde047)',
    boxShadow: '0 0 8px #fde047',
  },
  progressText: { fontSize: 11, textAlign: 'right', marginTop: 2, color: '#fde047' },
  palette: {
    position: 'absolute',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 8,
    background: 'rgba(15, 23, 42, 0.92)',
    border: '1px solid #334155',
    borderRadius: 12,
    padding: 10,
    zIndex: 10,
  },
  paletteBtn: {
    width: 92,
    background: '#1f2937',
    border: 'none',
    borderRadius: 8,
    padding: '8px 6px',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  paletteIcon: { fontSize: 24, lineHeight: 1 },
  paletteName: { fontSize: 11, fontWeight: 600, marginTop: 4 },
  paletteCost: { fontSize: 11, marginTop: 4 },
  palettePower: { fontSize: 10, color: '#34d399', marginTop: 2 },
  researchToggle: {
    position: 'absolute',
    top: 80,
    right: 12,
    background: 'linear-gradient(135deg, #6d28d9, #a78bfa)',
    border: 'none',
    color: '#fff',
    padding: '8px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 700,
    zIndex: 10,
    boxShadow: '0 4px 12px rgba(167, 139, 250, 0.3)',
  },
  researchPanel: {
    position: 'absolute',
    top: 120,
    right: 12,
    width: 280,
    background: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid #6d28d9',
    borderRadius: 12,
    padding: 14,
    backdropFilter: 'blur(8px)',
    zIndex: 10,
    maxHeight: 'calc(100vh - 140px)',
    overflowY: 'auto',
  },
  researchCard: {
    width: '100%',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    color: '#fff',
    textAlign: 'left',
  },
  hint: {
    position: 'absolute',
    bottom: 130,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid #475569',
    color: '#cbd5e1',
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 11,
    zIndex: 5,
    maxWidth: 540,
    textAlign: 'center',
  },
  popup: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: 22,
    fontWeight: 700,
    pointerEvents: 'none',
    zIndex: 100,
  },
  yearBox: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(15, 23, 42, 0.92)',
    border: '1px solid #475569',
    borderRadius: 12,
    padding: '6px 16px',
    minWidth: 200,
    zIndex: 11,
    backdropFilter: 'blur(8px)',
  },
  yearProgressBg: {
    width: '100%',
    height: 4,
    background: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 6,
  },
  yearProgressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #00d4ff, #fbbf24, #ef4444)',
  },
  surgeBanner: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'linear-gradient(135deg, rgba(127, 29, 29, 0.97), rgba(202, 8, 19, 0.92))',
    border: '2px solid #fbbf24',
    borderRadius: 14,
    padding: '18px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: 18,
    color: '#fff',
    boxShadow: '0 16px 48px rgba(239, 68, 68, 0.5)',
    zIndex: 60,
    backdropFilter: 'blur(8px)',
    maxWidth: 480,
  },
  endOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(5, 8, 22, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    backdropFilter: 'blur(6px)',
  },
  endCard: {
    background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))',
    border: '1px solid #a78bfa',
    borderRadius: 16,
    padding: 36,
    textAlign: 'center',
    minWidth: 360,
    color: '#fff',
  },
  endBtn: {
    marginTop: 24,
    width: '100%',
    background: 'linear-gradient(90deg, #a78bfa, #6d28d9)',
    border: 'none',
    color: '#fff',
    padding: '12px',
    borderRadius: 8,
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 14,
  },
  citation: {
    position: 'absolute',
    bottom: 4,
    left: 62,
    fontSize: 10,
    color: '#475569',
    fontStyle: 'italic',
    zIndex: 5,
    pointerEvents: 'none',
  },
  zoomBox: {
    position: 'absolute',
    right: 12,
    bottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    background: 'rgba(15, 23, 42, 0.92)',
    border: '1px solid #334155',
    borderRadius: 10,
    padding: 6,
    zIndex: 10,
  },
  zoomBtn: {
    width: 38,
    height: 32,
    background: '#1f2937',
    border: '1px solid #475569',
    borderRadius: 6,
    color: '#e5e7eb',
    cursor: 'pointer',
    fontSize: 16,
    fontWeight: 700,
    fontFamily: 'monospace',
  },
  zoomLabel: {
    width: 38,
    textAlign: 'center',
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: 'monospace',
  },
  disasterBanner: {
    position: 'absolute',
    top: 80,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'linear-gradient(135deg, rgba(127, 29, 29, 0.95), rgba(220, 38, 38, 0.85))',
    border: '1px solid #ef4444',
    borderRadius: 10,
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    color: '#fff',
    boxShadow: '0 8px 24px rgba(239, 68, 68, 0.3)',
    zIndex: 30,
    backdropFilter: 'blur(8px)',
  },
};
