import React, { useState } from 'react';
import DLOutageScenario from './DLOutageScenario';

// Catalog of educational modules. Each entry is one self-contained lesson
// (briefing → interactive simulation → debrief). Modules listed here as
// `coming: true` are shown in the index but disabled — they document the
// roadmap so a learner can see where they're heading before each new release.
const MODULES = [
  {
    id: 'system-overview',
    chapter: 1,
    title: '전력계통 개요',
    subtitle: '발전 → 송전 → 변전 → 배전 → 가정',
    duration: '약 8분',
    summary: '대전력계통의 전압 계급(345kV·154kV·22.9kV·220V)과 각 단계별 핵심 설비를 시각적으로 따라가며 익힙니다.',
    icon: '🔌',
    coming: true,
  },
  {
    id: 'substation-sld',
    chapter: 2,
    title: '변전소 단선결선도(SLD) 이해',
    subtitle: '주변압기 · 모선 · CB · DS · 보호계전기',
    duration: '약 12분',
    summary: '154/22.9 kV 변전소의 표준 결선도를 읽고, 각 기기의 역할과 표준 심볼을 학습합니다.',
    icon: '📐',
    coming: true,
  },
  {
    id: 'dl-outage',
    chapter: 3,
    title: 'D/L 휴전작업 부하절체',
    subtitle: '데이터 수집 → 시스템 검토 → 시나리오 → 스위칭',
    duration: '약 15분',
    summary: '1개 배전선로 휴전을 위해 인접 선로로 부하를 안전하게 넘기는 전 과정을 단계별로 시뮬레이션합니다. 잘못된 선택은 주변압기 과부하·말단 전압강하·보호계전기 오동작 같은 실제 사고 모드로 피드백됩니다.',
    icon: '🔄',
    coming: false,
    component: DLOutageScenario,
  },
  {
    id: 'protection-coord',
    chapter: 4,
    title: '보호계전기 협조',
    subtitle: 'Recloser ↔ CB ↔ Fuse 시간-전류 곡선',
    duration: '약 10분',
    summary: '구간별 보호기기의 동작 시간과 정정 전류를 조정해 사고 시 최소 정전 구간만 분리되도록 협조시킵니다.',
    icon: '🛡️',
    coming: true,
  },
  {
    id: 'blackout-restore',
    chapter: 5,
    title: '대규모 정전 복구 (Black Start)',
    subtitle: '자력기동 → 모선가압 → 부하 점진 투입',
    duration: '약 20분',
    summary: '광역 정전 후 자력기동 발전소부터 단계적으로 모선을 가압하고 부하를 점진 투입해 계통을 복구하는 절차를 학습합니다.',
    icon: '🌒',
    coming: true,
  },
];

// Inline styles only — no Tailwind to keep the visual identical across modes.
const palette = {
  bg: 'radial-gradient(circle at 30% 20%, #0c1430 0%, #050816 70%)',
  panel: 'rgba(14, 20, 42, 0.88)',
  accent: '#7be6ff',
  accentDim: '#3a5e7c',
  text: '#e6f7ff',
  textDim: '#94a8c8',
  positive: '#39ffa6',
  warn: '#ffc640',
  muted: '#4a5872',
};

export default function EducationMode() {
  const [activeId, setActiveId] = useState(null);
  const active = MODULES.find((m) => m.id === activeId);

  if (active && active.component) {
    const Cmp = active.component;
    return <Cmp onExit={() => setActiveId(null)} />;
  }

  return (
    <div
      style={{
        width: '100%', height: '100%',
        background: palette.bg,
        overflow: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: palette.text,
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 32px 96px' }}>
        <div style={{ marginBottom: 12, opacity: 0.6, fontSize: 12, letterSpacing: 2 }}>
          EDUCATION · 전력실무 교육 모드
        </div>
        <h1 style={{ fontSize: 36, margin: 0, fontWeight: 700, letterSpacing: -0.5 }}>
          전력계통 운영 시뮬레이터
        </h1>
        <p style={{ marginTop: 12, color: palette.textDim, fontSize: 14, maxWidth: 720, lineHeight: 1.7 }}>
          실무 배전운영시스템을 단순화한 인터랙티브 시나리오. 신입 운영원이 안전하게 실패하면서
          배우도록 설계되었습니다. 각 모듈은 짧은 브리핑 → 결정/조작 → 결과 디브리프 흐름입니다.
        </p>

        <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {MODULES.map((m) => (
            <ModuleCard key={m.id} module={m} onOpen={() => !m.coming && setActiveId(m.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ModuleCard({ module: m, onOpen }) {
  const [hover, setHover] = useState(false);
  const disabled = m.coming;
  return (
    <button
      onClick={onOpen}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: 'left',
        padding: 20,
        background: palette.panel,
        border: `1px solid ${hover && !disabled ? palette.accent : palette.accentDim}`,
        borderRadius: 12,
        color: palette.text,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'transform 0.18s, box-shadow 0.18s, border-color 0.18s',
        transform: hover && !disabled ? 'translateY(-2px)' : 'none',
        boxShadow: hover && !disabled ? '0 8px 28px rgba(123, 230, 255, 0.18)' : 'none',
        fontFamily: 'inherit',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 24 }}>{m.icon}</span>
        <span
          style={{
            fontSize: 10, letterSpacing: 1, color: palette.textDim,
            background: 'rgba(255,255,255,0.04)',
            padding: '3px 8px', borderRadius: 999,
          }}
        >
          CH·{String(m.chapter).padStart(2, '0')}
        </span>
        {disabled && (
          <span
            style={{
              fontSize: 10, color: palette.warn, marginLeft: 'auto',
              border: `1px solid ${palette.warn}`, borderRadius: 999, padding: '2px 8px',
            }}
          >
            준비 중
          </span>
        )}
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>
        {m.title}
      </div>
      <div style={{ fontSize: 12, color: palette.accent, marginBottom: 10 }}>
        {m.subtitle}
      </div>
      <div style={{ fontSize: 12, color: palette.textDim, lineHeight: 1.6, marginBottom: 12 }}>
        {m.summary}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: palette.muted }}>
        <span>⏱ {m.duration}</span>
        {!disabled && <span style={{ color: palette.accent }}>시작 →</span>}
      </div>
    </button>
  );
}
