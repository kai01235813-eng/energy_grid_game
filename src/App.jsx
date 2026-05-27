import React, { useState } from 'react';
import SmartGridGame from './components/SmartGridGame';
import GridBuilder3D from './components/GridBuilder3D';
import EducationMode from './components/EducationMode';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  const [mode, setMode] = useState(() => {
    return localStorage.getItem('eg_mode') || 'menu';
  });

  const switchMode = (next) => {
    localStorage.setItem('eg_mode', next);
    setMode(next);
  };

  if (mode === 'menu') {
    return <ModeSelect onSelect={switchMode} />;
  }

  return (
    <ErrorBoundary>
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        <button
          onClick={() => switchMode('menu')}
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 1000,
            padding: '6px 12px',
            background: 'rgba(10, 14, 39, 0.85)',
            color: '#00d4ff',
            border: '1px solid #00d4ff',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'monospace',
          }}
        >
          ← 모드 선택
        </button>
        {mode === 'phaser' && <SmartGridGame />}
        {mode === 'r3f' && <GridBuilder3D />}
        {mode === 'edu' && <EducationMode />}
      </div>
    </ErrorBoundary>
  );
}

function ModeSelect({ onSelect }) {
  const cardStyle = {
    flex: 1,
    padding: 32,
    background: 'rgba(10, 14, 39, 0.7)',
    border: '1px solid #00d4ff',
    borderRadius: 12,
    cursor: 'pointer',
    color: '#e6f7ff',
    textAlign: 'left',
    fontFamily: 'system-ui, sans-serif',
    transition: 'transform 0.15s, box-shadow 0.15s',
  };
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: 'radial-gradient(circle at 50% 30%, #0a1a3a 0%, #050816 70%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ color: '#00d4ff', fontFamily: 'system-ui', margin: 0, fontSize: 36 }}>
        ⚡ Energy Grid
      </h1>
      <p style={{ color: '#7aa', margin: 0, fontFamily: 'system-ui' }}>
        플레이 모드를 선택하세요
      </p>
      <div style={{ display: 'flex', gap: 16, maxWidth: 1200, width: '100%', flexWrap: 'wrap' }}>
        <button onClick={() => onSelect('phaser')} style={cardStyle}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎮</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#00d4ff' }}>
            스마트그리드 캠페인
          </div>
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, opacity: 0.85 }}>
            11차 전기본 기반의 2.5D 시뮬레이션. 발전·송배전·수요관리 시나리오를 단계별로 플레이합니다.
          </div>
        </button>
        <button
          onClick={() => onSelect('r3f')}
          style={{ ...cardStyle, borderColor: '#ffd700' }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>🏗️</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#ffd700' }}>
            그리드 빌더 (3D)
          </div>
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, opacity: 0.85 }}>
            Townscaper 스타일의 헥스 그리드 위에 발전소·변전소·송전탑·가정을 자유 배치. 마을이 자라며 전력망이 자동으로 빛납니다.
          </div>
        </button>
        <button
          onClick={() => onSelect('edu')}
          style={{ ...cardStyle, borderColor: '#7be6ff' }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎓</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#7be6ff' }}>
            교육 모드 · NEW
          </div>
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, opacity: 0.85 }}>
            전력시스템 단선결선도 기반의 실무 교육 시뮬레이터. 변전소 D/L 휴전작업·부하절체 등 신입 운영원이 안전하게 실패하며 배우는 시나리오 모음.
          </div>
        </button>
      </div>
      <div style={{ color: '#456', fontSize: 11, fontFamily: 'monospace', marginTop: 12 }}>
        Models © Kenney.nl (CC0)
      </div>
    </div>
  );
}

export default App;
