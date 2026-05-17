import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { bus } from '../game/eventBus';
import { EVENTS } from '../game/gameData';

const STORAGE_KEY = 'smartgrid:tutorial:done:v1';

const STEPS = [
  {
    id: 'welcome',
    title: '⚡ 에너지 가디언, 어서오세요',
    body: '경남 8개 도시(창원·진주·통영·함안·김해·거제·사천·양산)에 불을 켜는 게 목표입니다. 11차 전력수급기본계획과 3차 스마트그리드 기본계획에 맞춰 진짜 같은 전력망을 직접 설계해보세요.',
    cta: '시작하기',
    arrow: null,
  },
  {
    id: 'select-sub',
    title: '1단계 — 변전소부터',
    body: '발전소 전력은 변전소를 거쳐야 도시로 갑니다. 하단 팔레트에서 ⚡ 변전소 를 클릭하세요. 비용 400원.',
    cta: null,
    arrow: 'palette-substation',
    waitFor: 'select-substation',
  },
  {
    id: 'place-sub',
    title: '2단계 — 도시 가까이에 배치',
    body: '마우스를 움직이면 노란 반경이 미리 보입니다. 큰 도시(창원·김해 부근)에 가까운 빈 땅에 클릭하세요. 반경 안 도시만 점등됩니다.',
    cta: null,
    arrow: null,
    waitFor: 'place-substation',
  },
  {
    id: 'select-lng',
    title: '3단계 — 발전소 짓기',
    body: '변전소만으론 전력이 없습니다. 🔥 LNG 복합 (800원, +180MW)을 선택하세요. 첨두부하 대응용 브릿지 전원이에요.',
    cta: null,
    arrow: 'palette-lng',
    waitFor: 'select-lng',
  },
  {
    id: 'place-lng',
    title: '4단계 — LNG 배치',
    body: '변전소 근처(반경 내)에 LNG를 놓으세요. 굴뚝에서 연기가 피어오르며 발전이 시작됩니다.',
    cta: null,
    arrow: null,
    waitFor: 'place-lng',
  },
  {
    id: 'lit',
    title: '🎉 도시에 불이 켜졌어요!',
    body: '점등된 도시마다 매초 코인 +10, RP +1이 들어옵니다. 더 많은 발전소를 짓거나 큰 발전원(원전 SMR)에 도전하세요.',
    cta: '다음',
    arrow: null,
    waitFor: 'city-lit',
  },
  {
    id: 'research',
    title: '5단계 — 스마트그리드 연구',
    body: '우측 상단 🔬 연구 버튼을 누르면 5장의 카드(HVDC·ESS·AMI·V2G·VPP)가 있어요. HVDC(100RP)가 가장 가성비 좋아요 — 송전 손실이 15%→5%로 줄어듭니다.',
    cta: '다음',
    arrow: 'research-toggle',
  },
  {
    id: 'done',
    title: '준비 완료',
    body: '8개 도시 전부 점등이 1차 목표. 환경 점수와 코인을 모두 챙기는 무탄소 전원 믹스가 진짜 챔피언입니다. 도파민 즐기세요 ⚡',
    cta: '플레이 시작',
    arrow: null,
  },
];

export default function SmartGridTutorial() {
  const [stepIdx, setStepIdx] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === '1' ? -1 : 0;
  });

  // 행동 기반 자동 진행
  useEffect(() => {
    if (stepIdx < 0) return;
    const step = STEPS[stepIdx];
    if (!step?.waitFor) return;

    let off;
    if (step.waitFor === 'select-substation') {
      off = bus.on(EVENTS.BUILDING_SELECTED, (id) => {
        if (id === 'substation') setStepIdx((s) => s + 1);
      });
    } else if (step.waitFor === 'place-substation') {
      off = bus.on(EVENTS.BUILDING_PLACED, ({ buildingId }) => {
        if (buildingId === 'substation') setStepIdx((s) => s + 1);
      });
    } else if (step.waitFor === 'select-lng') {
      off = bus.on(EVENTS.BUILDING_SELECTED, (id) => {
        if (id === 'lng') setStepIdx((s) => s + 1);
      });
    } else if (step.waitFor === 'place-lng') {
      off = bus.on(EVENTS.BUILDING_PLACED, ({ buildingId }) => {
        if (buildingId === 'lng') setStepIdx((s) => s + 1);
      });
    } else if (step.waitFor === 'city-lit') {
      off = bus.on(EVENTS.CITY_LIT, () => setStepIdx((s) => s + 1));
    }
    return () => off?.();
  }, [stepIdx]);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setStepIdx(-1);
  };

  const next = () => {
    if (stepIdx >= STEPS.length - 1) finish();
    else setStepIdx((s) => s + 1);
  };

  const skip = () => {
    if (confirm('튜토리얼을 건너뛸까요? 나중에 우측 상단 ❓ 버튼으로 다시 볼 수 있어요.')) finish();
  };

  if (stepIdx < 0) {
    return (
      <button onClick={() => setStepIdx(0)} style={styles.helpBtn} title="튜토리얼 다시보기">
        ❓
      </button>
    );
  }

  const step = STEPS[stepIdx];
  const showNext = !!step.cta;
  const isLast = stepIdx === STEPS.length - 1;

  return (
    <>
      {/* 화살표 하이라이트 */}
      {step.arrow && <Highlight target={step.arrow} />}

      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          style={styles.card}
        >
          <div style={styles.header}>
            <div style={styles.stepBadge}>
              {stepIdx + 1} / {STEPS.length}
            </div>
            <button onClick={skip} style={styles.skipBtn}>건너뛰기 ✕</button>
          </div>
          <h3 style={styles.title}>{step.title}</h3>
          <p style={styles.body}>{step.body}</p>
          {showNext && (
            <button onClick={next} style={styles.nextBtn}>
              {isLast ? step.cta + ' →' : step.cta + ' →'}
            </button>
          )}
          {!showNext && (
            <div style={styles.waitHint}>
              <span style={styles.pulse}>●</span> 위 행동을 하면 자동으로 다음 단계
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

// 특정 UI 영역을 가리키는 간단한 화살표 + 글로우
function Highlight({ target }) {
  // 좌표는 SmartGridGame 레이아웃과 동기화 (대략 위치)
  const positions = {
    'palette-substation': { x: '50%', y: 'calc(100% - 70px)', dx: 224, label: '⚡ 변전소' },
    'palette-lng':        { x: '50%', y: 'calc(100% - 70px)', dx: -184, label: '🔥 LNG' },
    'research-toggle':    { x: 'calc(100% - 80px)', y: '92px', dx: 0, label: '🔬 연구' },
  };
  const p = positions[target];
  if (!p) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        left: typeof p.x === 'string' ? p.x : `${p.x}px`,
        top: typeof p.y === 'string' ? p.y : `${p.y}px`,
        transform: `translate(calc(-50% + ${p.dx}px), -50%)`,
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      <motion.div
        animate={{
          scale: [1, 1.15, 1],
          boxShadow: [
            '0 0 0 0 rgba(0, 212, 255, 0.7)',
            '0 0 0 18px rgba(0, 212, 255, 0)',
            '0 0 0 0 rgba(0, 212, 255, 0)',
          ],
        }}
        transition={{ duration: 1.6, repeat: Infinity }}
        style={{
          width: 92,
          height: 60,
          border: '2px solid #00d4ff',
          borderRadius: 12,
          background: 'rgba(0, 212, 255, 0.08)',
        }}
      />
    </motion.div>
  );
}

const styles = {
  card: {
    position: 'fixed',
    left: 12,
    bottom: 16,
    width: 360,
    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.97), rgba(30, 41, 59, 0.97))',
    border: '1px solid #00d4ff',
    borderRadius: 14,
    padding: 16,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxShadow: '0 12px 32px rgba(0, 212, 255, 0.2)',
    zIndex: 40,
    backdropFilter: 'blur(12px)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepBadge: {
    background: 'rgba(0, 212, 255, 0.18)',
    color: '#00d4ff',
    padding: '2px 10px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 700,
  },
  skipBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: 11,
    cursor: 'pointer',
  },
  title: {
    margin: '4px 0 8px',
    fontSize: 17,
    color: '#00d4ff',
    fontWeight: 700,
  },
  body: {
    margin: '0 0 12px',
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 1.55,
  },
  nextBtn: {
    width: '100%',
    background: 'linear-gradient(90deg, #00d4ff, #0ea5e9)',
    border: 'none',
    color: '#0a0e27',
    padding: '10px',
    borderRadius: 8,
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 14,
  },
  waitHint: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  pulse: {
    color: '#34d399',
    fontSize: 14,
    animation: 'pulse 1.4s ease-in-out infinite',
  },
  helpBtn: {
    position: 'fixed',
    bottom: 16,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'rgba(15, 23, 42, 0.92)',
    border: '1px solid #475569',
    color: '#94a3b8',
    fontSize: 18,
    cursor: 'pointer',
    zIndex: 40,
  },
};
