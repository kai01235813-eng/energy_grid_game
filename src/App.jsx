import { useEffect, useState } from 'react';
import SmartGridGame from './components/SmartGridGame';
import GridBuilder3D from './components/GridBuilder3D';
import EducationMode from './components/EducationMode';
import ErrorBoundary from './components/ErrorBoundary';

// ────────── Fullscreen + orientation lock helpers ──────────
// Browser-security mandate: requestFullscreen() may only run inside a user-
// gesture handler. We wire it to every ModeSelect button click + an explicit
// toggle in the in-game HUD. Promise rejections are swallowed because Safari
// throws on unsupported environments and there's nothing useful to do with
// the failure — the rotate-device overlay still guides the user.
function activateFullscreenAndLockLandscape() {
  const el = document.documentElement;
  const req = el.requestFullscreen
    || el.webkitRequestFullscreen
    || el.msRequestFullscreen;
  if (!req) return;
  const result = req.call(el);
  // requestFullscreen returns a Promise in modern browsers, void in older
  // WebKit. Wrap defensively.
  Promise.resolve(result)
    .then(() => {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    })
    .catch(() => {});
}

function exitFullscreen() {
  const exit = document.exitFullscreen
    || document.webkitExitFullscreen
    || document.msExitFullscreen;
  if (exit) exit.call(document);
}

function isInFullscreen() {
  return !!(
    document.fullscreenElement
    || document.webkitFullscreenElement
    || document.msFullscreenElement
  );
}

// Detect iPhone specifically — iPad supports Fullscreen API, but iPhone
// Safari does not. The only way to give iPhone users the same chrome-free
// experience is PWA (Add-to-Home-Screen). isStandalone tells us they've
// already installed it, so we can hide the install hint.
function isIPhone() {
  return /iPhone|iPod/.test(navigator.userAgent);
}
function isStandalonePWA() {
  return window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}

function isMobileUA() {
  return typeof navigator !== 'undefined'
    && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

// First-tap fullscreen — Fullscreen API requires a user gesture, so we
// can't autostart. Strategy: while on mobile + not currently fullscreen,
// install a global pointerdown listener that requests fullscreen on EVERY
// tap (no-op if already in). Also surface a visible prompt so users know
// to tap. fullscreenchange events keep the React side in sync — exit
// fullscreen (back gesture, ESC) → the prompt reappears.
function FirstTapFullscreen() {
  const wantsPrompt = isMobileUA() && !isStandalonePWA() && !isIPhone();
  const [inFs, setInFs] = useState(() => isInFullscreen());
  useEffect(() => {
    if (!wantsPrompt) return;
    const onChange = () => setInFs(isInFullscreen());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    const onTap = () => {
      if (!isInFullscreen()) activateFullscreenAndLockLandscape();
    };
    document.addEventListener('pointerdown', onTap);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      document.removeEventListener('pointerdown', onTap);
    };
  }, [wantsPrompt]);
  if (!wantsPrompt || inFs) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        zIndex: 99999,
        background: 'rgba(5, 8, 22, 0.78)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: '#e6f7ff', fontFamily: 'system-ui',
        textAlign: 'center', padding: 24,
        pointerEvents: 'none', /* tap passes through to document handler */
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>👆</div>
      <div style={{
        color: '#00d4ff', fontWeight: 700, fontSize: 18, marginBottom: 6,
      }}>
        화면을 탭해 전체화면으로 시작
      </div>
      <div style={{ color: '#9ab', fontSize: 12, lineHeight: 1.6, maxWidth: 320 }}>
        모바일 브라우저는 보안상 자동으로 전체화면을 켤 수 없습니다.<br />
        아무 곳이나 한 번 탭하면 주소창이 사라지고 가로 모드로 시작됩니다.
      </div>
    </div>
  );
}

// Mobile portrait is hostile to this UI — HUD panels and the bottom palette
// assume a wide viewport. CSS-driven overlay (no JS resize listener needed)
// renders only when the device is small AND in portrait. Class lives in
// index.css so the same rule applies regardless of which mode is loaded.
function RotateDevicePrompt() {
  return (
    <div className="eg-rotate-overlay" aria-hidden="true">
      <div style={{ fontSize: 64, marginBottom: 16 }}>📱↻</div>
      <h2 style={{ color: '#00d4ff', fontFamily: 'system-ui', margin: '0 0 8px' }}>
        가로 모드로 회전해 주세요
      </h2>
      <p style={{ color: '#7aa', fontFamily: 'system-ui', fontSize: 13, lineHeight: 1.6, maxWidth: 280 }}>
        Energy Grid는 가로 화면 기준으로 설계되어 있습니다.<br />
        기기를 옆으로 돌리면 정상적으로 표시됩니다.
      </p>
    </div>
  );
}

// Small toggle for the in-game HUD. Tracks fullscreenchange so ESC/back
// gesture flips the icon correctly.
function FullscreenToggle() {
  const [fs, setFs] = useState(isInFullscreen());
  useEffect(() => {
    const onChange = () => setFs(isInFullscreen());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);
  const onClick = () => {
    if (fs) exitFullscreen();
    else activateFullscreenAndLockLandscape();
  };
  return (
    <button
      onClick={onClick}
      title={fs ? '전체화면 종료' : '전체화면'}
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 1000,
        width: 32,
        height: 32,
        padding: 0,
        background: 'rgba(10, 14, 39, 0.85)',
        color: '#00d4ff',
        border: '1px solid #00d4ff',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 16,
        fontFamily: 'monospace',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {fs ? '⤢' : '⛶'}
    </button>
  );
}

function App() {
  const [mode, setMode] = useState(() => {
    return localStorage.getItem('eg_mode') || 'menu';
  });

  const switchMode = (next) => {
    localStorage.setItem('eg_mode', next);
    // Entering a play mode is the user-gesture moment when browsers will
    // honour the Fullscreen API. Going BACK to the menu intentionally
    // doesn't exit — the player keeps their immersive view across mode
    // switches and can hit the toggle if they want chrome back.
    if (next !== 'menu') activateFullscreenAndLockLandscape();
    setMode(next);
  };

  if (mode === 'menu') {
    return (
      <>
        <ModeSelect onSelect={switchMode} />
        <FirstTapFullscreen />
        <RotateDevicePrompt />
      </>
    );
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
        <FullscreenToggle />
        {mode === 'phaser' && <SmartGridGame />}
        {mode === 'r3f' && <GridBuilder3D />}
        {mode === 'edu' && <EducationMode />}
        <FirstTapFullscreen />
        <RotateDevicePrompt />
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
      {/* iPhone Safari blocks Fullscreen API; the only way to give iPhone
          users a chrome-free experience is PWA install. Skip the hint if
          they're already running standalone. */}
      {isIPhone() && !isStandalonePWA() && (
        <div style={{
          color: '#8fd', fontSize: 12, fontFamily: 'system-ui',
          marginTop: 4, opacity: 0.9, textAlign: 'center',
          maxWidth: 420, lineHeight: 1.6,
          padding: '8px 14px',
          background: 'rgba(125,230,200,0.08)',
          border: '1px solid rgba(125,230,200,0.3)',
          borderRadius: 8,
        }}>
          🍎 <b>아이폰 사용자</b>: 사파리의 [공유] → <b>"홈 화면에 추가"</b>를 누르면<br />
          주소창 없이 가로 전체화면으로 실행됩니다.
        </div>
      )}
      <div style={{ color: '#456', fontSize: 11, fontFamily: 'monospace', marginTop: 12 }}>
        Models © Kenney.nl (CC0)
      </div>
    </div>
  );
}

export default App;
