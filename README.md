# Gomoku (오목) React Game

최적화된 React 기반 오목 게임입니다. MCTS와 미니맥스 알고리즘을 사용한 강력한 AI와 함께 플레이하세요.

## 🚀 주요 기능

- **강력한 AI**: MCTS + 미니맥스 알고리즘
- **5가지 난이도**: Easy, Normal, Hard, TINI 모드, TITIBO 모드
- **고급 규칙**: 3-3, 4-4 금수, 오버라인 체크
- **모바일 최적화**: 터치 지원, 반응형 디자인
- **성능 최적화**: React.memo, useMemo, useCallback 활용
- **MCTS 최적화**: 트리 재사용, 휴리스틱 rollout, 후보 제한

## 🎮 게임 규칙

- **승리 조건**: 정확히 5목을 완성
- **금수 규칙**: 3-3, 4-4 금수 적용
- **오버라인**: 6목 이상 금지
- **선수권**: 흑이 먼저 시작

## 🛠️ 설치 및 실행

### 로컬 개발
```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm start
```

### 프로덕션 빌드
```bash
# 최적화된 빌드
npm run build:prod

# 빌드 결과 확인
npm run analyze
```

## 🌐 Render 배포

### 1. GitHub 연동
1. GitHub에 코드 푸시
2. Render.com에서 새 Static Site 생성
3. GitHub 저장소 연결

### 2. 배포 설정
- **Build Command**: `npm run build:prod`
- **Publish Directory**: `build`
- **Environment Variables**: 없음

### 3. 자동 배포
- GitHub에 푸시하면 자동으로 배포
- 브랜치별 배포 지원

## ⚡ 성능 최적화

### React 최적화
- `React.memo`로 불필요한 리렌더링 방지
- `useMemo`로 계산 결과 메모이제이션
- `useCallback`으로 함수 메모이제이션

### MCTS 최적화
- **트리 재사용**: 매 턴마다 새로 계산하지 않고 이전 트리 재사용
- **시뮬레이션 수 감소**: 1000회 → 150-300회로 제한
- **후보 수 제한**: 전체 225칸 → 돌 주변 2칸 이내로 제한
- **휴리스틱 rollout**: 완전 랜덤 대신 간단한 평가함수 기반

### 번들 최적화
- 소스맵 비활성화로 번들 크기 감소
- 불필요한 의존성 제거
- 코드 스플리팅 적용

### 렌더링 최적화
- SVG 요소 메모이제이션
- 스타일 객체 메모이제이션
- 이벤트 핸들러 최적화

## 📱 모바일 지원

- 터치 이벤트 지원
- 반응형 디자인
- 모바일 최적화된 UI
- 터치 최적화 (touch-action: manipulation)

## 🎯 AI 난이도

1. **Easy (이준희실력)**: 미니맥스 깊이 2 (빠름)
2. **Normal**: 미니맥스 깊이 3 (빠름)
3. **Hard**: MCTS 150회 시뮬레이션 (중간)
4. **TINI 모드**: MCTS 200회 시뮬레이션 (강함)
5. **TITIBO 모드**: MCTS 300회 + 미니맥스 조합 (최강)

## 🔧 기술 스택

- **Frontend**: React 19.1.0
- **AI**: MCTS, Minimax with Alpha-Beta Pruning
- **Styling**: CSS3 with animations
- **Build**: Create React App
- **Deployment**: Render.com

## 📊 성능 지표

- **초기 로딩**: < 2초
- **AI 응답**: < 0.5초 (Easy/Normal), < 2초 (Hard+)
- **번들 크기**: < 500KB
- **메모리 사용**: < 50MB
- **MCTS 속도**: 5-10배 향상

## 🐛 문제 해결

### 일반적인 문제
1. **AI 응답 느림**: 난이도를 낮춰보세요
2. **모바일 터치 문제**: 화면을 새로고침하세요
3. **렌더링 지연**: 브라우저 캐시를 지워보세요

### 개발 환경
```bash
# 캐시 클리어
npm run build -- --reset-cache

# 의존성 재설치
rm -rf node_modules package-lock.json
npm install
```

## 📄 라이선스

MIT License

## 🤝 기여하기

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**즐거운 오목 게임 되세요! 🎮**
