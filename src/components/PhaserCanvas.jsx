import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import SmartGridScene from '../game/SmartGridScene';

export default function PhaserCanvas({ onSceneReady }) {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const onSceneReadyRef = useRef(onSceneReady);

  // 콜백을 ref로 보관 — 부모 리렌더로 prop이 바뀌어도 effect는 재실행 안 됨
  useEffect(() => {
    onSceneReadyRef.current = onSceneReady;
  }, [onSceneReady]);

  useEffect(() => {
    if (gameRef.current) return;
    console.log('[PhaserCanvas] mounting, Phaser version:', Phaser.VERSION);

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: '#0a0e27',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [SmartGridScene],
      render: { antialias: true, pixelArt: false },
    });

    gameRef.current = game;

    let cancelled = false;
    const waitForScene = () => {
      if (cancelled) return;
      const scene = game.scene.getScene('SmartGridScene');
      if (scene && scene.scene.isActive() && typeof scene.applyBuildingPlacement === 'function') {
        onSceneReadyRef.current?.(scene);
      } else {
        setTimeout(waitForScene, 50);
      }
    };
    waitForScene();

    return () => {
      cancelled = true;
      game.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 게임은 마운트 시 1회만 — prop 변화로 재생성 금지

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
      }}
    />
  );
}
