# TROUBLESHOOT: seminar.pi

> 장애·결함의 원인과 결과를 남겨 같은 문제를 재발시키지 않는다(R-P0). 공통 사례 = [BUILD_DEFECTS](../../../docs/BUILD_DEFECTS.md)

| 날짜 | 증상 | 원인 | 조치 | 재발 방지 |
|---|---|---|---|---|
| 2026-10-25 | M1 착수 골격의 S-1 점검 테스트 실패 — offer SDP 에 `transport-cc`(TWCC) 피드백이 붙음 | pion v4 `webrtc.NewAPI` 는 `WithInterceptorRegistry` 를 넘기지 않으면 기본 인터셉터(NACK·TWCC·SR/RR 등)를 **자동 등록**한다(pion/webrtc v4.2.25 api.go `NewAPI`) — '레지스트리를 안 넘기면 인터셉터 없음'이라는 가정이 틀림 | `webrtc.WithInterceptorRegistry(&interceptor.Registry{})` 로 빈 레지스트리를 명시 (media/cmd/galapagos/main.go `newAPI`) | `main_test.go` 가 offer 에 transport-cc 가 없음을 검사 — 회귀 시 테스트 실패. PRD_02 M1 ① 에 명시 |
| 2026-10-27 | 엔진 v1.3 `app.send` 중계 중 청중 1명이 방 전원의 연결을 끊을 수 있음 | 잘못된 UTF-8 텍스트를 그대로 중계 → 받는 브라우저가 WebSocket 텍스트 프레임 오류로 연결 종료 | 잘못된 UTF-8 프레임은 보낸 연결만 종료(SIGNAL_API v1.3.1, `4e33bbad`). v1.3 빌드(`45541466…`)는 폐기·설치 금지(HOME_NODE_GUIDE 4.7) | 중계 메시지는 엔진 한 곳에서 검증(주제별 역할·4KB·초당 2건·UTF-8) — 받는 쪽 필터에 기대지 않음(REA_04_MEET_FEATURES ⑦) |
| 2026-10-27 | 기능 브랜치 병합 후 `pnpm test` 가 시험 1개(media-fx)만 실행 | 시험 스크립트가 특정 파일만 지정 — 병합으로 늘어난 `src/**/*.test.mjs` 를 놓침 | 시험 대상을 `src/**/*.test.mjs` 전부로(`60695804`) | 새 기능은 `*.test.mjs` 이름 규칙만 지키면 자동 포함 |
| 2026-10-27 | ⋯ 메뉴에 '효과' 항목이 2개 | 소음·조명(SA3)과 배경(SA5)이 각자 시트 항목을 등록 | 시트 1개로 통합, 조명·소음 줄을 배경 시트 아래에(`0c4f32d7`, 설계 15.2·15.5) | 확장 지점 등록 전 설계서 15.1 자리 표 대조 |
| 2026-10-27 | HEAD 에서 `pnpm build` 실패 — "[copy-mediapipe] 모델 파일 없음" | 배경 효과 모델 `public/mediapipe/models/selfie_segmenter_landscape.tflite` 를 사람이 1회 받아 커밋하는 설계인데 아무도 넣지 않음(로컬에 있던 작업 트리에서만 빌드 통과). 이번 실행은 다운로드가 권한 정책에 거부됨 | **미해결** — `scripts/copy-mediapipe.mjs` 머리 주석의 curl 1줄로 받아 커밋 후 push(ROADMAP 막힌 것 #5). 그 전엔 Vercel 이 이전 배포를 계속 서빙 | 빌드 차단 장치(`12fe33f5`)가 조용한 깨짐은 막았다. 통합 직후 깨끗한 클론에서 `pnpm build` 1회를 관문에 넣을 것 |
| 2026-10-27 | REA MCP 서버 연결 실패(CONNECT_TIMEOUT 30초) | MCP 서버 기동 시간 초과 [확인중 : 원인] | REA CLI `rea@6.4.0` 로 같은 작업 수행, 앞선 실행이 내보낸 산출물은 sha256 재대조 후 재사용 | 분석 기록에 'MCP 실패 → CLI' 를 명시(REA_04_MEET_FEATURES 7절) |
| 2026-10-27 | REA `trace-application-feature` 가 웹팩·Next 압축 청크에서 5건 모두 no-match, Jitsi `analyze-javascript-application` 은 300초 타임아웃·힙 4096MB 고갈 | 앱 그래프가 압축 청크의 문자열 리터럴·JSX 를 seed 노드로 색인하지 않음 / 3.6MB 번들은 기본 한도 초과 | REA `export-web-scripts` 원문(다이제스트 검증) + indexOf 앵커로 대체, node-id seed 는 정상 동작 | no-match 를 '부재'로 쓰지 않음. 큰 번들은 그래프 대신 앵커 읽기로 바로 감 |
| 2026-10-27 | Git Bash 에서 REA 인자 `'/{api_version}/interactions'` 가 깨짐 | MSYS 경로 변환이 `/` 로 시작하는 인자를 Windows 경로로 바꿈 | `MSYS_NO_PATHCONV=1` 로 재실행 | `/` 로 시작하는 문자열 인자는 이 환경변수와 함께 |
