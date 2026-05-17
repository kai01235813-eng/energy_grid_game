import Phaser from 'phaser';
import { BUILDINGS, CITIES, LARGE_CUSTOMERS, EVENTS, DISASTERS, YEAR } from './gameData';
import { bus } from './eventBus';
import mapUrl from '../../map_bg.jpg';

const MIN_PLACE_DIST = 36;
const CITY_AVOID_DIST = 38;
const MAP_SQUISH = 0.65;
const REPAIR_HIT_RADIUS = 30;    // 손상 건물 클릭 히트박스
const DISASTER_GRACE_MS = 60000; // 시작 후 무사 60초
const DISASTER_INTERVAL_MS = 30000;
const DISASTER_PROB = 0.65;
const WILDFIRE_RADIUS = 80;

export default class SmartGridScene extends Phaser.Scene {
  constructor() {
    super('SmartGridScene');
  }

  init() {
    this.cities = [];
    this.customers = [];
    this.buildings = [];
    this.selectedBuilding = null;
    this.research = {};
    this.mapScale = 1;
    this.zoom = 1;
    this.year = YEAR.START;       // 게임 내 연도
  }

  preload() {
    this.load.image('map', mapUrl);
  }

  create() {
    console.log('[SmartGridScene] create()');
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a0e27');

    // 월드 컨테이너 — 모든 게임 콘텐츠가 여기 들어감 (드래그/줌 대상)
    this.world = this.add.container(0, 0);

    // 지도 추가
    const map = this.add.image(0, 0, 'map').setOrigin(0, 0);
    this.mapImage = map;
    this.layoutMap();

    this.world.add(map);

    // 비네트 (가장자리 어둡게 — 분위기)
    this.vignette = this.add.graphics();
    this.world.add(this.vignette);
    this.drawVignette();

    // 도시 + 대형고객 배치
    CITIES.forEach((c) => this.spawnCity(c));
    LARGE_CUSTOMERS.forEach((c) => this.spawnCustomer(c));

    // 빌딩 컨테이너 (도시 위에 그려져야 함 → 나중에 추가)
    this.buildingsLayer = this.add.container(0, 0);
    this.world.add(this.buildingsLayer);

    // 변전소 범위 미리보기 원 (배치 전 호버용)
    this.rangePreview = this.add.graphics();
    this.world.add(this.rangePreview);

    // bus 구독 — shutdown 시 정리할 수 있게 unsub 보관
    this.unsubs = [];
    this.unsubs.push(bus.on(EVENTS.BUILDING_SELECTED, (id) => {
      this.selectedBuilding = id;
      if (id !== 'substation') this.rangePreview?.clear();
    }));
    this.unsubs.push(bus.on(EVENTS.RESEARCH_UNLOCKED, (id) => {
      this.research[id] = true;
      this.recomputePower();
    }));

    // 입력 처리
    this.setupInput();

    // 1초 틱
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.tick(),
    });

    // 재난 타이머 시작 (60초 유예 후)
    this.startDisasterTimer();

    // 연도 진행 타이머 — 11차 전기본 캠페인
    bus.emit(EVENTS.YEAR_CHANGED, { year: this.year, isEnd: false });
    this.yearEvent = this.time.addEvent({
      delay: YEAR.DURATION_MS,
      loop: true,
      callback: () => this.advanceYear(),
    });

    // 리사이즈 대응
    this.scale.on('resize', () => this.layoutMap(true));

    this.recomputePower();
  }

  // 지도를 화면에 맞게 스케일 + 중앙 배치
  layoutMap(reposition = false) {
    if (!this.mapImage) return;
    const { width, height } = this.scale;
    const m = this.mapImage;
    const tex = m.texture.getSourceImage();
    const ow = tex.width;
    const oh = tex.height;

    // 세로 압축까지 고려해 화면에 맞도록 스케일 결정
    const scale = Math.min(width / ow, height / (oh * MAP_SQUISH)) * 0.95;
    this.mapScale = scale;
    m.setScale(scale, scale * MAP_SQUISH);
    m.x = (width - ow * scale) / 2;
    m.y = (height - oh * scale * MAP_SQUISH) / 2;

    // 도시·고객·건물 위치 재계산 (map 원본 좌표 → 화면 좌표)
    if (reposition) {
      this.cities.forEach((c) => this.placeCityVisual(c));
      this.customers.forEach((c) => this.placeCustomerVisual(c));
      this.buildings.forEach((b) => this.placeBuildingVisual(b));
      this.drawVignette();
    }
  }

  // 원본 (mapX, mapY) → 월드 좌표 (세로 압축 반영)
  toScreen(mx, my) {
    return {
      x: this.mapImage.x + mx * this.mapScale,
      y: this.mapImage.y + my * this.mapScale * MAP_SQUISH,
    };
  }

  fromScreen(sx, sy) {
    return {
      mx: (sx - this.mapImage.x) / this.mapScale,
      my: (sy - this.mapImage.y) / (this.mapScale * MAP_SQUISH),
    };
  }

  drawVignette() {
    this.vignette.clear();
    const { width, height } = this.scale;
    const g = this.vignette;
    // 가장자리 어두운 그라데이션 (간이)
    g.fillStyle(0x000000, 0.45);
    g.fillRect(0, 0, width, 60);
    g.fillRect(0, height - 60, width, 60);
    g.fillRect(0, 0, 60, height);
    g.fillRect(width - 60, 0, 60, height);
  }

  spawnCity(cityDef) {
    const c = {
      ...cityDef,
      lit: false,
      ring: null,
      glow: null,
      label: null,
      block: null,
    };
    this.cities.push(c);
    this.placeCityVisual(c);
  }

  placeCityVisual(c) {
    const { x, y } = this.toScreen(c.x, c.y);

    // 기존 비주얼 제거 후 재생성 (리사이즈 대응)
    [c.ring, c.glow, c.label, c.block, ...(c.houses || [])].forEach((g) => g && g.destroy());
    c.houses = [];

    // 발광 (꺼진 상태)
    const glow = this.add.graphics();
    glow.x = x; glow.y = y;
    this.world.add(glow);
    c.glow = glow;

    // 도시 블록 — 작은 아이소 빌딩 더미 (2.5D 느낌)
    const block = this.add.graphics();
    block.x = x; block.y = y;
    // 어두운 받침
    block.fillStyle(0x1f2937, 0.85);
    block.fillEllipse(0, 4, 26, 10);
    // 빌딩 더미 3개
    block.fillStyle(0x4b5563, 1);
    block.lineStyle(1, 0x1f2937, 1);
    block.fillRect(-9, -16, 6, 16);
    block.strokeRect(-9, -16, 6, 16);
    block.fillRect(-2, -22, 6, 22);
    block.strokeRect(-2, -22, 6, 22);
    block.fillRect(5, -12, 6, 12);
    block.strokeRect(5, -12, 6, 12);
    // 창문 점들
    block.fillStyle(0x1f2937, 1);
    [[-7,-13],[-7,-9],[-7,-5],[0,-19],[0,-15],[0,-11],[0,-7],[7,-9],[7,-5]].forEach(([dx,dy]) => {
      block.fillRect(dx, dy, 1, 1);
    });
    this.world.add(block);
    c.block = block;

    // 라벨
    const label = this.add.text(x, y + 14, c.name, {
      fontSize: '11px',
      color: '#e5e7eb',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);
    this.world.add(label);
    c.label = label;

    // 수요 배지
    const demand = this.add.text(x, y + 28, `${c.demand}MW`, {
      fontSize: '9px',
      color: '#fbbf24',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0);
    this.world.add(demand);
    c.demandLabel = demand;

    // 고객(가정) 3채 — 도시 주변에 배치
    const houseAngles = [Math.PI * 0.7, Math.PI * 1.3, Math.PI * 1.85];
    houseAngles.forEach((angle) => {
      const hx = x + Math.cos(angle) * 26;
      const hy = y + Math.sin(angle) * 12;
      const h = this.add.graphics();
      h.x = hx; h.y = hy;
      this.drawHouse(h, false);
      this.world.add(h);
      c.houses.push(h);
    });

    // 점등 상태 동기화
    this.updateCityLight(c);
  }

  spawnCustomer(def) {
    const c = { ...def, lit: false, factory: null, label: null, demandLabel: null, glow: null };
    this.customers.push(c);
    this.placeCustomerVisual(c);
  }

  placeCustomerVisual(c) {
    const { x, y } = this.toScreen(c.x, c.y);
    [c.factory, c.label, c.demandLabel, c.glow].forEach((g) => g && g.destroy());

    // 발광 (꺼진 상태)
    const glow = this.add.graphics();
    glow.x = x; glow.y = y;
    this.world.add(glow);
    c.glow = glow;

    // 공장 외관
    const factory = this.add.graphics();
    factory.x = x; factory.y = y;
    this.drawFactory(factory, false);
    this.world.add(factory);
    c.factory = factory;

    // 라벨
    const label = this.add.text(x, y + 18, c.name, {
      fontSize: '10px',
      color: '#fbbf24',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);
    this.world.add(label);
    c.label = label;

    // 수요
    const demand = this.add.text(x, y + 30, `🏭 ${c.demand}MW`, {
      fontSize: '9px',
      color: '#f59e0b',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0);
    this.world.add(demand);
    c.demandLabel = demand;

    this.updateConsumerLight(c);
  }

  // 공장 (대형고객) 그리기
  drawFactory(g, lit) {
    g.clear();
    // 그림자
    g.fillStyle(0x000000, 0.5);
    g.fillEllipse(0, 8, 38, 12);
    // 본관
    g.fillStyle(lit ? 0x60a5fa : 0x4b5563, 1);
    g.lineStyle(1, 0x111827, 1);
    g.fillRect(-18, -14, 36, 18);
    g.strokeRect(-18, -14, 36, 18);
    // 톱니 지붕 (saw-tooth roof)
    g.fillStyle(lit ? 0x3b82f6 : 0x374151, 1);
    for (let i = -18; i < 18; i += 8) {
      g.fillTriangle(i, -14, i + 8, -14, i + 4, -22);
      g.lineBetween(i, -14, i + 4, -22);
      g.lineBetween(i + 4, -22, i + 8, -14);
    }
    // 굴뚝 2개
    g.fillStyle(0x6b7280, 1);
    g.fillRect(-12, -34, 5, 12);
    g.strokeRect(-12, -34, 5, 12);
    g.fillRect(7, -34, 5, 12);
    g.strokeRect(7, -34, 5, 12);
    // 굴뚝 끝 빨간 띠
    g.fillStyle(0xef4444, 1);
    g.fillRect(-12, -34, 5, 2);
    g.fillRect(7, -34, 5, 2);
    // 산업 띠
    g.fillStyle(lit ? 0xfbbf24 : 0x4b5563, 1);
    g.fillRect(-16, -4, 32, 2);
    // 점등 시 창문
    if (lit) {
      g.fillStyle(0xfffbeb, 0.95);
      [-12, -5, 2, 9].forEach((wx) => g.fillRect(wx, -10, 4, 3));
    }
  }

  updateConsumerLight(c) {
    if (c.factory) {
      this.drawFactory(c.factory, c.lit);
    }
    const glow = c.glow;
    if (!glow) return;
    glow.clear();
    if (c.lit) {
      for (let r = 38; r >= 14; r -= 4) {
        glow.fillStyle(0xfbbf24, 0.06);
        glow.fillCircle(0, -2, r);
      }
      glow.fillStyle(0xfbbf24, 0.5);
      glow.fillCircle(0, -2, 9);
    }
  }

  // 가정 하나 그리기 (작은 집 아이콘)
  drawHouse(g, lit) {
    g.clear();
    const wallColor = lit ? 0xfde047 : 0x4b5563;
    const roofColor = lit ? 0xf59e0b : 0x374151;
    g.fillStyle(roofColor, 1);
    g.fillTriangle(-6, -3, 6, -3, 0, -8);
    g.fillStyle(wallColor, 1);
    g.fillRect(-5, -3, 10, 6);
    g.lineStyle(0.5, 0x000000, 0.6);
    g.strokeRect(-5, -3, 10, 6);
    g.fillStyle(0x1f2937, 1);
    g.fillRect(-1, 0, 2, 3);   // 문
    if (lit) {
      g.fillStyle(0xfffbeb, 1);
      g.fillRect(-3.5, -1.5, 1.5, 1.5);  // 창문 빛
      g.fillRect(2, -1.5, 1.5, 1.5);
    }
  }

  setupInput() {
    let down = null;
    let worldStart = null;
    let dragged = false;

    this.input.on('pointerdown', (p) => {
      down = { x: p.x, y: p.y };
      worldStart = { x: this.world.x, y: this.world.y };
      dragged = false;
    });

    this.input.on('pointermove', (p) => {
      if (this.selectedBuilding === 'substation' && !p.isDown) {
        this.showRangePreview(p.x, p.y);
      } else if (this.selectedBuilding && this.selectedBuilding !== 'substation') {
        this.rangePreview.clear();
      }

      if (!down) return;
      const dx = p.x - down.x;
      const dy = p.y - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) {
        dragged = true;
        if (p.rightButtonDown() || !this.selectedBuilding) {
          // 화면 픽셀 단위로 팬 — 줌과 무관하게 일관된 드래그 속도
          this.world.x = worldStart.x + dx;
          this.world.y = worldStart.y + dy;
        }
      }
    });

    this.input.on('pointerup', (p) => {
      if (down && !dragged && !p.rightButtonDown()) {
        const wp = this.screenToWorld(p.x, p.y);
        const damaged = this.findDamagedBuildingAt(wp.x, wp.y);
        if (damaged) {
          bus.emit(EVENTS.REPAIR_REQUESTED, { buildingRef: damaged });
        } else {
          this.tryPlaceAt(p);
        }
      }
      down = null;
    });

    this.input.on('pointerout', () => {
      this.rangePreview.clear();
    });

    // 마우스 휠 줌 — 커서 위치 중심
    this.input.on('wheel', (pointer, _objs, _dx, dy) => {
      const oldZoom = this.zoom;
      const factor = dy > 0 ? 0.9 : 1.1111;
      const newZoom = Phaser.Math.Clamp(oldZoom * factor, 0.6, 2.5);
      if (newZoom === oldZoom) return;

      // 커서 아래의 월드 좌표
      const cwx = (pointer.x - this.world.x) / oldZoom;
      const cwy = (pointer.y - this.world.y) / oldZoom;

      this.zoom = newZoom;
      this.world.setScale(newZoom);

      // 줌 후 같은 월드 포인트가 같은 화면 위치에 오도록 world 위치 조정
      this.world.x = pointer.x - cwx * newZoom;
      this.world.y = pointer.y - cwy * newZoom;

      bus.emit('zoom-changed', { zoom: newZoom });
    });
  }

  // 화면 좌표 → 월드 좌표 (zoom + pan 반영)
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.world.x) / this.zoom,
      y: (sy - this.world.y) / this.zoom,
    };
  }

  showRangePreview(sx, sy) {
    const def = BUILDINGS.substation;
    const wp = this.screenToWorld(sx, sy);
    this.rangePreview.clear();
    this.rangePreview.lineStyle(2, 0xfbbf24, 0.6);
    this.rangePreview.fillStyle(0xfbbf24, 0.08);
    this.rangePreview.fillCircle(wp.x, wp.y, def.range);
    this.rangePreview.strokeCircle(wp.x, wp.y, def.range);
  }

  tryPlaceAt(pointer) {
    if (!this.selectedBuilding) return;
    const wp = this.screenToWorld(pointer.x, pointer.y);
    const wx = wp.x;
    const wy = wp.y;

    // 지도 범위 체크 (세로 압축 반영)
    if (this.mapImage) {
      const m = this.mapImage;
      const tex = m.texture.getSourceImage();
      const mw = tex.width * this.mapScale;
      const mh = tex.height * this.mapScale * MAP_SQUISH;
      if (wx < m.x || wx > m.x + mw || wy < m.y || wy > m.y + mh) return;
    }

    // 도시와 너무 가까우면 거부
    for (const c of this.cities) {
      const cs = this.toScreen(c.x, c.y);
      if (Math.hypot(cs.x - wx, cs.y - wy) < CITY_AVOID_DIST) return;
    }

    // 다른 건물과 너무 가까우면 거부
    for (const b of this.buildings) {
      if (Math.hypot(b.x - wx, b.y - wy) < MIN_PLACE_DIST) return;
    }

    bus.emit(EVENTS.BUILDING_PLACED, { x: wx, y: wy, buildingId: this.selectedBuilding });
  }

  // React에서 비용 차감 후 호출
  applyBuildingPlacement(x, y, buildingId) {
    const def = BUILDINGS[buildingId];
    const b = { x, y, def, container: null, rangeGfx: null };
    this.buildings.push(b);
    this.placeBuildingVisual(b);
    this.recomputePower();
  }

  placeBuildingVisual(b) {
    if (b.container) b.container.destroy();
    if (b.rangeGfx) b.rangeGfx.destroy();

    const { x, y, def } = b;

    // 변전소 영구 범위 (반투명)
    if (def.isSubstation) {
      const rg = this.add.graphics();
      rg.lineStyle(1, 0xfbbf24, 0.3);
      rg.fillStyle(0xfbbf24, 0.04);
      rg.fillCircle(x, y, def.range);
      rg.strokeCircle(x, y, def.range);
      this.world.add(rg);
      b.rangeGfx = rg;
    }

    const c = this.add.container(x, y);

    // 그림자 (2.5D 깊이)
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.4);
    shadow.fillEllipse(0, 4, 32, 12);
    c.add(shadow);

    // 받침 (아이소 마름모)
    const base = this.add.graphics();
    base.fillStyle(def.color, 1);
    base.lineStyle(1.5, def.accent, 1);
    base.beginPath();
    base.moveTo(0, -14);
    base.lineTo(28, 0);
    base.lineTo(0, 14);
    base.lineTo(-28, 0);
    base.closePath();
    base.fillPath();
    base.strokePath();
    c.add(base);

    // 본체
    const top = this.add.graphics();
    top.fillStyle(def.color, 1);
    top.lineStyle(1.5, def.accent, 1);

    if (def.id === 'coal' || def.id === 'lng') {
      top.fillRect(-12, -32, 24, 24);
      top.strokeRect(-12, -32, 24, 24);
      top.fillStyle(def.accent, 1);
      top.fillRect(-4, -46, 8, 16);
      top.strokeRect(-4, -46, 8, 16);
      // 연기 (LNG는 약하게)
      this.spawnSmoke(x, y - 46, def.id === 'coal' ? 0x6b7280 : 0xbfdbfe);
    } else if (def.id === 'nuclear') {
      top.fillCircle(0, -24, 18);
      top.strokeCircle(0, -24, 18);
      top.fillStyle(def.accent, 1);
      top.fillCircle(0, -38, 4);
      // 원자력 펄스
      this.spawnNuclearPulse(c);
    } else if (def.id === 'solar') {
      top.fillRect(-18, -16, 36, 8);
      top.strokeRect(-18, -16, 36, 8);
      top.lineStyle(1, def.accent, 0.7);
      for (let i = -16; i <= 16; i += 8) top.lineBetween(i, -16, i, -8);
    } else if (def.id === 'wind') {
      top.fillRect(-2, -38, 4, 32);
      top.strokeRect(-2, -38, 4, 32);
      // 회전 날개
      const blades = this.add.graphics();
      blades.fillStyle(def.accent, 1);
      blades.fillTriangle(0, -38, 16, -42, 0, -34);
      blades.fillTriangle(0, -38, -16, -42, 0, -34);
      blades.fillTriangle(0, -38, 0, -22, 10, -32);
      c.add(blades);
      this.tweens.add({ targets: blades, angle: 360, duration: 2000, repeat: -1 });
    } else if (def.id === 'substation') {
      top.fillRect(-16, -24, 32, 20);
      top.strokeRect(-16, -24, 32, 20);
      top.fillStyle(def.accent, 1);
      top.fillRect(-2, -36, 4, 12);
      top.fillCircle(0, -36, 4);
    } else if (def.id === 'tower') {
      // 송전철탑 — 마스트 + 가로 크로스빔
      top.fillStyle(def.color, 1);
      top.fillRect(-2, -38, 4, 32);
      top.strokeRect(-2, -38, 4, 32);
      top.lineStyle(2, def.color, 1);
      top.lineBetween(-14, -34, 14, -34); // 상부
      top.lineBetween(-12, -26, 12, -26); // 중부
      top.lineBetween(-10, -18, 10, -18); // 하부
      top.lineStyle(1, def.color, 0.7);
      top.lineBetween(-14, -34, -2, -38); // 사선 보강
      top.lineBetween(14, -34, 2, -38);
      top.fillStyle(def.accent, 1);
      top.fillCircle(0, -38, 2);
    }
    c.add(top);

    this.buildingsLayer.add(c);
    b.container = c;

    // 등장 애니메이션
    c.y = y - 40;
    c.alpha = 0;
    this.tweens.add({
      targets: c,
      y: y,
      alpha: 1,
      duration: 380,
      ease: 'Back.easeOut',
    });

    this.spawnPlacementBurst(x, y, def.accent);
  }

  spawnPlacementBurst(px, py, color) {
    for (let i = 0; i < 14; i++) {
      const angle = (Math.PI * 2 * i) / 14;
      const dot = this.add.graphics();
      dot.fillStyle(color, 1);
      dot.fillCircle(0, 0, 3);
      dot.x = px;
      dot.y = py;
      this.world.add(dot);
      this.tweens.add({
        targets: dot,
        x: px + Math.cos(angle) * 50,
        y: py + Math.sin(angle) * 50,
        alpha: 0,
        duration: 700,
        onComplete: () => dot.destroy(),
      });
    }
  }

  spawnSmoke(px, py, color) {
    this.time.addEvent({
      delay: 800,
      loop: true,
      callback: () => {
        const s = this.add.graphics();
        s.fillStyle(color, 0.5);
        s.fillCircle(0, 0, 4);
        s.x = px + (Math.random() - 0.5) * 4;
        s.y = py;
        this.world.add(s);
        this.tweens.add({
          targets: s,
          y: py - 40,
          alpha: 0,
          scale: 1.5,
          duration: 1800,
          onComplete: () => s.destroy(),
        });
      },
    });
  }

  spawnNuclearPulse(c) {
    const ring = this.add.graphics();
    ring.lineStyle(2, 0xef4444, 0.8);
    ring.strokeCircle(0, -24, 16);
    c.add(ring);
    this.tweens.add({
      targets: ring,
      scale: 1.6,
      alpha: 0,
      duration: 1400,
      repeat: -1,
    });
  }

  recomputePower() {
    // 1) 발전량 합산 (손상 시설 제외)
    let totalSupply = 0;
    let envScore = 0;
    for (const b of this.buildings) {
      if (b.damaged) continue;
      const def = b.def;
      envScore += def.env;
      if (def.power > 0) {
        let p = def.power;
        if (def.intermittent && this.research.ess) p *= 1.3;
        if (def.intermittent && this.research.vpp) p *= 1.25;
        totalSupply += p;
      }
    }
    const lossFactor = this.research.hvdc ? 0.05 : 0.15;
    const effectiveSupply = totalSupply * (1 - lossFactor);

    // 2) 송전망 BFS — 변전소에서 시작해 활성 철탑 체인을 따라 확장
    const subs = this.buildings.filter((b) => !b.damaged && b.def.isSubstation);
    const towers = this.buildings.filter((b) => !b.damaged && b.def.isTower);
    const active = new Set(subs);
    let added = true;
    while (added) {
      added = false;
      for (const t of towers) {
        if (active.has(t)) continue;
        for (const n of active) {
          // 노드 간 연결: 작은 쪽 반경을 사용 (보수적)
          const r = Math.min(t.def.range, n.def.range);
          if (Math.hypot(t.x - n.x, t.y - n.y) <= r) {
            active.add(t);
            added = true;
            break;
          }
        }
      }
    }
    this.activeNodes = active;

    // 2.5) 발전소 → 가장 가까운 활성 노드 (인입선) + BFS depth 시드
    const PLANT_CONNECT_DIST = 130;
    const flowEdges = [];
    const plants = this.buildings.filter((b) => !b.damaged && b.def.power > 0);
    const nodeDepth = new Map();   // 활성 노드의 발전원으로부터의 거리(홉)
    const bfsQueue = [];

    for (const p of plants) {
      let nearest = null;
      let nearestDist = Infinity;
      for (const n of active) {
        const d = Math.hypot(p.x - n.x, p.y - n.y);
        if (d < nearestDist && d <= PLANT_CONNECT_DIST) {
          nearestDist = d;
          nearest = n;
        }
      }
      if (nearest) {
        flowEdges.push({
          src: { x: p.x, y: p.y - 8 },
          dst: { x: nearest.x, y: nearest.y - 8 },
          color: 0xfbbf24,
          label: 'gen',
        });
        if (!nodeDepth.has(nearest) || nodeDepth.get(nearest) > 1) {
          nodeDepth.set(nearest, 1);
          bfsQueue.push(nearest);
        }
      }
    }

    // BFS — 발전원에서부터의 홉 거리 계산
    while (bfsQueue.length > 0) {
      const cur = bfsQueue.shift();
      const curDepth = nodeDepth.get(cur);
      for (const next of active) {
        if (cur === next) continue;
        const r = Math.min(cur.def.range, next.def.range);
        if (Math.hypot(cur.x - next.x, cur.y - next.y) <= r) {
          const nd = curDepth + 1;
          if (!nodeDepth.has(next) || nodeDepth.get(next) > nd) {
            nodeDepth.set(next, nd);
            bfsQueue.push(next);
          }
        }
      }
    }

    // 3) 도시 + 대형고객 통합 점등 + 배전 엣지 (배전선로 — 녹색)
    let consumed = 0;
    let totalDemand = 0;
    let poweredCities = 0;
    let poweredCustomers = 0;

    const lightConsumer = (c, isCustomer) => {
      totalDemand += c.demand;
      const cs = this.toScreen(c.x, c.y);
      let nearestNode = null;
      let nearestDist = Infinity;
      for (const n of active) {
        const d = Math.hypot(n.x - cs.x, n.y - cs.y);
        if (d <= n.def.range && d < nearestDist) {
          nearestDist = d;
          nearestNode = n;
        }
      }
      const hasSupply = effectiveSupply >= consumed + c.demand;
      const lit = !!nearestNode && hasSupply;
      if (lit !== c.lit) {
        c.lit = lit;
        if (isCustomer) this.updateConsumerLight(c);
        else this.updateCityLight(c);
      }
      if (lit) {
        consumed += c.demand;
        if (isCustomer) poweredCustomers++; else poweredCities++;
        flowEdges.push({
          src: { x: nearestNode.x, y: nearestNode.y - 8 },
          dst: { x: cs.x, y: cs.y - 4 },
          color: 0x4ade80,        // 배전선로 (녹색)
          label: 'distribution',
        });
      }
    };

    // 도시 먼저, 그 다음 대형고객 (산업 부하 우선순위 낮춤)
    this.cities.forEach((c) => lightConsumer(c, false));
    this.customers.forEach((c) => lightConsumer(c, true));

    // 4) 송전 백본 — 발전원으로부터의 BFS depth 기준 방향성
    const nodes = Array.from(active);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const r = Math.min(a.def.range, b.def.range);
        if (Math.hypot(a.x - b.x, a.y - b.y) > r) continue;

        const da = nodeDepth.has(a) ? nodeDepth.get(a) : Infinity;
        const db = nodeDepth.has(b) ? nodeDepth.get(b) : Infinity;
        let src, dst;
        if (da < db) { src = a; dst = b; }
        else if (db < da) { src = b; dst = a; }
        else continue; // 동일 depth — 흐름 방향 없음 (메시 중복선은 생략)

        flowEdges.push({
          src: { x: src.x, y: src.y - 8 },
          dst: { x: dst.x, y: dst.y - 8 },
          color: 0x00d4ff,        // 송전 백본 (시안)
          label: 'transmit',
        });
      }
    }

    // 5) 신재생 마이크로그리드 — 도시·대형고객 90px 내면 직접 배전 (송전 우회)
    const MICROGRID_DIST = 90;
    const renewables = plants.filter((p) => p.def.intermittent);
    const allConsumers = [...this.cities, ...this.customers];
    for (const r of renewables) {
      for (const c of allConsumers) {
        if (!c.lit) continue;
        const cs = this.toScreen(c.x, c.y);
        if (Math.hypot(r.x - cs.x, r.y - cs.y) <= MICROGRID_DIST) {
          flowEdges.push({
            src: { x: r.x, y: r.y - 8 },
            dst: { x: cs.x, y: cs.y - 4 },
            color: 0x14b8a6,      // 신재생 직접 배전 (청록)
            label: 'microgrid',
          });
        }
      }
    }

    this.flowEdges = flowEdges;
    this.drawFlowLines();

    bus.emit(EVENTS.STATE_CHANGED, {
      supply: Math.round(effectiveSupply),
      demand: totalDemand,
      env: envScore,
      poweredCities: poweredCities,
      totalCities: this.cities.length,
      poweredCustomers: poweredCustomers,
      totalCustomers: this.customers.length,
      buildingCount: this.buildings.length,
    });
  }

  drawFlowLines() {
    if (!this.flowGfx) {
      this.flowGfx = this.add.graphics();
      this.world.addAt(this.flowGfx, 1); // 지도 위, 건물 아래
    }
    const g = this.flowGfx;
    g.clear();
    const edges = this.flowEdges;
    if (!edges) return;

    const phase = this.flowPhase || 0;

    // 1) 정적 라인 (얇게 — 흐름의 길)
    for (const e of edges) {
      g.lineStyle(1, e.color, 0.28);
      g.lineBetween(e.src.x, e.src.y, e.dst.x, e.dst.y);
    }

    // 2) 이동 입자 (4개씩 균등 배치)
    const PACKETS = 4;
    for (const e of edges) {
      const dx = e.dst.x - e.src.x;
      const dy = e.dst.y - e.src.y;
      for (let i = 0; i < PACKETS; i++) {
        const t = (phase + i / PACKETS) % 1;
        const x = e.src.x + dx * t;
        const y = e.src.y + dy * t;
        // 끝부분에서 살짝 페이드
        const a = t < 0.05 || t > 0.95 ? 0.4 : 0.95;
        g.fillStyle(e.color, a);
        g.fillCircle(x, y, 3);
      }
    }
  }

  // Phaser scene update — 매 프레임 호출
  update(time, delta) {
    this.flowPhase = ((this.flowPhase || 0) + delta * 0.0006) % 1;
    if (this.flowEdges && this.flowEdges.length > 0) this.drawFlowLines();
  }

  updateCityLight(c) {
    // 가정 라이트 동기화
    if (c.houses) {
      c.houses.forEach((h) => this.drawHouse(h, c.lit));
    }

    const glow = c.glow;
    if (!glow) return;
    glow.clear();

    if (c.lit) {
      // 부드러운 다층 글로우
      for (let r = 36; r >= 14; r -= 4) {
        glow.fillStyle(0xffd700, 0.07);
        glow.fillCircle(0, -2, r);
      }
      glow.fillStyle(0xfde047, 0.7);
      glow.fillCircle(0, -2, 9);

      glow.scale = 0.3;
      this.tweens.add({
        targets: glow,
        scale: 1,
        duration: 320,
        ease: 'Back.easeOut',
      });
      bus.emit(EVENTS.CITY_LIT, { name: c.name });
    } else {
      bus.emit(EVENTS.CITY_BLACKOUT, { name: c.name });
    }
  }

  tick() {
    let lit = 0;
    for (const c of this.cities) if (c.lit) lit++;
    for (const c of this.customers) if (c.lit) lit++;
    bus.emit('tick', { lit, ami: !!this.research.ami });
  }

  // ─── 연도 진행 (11차 전기본 캠페인) ──────────────────────
  advanceYear() {
    if (this.year >= YEAR.END) {
      this.yearEvent?.remove();
      bus.emit(EVENTS.YEAR_CHANGED, { year: this.year, isEnd: true });
      return;
    }
    this.year++;

    // 일반 수요 증가 — 모든 도시·산단 +1.9% 복리
    const growth = 1 + YEAR.DEMAND_GROWTH_PER_YEAR;
    [...this.cities, ...this.customers].forEach((c) => {
      c.demand = Math.round(c.demand * growth);
    });

    // 2030년 AI/반도체 폭증 — 한 번에 +20% 추가
    if (this.year === YEAR.AI_SURGE_YEAR) {
      [...this.cities, ...this.customers].forEach((c) => {
        c.demand = Math.round(c.demand * YEAR.AI_SURGE_MULTIPLIER);
      });
      this.cameras.main.shake(800, 0.012);
      bus.emit(EVENTS.AI_SURGE, { year: this.year });
    }

    this.refreshDemandLabels();
    bus.emit(EVENTS.YEAR_CHANGED, { year: this.year, isEnd: false });
    this.recomputePower();
  }

  refreshDemandLabels() {
    for (const c of this.cities) {
      if (c.demandLabel) c.demandLabel.setText(`${c.demand}MW`);
    }
    for (const c of this.customers) {
      if (c.demandLabel) c.demandLabel.setText(`🏭 ${c.demand}MW`);
    }
  }

  // ─── 재난 ───────────────────────────────────────────────
  startDisasterTimer() {
    this.gameStartTime = this.time.now;
    this.disasterEvent = this.time.addEvent({
      delay: DISASTER_INTERVAL_MS,
      loop: true,
      callback: () => this.maybeFireDisaster(),
    });
  }

  maybeFireDisaster() {
    if (this.time.now - this.gameStartTime < DISASTER_GRACE_MS) return;
    if (this.buildings.filter((b) => !b.damaged).length === 0) return;
    if (Math.random() > DISASTER_PROB) return;

    const r = Math.random();
    if (r < 0.5) this.fireLightning();
    else if (r < 0.8) this.fireHelicopter();
    else this.fireWildfire();
  }

  pickRandomBuilding(filter) {
    const pool = this.buildings.filter((b) => !b.damaged && (!filter || filter(b)));
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  fireLightning() {
    const target = this.pickRandomBuilding();
    if (!target) return;

    const sky = { x: target.x + (Math.random() - 0.5) * 40, y: -200 };
    const bolt = this.add.graphics();
    bolt.lineStyle(3, 0xffffff, 1);
    bolt.beginPath();
    bolt.moveTo(sky.x, sky.y);
    const segs = 8;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const px = sky.x + (target.x - sky.x) * t + (Math.random() - 0.5) * 24;
      const py = sky.y + (target.y - 20 - sky.y) * t;
      bolt.lineTo(px, py);
    }
    bolt.strokePath();
    this.world.add(bolt);

    const flash = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0xffffff, 0.55);
    flash.setScrollFactor(0);
    this.cameras.main.shake(220, 0.006);

    this.time.delayedCall(140, () => { bolt.destroy(); flash.destroy(); });

    this.damageBuilding(target);
    bus.emit(EVENTS.DISASTER, { type: 'lightning', name: DISASTERS.lightning.name, target: target.def.name });
  }

  fireHelicopter() {
    const towerTarget = this.pickRandomBuilding((b) => b.def.isTower);
    const target = towerTarget || this.pickRandomBuilding();
    if (!target) return;

    const heli = this.add.text(0, 0, '🚁', { fontSize: '28px' }).setOrigin(0.5);
    heli.x = target.x - 220;
    heli.y = target.y - 80;
    this.world.add(heli);

    this.tweens.add({
      targets: heli,
      x: target.x,
      y: target.y - 12,
      duration: 1300,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.spawnExplosion(target.x, target.y);
        heli.destroy();
        this.damageBuilding(target);
      },
    });

    bus.emit(EVENTS.DISASTER, { type: 'helicopter', name: DISASTERS.helicopter.name, target: target.def.name });
  }

  fireWildfire() {
    // 무작위 건물 주변을 진앙으로
    const seed = this.pickRandomBuilding();
    if (!seed) return;
    const cx = seed.x + (Math.random() - 0.5) * 60;
    const cy = seed.y + (Math.random() - 0.5) * 60;

    // 화염 파티클
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * WILDFIRE_RADIUS;
      const fx = cx + Math.cos(angle) * dist;
      const fy = cy + Math.sin(angle) * dist;
      const fire = this.add.graphics();
      fire.fillStyle(Math.random() > 0.5 ? 0xff6b35 : 0xfbbf24, 0.85);
      fire.fillCircle(0, 0, 4 + Math.random() * 4);
      fire.x = fx;
      fire.y = fy;
      this.world.add(fire);
      this.tweens.add({
        targets: fire,
        y: fy - 36,
        alpha: 0,
        scale: 2.2,
        duration: 1500 + Math.random() * 700,
        onComplete: () => fire.destroy(),
      });
    }

    // 반경 내 모든 시설 손상
    const hit = [];
    for (const b of this.buildings) {
      if (b.damaged) continue;
      if (Math.hypot(b.x - cx, b.y - cy) <= WILDFIRE_RADIUS) {
        hit.push(b);
      }
    }
    hit.forEach((b) => this.damageBuilding(b));

    bus.emit(EVENTS.DISASTER, {
      type: 'wildfire',
      name: DISASTERS.wildfire.name,
      target: hit.length > 0 ? `${hit.length}개 시설` : '경미',
    });
  }

  spawnExplosion(px, py) {
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dot = this.add.graphics();
      const color = [0xff6b35, 0xfbbf24, 0xef4444][i % 3];
      dot.fillStyle(color, 1);
      dot.fillCircle(0, 0, 4);
      dot.x = px;
      dot.y = py;
      this.world.add(dot);
      this.tweens.add({
        targets: dot,
        x: px + Math.cos(angle) * 60,
        y: py + Math.sin(angle) * 60,
        alpha: 0,
        scale: 0.3,
        duration: 700,
        onComplete: () => dot.destroy(),
      });
    }
    this.cameras.main.shake(160, 0.005);
  }

  // ─── 손상 / 수리 ─────────────────────────────────────────
  damageBuilding(b) {
    if (!b || b.damaged) return;
    b.damaged = true;

    if (b.container) {
      // 빨간 X
      const xMark = this.add.text(0, -10, '✕', {
        fontSize: '22px',
        color: '#ef4444',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5);
      b.container.add(xMark);
      b.xMark = xMark;

      // 깜빡 펄스
      b.damageTween = this.tweens.add({
        targets: b.container,
        alpha: 0.55,
        duration: 600,
        yoyo: true,
        repeat: -1,
      });

      // 반복 연기
      b.damageSmokeTimer = this.time.addEvent({
        delay: 500,
        loop: true,
        callback: () => this.spawnSmoke(b.x, b.y - 22, 0x6b7280),
      });
    }

    if (b.rangeGfx) b.rangeGfx.setAlpha(0.1);

    bus.emit(EVENTS.BUILDING_DAMAGED, { name: b.def.name });
    this.recomputePower();
  }

  repairBuilding(b) {
    if (!b || !b.damaged) return;
    b.damaged = false;

    if (b.xMark) { b.xMark.destroy(); b.xMark = null; }
    if (b.damageTween) { b.damageTween.stop(); b.damageTween = null; }
    if (b.damageSmokeTimer) { b.damageSmokeTimer.destroy(); b.damageSmokeTimer = null; }
    if (b.container) b.container.alpha = 1;
    if (b.rangeGfx) b.rangeGfx.setAlpha(1);

    this.spawnPlacementBurst(b.x, b.y, 0x34d399);
    bus.emit(EVENTS.BUILDING_REPAIRED, { name: b.def.name });
    this.recomputePower();
  }

  findDamagedBuildingAt(wx, wy) {
    for (const b of this.buildings) {
      if (!b.damaged) continue;
      if (Math.hypot(b.x - wx, b.y - wy) <= REPAIR_HIT_RADIUS) return b;
    }
    return null;
  }

  shutdown() {
    if (this.unsubs) {
      this.unsubs.forEach((fn) => fn());
      this.unsubs = [];
    }
  }
}
