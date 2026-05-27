import React, { useEffect, useMemo, useState } from 'react';

// ============================================================================
// D/L (배전선로) 휴전작업 부하절체 시뮬레이터
// ----------------------------------------------------------------------------
// 배전운영시스템의 휴전 모의 기능을 단순화한 학습용 시뮬레이션. 4단계 흐름:
//   1) 데이터 수집  — 휴전선로 부하 + 인접선로 여유 용량 검토
//   2) 시스템 검토  — 전압강하 / 주변압기 용량 / 보호협조 자동 시뮬
//   3) 시나리오 선택 — 단독 절체 vs 분할 절체
//   4) 스위칭 시퀀스 — 정확한 순서로 개폐기 조작 (동기 검정 포함)
// 모든 변전소/선로 이름은 익명 (A 변전소, 1호 D/L …) — 특정 사업자 표기 회피.
// ============================================================================

const palette = {
  bg:        'radial-gradient(circle at 70% 20%, #0c1430 0%, #050816 80%)',
  panel:     'rgba(14, 20, 42, 0.92)',
  panelSub:  'rgba(20, 28, 52, 0.88)',
  accent:    '#7be6ff',
  accentDim: '#3a5e7c',
  text:      '#e6f7ff',
  textDim:   '#94a8c8',
  positive:  '#39ffa6',
  warn:      '#ffc640',
  danger:    '#ff4d6d',
  muted:     '#4a5872',
  busbar:    '#d4dbe8',
  feederA:   '#ff7a3d', // 휴전 대상 — 적색 계열
  feederB:   '#39ffa6', // 정상 연계
  feederC:   '#7be6ff', // 정상 연계
};

// 시나리오 데이터 — 모든 수치는 실무에서 흔히 보는 범위로 균형 잡아둠
const SCENARIO = {
  substation: {
    name: 'A 변전소',
    primaryV: '154 kV',
    secondaryV: '22.9 kV',
    mtrName: '주변압기 1',
    mtrCapacity: 60, // MVA — 주변압기 용량
  },
  feeders: {
    A: {
      id: 'A', name: '1호 D/L', color: palette.feederA,
      baseLoad: 4.0,        // MVA, 현재 부하
      peakLoad: 4.3,        // MVA, 작업 시간대 예상 최대
      lengthKm: 8.2, conductorLimit: 10.0,
      outage: true,         // 휴전 대상
      frontLoad: 2.0, backLoad: 2.0, // 분할 절체용 — 앞쪽/뒤쪽 구간
    },
    B: {
      id: 'B', name: '2호 D/L', color: palette.feederB,
      baseLoad: 3.0, peakLoad: 3.2, lengthKm: 6.5, conductorLimit: 10.0,
      mtrName: '주변압기 1',  // 같은 변압기 소속
    },
    C: {
      id: 'C', name: '3호 D/L', color: palette.feederC,
      baseLoad: 2.5, peakLoad: 2.7, lengthKm: 7.8, conductorLimit: 10.0,
      mtrName: '주변압기 2',  // 다른 변압기 소속
      mtrCapacity: 60, mtrCurrentLoad: 48, // 주변압기 2 부하 — 비교적 빠듯
    },
  },
  // 연계 개폐기 (Tie Switch) — 정상시 개방
  ties: [
    { id: 'AB', label: 'A↔B 연계', between: ['A', 'B'], open: true },
    { id: 'AC', label: 'A↔C 연계', between: ['A', 'C'], open: true },
  ],
};

// 4가지 시나리오 옵션 — 학생이 고르면 즉시 결과 시뮬
const OPTIONS = [
  {
    id: 'all-to-B',
    label: '1호 전체 → 2호로 일괄 절체',
    summary: '2호의 부하가 3.0 → 7.0 MVA. 같은 변압기 소속이라 가장 간단.',
    evaluate(s) {
      const newB = s.feeders.B.baseLoad + s.feeders.A.peakLoad;
      const mtrLoad = newB + s.feeders.B.baseLoad; // 단순화: 주변압기 1엔 A·B 두 D/L만 본다
      const overFeeder = newB > s.feeders.B.conductorLimit;
      const voltagePU = clamp(1 - (newB / s.feeders.B.conductorLimit) * 0.08 - s.feeders.B.lengthKm * 0.004, 0.85, 1);
      return {
        result: overFeeder ? 'fail' : voltagePU < 0.95 ? 'warn' : 'pass',
        feederLoad: newB,
        voltagePU,
        notes: [
          overFeeder
            ? `❌ 2호 D/L 부하 ${newB.toFixed(1)} MVA > 허용 ${s.feeders.B.conductorLimit} MVA (전선 과부하)`
            : `✓ 2호 D/L 부하 ${newB.toFixed(1)} MVA / ${s.feeders.B.conductorLimit} MVA — 여유 있음`,
          voltagePU < 0.95
            ? `⚠ 말단 전압 ${voltagePU.toFixed(3)} pu < 0.95 — 전압강하 한계 근접`
            : `✓ 말단 전압 ${voltagePU.toFixed(3)} pu — 정상`,
          `✓ 주변압기 1 단일 변압기 내 부하 이동 — 변압기 추가 부담 없음`,
          `✓ 보호계전기 정정치 재검토 불필요 (동일 보호구간)`,
        ],
      };
    },
  },
  {
    id: 'all-to-C',
    label: '1호 전체 → 3호로 일괄 절체',
    summary: '3호의 부하가 2.5 → 6.5 MVA. 단, 3호는 다른 변압기 소속이라 변압기 용량 검토 필수.',
    evaluate(s) {
      const newC = s.feeders.C.baseLoad + s.feeders.A.peakLoad;
      const newMtr2 = s.feeders.C.mtrCurrentLoad + s.feeders.A.peakLoad;
      const overMtr = newMtr2 > s.feeders.C.mtrCapacity * 0.95;
      const voltagePU = clamp(1 - (newC / s.feeders.C.conductorLimit) * 0.09 - s.feeders.C.lengthKm * 0.005, 0.85, 1);
      return {
        result: overMtr ? 'fail' : voltagePU < 0.95 ? 'warn' : 'pass',
        feederLoad: newC,
        voltagePU,
        mtrLoad: newMtr2,
        notes: [
          `✓ 3호 D/L 부하 ${newC.toFixed(1)} MVA / ${s.feeders.C.conductorLimit} MVA — 전선은 여유`,
          overMtr
            ? `❌ 주변압기 2 부하 ${newMtr2.toFixed(1)} MVA / ${s.feeders.C.mtrCapacity} MVA — 변압기 과부하 록(Lock) 위험`
            : `✓ 주변압기 2 부하 ${newMtr2.toFixed(1)} MVA / ${s.feeders.C.mtrCapacity} MVA`,
          voltagePU < 0.95
            ? `⚠ 말단 전압 ${voltagePU.toFixed(3)} pu < 0.95 — 선로 길이 + 부하 합산 영향`
            : `✓ 말단 전압 ${voltagePU.toFixed(3)} pu`,
          `⚠ 다른 변압기로 절체 — 보호계전기 정정치 재검토 권장`,
        ],
      };
    },
  },
  {
    id: 'split',
    label: '분할 절체 (앞쪽 → 2호, 뒤쪽 → 3호)',
    summary: '1호의 앞쪽 2 MVA는 2호로, 뒤쪽 2 MVA는 3호로 분할. 부하가 분산돼 안전.',
    recommended: true,
    evaluate(s) {
      const newB = s.feeders.B.baseLoad + s.feeders.A.frontLoad;   // 3 + 2 = 5
      const newC = s.feeders.C.baseLoad + s.feeders.A.backLoad;    // 2.5 + 2 = 4.5
      const newMtr2 = s.feeders.C.mtrCurrentLoad + s.feeders.A.backLoad;
      const voltageB = clamp(1 - (newB / s.feeders.B.conductorLimit) * 0.07 - 4 * 0.004, 0.85, 1);
      const voltageC = clamp(1 - (newC / s.feeders.C.conductorLimit) * 0.07 - 5 * 0.004, 0.85, 1);
      const minV = Math.min(voltageB, voltageC);
      return {
        result: minV < 0.95 ? 'warn' : 'pass',
        feederLoad: Math.max(newB, newC),
        voltagePU: minV,
        mtrLoad: newMtr2,
        notes: [
          `✓ 2호 D/L 부하 ${newB.toFixed(1)} / 10 MVA · 말단 전압 ${voltageB.toFixed(3)} pu`,
          `✓ 3호 D/L 부하 ${newC.toFixed(1)} / 10 MVA · 말단 전압 ${voltageC.toFixed(3)} pu`,
          `✓ 주변압기 2 부하 ${newMtr2.toFixed(1)} / 60 MVA — 분할로 변압기 부담 분산`,
          `✓ 보호협조 — 각 구간 절반씩만 부하 증가, 정정치 안전`,
        ],
      };
    },
  },
  {
    id: 'do-nothing',
    label: '부하 검토 없이 그냥 차단',
    summary: '한 번 가볼래요? — 절차 무시 시 어떤 일이 생기는지 확인.',
    evaluate() {
      return {
        result: 'fail',
        notes: [
          `❌ 사전 부하검토 누락 — 시스템 휴전 모의 미실시`,
          `❌ 무정전 절체 미수행 — 4.0 MVA 부하 직접 정전`,
          `❌ 약 3,200세대 정전, 안전사고 위험`,
          `❌ 실무 절차 위반 — 표준 운영규정 미준수`,
        ],
      };
    },
  },
];

// 정상 시나리오의 표준 스위칭 시퀀스 (분할 절체 기준)
const SWITCHING_SEQUENCE = [
  { id: 'pre',  label: '동기 검정 — 1호·2호 모선 전압/위상 일치 확인', icon: '⚡', tip: '동기검정기(SynchroScope)로 위상차 0, 전압차 0.5% 이하 확인' },
  { id: 'tieAB', label: '1-2호 연계개폐기 투입 (Close)',              icon: '🔗', tip: '병렬 운전 상태로 진입 — 순간적으로 두 D/L이 연결됨' },
  { id: 'aFront', label: '1호 D/L 앞쪽 구간 개폐기 개방 (Open)',         icon: '✂️', tip: '앞쪽 2 MVA를 2호 측으로 분리. 짧은 순간 부하 전이' },
  { id: 'tieAC', label: '1-3호 연계개폐기 투입 (Close)',              icon: '🔗', tip: '뒤쪽 구간을 3호로 절체 준비. 다시 병렬 운전' },
  { id: 'aBack', label: '1호 D/L 뒤쪽 구간 개폐기 개방 (Open)',         icon: '✂️', tip: '뒤쪽 2 MVA를 3호 측으로 완전 이전' },
  { id: 'aCb',   label: '1호 D/L 인출 CB 개방 (Open)',                  icon: '🔌', tip: '변전소측 차단기 개방 — 1호 D/L 완전 휴전 상태' },
  { id: 'final', label: '검전 + 접지 — 작업 안전조치',                  icon: '🛡️', tip: '검전기로 잔류 전압 확인 후 작업용 접지 설치' },
];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ============================================================================
// Component
// ============================================================================

export default function DLOutageScenario({ onExit }) {
  const [stage, setStage] = useState(1);
  const [selectedOption, setSelectedOption] = useState(null);
  const [optionResult, setOptionResult] = useState(null);
  const [admsChecks, setAdmsChecks] = useState({ voltage: false, mtr: false, protection: false });
  const [switchingStep, setSwitchingStep] = useState(0);
  const [switchingErrors, setSwitchingErrors] = useState([]);
  const [pendingClick, setPendingClick] = useState(null); // for incorrect-order toast
  // 복습 모드 — 완료한 항목을 다시 SLD에서 보기 위한 상태. null이면 평소 진행 모드.
  //   reviewStep: 1..N (N=완료된 step 개수)을 가지며 그 시점의 SLD 상태를 표시
  //   reviewCheck: 'voltage' | 'mtr' | 'protection' — 그 검토에 해당 포커스를 SLD에 띄움
  const [reviewStep, setReviewStep] = useState(null);
  const [reviewCheck, setReviewCheck] = useState(null);

  const allAdmsOk = admsChecks.voltage && admsChecks.mtr && admsChecks.protection;
  const switchingDone = switchingStep >= SWITCHING_SEQUENCE.length;

  const restart = () => {
    setStage(1);
    setSelectedOption(null);
    setOptionResult(null);
    setAdmsChecks({ voltage: false, mtr: false, protection: false });
    setSwitchingStep(0);
    setSwitchingErrors([]);
    setReviewStep(null);
    setReviewCheck(null);
  };

  // Stage 전환 시 복습 모드 자동 종료 — 다른 단계의 SLD 상태가 새는 걸 방지.
  useEffect(() => {
    setReviewStep(null);
    setReviewCheck(null);
  }, [stage]);

  return (
    <div style={{
      width: '100%', height: '100%', background: palette.bg, color: palette.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <Header onExit={onExit} onRestart={restart} stage={stage} setStage={setStage} />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0, minHeight: 0 }}>
        <SLDPanel
          stage={stage}
          selectedOption={selectedOption}
          optionResult={optionResult}
          switchingStep={switchingStep}
          admsChecks={admsChecks}
          reviewStep={reviewStep}
          reviewCheck={reviewCheck}
        />
        <SidePanel
          stage={stage} setStage={setStage}
          admsChecks={admsChecks} setAdmsChecks={setAdmsChecks}
          allAdmsOk={allAdmsOk}
          selectedOption={selectedOption} setSelectedOption={setSelectedOption}
          optionResult={optionResult} setOptionResult={setOptionResult}
          switchingStep={switchingStep} setSwitchingStep={setSwitchingStep}
          switchingErrors={switchingErrors} setSwitchingErrors={setSwitchingErrors}
          switchingDone={switchingDone}
          restart={restart}
          reviewStep={reviewStep} setReviewStep={setReviewStep}
          reviewCheck={reviewCheck} setReviewCheck={setReviewCheck}
        />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Header / progress
// ----------------------------------------------------------------------------
function Header({ onExit, onRestart, stage, setStage }) {
  const stages = ['1·데이터 수집', '2·시스템 검토', '3·시나리오', '4·스위칭'];
  return (
    <div style={{
      background: 'rgba(8, 12, 28, 0.96)',
      borderBottom: `1px solid ${palette.accentDim}`,
      padding: '12px 20px',
      display: 'flex', alignItems: 'center', gap: 20,
    }}>
      <button onClick={onExit} style={btnStyle('ghost')}>← 모듈 목록</button>
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        🔄 D/L 휴전작업 부하절체 · <span style={{ color: palette.accent }}>A 변전소 · 1호 D/L 휴전</span>
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 6 }}>
        {stages.map((s, i) => {
          const idx = i + 1;
          const active = idx === stage;
          const done = idx < stage;
          // 클릭 가능한 칩 — 이전(완료) 단계로만 점프 허용. 앞 단계는 Continue로 prereq 검사 거치게.
          const canJump = idx < stage;
          return (
            <button key={i}
              onClick={() => canJump && setStage(idx)}
              disabled={!canJump}
              title={canJump ? '이 단계로 돌아가기' : active ? '현재 단계' : '아직 진행하지 않은 단계'}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                background: active ? palette.accent : done ? 'rgba(57,255,166,0.16)' : 'rgba(255,255,255,0.04)',
                color: active ? '#062028' : done ? palette.positive : palette.textDim,
                border: `1px solid ${active ? palette.accent : done ? palette.positive : palette.accentDim}`,
                letterSpacing: 0.5,
                cursor: canJump ? 'pointer' : 'default',
                fontFamily: 'inherit',
                transition: 'transform 0.1s',
              }}
              onMouseEnter={(e) => { if (canJump) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
            >
              {s}
            </button>
          );
        })}
      </div>
      <button onClick={onRestart} style={btnStyle('ghost')}>↻ 다시 시작</button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// SLD (Single-Line Diagram) — 메인 좌측 패널. SVG로 단선결선도를 표현.
//   · 단계에 따라 관련 없는 요소를 디밍하고, 학습 타겟에 헤일로·콜아웃을 표시.
//   · `focus` 객체는 어떤 키들이 강조 대상인지 + 콜아웃 정보를 담음.
// ----------------------------------------------------------------------------

// 단계·상태로부터 포커스 대상 계산. 키들은 SLD 요소와 1:1 매핑.
// reviewStep / reviewCheck 가 지정되면 "복습 모드" — 평소 진행 흐름 대신
// 사용자가 지정한 과거 시점/검토를 다시 강조 표시.
function computeFocus(stage, admsChecks, selectedOption, switchingStep, reviewStep, reviewCheck) {
  if (stage === 1) {
    return {
      feederA: true,
      callout: { x: 200, y: 248, text: '🎯 휴전 대상 · 1호 D/L', anchor: 'top' },
    };
  }
  if (stage === 2) {
    // 복습 모드 — 완료된 검토를 다시 강조 표시 (회전 무시).
    const target = reviewCheck
      ?? (!admsChecks.voltage ? 'voltage'
        : !admsChecks.mtr ? 'mtr'
        : !admsChecks.protection ? 'protection' : 'done');
    const tag = reviewCheck ? '🔍 복습: ' : '';
    if (target === 'voltage') {
      return {
        feederA: true, feederB: true, feederC: true,
        callout: { x: 380, y: 498, text: `${tag}① 말단 전압 강하 검토 — 각 D/L 부하점 확인`, anchor: 'bottom' },
      };
    }
    if (target === 'mtr') {
      return {
        mtr1: true,
        callout: { x: 380, y: 78, text: `${tag}② 주변압기 1·2 공급 여유 용량 확인`, anchor: 'bottom' },
      };
    }
    if (target === 'protection') {
      return {
        cbs: true,
        callout: { x: 380, y: 215, text: `${tag}③ 보호계전기 정정치 (각 D/L CB)`, anchor: 'top' },
      };
    }
    return { all: true };
  }
  if (stage === 3) {
    if (!selectedOption) {
      return {
        feederA: true, tieAB: true, tieAC: true,
        callout: { x: 380, y: 440, text: '시나리오에 따라 부하 이동 경로 결정', anchor: 'top' },
      };
    }
    if (selectedOption.id === 'all-to-B') {
      return { tieAB: true, feederB: true, callout: { x: 290, y: 446, text: '경로: 1호 → 1↔2 연계 → 2호', anchor: 'top' } };
    }
    if (selectedOption.id === 'all-to-C') {
      return { tieAC: true, feederC: true, callout: { x: 410, y: 478, text: '경로: 1호 → 1↔3 연계 → 3호 (다른 주변압기)', anchor: 'top' } };
    }
    if (selectedOption.id === 'split') {
      return { tieAB: true, tieAC: true, feederB: true, feederC: true,
               callout: { x: 380, y: 446, text: '경로: 앞쪽 → 2호 / 뒤쪽 → 3호 (분할)', anchor: 'top' } };
    }
    return { all: true };
  }
  if (stage === 4) {
    // 평소엔 switchingStep(다음에 할 step)을 가리키지만 복습 중이면 reviewStep을
    // "방금 다시 보고 있는 step의 다음 인덱스(=완료 개수)"로 해석하므로 -1 보정.
    const reviewing = reviewStep != null;
    const focusIdx = reviewing ? reviewStep - 1 : switchingStep;
    if (focusIdx < 0 || focusIdx >= SWITCHING_SEQUENCE.length) {
      return { all: true, callout: { x: 380, y: 60, text: '✓ 1호 D/L 휴전 완료 — 작업 가능 상태', anchor: 'bottom' } };
    }
    const step = SWITCHING_SEQUENCE[focusIdx];
    const tag = reviewing ? '🔍 복습: ' : '';
    if (step.id === 'pre')    return { feederA: true, feederB: true, callout: { x: 290, y: 218, text: `${tag}동기 검정 — 1호·2호 전압/위상`, anchor: 'top' } };
    if (step.id === 'tieAB')  return { tieAB: true, callout: { x: 290, y: 446, text: `${tag}1↔2 연계개폐기 투입`, anchor: 'top' } };
    if (step.id === 'aFront') return { feederA: true, aFront: true, callout: { x: 200, y: 352, text: `${tag}앞쪽 구간 개폐기 개방`, anchor: 'top' } };
    if (step.id === 'tieAC')  return { tieAC: true, callout: { x: 410, y: 478, text: `${tag}1↔3 연계개폐기 투입`, anchor: 'top' } };
    if (step.id === 'aBack')  return { feederA: true, aBack: true, callout: { x: 200, y: 432, text: `${tag}뒤쪽 구간 개폐기 개방`, anchor: 'top' } };
    if (step.id === 'aCb')    return { feederA: true, aCB: true, callout: { x: 200, y: 222, text: `${tag}인출 CB 개방`, anchor: 'top' } };
    if (step.id === 'final')  return { feederA: true, callout: { x: 200, y: 408, text: `${tag}검전 + 작업용 접지`, anchor: 'top' } };
    return { all: true };
  }
  return { all: true };
}

function SLDPanel({ stage, selectedOption, optionResult, switchingStep, admsChecks, reviewStep, reviewCheck }) {
  const { feeders } = SCENARIO;

  // 시각적 부하 표시는 현재 진행 단계에 따라 다르게:
  //   stage 1~3: 정상 운전 + A는 휴전 예정 강조
  //   stage 4 진행 중: SWITCHING_SEQUENCE 단계에 따라 부하 이동
  //   stage 4 복습 중: reviewStep까지의 상태로 일시적으로 되돌림
  //   stage 4 완료: 분할 절체 완료 모습
  const a = feeders.A;
  const b = feeders.B;
  const c = feeders.C;
  // 복습 모드: reviewStep == "이 시점까지 완료된 개수" 로 SLD 상태 재현
  const effectiveStep = reviewStep != null ? reviewStep : switchingStep;
  let aActive = true, bLoad = b.baseLoad, cLoad = c.baseLoad;
  let tieAB = false, tieAC = false;
  let aFrontOpen = false, aBackOpen = false, aCbOpen = false;
  let groundOn = false;
  if (stage === 4) {
    if (effectiveStep >= 2) tieAB = true;
    if (effectiveStep >= 3) { bLoad += a.frontLoad; aFrontOpen = true; }
    if (effectiveStep >= 4) tieAC = true;
    if (effectiveStep >= 5) { cLoad += a.backLoad; aBackOpen = true; }
    if (effectiveStep >= 6) { aCbOpen = true; aActive = false; }
    if (effectiveStep >= 7) groundOn = true;
  } else if (stage > 4) {
    bLoad += a.frontLoad; cLoad += a.backLoad;
    aActive = false; tieAB = true; tieAC = true;
    aFrontOpen = true; aBackOpen = true; aCbOpen = true; groundOn = true;
  }

  const focus = useMemo(
    () => computeFocus(stage, admsChecks || {}, selectedOption, switchingStep, reviewStep, reviewCheck),
    [stage, admsChecks?.voltage, admsChecks?.mtr, admsChecks?.protection, selectedOption?.id, switchingStep, reviewStep, reviewCheck],
  );
  const isFocused = (key) => !!(focus.all || focus[key]);
  // Dim opacity used when an element is NOT in the focus set. When focus.all
  // is true (or focus is empty/unset), nothing is dimmed.
  const dimOpacity = (focus.all || !Object.keys(focus).some((k) => k !== 'callout')) ? 1 : 0.28;

  return (
    <div style={{
      background: palette.bg, padding: 24, minHeight: 0, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontSize: 11, letterSpacing: 2, color: palette.textDim, marginBottom: 4 }}>
        배전운영시스템 · 단선결선도 (SLD)
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
        {SCENARIO.substation.name}
      </div>

      <svg viewBox="0 0 760 540" style={{ flex: 1, width: '100%', height: '100%', maxHeight: 'calc(100vh - 180px)' }}>
        {/* === 154 kV 모선 (항상 dim 대상 가능) === */}
        <FocusGroup focused={isFocused('busbar') || focus.all} dim={dimOpacity}>
          <rect x="280" y="40" width="200" height="14" fill={palette.busbar} />
          <text x="380" y="32" textAnchor="middle" fill={palette.textDim} fontSize="11">154 kV 모선</text>
        </FocusGroup>

        {/* === 주변압기 1 === */}
        <FocusGroup focused={isFocused('mtr1')} dim={dimOpacity}>
          <line x1="380" y1="54" x2="380" y2="84" stroke={palette.busbar} strokeWidth="2" />
          <MTrSymbol cx={380} cy={108} name={SCENARIO.substation.mtrName} capacity={SCENARIO.substation.mtrCapacity} load={bLoad + (aActive ? a.baseLoad : 0)} />
          <line x1="380" y1="148" x2="380" y2="178" stroke={palette.busbar} strokeWidth="2" />
        </FocusGroup>

        {/* === 22.9 kV 모선 === */}
        <FocusGroup focused={isFocused('busbar') || focus.all} dim={dimOpacity}>
          <rect x="120" y="178" width="520" height="12" fill={palette.busbar} />
          <text x="120" y="172" fill={palette.textDim} fontSize="10">22.9 kV 모선 · 주변압기 1</text>
        </FocusGroup>

        {/* === Feeder A (1호) === */}
        <FocusGroup focused={isFocused('feederA') || isFocused('cbs')} dim={dimOpacity}>
          <Feeder x={200} feeder={a}
            active={aActive} cbOpen={aCbOpen}
            frontOpen={aFrontOpen} backOpen={aBackOpen}
            groundOn={groundOn}
            highlight={stage <= 3} />
        </FocusGroup>

        {/* === Feeder B (2호) === */}
        <FocusGroup focused={isFocused('feederB') || isFocused('cbs')} dim={dimOpacity}>
          <Feeder x={380} feeder={{ ...b, currentLoad: bLoad }} />
        </FocusGroup>

        {/* === Tie 1↔2 === */}
        <FocusGroup focused={isFocused('tieAB')} dim={dimOpacity}>
          <TieSwitch x1={245} x2={335} y={460} open={!tieAB} label="1↔2 연계" />
        </FocusGroup>

        {/* === Feeder C (3호) === */}
        <FocusGroup focused={isFocused('feederC') || isFocused('cbs')} dim={dimOpacity}>
          <Feeder x={620} feeder={{ ...c, currentLoad: cLoad }} mtrLabel="주변압기 2" />
        </FocusGroup>

        {/* === Tie 1↔3 === */}
        <FocusGroup focused={isFocused('tieAC')} dim={dimOpacity}>
          <TieSwitch x1={245} x2={575} y={500} open={!tieAC} label="1↔3 연계" curved />
        </FocusGroup>

        {/* === Halos (focus highlights) === */}
        {isFocused('feederA') && <Halo cx={200} cy={400} r={70} />}
        {isFocused('feederB') && <Halo cx={380} cy={385} r={70} />}
        {isFocused('feederC') && <Halo cx={620} cy={385} r={70} />}
        {isFocused('mtr1')    && <Halo cx={380} cy={108} r={42} />}
        {isFocused('tieAB')   && <Halo cx={290} cy={460} r={26} />}
        {isFocused('tieAC')   && <Halo cx={410} cy={518} r={26} />}
        {isFocused('aCB')     && <Halo cx={200} cy={235} r={20} color={palette.warn} />}
        {isFocused('aFront')  && <Halo cx={200} cy={365} r={20} color={palette.warn} />}
        {isFocused('aBack')   && <Halo cx={200} cy={445} r={20} color={palette.warn} />}

        {/* === Callout (focused-target label) === */}
        {focus.callout && (
          <Callout
            x={focus.callout.x}
            y={focus.callout.y}
            text={focus.callout.text}
            anchor={focus.callout.anchor}
          />
        )}

        {/* === Decision overlay (stage 3) === */}
        {stage === 3 && optionResult && (
          <ResultOverlay result={optionResult} option={selectedOption} />
        )}

        {/* === Stage 4 active step caption === */}
        {stage === 4 && switchingStep > 0 && switchingStep <= SWITCHING_SEQUENCE.length && (
          <text x="380" y="520" textAnchor="middle" fill={palette.accent} fontSize="13" fontWeight="700">
            {SWITCHING_SEQUENCE[switchingStep - 1].icon} STEP {switchingStep}/{SWITCHING_SEQUENCE.length} · {SWITCHING_SEQUENCE[switchingStep - 1].label}
          </text>
        )}
      </svg>
    </div>
  );
}

// Wrap an SVG group so it can be dimmed when not the current focus. We use a
// CSS transition on opacity so the dim/highlight feels guided rather than
// abrupt.
function FocusGroup({ focused, dim, children }) {
  return (
    <g
      opacity={focused ? 1 : dim}
      style={{ transition: 'opacity 0.4s ease' }}
    >
      {children}
    </g>
  );
}

// Pulsing focus ring. SVG `<animate>` keeps everything off the React render
// path — no useFrame loop, the browser handles the animation directly.
function Halo({ cx, cy, r = 30, color = palette.accent }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="2" opacity="0.75">
        <animate attributeName="r" values={`${r - 4};${r + 7};${r - 4}`} dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.85;0.15;0.85" dur="1.8s" repeatCount="indefinite" />
      </circle>
      {/* second inner ring for layered glow */}
      <circle cx={cx} cy={cy} r={r * 0.6} fill={color} opacity="0.04">
        <animate attributeName="opacity" values="0.10;0.02;0.10" dur="1.8s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

// Callout — a small chip with a triangular tail pointing at the focused
// element. `anchor='top'` means the chip is above the target with tail
// pointing down; `'bottom'` is the inverse.
function Callout({ x, y, text, anchor = 'top', color = palette.accent }) {
  const offset = anchor === 'top' ? -28 : 28;
  const labelY = y + offset;
  const padX = 8;
  const charW = 7.2;
  const w = Math.max(40, text.length * charW + padX * 2);
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={x - w / 2} y={labelY - 12} width={w} height="22" rx="4"
            fill="rgba(8,12,28,0.94)" stroke={color} strokeWidth="1.2" />
      <text x={x} y={labelY + 4} textAnchor="middle"
            fill={color} fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">
        {text}
      </text>
      {/* Tail */}
      {anchor === 'top' ? (
        <path d={`M ${x - 5} ${labelY + 10} L ${x + 5} ${labelY + 10} L ${x} ${labelY + 18} Z`} fill={color} />
      ) : (
        <path d={`M ${x - 5} ${labelY - 10} L ${x + 5} ${labelY - 10} L ${x} ${labelY - 18} Z`} fill={color} />
      )}
    </g>
  );
}

function MTrSymbol({ cx, cy, name, capacity, load }) {
  const overload = load > capacity * 0.95;
  return (
    <g>
      <circle cx={cx - 8} cy={cy} r="18" fill="none" stroke={overload ? palette.danger : palette.busbar} strokeWidth="2" />
      <circle cx={cx + 8} cy={cy} r="18" fill="none" stroke={overload ? palette.danger : palette.busbar} strokeWidth="2" />
      <text x={cx + 38} y={cy - 6} fill={palette.text} fontSize="11" fontWeight="600">{name}</text>
      <text x={cx + 38} y={cy + 8} fill={palette.textDim} fontSize="10">{load.toFixed(1)} / {capacity} MVA</text>
    </g>
  );
}

function Feeder({ x, feeder, active = true, cbOpen = false, frontOpen = false, backOpen = false, groundOn = false, highlight = false, mtrLabel }) {
  const load = feeder.currentLoad ?? feeder.baseLoad;
  const ratio = clamp(load / feeder.conductorLimit, 0, 1.1);
  const overload = ratio > 0.95;
  const color = !active ? palette.muted : overload ? palette.danger : feeder.color;
  const dim = !active ? 0.45 : 1;

  return (
    <g opacity={dim}>
      {/* drop from busbar */}
      <line x1={x} y1={190} x2={x} y2={220} stroke={palette.busbar} strokeWidth="2" />
      {/* CB at substation */}
      <Breaker x={x} y={235} open={cbOpen} />
      <line x1={x} y1={250} x2={x} y2={285} stroke={color} strokeWidth={highlight && feeder.outage ? 3 : 2}
            strokeDasharray={cbOpen ? '5 4' : '0'} />
      {/* Front section */}
      <line x1={x} y1={285} x2={x} y2={345} stroke={color} strokeWidth={highlight && feeder.outage ? 3 : 2}
            strokeDasharray={cbOpen ? '5 4' : '0'} />
      {/* Sectionalizer (front) — only meaningful for outage feeder */}
      {feeder.outage && (
        <Disconnector x={x} y={365} open={frontOpen} />
      )}
      {/* Back section */}
      <line x1={x} y1={feeder.outage ? 380 : 345} x2={x} y2={430} stroke={color} strokeWidth={highlight && feeder.outage ? 3 : 2}
            strokeDasharray={(cbOpen || frontOpen) ? '5 4' : '0'} />
      {feeder.outage && (
        <Disconnector x={x} y={445} open={backOpen} />
      )}
      {/* Load — community block */}
      <g transform={`translate(${x}, ${feeder.outage ? 460 : 430})`}>
        <rect x="-22" y="0" width="44" height="20" rx="3"
              fill="none" stroke={color} strokeWidth="1.5"
              strokeDasharray={!active ? '4 3' : '0'} />
        <text x="0" y="13" textAnchor="middle" fill={color} fontSize="9" fontWeight="700">
          {load.toFixed(1)} MVA
        </text>
      </g>

      {/* Feeder label */}
      <text x={x} y={210} textAnchor="middle" fill={color} fontSize="11" fontWeight="700">
        {feeder.name}
      </text>
      {feeder.outage && (
        <text x={x} y={278} textAnchor="middle" fill={palette.warn} fontSize="9" fontWeight="600">
          ⚠ 휴전 대상
        </text>
      )}
      {mtrLabel && (
        <text x={x} y={500} textAnchor="middle" fill={palette.textDim} fontSize="9">
          ({mtrLabel})
        </text>
      )}
      {groundOn && feeder.outage && (
        <g>
          {/* 작업용 접지 심볼 */}
          <line x1={x - 10} y1={415} x2={x + 10} y2={415} stroke={palette.positive} strokeWidth="2" />
          <line x1={x - 7}  y1={420} x2={x + 7}  y2={420} stroke={palette.positive} strokeWidth="2" />
          <line x1={x - 4}  y1={425} x2={x + 4}  y2={425} stroke={palette.positive} strokeWidth="2" />
          <text x={x + 16} y={422} fill={palette.positive} fontSize="9" fontWeight="700">접지</text>
        </g>
      )}
    </g>
  );
}

function Breaker({ x, y, open }) {
  return (
    <g>
      <rect x={x - 9} y={y - 9} width="18" height="18"
            fill={open ? 'transparent' : palette.bg}
            stroke={open ? palette.warn : palette.positive} strokeWidth="2" />
      <text x={x + 16} y={y - 4} fill={palette.textDim} fontSize="9">CB</text>
      <text x={x + 16} y={y + 7} fill={open ? palette.warn : palette.positive} fontSize="8">
        {open ? 'OPEN' : 'CLOSE'}
      </text>
    </g>
  );
}

function Disconnector({ x, y, open }) {
  return (
    <g>
      {open ? (
        <>
          <line x1={x} y1={y - 6} x2={x - 7} y2={y + 6} stroke={palette.warn} strokeWidth="2.5" />
          <circle cx={x} cy={y - 6} r="2" fill={palette.warn} />
          <circle cx={x} cy={y + 6} r="2" fill={palette.warn} />
        </>
      ) : (
        <>
          <line x1={x} y1={y - 6} x2={x} y2={y + 6} stroke={palette.positive} strokeWidth="2.5" />
          <circle cx={x} cy={y - 6} r="2" fill={palette.positive} />
          <circle cx={x} cy={y + 6} r="2" fill={palette.positive} />
        </>
      )}
      <text x={x + 12} y={y + 3} fill={palette.textDim} fontSize="8">DS</text>
    </g>
  );
}

function TieSwitch({ x1, x2, y, open, label, curved = false }) {
  const mid = (x1 + x2) / 2;
  const path = curved
    ? `M ${x1} ${y} Q ${mid} ${y + 35}, ${x2} ${y}`
    : `M ${x1} ${y} L ${x2} ${y}`;
  return (
    <g>
      <path d={path} fill="none"
            stroke={open ? palette.muted : palette.positive}
            strokeWidth="2"
            strokeDasharray={open ? '6 4' : '0'} />
      {/* switch indicator at midpoint */}
      <circle cx={mid} cy={curved ? y + 18 : y} r="6"
              fill={open ? 'transparent' : palette.positive}
              stroke={open ? palette.warn : palette.positive} strokeWidth="2" />
      <text x={mid} y={curved ? y + 38 : y - 10}
            textAnchor="middle" fill={palette.textDim} fontSize="9">
        {label} {open ? '(개방)' : '(투입)'}
      </text>
    </g>
  );
}

function ResultOverlay({ result, option }) {
  const color = result.result === 'pass' ? palette.positive
              : result.result === 'warn' ? palette.warn : palette.danger;
  return (
    <g>
      <rect x="80" y="60" width="600" height="60" rx="8"
            fill="rgba(8,12,28,0.96)" stroke={color} strokeWidth="2" />
      <text x="100" y="86" fill={color} fontSize="14" fontWeight="700">
        {result.result === 'pass' ? '✓ 통과' : result.result === 'warn' ? '⚠ 경고 (조건부)' : '✗ 실패'}
        {' · '}
        {option?.label}
      </text>
      <text x="100" y="105" fill={palette.textDim} fontSize="10">
        결과는 우측 패널에 상세 표시. 분할 절체가 가장 안전한 정답.
      </text>
    </g>
  );
}

// ----------------------------------------------------------------------------
// Side panel — stage-by-stage interactive content
// ----------------------------------------------------------------------------
function SidePanel(props) {
  const { stage } = props;
  return (
    <div style={{
      background: palette.panel, borderLeft: `1px solid ${palette.accentDim}`,
      padding: 20, overflow: 'auto',
    }}>
      {stage === 1 && <Stage1 {...props} />}
      {stage === 2 && <Stage2 {...props} />}
      {stage === 3 && <Stage3 {...props} />}
      {stage === 4 && <Stage4 {...props} />}
      {stage === 5 && <Stage5 {...props} />}
    </div>
  );
}

function Stage1({ setStage }) {
  const a = SCENARIO.feeders.A, b = SCENARIO.feeders.B, c = SCENARIO.feeders.C;
  const marginB = b.conductorLimit - b.peakLoad;
  const marginC = c.conductorLimit - c.peakLoad;
  return (
    <>
      <StageTitle n={1} title="데이터 수집" lede="휴전선로 부하와 연계선로 여유 용량을 확인합니다." />

      <SectionCard title="① 휴전 대상 — 1호 D/L">
        <Row label="현재 부하" value={`${a.baseLoad} MVA`} />
        <Row label="작업 시간대 예상 최대" value={`${a.peakLoad} MVA`} accent />
        <Row label="선로 길이" value={`${a.lengthKm} km`} />
        <Row label="작업 사유" value="노후 전선 교체" />
      </SectionCard>

      <SectionCard title="② 연계선로 여유 용량 (Pmargin = Plimit − Pcurrent)">
        <FeederBar feeder={b} margin={marginB} />
        <FeederBar feeder={c} margin={marginC} />
        <div style={{ marginTop: 10, fontSize: 11, color: palette.textDim, lineHeight: 1.6 }}>
          B는 같은 주변압기 1 소속, C는 다른 변압기(주변압기 2) 소속이라 부하 전이 시 변압기 용량 검토가 추가로 필요합니다.
        </div>
      </SectionCard>

      <LearnBox>
        <b>Why?</b> 절체 후 인접 선로가 도체 허용 전류를 넘으면 전선이 과열돼 사고로 이어집니다.
        일반적인 운영 기준상 D/L 1회선당 약 10 MVA 한도 (전선 굵기에 따라 다름).
        단순 "넘기면 된다"가 아니라 시간대별 최대 부하로 검토해야 안전합니다.
      </LearnBox>

      <NavRow stage={1} setStage={setStage}
        nextOnClick={() => setStage(2)} nextLabel="시스템 검토 →" />
    </>
  );
}

function Stage2({ setStage, admsChecks, setAdmsChecks, allAdmsOk, reviewCheck, setReviewCheck }) {
  const toggle = (k) => setAdmsChecks((p) => ({ ...p, [k]: true }));
  const toggleReview = (k) => setReviewCheck(reviewCheck === k ? null : k);
  return (
    <>
      <StageTitle n={2} title="시스템 검토 (상태 추정 시뮬)" lede="단순 용량 비교를 넘어 계통공학적 검토를 자동 시뮬레이션합니다. 완료한 검토는 다시 눌러 SLD에서 복습할 수 있습니다." />

      {reviewCheck && (
        <div style={{
          marginBottom: 12, padding: '10px 12px',
          background: 'rgba(123,230,255,0.08)',
          border: `1px solid ${palette.accent}`,
          borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
        }}>
          <span style={{ color: palette.accent, fontWeight: 700 }}>
            🔍 복습 모드 · {reviewCheck === 'voltage' ? '말단 전압강하'
                          : reviewCheck === 'mtr' ? '주변압기 용량' : '보호계전기 협조'}
          </span>
          <button onClick={() => setReviewCheck(null)}
            style={{
              marginLeft: 'auto', padding: '4px 10px',
              background: palette.accent, color: '#062028',
              border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
            평소 표시로 복귀 →
          </button>
        </div>
      )}

      <CheckCard
        title="① 말단 전압강하 + 3상 불평형"
        ckey="voltage"
        done={admsChecks.voltage}
        onRun={() => toggle('voltage')}
        runLabel="전압 시뮬 실행"
        reviewing={reviewCheck === 'voltage'}
        onReview={() => toggleReview('voltage')}
        result={{
          ok: true,
          lines: [
            '✓ 분할 절체 시 2호 말단 0.972 pu, 3호 말단 0.961 pu',
            '⚠ 1호 전체→3호 단독 절체 시 0.943 pu — 한계',
            '✓ 3상 불평형률 모든 시나리오에서 < 5%',
          ],
        }}
        why="부하가 옮겨가면 선로 임피던스가 더해져 말단 전압이 낮아집니다. 일반적으로 0.95 pu 이상 유지가 원칙."
      />

      <CheckCard
        title="② 상위 주변압기 공급 여유 용량"
        ckey="mtr"
        done={admsChecks.mtr}
        onRun={() => toggle('mtr')}
        runLabel="변압기 부하 모의"
        reviewing={reviewCheck === 'mtr'}
        onReview={() => toggleReview('mtr')}
        result={{
          ok: true,
          lines: [
            '✓ 주변압기 1 (60 MVA): 현재 부하 ≈ 35 MVA',
            '⚠ 주변압기 2 (60 MVA): 현재 48 MVA — 여유 12 MVA',
            '❌ 1호 전체→3호 단독 절체 시 주변압기 2 부하 52 MVA, 록 위험',
          ],
        }}
        why="D/L 한도만 보고 절체하면 상위 변압기가 과부하 록(Lock)에 걸려 광역 정전이 발생합니다."
      />

      <CheckCard
        title="③ 보호계전기 협조 (Recloser · CB)"
        ckey="protection"
        done={admsChecks.protection}
        onRun={() => toggle('protection')}
        runLabel="정정치 검토"
        reviewing={reviewCheck === 'protection'}
        onReview={() => toggleReview('protection')}
        result={{
          ok: true,
          lines: [
            '✓ 2호 Recloser pickup 600 A — 분할 시 최대 전류 412 A',
            '✓ 3호 Recloser pickup 600 A — 분할 시 최대 전류 380 A',
            '⚠ 단독 절체 시 2호 전류 575 A — 마진 25 A로 부족',
          ],
        }}
        why="부하가 늘면 정상 전류 자체가 보호기 정정치에 근접해 사고가 아닌데도 트립할 수 있습니다."
      />

      <NavRow stage={2} setStage={setStage}
        nextOnClick={() => setStage(3)} nextDisabled={!allAdmsOk}
        nextLabel="시나리오 선택 →" />
    </>
  );
}

function Stage3({ setStage, selectedOption, setSelectedOption, optionResult, setOptionResult }) {
  const choose = (opt) => {
    setSelectedOption(opt);
    setOptionResult(opt.evaluate(SCENARIO));
  };
  return (
    <>
      <StageTitle n={3} title="시나리오 선택" lede="시스템 검토 결과를 바탕으로 절체 전략을 결정합니다." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {OPTIONS.map((opt) => {
          const isActive = selectedOption?.id === opt.id;
          return (
            <button key={opt.id} onClick={() => choose(opt)}
              style={{
                textAlign: 'left', padding: '12px 14px',
                background: isActive ? 'rgba(123,230,255,0.10)' : palette.panelSub,
                border: `1.5px solid ${isActive ? palette.accent : palette.accentDim}`,
                borderRadius: 8, color: palette.text, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</span>
                {opt.recommended && (
                  <span style={{ fontSize: 9, color: palette.positive, border: `1px solid ${palette.positive}`, borderRadius: 4, padding: '1px 6px' }}>
                    권장
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: palette.textDim, lineHeight: 1.55 }}>{opt.summary}</div>
            </button>
          );
        })}
      </div>

      {optionResult && (
        <div style={{ marginTop: 16, padding: 12,
                      background: 'rgba(8,12,28,0.6)', borderRadius: 8,
                      border: `1px solid ${
                        optionResult.result === 'pass' ? palette.positive
                          : optionResult.result === 'warn' ? palette.warn : palette.danger}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8,
                        color: optionResult.result === 'pass' ? palette.positive
                          : optionResult.result === 'warn' ? palette.warn : palette.danger }}>
            검토 결과 · {optionResult.result === 'pass' ? '통과' : optionResult.result === 'warn' ? '경고' : '실패'}
          </div>
          {optionResult.notes.map((n, i) => (
            <div key={i} style={{ fontSize: 11, color: palette.textDim, lineHeight: 1.7 }}>{n}</div>
          ))}
        </div>
      )}

      <NavRow stage={3} setStage={setStage}
        nextOnClick={() => setStage(4)}
        nextDisabled={!optionResult || optionResult.result === 'fail'}
        nextLabel={optionResult?.result === 'fail' ? '실패 — 다른 시나리오 선택' : '스위칭 시퀀스 →'} />
    </>
  );
}

function Stage4({ setStage, switchingStep, setSwitchingStep, switchingErrors, setSwitchingErrors, switchingDone, reviewStep, setReviewStep }) {
  const inReview = reviewStep != null;
  // 완료된 step 클릭 = 복습 토글 / 다음 step 클릭 = 진행 / 그 외 = 오류 기록.
  const onStepClick = (i, status) => {
    if (status === 'done') {
      // 같은 step 다시 누르면 복습 종료, 다른 step 누르면 그 시점으로 이동.
      setReviewStep(reviewStep === i + 1 ? null : i + 1);
      return;
    }
    // 진행 중 클릭 — 복습 모드면 우선 해제.
    if (inReview) {
      setReviewStep(null);
      return;
    }
    if (i === switchingStep) {
      setSwitchingStep(i + 1);
    } else {
      setSwitchingErrors((prev) => [...prev, { idx: i, expected: switchingStep, when: Date.now() }]);
    }
  };

  return (
    <>
      <StageTitle n={4} title="스위칭 시퀀스" lede="순서대로 클릭. 완료한 단계는 다시 눌러서 그 시점의 SLD를 복습할 수 있습니다." />

      {inReview && (
        <div style={{
          marginBottom: 12, padding: '10px 12px',
          background: 'rgba(123,230,255,0.08)',
          border: `1px solid ${palette.accent}`,
          borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
        }}>
          <span style={{ color: palette.accent, fontWeight: 700 }}>
            🔍 복습 모드 · STEP {reviewStep}/{SWITCHING_SEQUENCE.length} 상태
          </span>
          <button onClick={() => setReviewStep(null)}
            style={{
              marginLeft: 'auto', padding: '4px 10px',
              background: palette.accent, color: '#062028',
              border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
            진행 위치로 복귀 →
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SWITCHING_SEQUENCE.map((step, i) => {
          const status = i < switchingStep ? 'done' : i === switchingStep ? 'next' : 'pending';
          const wasError = switchingErrors.some((e) => e.idx === i);
          const isReviewing = inReview && reviewStep === i + 1;
          // 복습 중인 step은 살짝 강조 (테두리/배경 톤 ↑)
          const borderColor = isReviewing ? palette.accent
            : status === 'done' ? palette.positive
            : status === 'next' ? palette.accent : palette.accentDim;
          const bg = isReviewing ? 'rgba(123,230,255,0.16)'
            : status === 'done' ? 'rgba(57,255,166,0.10)'
            : status === 'next' ? 'rgba(123,230,255,0.10)' : palette.panelSub;
          return (
            <button key={step.id}
              onClick={() => onStepClick(i, status)}
              title={status === 'done' ? '클릭하면 이 시점의 SLD를 복습' : status === 'next' ? '지금 실행할 단계' : '아직 차례가 아님'}
              style={{
                textAlign: 'left', padding: '10px 12px',
                background: bg,
                border: `1.5px solid ${borderColor}`,
                borderRadius: 8, color: palette.text,
                cursor: 'pointer',
                fontFamily: 'inherit', opacity: status === 'pending' ? 0.55 : 1,
                boxShadow: isReviewing ? `0 0 12px ${palette.accent}55` : 'none',
                transition: 'box-shadow 0.2s',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>{step.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  STEP {i + 1}. {step.label}
                </span>
                {isReviewing && <span style={{ marginLeft: 'auto', fontSize: 10, color: palette.accent }}>🔍 보는 중</span>}
                {!isReviewing && status === 'done' && <span style={{ marginLeft: 'auto', fontSize: 10, color: palette.positive }}>완료</span>}
                {!isReviewing && status === 'next' && <span style={{ marginLeft: 'auto', fontSize: 10, color: palette.accent }}>지금 클릭</span>}
              </div>
              <div style={{ fontSize: 10, color: palette.textDim, marginTop: 4, paddingLeft: 22, lineHeight: 1.5 }}>
                {step.tip}
              </div>
              {wasError && (
                <div style={{ fontSize: 10, color: palette.danger, marginTop: 4, paddingLeft: 22 }}>
                  ❌ 잘못된 순서 — 동기검정 실패 또는 부하 단절 위험
                </div>
              )}
            </button>
          );
        })}
      </div>

      {switchingErrors.length > 0 && (
        <LearnBox accent="warn">
          잘못된 순서로 클릭 시도가 <b>{switchingErrors.length}회</b> 있었습니다. 실무에서는 한 번의 오조작이
          파급 정전이나 아크 사고로 이어질 수 있어, 운영 매뉴얼의 표준 시퀀스를 엄격히 지킵니다.
        </LearnBox>
      )}

      <NavRow stage={4} setStage={setStage}
        nextOnClick={() => setStage(5)} nextDisabled={!switchingDone || inReview}
        nextLabel={inReview ? '복습 모드 — 진행 위치로 복귀 먼저' : '디브리프 →'} />
    </>
  );
}

function Stage5({ switchingErrors, restart, setStage }) {
  const perfect = switchingErrors.length === 0;
  return (
    <>
      <StageTitle n={5} title={perfect ? '🎉 디브리프 (Perfect)' : '디브리프'}
        lede={perfect ? '한 번도 틀리지 않고 표준 절차를 완수했습니다.' : '아래 학습 포인트를 복습하세요.'} />

      <SectionCard title="배운 것">
        <Bullet>휴전 전 데이터 수집 — Plimit·Pcurrent·Pmargin 의 의미</Bullet>
        <Bullet>시스템 검토 3종 — 전압강하 / 주변압기 용량 / 보호협조</Bullet>
        <Bullet>분할 절체가 단독 절체보다 안전한 이유 — 변압기 부담 분산</Bullet>
        <Bullet>표준 스위칭 시퀀스 — 동기 검정 → 병렬 → 분리 → 검전·접지</Bullet>
      </SectionCard>

      <SectionCard title="다음 단계 (실무 연계)">
        <Bullet>실제 배전운영시스템(DMS)의 휴전 모의 기능에서 동일 흐름을 조작해보세요.</Bullet>
        <Bullet>오늘 시뮬레이션의 수치(부하·주변압기 용량)는 단순화된 값입니다. 실무는 더 많은 제약조건을 동시에 만족해야 합니다.</Bullet>
        <Bullet>다음 모듈(예정): 보호계전기 협조 곡선 조정, 사고 시 자동복구 시퀀스.</Bullet>
      </SectionCard>

      <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
        <button onClick={() => setStage(4)}
          style={{
            padding: '12px 14px',
            background: 'transparent', color: palette.textDim,
            border: `1px solid ${palette.accentDim}`, borderRadius: 8,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
          ← 스위칭 다시 보기
        </button>
        <Continue onClick={restart}>↻ 처음부터 다시</Continue>
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Small reusable bits
// ----------------------------------------------------------------------------
function StageTitle({ n, title, lede }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, color: palette.textDim, marginBottom: 6 }}>
        STAGE {n}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: palette.textDim, lineHeight: 1.6 }}>{lede}</div>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div style={{
      background: palette.panelSub, borderRadius: 8, padding: 12,
      marginBottom: 14, border: `1px solid ${palette.accentDim}`,
    }}>
      <div style={{ fontSize: 11, color: palette.accent, letterSpacing: 1, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: palette.textDim }}>{label}</span>
      <span style={{ fontSize: 12, color: accent ? palette.accent : palette.text, fontFamily: 'monospace', fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

function FeederBar({ feeder, margin }) {
  const ratio = clamp(feeder.peakLoad / feeder.conductorLimit, 0, 1);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: palette.text, marginBottom: 4 }}>
        <span>{feeder.name}</span>
        <span style={{ color: palette.textDim, fontFamily: 'monospace' }}>
          {feeder.peakLoad} / {feeder.conductorLimit} MVA · 여유 {margin.toFixed(1)}
        </span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: `${ratio * 100}%`, height: '100%',
          background: feeder.color,
        }} />
      </div>
    </div>
  );
}

function CheckCard({ title, done, onRun, runLabel, result, why, reviewing, onReview }) {
  // Reviewing = this check is currently being re-highlighted on the SLD.
  // Visual: stronger border + small "보는 중" indicator.
  const borderColor = reviewing ? palette.accent
                    : done ? palette.positive : palette.accentDim;
  return (
    <div style={{
      background: reviewing ? 'rgba(123,230,255,0.07)' : palette.panelSub,
      borderRadius: 8, padding: 12, marginBottom: 12,
      border: `1px solid ${borderColor}`,
      boxShadow: reviewing ? `0 0 12px ${palette.accent}33` : 'none',
      transition: 'box-shadow 0.2s, border-color 0.2s, background 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: done ? palette.positive : palette.text }}>
          {done ? '✓' : '○'} {title}
        </span>
        {!done ? (
          <button onClick={onRun} style={btnStyle('accent')}>
            {runLabel}
          </button>
        ) : onReview ? (
          <button
            onClick={onReview}
            title={reviewing ? '평소 표시로 복귀' : '이 검토를 SLD에서 다시 강조'}
            style={{
              background: reviewing ? palette.accent : 'transparent',
              color: reviewing ? '#062028' : palette.accent,
              border: `1px solid ${palette.accent}`,
              padding: '4px 10px', borderRadius: 4,
              fontSize: 10, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
            {reviewing ? '🔍 보는 중' : '🔍 SLD에 다시'}
          </button>
        ) : null}
      </div>
      {done && result.lines.map((l, i) => (
        <div key={i} style={{ fontSize: 11, color: palette.textDim, lineHeight: 1.6 }}>{l}</div>
      ))}
      <div style={{ fontSize: 10, color: palette.muted, marginTop: 8, lineHeight: 1.6 }}>
        💡 {why}
      </div>
    </div>
  );
}

function LearnBox({ children, accent }) {
  const color = accent === 'warn' ? palette.warn : palette.accent;
  return (
    <div style={{
      marginTop: 12, marginBottom: 14, padding: 12,
      background: 'rgba(255,255,255,0.03)',
      border: `1px dashed ${color}`, borderRadius: 8,
      fontSize: 11, color: palette.textDim, lineHeight: 1.7,
    }}>
      {children}
    </div>
  );
}

function Bullet({ children }) {
  return (
    <div style={{ fontSize: 11, color: palette.text, lineHeight: 1.7, paddingLeft: 14, position: 'relative' }}>
      <span style={{ position: 'absolute', left: 0, color: palette.accent }}>•</span>
      {children}
    </div>
  );
}

function Continue({ onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        flex: 1, padding: '12px 16px',
        background: disabled ? 'rgba(123,230,255,0.10)' : palette.accent,
        color: disabled ? palette.muted : '#062028',
        border: 'none', borderRadius: 8,
        fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
      }}>
      {children}
    </button>
  );
}

// Navigation row used at the bottom of every stage. Always shows the
// learner where they can go (back to a previous stage is always allowed;
// forward is gated by the stage's own prerequisites).
function NavRow({ stage, setStage, nextOnClick, nextDisabled, nextLabel }) {
  return (
    <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
      {stage > 1 && (
        <button onClick={() => setStage(stage - 1)}
          style={{
            padding: '12px 14px',
            background: 'transparent', color: palette.textDim,
            border: `1px solid ${palette.accentDim}`, borderRadius: 8,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
          ← 이전 단계
        </button>
      )}
      {nextOnClick && (
        <Continue onClick={nextOnClick} disabled={nextDisabled}>{nextLabel}</Continue>
      )}
    </div>
  );
}

function btnStyle(kind) {
  if (kind === 'ghost') {
    return {
      background: 'transparent', color: palette.textDim,
      border: `1px solid ${palette.accentDim}`,
      padding: '6px 10px', borderRadius: 6,
      fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
    };
  }
  return {
    background: palette.accent, color: '#062028',
    border: 'none', padding: '6px 12px', borderRadius: 6,
    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  };
}
