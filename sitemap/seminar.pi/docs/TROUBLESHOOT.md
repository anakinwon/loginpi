# TROUBLESHOOT: seminar.pi

> 장애·결함의 원인과 결과를 남겨 같은 문제를 재발시키지 않는다(R-P0). 공통 사례 = [BUILD_DEFECTS](../../../docs/BUILD_DEFECTS.md)

| 날짜 | 증상 | 원인 | 조치 | 재발 방지 |
|---|---|---|---|---|
| 2026-10-25 | M1 착수 골격의 S-1 점검 테스트 실패 — offer SDP 에 `transport-cc`(TWCC) 피드백이 붙음 | pion v4 `webrtc.NewAPI` 는 `WithInterceptorRegistry` 를 넘기지 않으면 기본 인터셉터(NACK·TWCC·SR/RR 등)를 **자동 등록**한다(pion/webrtc v4.2.25 api.go `NewAPI`) — '레지스트리를 안 넘기면 인터셉터 없음'이라는 가정이 틀림 | `webrtc.WithInterceptorRegistry(&interceptor.Registry{})` 로 빈 레지스트리를 명시 (media/cmd/galapagos/main.go `newAPI`) | `main_test.go` 가 offer 에 transport-cc 가 없음을 검사 — 회귀 시 테스트 실패. PRD_02 M1 ① 에 명시 |
| 2026-10-27 | 엔진 v1.3 `app.send` 중계 중 청중 1명이 방 전원의 연결을 끊을 수 있음 | 잘못된 UTF-8 텍스트를 그대로 중계 → 받는 브라우저가 WebSocket 텍스트 프레임 오류로 연결 종료 | 잘못된 UTF-8 프레임은 보낸 연결만 종료(SIGNAL_API v1.3.1, `4e33bbad`). v1.3 빌드(`45541466…`)는 폐기·설치 금지(HOME_NODE_GUIDE 4.7) | 중계 메시지는 엔진 한 곳에서 검증(주제별 역할·4KB·초당 2건·UTF-8) — 받는 쪽 필터에 기대지 않음(REA_04_MEET_FEATURES ⑦) |
| 2026-10-27 | 기능 브랜치 병합 후 `pnpm test` 가 시험 1개(media-fx)만 실행 | 시험 스크립트가 특정 파일만 지정 — 병합으로 늘어난 `src/**/*.test.mjs` 를 놓침 | 시험 대상을 `src/**/*.test.mjs` 전부로(`60695804`) | 새 기능은 `*.test.mjs` 이름 규칙만 지키면 자동 포함 |
| 2026-10-27 | ⋯ 메뉴에 '효과' 항목이 2개 | 소음·조명(SA3)과 배경(SA5)이 각자 시트 항목을 등록 | 시트 1개로 통합, 조명·소음 줄을 배경 시트 아래에(`0c4f32d7`, 설계 15.2·15.5) | 확장 지점 등록 전 설계서 15.1 자리 표 대조 |
| 2026-10-27 | HEAD 에서 `pnpm build` 실패 — "[copy-mediapipe] 모델 파일 없음" | 배경 효과 모델 `public/mediapipe/models/selfie_segmenter_landscape.tflite` 를 사람이 1회 받아 커밋하는 설계인데 아무도 넣지 않음(로컬에 있던 작업 트리에서만 빌드 통과). 이번 실행은 다운로드가 권한 정책에 거부됨 | **해결(`9ca1b26c`, 2026-10-27)** — 메인 세션이 모델 파일을 받아 커밋 → `pnpm build` 통과 → Vercel success | 빌드 차단 장치(`12fe33f5`)가 조용한 깨짐은 막았다. 통합 직후 깨끗한 클론에서 `pnpm build` 1회를 관문에 넣을 것 |
| 2026-10-27 | REA MCP 서버 연결 실패(CONNECT_TIMEOUT 30초) | MCP 서버 기동 시간 초과 [확인중 : 원인] | REA CLI `rea@6.4.0` 로 같은 작업 수행, 앞선 실행이 내보낸 산출물은 sha256 재대조 후 재사용 | 분석 기록에 'MCP 실패 → CLI' 를 명시(REA_04_MEET_FEATURES 7절) |
| 2026-10-27 | REA `trace-application-feature` 가 웹팩·Next 압축 청크에서 5건 모두 no-match, Jitsi `analyze-javascript-application` 은 300초 타임아웃·힙 4096MB 고갈 | 앱 그래프가 압축 청크의 문자열 리터럴·JSX 를 seed 노드로 색인하지 않음 / 3.6MB 번들은 기본 한도 초과 | REA `export-web-scripts` 원문(다이제스트 검증) + indexOf 앵커로 대체, node-id seed 는 정상 동작 | no-match 를 '부재'로 쓰지 않음. 큰 번들은 그래프 대신 앵커 읽기로 바로 감 |
| 2026-10-27 | Git Bash 에서 REA 인자 `'/{api_version}/interactions'` 가 깨짐 | MSYS 경로 변환이 `/` 로 시작하는 인자를 Windows 경로로 바꿈 | `MSYS_NO_PATHCONV=1` 로 재실행 | `/` 로 시작하는 문자열 인자는 이 환경변수와 함께 |
| 2026-10-28 | 더빙(tts) 캐시에 적중하면 비참가자도 합성 음성을 받음(D-2 회귀, 야간 r2 T09) | 서명 확인 뒤 권한 판정을 캐시 조회 **뒤**로 옮겨, 적중 경로는 권한을 안 봄. 이어 캐시를 공유하던 첫 요청자의 거절 결과가 다른 요청에 번짐 | 적중이어도 `aiGate`(참가·LIVE)를 먼저(r2), 거절은 `DENIED` 표식으로 공유하지 않음(`db3426fb`) | **권한 판정은 캐시 앞**. 공유 캐시에는 성공 결과만. 회귀 시험 = 비참가자 + 캐시 적중 → 403 |
| 2026-10-28 | 음성 조각 예약 RPC 를 못 찾은 것으로 오판해 옛(008) 느슨한 계량으로 후퇴 — 일시 DB 오류가 상한을 풀어 줌 | "새 함수 없음" 감지를 모든 RPC 오류로 판정(fail-open) | 함수 없음 코드(`PGRST202`·`42883`)만 후퇴, 그 밖은 큰 예약 유지·재확인(`a5092228`) | 하위 호환 후퇴는 **특정 오류 코드만** — 일반 오류는 닫히는 쪽 |
| 2026-10-28 | 같은 NAT 한도 분리 키가 토큰 끝 32자 원문이라, 토큰 문자열만 바꾸면 한도 10배·차단 회피 | 검증하지 않은 클라이언트 값을 속도 제한 버킷 키로 사용 | 서명·만료를 검증한 Pi 세션만 분리, 그 외 IP 단독(`350adc25`) | 속도 제한·계량 키에는 **서버가 검증한 값만** |
| 2026-10-28 | 배포본(Vercel, UTC)에서 세미나 시작일시가 UTC 로 표시(야간 E2E r2) | next-intl `useFormatter` 가 Provider 에서 서버 timeZone 을 물려받음 — 주석의 "보는 사람 시간대"와 달랐음 | 보는 사람 시간대를 명시(r3 T01 `0d1a7b5d`, 메일 초대 본문 시간대 이름 보강 `ae25bc5a`) | 날짜 표시는 KST 로컬이 아니라 **UTC 서버 빌드**로 확인 |
| 2026-10-28 | 병렬 테스터 2명이 같은 결함(D-2)을 다른 서명·SQL 로 중복 구현 → 13파일 충돌로 한쪽 병합 포기(야간 r1 T08·T09) | 후속 과제 배정에서 번역·더빙의 공용 부분(서명·계량)이 두 담당에 겹쳐 있었음 | T08 기반 위에 T09 보강분만 재작업(r2), SQL 은 `fn_use_smn_ai` 재사용 | 공용 부분이 겹치는 과제는 **한 담당이 기반을 먼저**, 다른 담당은 다음 라운드에 그 위로 |
| 2026-10-28 | 로컬 시험이 만든 세미나가 운영 공개 목록에 노출(야간 E2E r1 high) | 배포본이 로컬 STAGING 과 같은 DB(public)를 읽음 — Vercel 운영 env 와 `.env.vercel-prod` 불일치 또는 운영이 비운영 DB 사용 [확인중 : 마스터]. tier 스키마는 PostgREST 미노출(406)이라 로컬은 public 만 가능 | 시험 데이터 논리삭제 · **미해결**(ROADMAP 막힌 것 #10) | 원인 확인 전에는 로컬 시험 데이터 제목에 `[QA-…]` 를 붙이고 시험 뒤 논리삭제 |
