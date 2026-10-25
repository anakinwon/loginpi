# PRD_01: seminar.pi 자체 화상 엔진(SFU) 기획

> 버전 v0.2 · 작성 2026-10-24 · 개정 2026-10-25 · 상위 `PRD.md` 10절(기준점) · 근거 [DECISION_01](DECISION_01_VIDEO.md) 7절, [DECISION_02](DECISION_02_REA_TARGET.md) · 작성 아소카
> 이 문서는 **엔진을 어떤 순서로, 무엇을 기준으로 만들지** 정한다. 단계별 상세 설계는 각 단계 착수 때 이 문서에 덧붙인다.

## 1. 기준점 (마스터 확정 2026-10-24)

| # | 기준 | 내용 |
|---|---|---|
| K-1 | 참고모델 3개 | LiveKit · Galène · mediasoup (DECISION_02) |
| K-2 | 안전 원칙 | **S-1** 연결·암호 계층(ICE·DTLS·SRTP·RTP 직렬화)은 검증 라이브러리(pion)를 쓰고, 기본 인터셉터(NACK·TWCC·GCC)는 쓰지 않는다. **S-2** REA는 합법 범위(공개 표준·오픈소스 읽기·우리 세션 관찰). 상용 디컴파일과 코드 이식은 금지 |
| K-3 | **Galène으로 처음 짠다** | 같은 Go·pion 스택에서 패킷 전달·NACK·PLI 흐름을 따라 **우리 코드를 처음부터** 작성한다 → 언어는 **Go + pion으로 확정** |
| K-4 | **mediasoup 구조로 다듬는다** | Router·Transport·Producer·Consumer 경계로 모듈을 재구성하고, 시그널링 API를 이 단위로 맞춘다 |
| K-5 | **LiveKit과 비교해 품질을 맞춘다** | 같은 망 조건에서 측정해 차이를 줄인다(4절 지표) |

## 2. 범위

**한다**
- 영상·음성 중계 엔진(SFU)을 직접 작성한다: 방, 발행·구독, 패킷 전달, NACK·PLI, simulcast 전환, 대역폭 추정
- 시그널링 서버(WebSocket)와 입장권 검증
- seminar.pi 화면 쪽 클라이언트 모듈(브라우저 표준 WebRTC API)
- 녹화(M5, VOD R3)

**안 한다**
- 암호·연결 계층 직접 구현(S-1)
- 영상 합성(MCU)·트랜스코딩: 화질 단계는 발행자 쪽 simulcast로 처리한다
- 종단간 암호화(E2EE): 1차 범위 밖이다 [TBD]

## 3. 구조

> **변경 반영 상태** : 통합 설계 [PRD_02](PRD_02_ENGINE_DESIGN.md) — **C-1 승인(2026-10-25)** : 경계는 M1부터, 패키지 이름은 섬 이름(bora=Router·capri=Transport·santorini=Producer·jeju=Consumer, 엔진 Galápagos), M3은 경계 정밀화. **C-2 승인** : 참가자당 PC 2개. 입장권 형식(C-8)은 승인 전까지 이 문서가 정본.

```
[브라우저 — seminar.pi 화면(Next.js · Vercel)]
   ① HTTPS /api/media/ticket : 로그인 + (유료면) Pi 결제 확인 → 입장권 발급(HMAC, 수 분 유효)
   ② WSS  /signal            : 입장권 제시 → join · produce · consume · trickle ICE · leave
   ③ UDP/TCP(DTLS-SRTP)      : 영상·음성
        ▼
[media — 자체 Go 서버 Galápagos, 별도 VM]  sitemap/seminar.pi/media/
   signal/     WebSocket 프로토콜 · 입장권 검증(MEDIA_TOKEN_SECRET)
   bora/       Router(방) — 방 1개 = Router 1개, 역할(발표자·패널·청중)  ※ 섬 이름 패키지(C-1 승인)
   capri/      Transport(연결) — 참가자별 송신·수신 PeerConnection(pion — S-1 범위만)
   santorini/  Producer(송신 원천) — 들어오는 트랙(simulcast 레이어 rid=h·m·l)
   jeju/       Consumer(청중 수신) — 나가는 트랙 — 레이어 선택, 레이어 전환 때 SSRC·순번·타임스탬프 다시 매기기
   forward/    RTP 전달 경로(producer → consumers)
   nack/       패킷 캐시(링 버퍼) · 구독자 NACK에 재전송 · 발행자에게 NACK 요청
   pli/        키프레임 요청 모으기·조절(초당 상한)
   bwe/        구독자별 대역폭 추정 → 레이어 선택(M4)
   record/     녹화(M5)
   metrics/    지표 → schema.pi 모니터링(M5)
[TURN] cafe.pi /api/voice/turn-credentials 방식 재사용(seminar.pi 에 같은 라우트)
```

- **입장권**: 화면 서버(Next.js)와 미디어 서버가 공유 비밀(`MEDIA_TOKEN_SECRET`)로 서명·검증한다. 내용은 방 ID·사용자·역할·만료다. 결제 확인은 화면 서버만 한다. 미디어 서버는 DB를 보지 않는다(단순화·보안 경계).
- **역할**: 발표자·패널은 발행과 구독을 모두 하고, 청중은 구독만 한다. 청중 수가 규모를 결정한다.

## 4. 품질 지표 (K-5 — LiveKit 비교)

같은 VM, 같은 망 조건(`tc netem`으로 지연·손실 주입), 같은 클라이언트로 두 엔진을 측정한다.

| 지표 | 정의 | 목표(초안) |
|---|---|---|
| 첫 화면 시간 | 입장 클릭 → 첫 영상 프레임 | LiveKit 대비 1.5배 이내 [TBD : M4 측정 후 확정] |
| 화면 지연 | 발표자 카메라 → 시청자 화면 | LiveKit 대비 +100ms 이내 [TBD] |
| 손실 회복 | 3% 손실에서 화면 깨짐 → 복구까지 | 1초 이내 [TBD] |
| 화질 하향 반응 | 대역 제한 시작 → 낮은 레이어 전환 | LiveKit과 비슷한 수준 [TBD] |
| 규모 | 발표자 1명 + 청중 30명 동시, 서버 CPU·메모리 | VM 1대 안 [TBD] |

## 5. 단계 계획 — 통과 기준(go/no-go), 건너뛰기 금지

> **변경 반영 상태** : 통합 설계 [PRD_02](PRD_02_ENGINE_DESIGN.md) — **C-1 승인(2026-10-25)** : 경계는 M1부터, 패키지 이름은 섬 이름(bora=Router·capri=Transport·santorini=Producer·jeju=Consumer, 엔진 Galápagos), M3은 경계 정밀화. **C-2 승인** : 참가자당 PC 2개. 입장권 형식(C-8)은 승인 전까지 이 문서가 정본.

| 단계 | 참고 | 만드는 것 | 통과 기준 |
|---|---|---|---|
| **M0 실기기 관문** | — | seminar.pi 최소 앱 + `/lab/camera` 시험 화면(운영 가드 R-P6). 카메라·마이크 `getUserMedia`, 미리보기, 기기 2대 직접 연결(시그널링 = Supabase Realtime broadcast, cafe.pi 음성과 같은 방식) | iOS·Android Pi Browser에서 영상 송수신, 보이는 `<video playsinline muted>` 자동재생 OK. **실패하면 전체 재검토** |
| **M1 최소 SFU** | Galène | Go 도구 설치, `media/` Go 모듈, WebSocket 시그널링, 개발용 입장권, 발표자 1명 → 청중 2명 전달(NACK 없음) | 같은 LAN과 LTE에서 영상이 보인다 |
| **M2 안정화** | Galène | 패킷 캐시 + NACK, PLI 조절, TURN 경유, `tc netem` 시험 환경 | 3% 손실에서 화면 깨짐이 회복된다 |
| **M3 구조 다듬기** | mediasoup | Router·Transport·Producer·Consumer 경계로 재구성, 시그널링 API 문서화, 단위 테스트 | 기능 회귀 0, 모듈 간 의존이 위 구조도와 일치 |
| **M4 품질 맞추기** | LiveKit | simulcast 레이어 전환, 대역폭 추정(bwe), 청중 30명, 4절 지표로 LiveKit과 나란히 측정 | 4절 목표 충족(목표값은 M4 첫 측정 후 마스터 확정) |
| **M5 서비스화** | — | 입장권 = Pi 결제 확인 연동(PRD F-04), 방 관리 화면, 지표 → schema.pi 모니터링, 녹화(VOD) | PRD F-04·F-05·F-07, R-P0~P6 원장 통과, Pi Browser 실기기 결제·입장 |

- 단계마다 끝나면 `TROUBLESHOOT.md`에 기록하고, 다음 단계 전에 마스터에게 보고한다.
- **REA 분석 시점**: 참고모델 분석은 해당 단계 착수 직전에 한다. M1 전에 Galène, M3 전에 mediasoup, M4 전에 LiveKit. 결과는 이 문서 7절에 덧붙인다.

## 6. 개발 환경·운영

| 항목 | 내용 | 상태 |
|---|---|---|
| 언어 | Go(최신 안정판) + pion/webrtc v4 | 확정(K-3). 로컬 Go 미설치 → M1 첫 작업으로 설치 |
| 코드 위치 | `sitemap/seminar.pi/media/`(Go 모듈, Next 빌드와 분리) | 기본값 채택 — 변경 시 마스터 지시 |
| 호스팅 | 시험은 무료 등급 VM, 운영은 서울·도쿄 리전 VPS | [확인중 : 마스터] — **M1 외부(LTE) 시험 전까지** 결정 필요 |
| env | `MEDIA_TOKEN_SECRET`(화면·미디어 공유), `MEDIA_WS_URL`, TURN 키 | M1에서 `.env.example`·ENV_GUIDE 3절 추가 |
| 결함 점검 | build-defect-guard는 TS 전용 → Go 코드는 단계마다 R-P1~P6 관점 서브에이전트 점검 | M1부터 |
| 저장소 | Go가 처음 들어온다. `.gitignore`(바이너리), Vercel은 Next만 빌드 | M1 |

## 7. 참고모델 분석 기록 (단계 착수 때 덧붙임)

| 모델 | 분석 시점 | 읽을 곳(착수 시 소스로 확인) | 결과 |
|---|---|---|---|
| Galène | M1 전 | 패킷 전달·패킷 캐시·NACK·추정기 관련 패키지 | [REA_01_GALENE.md](rea/REA_01_GALENE.md) (커밋 `e2bc84f`) · 통합 설계 [PRD_02](PRD_02_ENGINE_DESIGN.md) |
| mediasoup | M3 전 | Router·Transport·Producer·Consumer API와 워커 RTP 처리 | [REA_02_MEDIASOUP.md](rea/REA_02_MEDIASOUP.md) (커밋 `aaf6e3a`) · 통합 설계 [PRD_02](PRD_02_ENGINE_DESIGN.md) |
| LiveKit | M4 전 | simulcast 선택·대역폭 할당 로직 | [REA_03_LIVEKIT.md](rea/REA_03_LIVEKIT.md) (커밋 `095e339`) · 통합 설계 [PRD_02](PRD_02_ENGINE_DESIGN.md) |

## 8. 위험

| 위험 | 대응 |
|---|---|
| Pi Browser 카메라·자동재생 제약(iOS WKWebView) | M0 관문. 실패하면 전체 재검토 |
| 품질이 상용 수준에 못 미침 | M4 비교 측정으로 차이를 수치화하고 목표를 마스터와 조정 |
| 서버 운영 책임(장애·보안 패치·DDoS) | M5 전 운영 체크리스트, VM 방화벽은 UDP 범위만 개방 |
| 일정 | 단계별로 산정 [TBD]. 각 단계 통과 후 다음 단계 일정 보고 |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-24 | v0.1 — 기준점 K-1~K-5, 구조, 품질 지표, M0~M5 단계, 개발 환경 |
| 2026-10-25 | v0.2 — 7절 결과 칸에 REA_01~03 링크 추가, 통합 설계 [PRD_02](PRD_02_ENGINE_DESIGN.md) 연결, Galène 행 [확인중 : 소스] 해소 |
