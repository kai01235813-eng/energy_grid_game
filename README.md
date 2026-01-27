# 에너지그리드 (Energy Grid: EG)

> 경남 지역 배경의 전력 효율화 RPG 웹앱 프로토타입

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18.3-61dafb.svg)
![Vite](https://img.shields.io/badge/Vite-5.1-646cff.svg)

## 🎮 게임 소개

**에너지그리드(에그, EG)**는 경남 지역을 배경으로 한 전력 효율화 시뮬레이션 RPG입니다. 플레이어는 '에너지 가디언'이 되어 블랙아웃 상태의 경남에 다시 빛을 되찾는 미션을 수행합니다.

### 핵심 컨셉
- **엔트로피와의 전쟁**: AC 송전의 전력 손실을 최소화하고 HVDC로 효율을 극대화
- **도파민 루프**: 손실 → 혐오 / 효율화 → 쾌감의 심리적 피드백
- **자유의지**: 창원/진주/통영/함안 중 시작 거점 선택 시 고유 버프 획득

## 🚀 주요 기능

### 1. 지역 선택 시스템
- **창원** (산업): 수익 +20%
- **진주** (기술): 건설비 -15%
- **통영** (신재생): 손실 -50%
- **함안** (네트워크): 건설속도 +50%

### 2. 스타터팩 시스템
게임 시작 시 무료로 제공되는 전력 계통 세트:
- 🏭 발전소
- 🗼 송전철탑
- ⚡ 변전소
- 🔌 전력케이블
- 📡 전신주
- 🔋 변압기

### 3. 경제 시스템
- **EXP → 코인 환전** (1 EXP = 10 Coins)
- 추후 `kepco-ai-zone` 메인 플랫폼과 JWT/API 연동 예정
- 현재는 LocalStorage 기반 Mock 데이터 사용

### 4. 전력 효율 시뮬레이션
- **AC 송전**: 거리에 비례한 전력 손실 (붉은 스파크 효과)
- **HVDC 업그레이드**: 직류 변환으로 손실 0% (네온 블루 효과)

## 📦 설치 및 실행

### 요구사항
- Node.js 18+ 
- npm 또는 yarn

### 설치
```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build

# 프리뷰
npm run preview
```

개발 서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.

## 🛠 기술 스택

- **React 18.3** - UI 라이브러리
- **Vite 5.1** - 빌드 도구
- **Tailwind CSS 3.4** - 스타일링
- **Framer Motion 11** - 애니메이션
- **Lucide React** - 아이콘

## 📁 프로젝트 구조

```
energy_grid/
├── src/
│   ├── components/          # React 컴포넌트
│   │   ├── RegionSelection.jsx
│   │   ├── GyeongnamMap.jsx
│   │   ├── StarterPackUI.jsx
│   │   ├── EconomyPanel.jsx
│   │   └── GridReconnectedEffect.jsx
│   ├── hooks/              # 커스텀 훅
│   │   ├── useEggUser.js   # 유저 데이터 관리
│   │   └── useEggEngine.js # 게임 엔진 로직
│   ├── constants/          # 게임 설정
│   │   └── gameConfig.js
│   ├── App.jsx             # 메인 앱
│   ├── main.jsx
│   └── index.css
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

## 🎨 디자인 테마

**Cyberpunk Smart City** - 다크 모드 기반의 네온 감성

### 색상 팔레트
- `cyber-dark`: #0a0e27
- `cyber-darker`: #050816
- `cyber-blue`: #00d4ff (주요 액센트)
- `cyber-gold`: #ffd700 (보상/성취)
- `cyber-red`: #ff3366 (경고/손실)
- `cyber-purple`: #9d4edd (EXP)

## 🔮 향후 계획

### Phase 1: 현재 (프로토타입)
- ✅ 기본 게임 플로우
- ✅ 스타터팩 시스템
- ✅ LocalStorage 기반 상태 관리

### Phase 2: 연동 준비
- [ ] JWT 토큰 인증 로직 구현
- [ ] REST API 엔드포인트 통합
- [ ] Webhook을 통한 EXP 실시간 동기화

### Phase 3: 게임 확장
- [ ] HVDC/LVDC 업그레이드 시스템
- [ ] 추가 건물 및 연구 트리
- [ ] 멀티플레이어 리더보드
- [ ] 날씨/시간대 시스템

## 🤝 기여

이 프로젝트는 현재 프로토타입 단계입니다. 피드백 및 제안은 이슈로 남겨주세요!

## 📄 라이선스

MIT License

---

**"한, 경남의 에너지를 부화시켜라."**

Developed with ⚡ by The Grid Overlord
