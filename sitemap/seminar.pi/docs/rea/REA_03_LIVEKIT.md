# REA_03: LiveKit 분석 — 목표 품질 기준(M4)

> 작성 2026-10-25 · 대상 LiveKit 서버 `livekit-server` **커밋 `095e339`**(version 1.13.10) · 상위 [PRD_01](../PRD_01_MEDIA_ENGINE.md) K-5·4절·M4 · 선정 근거 [DECISION_02](../DECISION_02_REA_TARGET.md) 6절
> 분석 방법 : 로컬 사본 소스 정독(빌드·실행 없음). REA MCP 는 이번 세션 연결 실패라 쓰지 않았다. S-2 준수 — 원본 코드 블록은 옮기지 않고 "경로:줄 · 함수명 · 동작 설명"으로만 인용한다. 경로는 모두 저장소 루트 기준이다.
> 이 문서의 수치(임계값·주기)는 **LiveKit 기본 설정값**이다. 우리 목표값이 아니라 M4 에서 우리 엔진 값을 정할 때 출발점으로 쓴다.
> **설계 결정 정본은 [PRD_02](../PRD_02_ENGINE_DESIGN.md)이다. 이 문서 6절은 분석 시점의 제안이며, PRD_02와 다르면 PRD_02를 따른다.**

## 1. 개요

| 항목 | 내용 | 근거 |
|---|---|---|
| 라이선스 | Apache-2.0. `pkg/sfu` 일부는 ion-sfu(MIT)에서 유래 — 해당 패키지에 별도 NOTICE | `LICENSE`, `NOTICE`, `pkg/sfu/NOTICE` |
| 커밋·버전 | `095e339`, `version/version.go` Version 1.13.10 | `version/version.go` |
| 언어·런타임 | Go 1.26, pion/webrtc v4.2.18 — **LiveKit 포크로 교체**(`livekit/webrtc-pion v4.2.18-warp.7`), pion/interceptor v0.1.49 | `go.mod:3`, `go.mod:35`, `go.mod:42`, `go.mod:170` |
| 외부 의존 핵심 | 패킷 저장 버킷·NACK 큐는 별도 모듈 `livekit/mediatransportutil`(`bucket`, `nack`) — **로컬 사본에 없음** | `go.mod:23`, `pkg/sfu/buffer/buffer_base.go:39-41` |
| 규모 | Go 비테스트 약 130,700줄(전체), `pkg` 약 125,500줄, `pkg/sfu` 약 40,000줄(가짜 객체 포함). 큰 파일 : `downtrack.go` 2,853 · `forwarder.go` 2,624 · `streamallocator.go` 1,474 · `buffer_base.go` 1,641 | `wc -l` 집계 |
| 구조 | `pkg/sfu`(미디어 평면 : 수신 버퍼·전달·대역폭 할당) / `pkg/rtc`(방·참가자·트랜스포트·구독 관리) / `pkg/service`(시그널링·API) / `pkg/routing`(다중 노드) | 디렉터리 |

판단 : 우리 범위(웨비나 1 → 30, 단일 노드)에 필요한 것은 `pkg/sfu` 의 약 1/3 과 `pkg/rtc` 의 일부다. 다중 노드·에이전트·데이터 트랙·E2EE·FlexFEC·SVC(AV1/VP9 의존성 기술자)는 범위 밖이다.

## 2. 핵심가치 (LiveKit 이 잘하는 것)

1. **구독자별 대역폭 할당기(StreamAllocator)** — 구독자 PeerConnection 마다 1개가 붙어, 그 구독자가 받는 모든 영상 트랙에 "우선순위 → 층(layer) 단위 공정 분배 → 남는 대역은 가장 먼 트랙부터 올림 → 모자라면 낮은 우선순위부터 일시정지(일시정지 허용 설정 시에만 — 기본 꺼짐, 5.6)"를 수행한다. 상태는 안정(STABLE)·부족(DEFICIENT) 두 가지뿐이라 단순하다. (`pkg/sfu/streamallocator/streamallocator.go:931 allocateTrack`, `:1149 allocateAllTracks`, `:1102 maybeBoostDeficientTracks`)
2. **simulcast 전환을 키프레임 경계에서만, 끊김 없이** — 목표 층(target)과 현재 층(current)을 분리하고, 목표 층의 키프레임이 도착할 때만 현재 층을 바꾼다. 바꿀 때 SSRC·순번·타임스탬프를 다시 매겨 구독자에게는 끊김 없는 하나의 스트림으로 보인다. (`pkg/sfu/videolayerselector/simulcast.go:63 Select`, `pkg/sfu/rtpmunger.go:171 UpdateAndGetSnTs`, `pkg/sfu/forwarder.go:1913 processSourceSwitch`)
3. **메모리 효율 좋은 재전송 구조** — 패킷 본문은 발행자 쪽 버퍼(층별 1개)에만 두고, 구독자 쪽(DownTrack)에는 "내가 보낸 순번 ↔ 원본 순번" 메타데이터 링(sequencer)만 둔다. 30명이 같은 패킷을 받아도 본문 사본은 1개다. (`pkg/sfu/sequencer.go:339 getExtPacketMetas`, `pkg/sfu/downtrack.go:2452 retransmitPackets`)
4. **혼잡에서 자기 강화를 막는 장치들** — PLI 를 보낸 뒤 키프레임이 올 때까지 재전송 중단, 부족 상태에서 하향 전환 중이면 높은 층 전달 즉시 중단, 혼잡 중 무의미한 재전송 필터링. (`pkg/sfu/downtrack.go:2457`, `:1200`, `pkg/sfu/forwarder.go:2336`, `:1830 FilterRTX`)
5. **브라우저 추정치(REMB) + 손실률만으로 동작하는 단순 BWE** — 기본 설정은 서버 송신 측 추정(TWCC·GCC)을 쓰지 않고, 브라우저가 보내는 REMB 추정치의 하락 추세(Kendall 순위상관)와 NACK 비율로 혼잡을 판정한다. (`pkg/config/config.go:602-607`, `pkg/sfu/bwe/remotebwe/remote_bwe.go:161`, `pkg/sfu/ccutils/trenddetector.go:255`)
6. **연결 품질 점수** — 손실·RTT·지터(단순 E-model), 기대 비트레이트 대비 실제, 원하는 층과의 거리 세 점수 중 최소값을 쓰고, 내려갈 때 빠르게·올라갈 때 느리게 평활한다. 5초마다 갱신. (`pkg/sfu/connectionquality/scorer.go:73`, `:133`, `:389`, `pkg/sfu/connectionquality/connectionstats.go:34`)

## 3. 기능 목록 (우리에게 필요한 것 위주)

| 기능 | LiveKit 위치 | 우리 필요 | 단계 |
|---|---|---|---|
| 발행자 RTP 수신·순번 확장·손실 감지 | `pkg/sfu/buffer/buffer_base.go:759 HandleIncomingPacketLocked`, `:963 updateNACKState` | 필수 | M1·M2 |
| 상류 NACK 생성(발행자에게) | `pkg/sfu/buffer/buffer.go:755 getRTCPPackets`, `:767 getNACKPacket` | 필수 | M2 |
| 패킷 캐시(층별, pps 따라 확장) | `pkg/sfu/buffer/buffer_base.go:1275 maybeGrowBucket`, 기본 영상 500·음성 200개 `pkg/config/config.go:596-598` | 필수 | M2 |
| 하류 NACK 재전송(중복 억제·최대 3회) | `pkg/sfu/sequencer.go:28-32`, `:339`, `pkg/sfu/downtrack.go:2411-2503` | 필수 | M2 |
| PLI 조절(층별 간격) | `pkg/sfu/receiver_base.go:54-65`, `:730-744`, `pkg/sfu/rtpstats/rtpstats_base_lite.go:247 CheckAndUpdatePli` | 필수 | M2 |
| 층 고정용 키프레임 요청 루프 | `pkg/sfu/downtrack.go:948 keyFrameRequester` | 필수 | M4 |
| simulcast 층 선택·전환 | `pkg/sfu/videolayerselector/simulcast.go:63` | 필수 | M4 |
| 순번·타임스탬프 재작성 | `pkg/sfu/rtpmunger.go:171`, `pkg/sfu/forwarder.go:1913` | 필수(M1 단일 층 단순판 → M4 전환판) | M1·M4 |
| VP8 픽처 ID·TL0PICIDX 재작성 | `pkg/sfu/codecmunger/vp8.go` | 필수(VP8 simulcast 시) | M4 |
| 층 활성 감지(stream tracker) | `pkg/sfu/streamtracker/streamtracker_packet.go:32-62`, `:118 CheckStatus` | 필수 | M4 |
| 층별 비트레이트 측정 | `pkg/sfu/streamtrackermanager.go:73-81`, `:640 bitrateReporter` | 필수 | M4 |
| 구독자별 대역폭 할당 | `pkg/sfu/streamallocator/streamallocator.go` | 필수(축소판) | M4 |
| REMB 기반 혼잡 판정 | `pkg/sfu/bwe/remotebwe/remote_bwe.go`, `channel_observer.go`, `nack_tracker.go` | 필수 | M4 |
| 패딩 탐침(probe) | `pkg/sfu/streamallocator/streamallocator.go:1356 maybeProbeWithPadding`, `pkg/sfu/ccutils/prober.go` | 권장(상향 복귀용) | M4 |
| 송신 측 BWE(TWCC 기반 지연 추세) | `pkg/sfu/bwe/sendsidebwe/congestion_detector.go` | 보류(기본값 꺼짐) | M4 이후 |
| 발행자 층 끄기(dynacast) | `pkg/rtc/dynacast/dynacastmanagervideo.go:158 update`, 하향 지연 5초 `pkg/config/config.go:614` | 권장(청중 0명 층 끄기) | M4 |
| 구독자 화면 크기 → 최대 층(adaptive stream) | `pkg/rtc/subscribedtrack.go:317 UpdateSubscriberSettings`(100ms 디바운스 `:40`) | 권장 | M4 |
| 다수 구독자 병렬 전달 | `pkg/sfu/utils/downtrackspreader.go:124 Broadcast`, 임계 20(일괄 IO 시 300) `pkg/rtc/mediatrack.go:277` | 30명이면 불필요(측정 후 판단) | M4 |
| 연결 품질 점수 | `pkg/sfu/connectionquality/scorer.go` | 필수(LiveKit 과 같은 식으로 비교) | M4·M5 |
| 전달 지연 통계(수신→송신) | `pkg/sfu/forwardstats.go:14`(20ms 초과 = 높음), `pkg/sfu/receiver_base.go:877 forwardRTP` | 필수(관측) | M4·M5 |

## 4. 구조·데이터 흐름

### 4.1 모듈 구성

```
pkg/service  ── 시그널링(WebSocket)·토큰·방 API
pkg/rtc
  Room ─ participants, RoomTrackManager                       (rtc/room.go)
  ParticipantImpl = TransportManager + UpTrackManager + SubscriptionManager  (rtc/participant.go:252, :310-313)
    TransportManager : 발행용 PC · 구독용 PC (PCTransport)      (rtc/transportmanager.go, rtc/transport.go)
      PCTransport(구독용) ─ StreamAllocator 1개 + BWE + Pacer   (rtc/transport.go:580-626)
    UpTrackManager → MediaTrack → WebRTCReceiver(층별 Buffer)  (rtc/mediatrack.go, sfu/receiver*.go)
    SubscriptionManager → SubscribedTrack → DownTrack           (rtc/subscriptionmanager.go, rtc/subscribedtrack.go)
pkg/sfu
  buffer/      발행자 RTP 수신·패킷 버킷·NACK 큐·PLI 조절·통계
  receiver*    층별 Buffer 를 읽어 DownTrack 들에 뿌림(forwardRTP), stream tracker
  forwarder    구독자별 층 선택·할당 함수·순번/타임스탬프 변환 파라미터
  videolayerselector/  simulcast·SVC 층 선택
  rtpmunger · codecmunger   순번·TS·코덱 헤더 재작성
  downtrack    구독자별 송신 트랙 : 쓰기·RTCP 처리·재전송·탐침·키프레임 요청
  sequencer    재전송용 메타데이터 링
  streamallocator/  구독자 PC 단위 대역폭 할당
  bwe/ (remotebwe · sendsidebwe) · ccutils/(trend·prober) · pacer/
  connectionquality/  품질 점수
```

### 4.2 패킷 한 개가 들어와서 나갈 때까지 (영상, simulcast 층 h)

1. **수신** : pion 이 SRTP 를 풀어 `Buffer` 에 넘긴다. `HandleIncomingPacketLocked`(`pkg/sfu/buffer/buffer_base.go:759`)가 16비트 순번을 64비트로 확장하고, 구멍이 생기면 손실 순번을 NACK 큐에 넣는다(`:963 updateNACKState`). 본문은 층별 버킷에 저장(`bucket.Bucket`, 외부 모듈).
2. **상류 피드백** : 버퍼가 RTCP 를 만들 때 NACK 큐에서 쌍(PID+BLP)을 꺼내 NACK 패킷과 RR 을 발행자에게 보낸다(`pkg/sfu/buffer/buffer.go:755`). 큐 알고리즘(재시도 간격·최대 횟수)은 외부 모듈 `mediatransportutil/pkg/nack` [확인중 : 해당 모듈 소스].
3. **분배** : 층마다 고루틴 1개(`pkg/sfu/receiver_base.go:877 forwardRTP`)가 버퍼를 읽어 payload type 확인 → `BroadcastRTP` 로 그 트랙의 모든 DownTrack 에 쓴다. 구독자가 임계(기본 20)보다 많으면 병렬 실행. 같은 루프에서 stream tracker 에 관측을 넣고 전달 지연을 잰다.
4. **구독자별 선택** : `DownTrack.WriteRTP`(`pkg/sfu/downtrack.go:1038`) → `Forwarder.GetTranslationParams`(`pkg/sfu/forwarder.go:1860`) → 영상이면 `getTranslationParamsVideo`(`:2244`). 목표 층이 없으면(할당기가 일시정지) 버림. `Simulcast.Select`(`pkg/sfu/videolayerselector/simulcast.go:63`)가 "이 패킷의 층 == 현재 층"인지 판정하고, 목표 층 키프레임이면 현재 층을 바꾼다.
5. **변환** : 현재 층 패킷이면 `RTPMunger.UpdateAndGetSnTs`(`pkg/sfu/rtpmunger.go:171`)가 연속 순번·타임스탬프로 바꾼다. 층이 바뀌는 순간에는 `processSourceSwitch`(`pkg/sfu/forwarder.go:1913`)가 발신자 보고(SR)의 NTP 시각으로 두 층의 타임스탬프를 맞춰 오프셋을 다시 잡는다(`:1979` 이하 설명 주석).
6. **송신** : 새 RTP 헤더(구독자용 SSRC)를 만들고 sequencer 에 메타데이터를 넣은 뒤 pacer 큐에 넣는다(`pkg/sfu/downtrack.go:1170` sequencer.push, `:1197` pacer 투입). 키프레임이면 "PLI 후 재전송 중단" 표시를 푼다(`:1200`). 층 전환 중이면 키프레임 요청 루프를 깨운다(`:1213` `postKeyFrameRequestEvent`).
7. **하류 피드백** : 구독자 RTCP 는 `handleRTCP`(`pkg/sfu/downtrack.go:2068`)에서 처리 — PLI/FIR → 현재 층 발행자에게 PLI(조절됨), NACK → 재전송 작업자, REMB/TWCC → StreamAllocator, RR → RTT·지터·손실 통계.
8. **재전송** : 작업자(`:2434 retransmitWorker`)가 NACK 순번을 모아 sequencer 에서 원본 순번을 찾고(`pkg/sfu/sequencer.go:339`), 발행자 버퍼에서 본문을 읽어(`ReadRTP`) RTX 또는 원 SSRC 로 다시 보낸다(`pkg/sfu/downtrack.go:2270 retransmitPacket`).

## 5. 핵심 메커니즘 상세

### 5.1 pion 사용 범위 (S-1 대조)

- LiveKit 도 pion 기본 인터셉터 묶음(`RegisterDefaultInterceptors`)을 쓰지 않는다. 빈 레지스트리를 만들고(`pkg/rtc/transport.go:462`) 필요한 것만 넣는다 : RTT 측정용 XR, simulcast 미처리 트랙 보조, 송신 측 BWE 인터셉터(설정 시만). **NACK 생성·재전송·PLI 는 전부 자체 코드**(Buffer·DownTrack)다. → 우리 S-1 방침과 같은 방향이며, 같은 구조가 상용 규모에서 동작한다는 근거가 된다.
- SRTP 재전송 방지(replay protection)를 끈다(SRTCP 도 대칭으로). 주석의 사유는 "Pion 이 RTX 스트림을 지원하지 않아, Firefox 가 오래된 패킷으로 대역 탐침을 하면 (RTX 가 아닌 원 스트림으로 와서) replay 차단에 걸려 탐침 실패·Pion 읽기 버퍼 고갈이 생긴다"이다(`pkg/rtc/transport.go:396-412` 설명 주석, `DisableSRTPReplayProtection`). 우리는 RTX 를 협상해 쓰면 해당 없을 것으로 보나, 공식 pion v4 의 RTX 수신 지원 범위는 [확인중 : M2 시험].
- 코덱별 RTCP 피드백을 직접 등록한다. 구독 PC 기본값 = NACK·PLI·FIR + **abs-send-time + goog-remb**(TWCC 끈 경우) (`pkg/rtc/config.go:197-224 getSubscriberConfig`). 발행 PC 는 기본 TWCC·FIR·NACK·PLI(`:180-188`)이고, REMB·abs-send-time 은 `consolidated` 모드일 때만 추가된다(`:146-156`, `getPublisherConfig`).

### 5.2 패킷 캐시와 상류 NACK

- 층(SSRC)마다 버킷 1개. 초기 용량에서 시작해 1초마다 실제 pps 를 보고 상한(영상 500·음성 200)까지 늘린다. 늘리는 작업은 전달 경로 밖 고루틴에서 한다(`pkg/sfu/buffer/buffer_base.go:1275-1319`, 상한 `pkg/config/config.go:596-598`).
- 도착 순번으로 "손실 구간 [시작, 끝)"을 계산해 NACK 큐에 넣고, 늦게 도착한 순번은 큐에서 지운다(`:963`). FEC 로 복구된 패킷이 NACK 되지 않도록 RTCP 생성 순서를 맞춘다(`pkg/sfu/buffer/buffer.go:722-742` 설명).

### 5.3 하류 NACK 재전송

- sequencer 크기 = 패킷 캐시 크기(영상 500)와 같다(`pkg/rtc/subscribedtrack.go:108-115`, `pkg/sfu/downtrack.go:598`).
- 같은 패킷 재요청 억제 : 마지막 재전송 후 `min(100ms, 2×RTT)` 안이면 무시, 패킷당 최대 3회(`pkg/sfu/sequencer.go:28-32`, `:339` 이하). RTT 는 RR 에서 갱신(`pkg/sfu/downtrack.go:2209-2215`).
- NACK 폭주 상한 : 대기 NACK 5,000개 넘으면 오래된 것부터 버림(`pkg/sfu/downtrack.go:68-69`, `:2411`).
- **PLI 후 재전송 중단** : 구독자가 PLI 를 보내면(이미 화면이 깨졌다는 뜻) 키프레임이 나갈 때까지 재전송을 멈춘다(`FlagStopRTXOnPLI`, `:62`, `:2457`, 해제 `:1200`).
- 혼잡 시 재전송 필터 : 목표 층이 현재보다 낮을 때 등 쓸모없는 재전송을 거른다(`pkg/sfu/forwarder.go:1830 FilterRTX` 설명 주석).
- RTX : 협상되면 RTX SSRC·PT 로, 앞 2바이트에 원 순번(OSN)을 넣어 보낸다(`pkg/sfu/downtrack.go:2298-2306` 이하).

### 5.4 PLI 조절과 키프레임 요청

- 발행자 쪽 PLI 는 층별 최소 간격으로 조절 : 낮은 층 500ms, 중간·높은 층 1초(`pkg/sfu/receiver_base.go:61-65`, 적용 `:730-744`, 판정 `pkg/sfu/rtpstats/rtpstats_base_lite.go:247`).
- 구독자 여럿이 동시에 PLI 를 보내도 한 RTCP 묶음에서는 1회(`pkg/sfu/downtrack.go:2075-2088 sendPliOnce`), 발행자 쪽은 위 간격으로 합쳐진다.
- 층 고정 대기 루프 : 목표 층에 아직 못 붙었으면 `clamp(2×RTT, 200ms, 1000ms)` 마다 PLI 를 다시 보낸다. 붙고 나면 잠든다(`pkg/sfu/downtrack.go:948-998`, 상수 `:64-65`).
- 첫 층 획득 유예 1초 : 구독 직후에는 요청한 층(예: h)이 보일 때까지 최대 1초 기다려, l → h 로 올라가는 화질 계단을 피한다(`pkg/sfu/forwarder.go:56-63`, `simulcast.go:95-110` 의 "acquiring target layer" 분기). **단 이 동작은 `EnableStartAtDesiredQuality` 가 켜진 구독에서만 작동한다**(`pkg/sfu/forwarder.go:336`, `pkg/rtc/participant.go:245`). 이 커밋 서버 코드 안에서는 이 값을 켜는 곳을 찾지 못했다(기본 꺼짐으로 보임) [확인중 : 소스 — 참가자 생성 경로·외부 설정].

### 5.5 simulcast 층 선택·전환

- 층은 (spatial, temporal) 쌍. simulcast 는 spatial = rid(l·m·h → 0·1·2).
- 전환 규칙(`pkg/sfu/videolayerselector/simulcast.go:63`) : 현재 ≠ 목표이면, **키프레임** 패킷 중 "현재보다 높고 목표 이하"(상향) 또는 "현재보다 낮고 목표 이상"(하향)인 층으로만 바꾼다. 키프레임이 아닌 패킷으로는 절대 바꾸지 않는다.
- 하향 즉시 차단 : 부족(DEFICIENT) 상태에서 목표가 현재보다 낮으면, 낮은 층 키프레임이 올 때까지 높은 층 전달을 즉시 멈춘다(화면은 잠시 정지, 대역은 바로 확보). 구독자 요청으로 내리는 경우는 계속 보낸다(`pkg/sfu/forwarder.go:2336` 설명 주석).
- 타임스탬프 연속성 : 전환 시 세 값(마지막 송신 TS, SR 기준 TS, 경과시간 기준 기대 TS)을 비교해 새 오프셋을 정한다. 기준 층 SR 이 아직 없으면 전환을 미룬다(`pkg/sfu/forwarder.go:1979-2090` 설명 주석). → 우리도 **층별 SR 수신**이 전환의 전제 조건이다.
- 층 활성 판정 : 500ms 주기로 패킷 수를 세어, 주기당 최소 패킷 수(층 0 은 1개, 층 1·2 는 5개)를 채운 주기가 층 0 은 4주기(2초)·층 1·2 는 20주기(10초) 연속이어야 "활성", 최소 수에 못 미친 주기가 1번이라도 나오면 "정지"(`pkg/sfu/streamtracker/streamtracker_packet.go:32-44`, `:118-139`). 높은 층은 늦게 활성으로 올려 깜박임을 막는다. 층별 비트레이트는 1초마다 보고(`pkg/sfu/streamtrackermanager.go:73-81`).

### 5.6 대역폭 할당 (StreamAllocator)

- **단위** : 구독자 PC 1개에 할당기 1개(`pkg/rtc/transport.go:616`). 웨비나 청중 1명이 받는 영상 트랙은 1~3개(발표자·패널)라 할당 문제 크기가 작다.
- **우선순위** : 기본 영상 1, 화면공유 255(`streamallocator.go:43-46`). 정렬기 3종(`pkg/sfu/streamallocator/track.go:217`, `:245`, `:269`) — 층 단위 분배는 높은 우선순위 먼저, 올림(boost)은 높은 우선순위·목표에서 먼 트랙 먼저, 대역 회수는 낮은 우선순위·목표에 가까운 트랙 먼저.
- **전체 재할당**(`:1149`) : 관리 대상 아닌 트랙(오디오 등)에 먼저 최적 할당 → 남은 대역으로 (0,0) 층부터 한 층씩 올리며 모든 트랙에 차례로 기회를 준다(공정 분배, "최대한 많은 트랙을 끊지 않고"). 대역 0 이면 일시정지 허용 시 모두 정지.
- **단일 트랙 변경**(`:931`) : 안정 상태면 그냥 최적 할당. 부족 상태면 ① 협조적 전환(줄 수 있으면 줄이고 남는 대역으로 다른 트랙 올림) ② 남은 여유로 가능한 가장 높은 층 ③ 그래도 모자라면 다른 트랙에게서 회수, 실패 시 일시정지.
- **상태** : 트랙 하나라도 목표 미달이면 DEFICIENT, 아니면 STABLE(`:920 adjustState`). STABLE 진입 시 탐침 중지·BWE 초기화, 핑 주기 15초 / DEFICIENT 는 100ms(`:899`, 상수 `:55-58`).
- **일시정지** 허용은 기본 꺼짐(`pkg/config/config.go:603`) — 끄면 최소 층은 항상 보낸다. 웨비나 청중은 "영상 끊김보다 저화질"이 낫다 → 우리도 기본 끔, 음성은 할당 대상 아님.
- 기대 사용량 = 각 트랙의 현재 할당 층 비트레이트 합(`:1279`), 여유 = 확정 용량 − 기대 사용량(`:1300`).

### 5.7 혼잡 판정 (기본 = REMB 기반 remotebwe)

- 기본 설정 : 혼잡 제어 켜짐, 송신 측 BWE·TWCC 인터셉터 꺼짐(`pkg/config/config.go:602-607`) → 구독자 브라우저가 보내는 **REMB** 가 입력.
- REMB 는 PC 단위 값인데 트랙마다 같은 패킷이 올라오므로, 추적할 SSRC 하나에만 반응한다(`streamallocator.go:390-471` 설명 주석).
- 판정(`pkg/sfu/bwe/remotebwe/channel_observer.go:170 GetTrend`) : 추정치 하락 추세 → 혼잡(사유 estimate), 또는 NACK 비율이 임계 초과 → 혼잡(사유 loss), 상승 추세 → 해소.
  - 추세 = 최근 추정치 표본의 Kendall 순위상관(`pkg/sfu/ccutils/trenddetector.go:255`). 평시 12개(최소 8) 표본·임계 −0.6, 탐침 중 3개·임계 0(`channel_observer.go:81-107`). 같은 값 반복은 500ms 붕괴 창으로 정리(`trenddetector.go:128-139` 설명).
  - NACK 비율 창 : 평시 2~3초·임계 8%, 탐침 중 0.5~1초·임계 4%(`pkg/sfu/bwe/remotebwe/nack_tracker.go:34-44`).
- 용량 확정(`remote_bwe.go:197`) : 손실 사유면 `기대사용량 × (1 − 0.4 × NACK비율)`, 아니면 마지막 REMB. 단 REMB 보다 크지 않게, 기대 사용량의 95% 이하이고 기존 확정값과 다를 때만 확정(`:40-46`) — 작은 흔들림에 재할당하지 않음.
- 혼잡 통지 → 할당기가 확정 용량으로 전체 재할당(`streamallocator.go:856-897`).

### 5.8 회복 (탐침)

- DEFICIENT 상태에서 탐침 조건이 맞으면, 목표에서 가장 먼 트랙의 "다음 한 단계" 비트레이트 증가분 × 120%(최소 200kbps)만큼 탐침 바이트를 추가로 보내 본다(`streamallocator.go:1356`, 기본값 `:201-212`). 모드 이름은 "padding"이지만 실제 탐침 패킷은 **RTX 가 협상돼 있으면 최근 보낸 패킷의 RTX 재전송**, RTX 가 없거나 최근 패킷이 버퍼에서 사라졌으면 RTP 패딩 패킷이다(`pkg/sfu/streamallocator/track.go:137` 이 `usePadding=false` 로 호출, `pkg/sfu/downtrack.go:2505 WriteProbePackets`). 탐침 바이트는 가장 먼 트랙 한 개가 아니라 할당기의 영상 트랙들을 차례로 돌며 목표 바이트를 채운다(`streamallocator.go:799 handleSignalSendProbe`). abs-send-time 또는 TWCC 확장과 RR 수신이 있어야 보낸다.
- 탐침 결과가 혼잡이 아니면 용량을 올리고 부족 트랙을 올린다(`:725` 이하 `handleSignalPeriodicPing`).
- 탐침 간격 : 기본 3초, 실패 시 1.5배씩 최대 2분, 탐침 길이 0.2~20초(`pkg/sfu/ccutils/probe_regulator.go:37-45`). 정착 대기 = RTT×5(250ms~5초)(`pkg/sfu/bwe/remotebwe/probe_controller.go:61-67`).
- 대안 모드 "media" : 패딩 대신 실제로 한 단계 올려 보는 방식(`:1339`). 기본은 padding.

### 5.9 발행자 쪽 최적화 (dynacast)

- 모든 구독자의 최대 요청 화질을 모아 발행자에게 "이 층 위는 보내지 마"를 시그널로 알린다. 하향은 5초 디바운스, 상향은 즉시(`pkg/rtc/dynacast/dynacastmanagervideo.go:158-240`, `pkg/config/config.go:614`). → 청중이 모두 저화질이거나 0명이면 발표자 업링크·CPU 절약. 실제 층 끄기는 클라이언트 SDK 가 `RTCRtpSender.setParameters` 의 encodings active 로 한다 [확인중 : client-sdk-js 소스 — 서버 저장소 밖].

### 5.10 연결 품질 점수

- 창 통계(패킷·손실·순서 뒤바뀜·바이트·최대 RTT·최대 지터)로 5초마다 갱신(`pkg/sfu/connectionquality/connectionstats.go:34`).
- 패킷 점수 = 100 − 지연 효과 − 손실 효과. 지연 효과 = (RTT/2 + 지터×2)/40, 160ms 넘으면 (값−120)/10. 손실 효과 = 실제 손실%(순서 뒤바뀜·상류 손실 제외) × 가중치(영상 10, Opus 8, RED 4, FEC 시 ÷1.5)(`scorer.go:73-131`, `connectionstats.go:405-430`).
- 비트레이트 점수 = 100 − 20×ln(기대 비트/실제 비트)(`scorer.go:133-154`), 층 점수 = 100 − 35×(원하는 층까지 거리)(`scorer.go:39`, `:428`).
- 최종 = 세 점수 최소값을 평활(하락 0.8·상승 0.4 가중), 하한 30(가중 `scorer.go:36-37`, 하한 `:34`, 적용 `:441-455`). 등급 : >80 EXCELLENT, >40 GOOD, >20 POOR, 그 이하 LOST(`:49-55`, `:618`). MOS 변환식 `:644`.
- 일시정지(혼잡)면 즉시 최저, 음소거·막 해제 직후는 갱신 보류(`:400-413` 설명).

### 5.11 대규모 구독 최적화

- 본문 1벌 + 구독자별 메타데이터(5.3), 패킷·헤더 객체 풀(`pkg/sfu/downtrack.go:1064`, `:1087`) — GC 압력 감소.
- 층별 전달 고루틴 1개가 모든 구독자에게 쓰고, 구독자 20명 초과 시 병렬 분할(`pkg/rtc/mediatrack.go:277-287` 설명 : 직렬이면 구독자당 약 26µs, 일괄 IO 면 약 3.3µs). 30명 × 26µs ≈ 0.8ms/패킷 → 우리 규모는 직렬로도 감당 가능, 측정 후 판단.
- 전달 지연 감시 : 수신 → 송신 큐 투입까지 20ms 넘으면 "높음"(`pkg/sfu/forwardstats.go:14`, `receiver_base.go` 의 forwardStats.Update).
- 구독 설정 변경 100ms 디바운스(`pkg/rtc/subscribedtrack.go:40`), 할당기 이벤트는 큐 1개로 직렬 처리(`streamallocator.go:643 postEvent`) — 잠금 경합 회피.

## 6. seminar.pi 설계 반영안

전제 : S-1 — pion 은 ICE·DTLS·SRTP·RTP/RTCP 직렬화만. 아래 "우리가 짠다" 항목은 전부 직접 작성이며 LiveKit 코드를 옮기지 않는다(S-2). 수치는 LiveKit 기본값을 **초기값**으로 두고 M4 측정으로 조정한다.

### 6.1 모듈별 반영안

| 우리 모듈 | LiveKit 대응 | 무엇을 · 어떻게 (우리가 짤 부분) | 단계 |
|---|---|---|---|
| signal | `pkg/service`, `rtc/participant_signal.go` | 구독자 → 서버 : `setLayer{track, maxSpatial}`(화면 크기 기반), 서버 → 클라이언트 : `streamState{track, active/paused}`, 서버 → 발행자 : `publishLayers{rid: on/off}`(dynacast). 메시지 디바운스 100ms | M3 정의 · M4 사용 |
| room | `rtc/room.go`, `RoomTrackManager` | 방 = Router. 트랙 등록 시 우선순위 부여(발표자 영상 > 패널 영상, 화면공유 최상). 청중은 구독만 | M3 |
| transport | `rtc/transport.go` | 구독 PC 협상 시 영상 피드백 = NACK·PLI·FIR·goog-remb + abs-send-time 확장 등록. 송신 RTP 에 abs-send-time(24비트 6.18 고정소수) 기록은 우리 코드 | M4 |
| producer | `sfu/receiver_base.go`, `buffer/` | 층별 수신 버퍼 : 순번 64비트 확장, 손실 구간 계산, 층별 SR 보관(전환 TS 기준), 층 활성 감지(500ms 주기 카운터 · 층0 2초 / 상위층 10초 활성), 층별 비트레이트 1초 측정 | M1(확장·SR) · M4(활성·비트레이트) |
| consumer | `sfu/downtrack.go`, `forwarder.go` | 구독자별 상태 : current/target/max 층, 첫 층 획득 유예 1초, 하향 시 즉시 차단(부족 상태 한정), 출력 SSRC 고정 | M1(단일 층) · M4(전환) |
| forward | `rtpmunger.go`, `codecmunger/vp8.go`, `processSourceSwitch` | 순번 오프셋·TS 오프셋 재계산(키프레임 경계, SR NTP 로 층간 TS 정렬, SR 없으면 전환 보류), VP8 picture ID·TL0PICIDX 연속화, 버린 패킷 순번 메우기 | M1(오프셋 단순판) · M4(전환판) |
| nack | `buffer_base.go`, `sequencer.go`, `downtrack.go` 재전송부 | 상류 : 손실 구간 → NACK 큐(재시도 간격·최대 횟수는 우리 값 — LiveKit 값은 외부 모듈이라 [확인중 : mediatransportutil]) / 하류 : 구독자별 메타 링(크기 = 캐시 크기), `min(100ms, 2×RTT)` 중복 억제, 최대 3회, 대기 상한, **PLI 후 키프레임까지 재전송 중단**, 부족 상태 재전송 필터 | M2(기본) · M4(필터·중단) |
| pli | `receiver_base.go:54-65`, `downtrack.go:948` | 발행자별·층별 최소 간격(초기값 l 500ms · m/h 1초), 구독자 RTCP 묶음당 1회, 층 고정 대기 루프 `clamp(2×RTT, 200ms, 1s)` | M2(간격) · M4(대기 루프) |
| bwe | `bwe/remotebwe`, `ccutils/trenddetector`, `ccutils/prober` | REMB 수집(추적 SSRC 1개) + NACK 비율 창 → 혼잡/해소 판정(순위상관 추세), 용량 확정 규칙(95% 문턱, 손실 감쇠 0.4), 패딩 탐침(증가분 120%, 최소 200kbps, 3초~2분 백오프) | M4 |
| (alloc — consumer 하위 또는 bwe 하위) | `streamallocator/` | 구독자 PC 당 1개. STABLE/DEFICIENT 두 상태, 층 단위 공정 분배, 최원거리 트랙부터 올림, 일시정지 기본 끔. 이벤트 큐 1개로 직렬 처리 | M4 |
| record | (egress 는 별도 서비스) | 녹화기 = 구독 클라이언트 1명으로 취급(최고 층 고정, 할당기 제외 트랙) | M5 |
| metrics | `connectionquality/`, `forwardstats.go`, `rtpstats/` | 품질 점수(5.10 식 그대로 구현 — LiveKit 과 같은 식이어야 비교 가능), 전달 지연 분위수, 구독자별 NACK·PLI·재전송·층 전환 횟수 | M4(비교용) · M5(schema.pi) |

### 6.2 우리 인터페이스 초안 (Go, 우리 설계 — LiveKit 코드 아님)

```go
// 층 : simulcast rid l/m/h → 0/1/2, temporal 은 M4 에서 VP8 만
type Layer struct{ Spatial, Temporal int8 }

// producer 가 제공 — 층별 상태와 비트레이트
type LayerSource interface {
    ActiveLayers() []int8
    Bitrates() [3][4]int64          // [spatial][temporal] bps, 0 = 미측정/정지
    RequestKeyFrame(spatial int8)   // pli 모듈 조절 통과 시에만 실제 전송
    ReadPacket(spatial int8, extSeq uint64, dst []byte) (int, error) // 재전송용
}

// consumer 1개 = 구독자 1명 × 트랙 1개
type Consumer interface {
    WriteRTP(p *InPacket, spatial int8)      // forward 경로, 할당 결과에 따라 선택·변환
    HandleRTCP(pkts []rtcp.Packet)           // NACK·PLI·REMB·RR 분배
    Allocation() Allocation                  // 현재·목표·최대 층, 요청 비트레이트
    SetTarget(l Layer, paused bool)          // allocator 만 호출
}

// 구독자 PC 1개에 1개
type Allocator interface {
    OnEstimate(bps int64)                    // REMB
    OnNackStats(sent, repeated uint32)
    OnTrackChanged(c Consumer)               // 층 활성·비트레이트·구독 설정 변경
    State() AllocState                       // Stable | Deficient
}
```

### 6.3 단계별 작업 순서

- **M1** : producer 순번 확장·SR 보관, consumer 단일 층(l 고정 또는 h 고정) 오프셋 변환. 할당·BWE 없음.
- **M2** : nack(상하류)·pli 간격. 이 문서 5.3 의 억제 규칙 3개(중복 억제·최대 횟수·대기 상한)는 M2 에 넣는다 — 30명 NACK 폭주 방지에 필요.
- **M3** : 모듈 경계 확정, 6.2 인터페이스를 mediasoup 개념명(Producer·Consumer)과 맞춤. 시그널링에 `setLayer`·`streamState` 메시지 자리 확보.
- **M4** : ① 층 활성 감지·비트레이트 → ② simulcast 전환(키프레임 경계·TS 정렬·VP8 재작성) → ③ allocator(우선 REMB 만) → ④ NACK 비율 혼잡 → ⑤ 패딩 탐침 → ⑥ dynacast·adaptive stream → ⑦ 품질 점수. 각 단계 끝에 6.4 시나리오 중 해당 항목 측정.
- **M5** : metrics 를 schema.pi 모니터링으로, 녹화 구독자.

### 6.4 M4 비교 측정 — 지표·시나리오·목표

**측정 지표** (같은 VM 사양·같은 망 조건·같은 클라이언트에서 LiveKit 공식 배포판과 우리 엔진을 번갈아 측정)

| # | 지표 | 측정 방법 | 출처 |
|---|---|---|---|
| Q1 | 첫 화면 시간 | 입장 클릭 → 첫 프레임 표시(`requestVideoFrameCallback` 또는 `getStats` framesDecoded>0 시각) | 클라이언트 |
| Q2 | 화면 지연(glass-to-glass) | 발표자 화면에 ms 시계 표시 → 시청자 화면 촬영·비교, 또는 abs-capture-time 기반 | 클라이언트 |
| Q3 | 손실 회복 시간 | 손실 주입 후 정지(freeze) 시작 → 해소, `getStats` freezeCount·totalFreezesDuration [확인중 : WKWebView 지원] | 클라이언트 |
| Q4 | 화질 하향 반응 | 대역 제한 시작 → 낮은 층 첫 프레임 | 서버 로그(층 전환 시각) + 클라이언트 frameWidth |
| Q5 | 화질 상향 복귀 | 제한 해제 → 원래 층 복귀 | 서버 로그 |
| Q6 | 정지 비율 | 총 정지 시간 / 시청 시간 | 클라이언트 |
| Q7 | NACK·재전송 | 구독자별 NACK 수, 재전송 수, 중복 NACK 수, 캐시 미스 | 서버 |
| Q8 | PLI·키프레임 | 발행자에게 간 PLI 수/분, 키프레임 수/분 | 서버 |
| Q9 | 전달 지연 | 수신 → 송신 투입 p50·p99(20ms 초과 비율) | 서버 |
| Q10 | 품질 점수 | 5.10 식(양쪽 같은 식) 평균·최저 | 서버 |
| Q11 | 서버 자원 | CPU%, RSS, 송신 Mbps, 고루틴 수 | VM |

**시험 시나리오** (`tc netem`/`tbf`, 기본 발표자 simulcast 3층 l/m/h)

| # | 시나리오 | 조건 | 주 지표 |
|---|---|---|---|
| T1 | 기준 | 발표자 1 + 청중 30, 손실 0, 지연 20ms | Q1·Q2·Q9·Q11 |
| T2 | 균일 손실 | 청중 1명 하류 3% | Q3·Q6·Q7 |
| T3 | 버스트 손실 | 청중 1명 10% 5초간 | Q3·Q7·Q8 |
| T4 | 대역 하락 | 청중 1명 하류 2Mbps → 400kbps | Q4·Q6·Q10 |
| T5 | 대역 회복 | T4 이후 제한 해제 | Q5 |
| T6 | 고지연·지터 | 하류 150ms ± 30ms | Q2·Q7 |
| T7 | 발행자 상류 손실 | 발표자 상류 3% | Q3·Q8(30명 PLI 합치기) |
| T8 | 동시 입장 | 30명 10초 안에 입장 | Q1·Q8·Q11 |
| T9 | Pi Browser 실기기 | iOS·Android 각 1대를 청중에 포함해 T1·T4 | Q1·Q4 [확인중 : REMB 송신 여부] |

- 청중 30명 생성 : 실브라우저 30개는 VM 1대로 어려우므로 pion 기반 Go 합성 구독자(클라이언트 측 pion 은 S-1 범위 밖 문제 아님 — 측정 도구) + 실브라우저 수 대 혼합 [TBD : M4 착수 시 도구 결정].
- LiveKit 측 : 공식 릴리스 바이너리 사용(로컬 다운로드 사본 빌드 금지 원칙 유지) [확인중 : 마스터 — 시험 VM 에 LiveKit 설치 승인].

**목표 품질 기준(초안)** — PRD_01 4절을 구체화. 최종값은 M4 첫 측정 후 마스터 확정.

| 지표 | 목표 초안 | 근거(LiveKit 기본 동작) |
|---|---|---|
| Q1 첫 화면 | LiveKit 대비 1.5배 이내 | 첫 층 획득 유예 1초(단 기본 꺼짐으로 보임, 5.4 [확인중 : 소스]) |
| Q2 지연 | LiveKit 대비 +100ms 이내 | — |
| Q3 3% 손실 회복 | 1초 이내, 정지 비율 1% 미만 [TBD] | 재전송 억제 `min(100ms,2RTT)`, PLI 간격 0.5~1초 |
| Q4 하향 반응 | LiveKit 대비 +2초 이내 [TBD] | REMB 추세 판정 8~12 표본(REMB 주기에 의존 [확인중 : M4 실측]) + 키프레임 대기 |
| Q5 상향 복귀 | 30초 이내 [TBD] | 탐침 3초 시작·백오프, 상위 층 활성 판정 10초 |
| Q8 PLI | 발행자 기준 층당 1초 1회 이하 | PLI 간격 설정 |
| Q9 전달 지연 | p99 20ms 미만 | forwardstats 기준 |
| Q11 자원 | VM 1대(2 vCPU [TBD]) CPU 50% 미만 | — |

## 7. 채택하지 않을 것과 이유

| 항목 | 위치 | 이유 |
|---|---|---|
| pion 포크(webrtc-pion warp) | `go.mod:170` | 우리는 공식 pion v4 사용(S-1 검증 라이브러리 원칙). 포크 기능(SCTP 확장 등)은 불필요 |
| 송신 측 BWE(TWCC·JitterPath 지연 추세) | `pkg/sfu/bwe/sendsidebwe/` | LiveKit 기본값도 꺼짐. 복잡도 큼. REMB 로 M4 목표 미달일 때 재검토 |
| pacer(leaky bucket 등) | `pkg/sfu/pacer/` | 기본(REMB 경로)은 pass-through, 송신 측 BWE 때만 no-queue 기본(`pkg/rtc/transport.go:580-611`). 30명 규모에서는 직접 쓰기로 충분 [확인중 : M4 측정] |
| SVC(VP9/AV1)·의존성 기술자(DD) | `videolayerselector/dependencydescriptor.go`, `rtpextension/dependencydescriptor/` | Pi Browser(WKWebView) 코덱 지원 불확실, simulcast(VP8/H.264)로 충분 |
| FlexFEC·RED | `pkg/sfu/flexfec/`, `redreceiver.go` | 1차 범위 밖. 음성 품질 문제 생기면 RED 만 재검토 |
| 다중 노드 라우팅·노드 간 중계 | `pkg/routing/` | 단일 VM 범위 |
| 에이전트·데이터 트랙·데이터 블롭 | `pkg/agent/`, `rtc/datatrack*.go` | 웨비나 기능 아님(채팅은 화면 서버 쪽) |
| 참가자 마이그레이션·상태 시드 | `forwarder.go:531 GetState/SeedState` | 재접속은 새 구독으로 처리 |
| 일시정지 기본 켜기 | `config.go:603` | 청중에게는 저화질 유지가 정지보다 낫다(기본 끔 유지) |
| 단일 PC 모드·one-shot 시그널링 | `rtc/transportmanager.go:164` | M3 에서 mediasoup 식 Transport 경계로 결정 |
| SRTP 재전송 방지 끄기 | `transport.go:396-412` | RTX 를 직접 쓰면 불필요, 보안 기본값 유지 [확인중 : M2] |

## 8. 위험·주의

| 위험 | 내용 | 대응 |
|---|---|---|
| 라이선스 | Apache-2.0(+ `pkg/sfu` 일부 MIT). 코드 이식 시 NOTICE·변경 고지 의무 발생 | S-2 : 코드 이식 없음. 이 문서도 설명·경로 인용만. 상수값(공개 설정 기본값) 참고는 아이디어 차원 |
| 외부 모듈 미확인 | NACK 큐·패킷 버킷 알고리즘은 `mediatransportutil`(로컬 사본 없음) | 우리 값은 M2 에서 netem 실측으로 정함 [확인중 : 해당 모듈] |
| 복잡도 | forwarder·downtrack·streamallocator 합 7,000줄 가까움 | 6.3 순서대로 작은 단위로, 단계마다 T 시나리오 측정 후 다음으로 |
| REMB 의존 | 기본 BWE 가 브라우저 REMB 에 의존. iOS WKWebView·Android WebView(Pi Browser)가 abs-send-time + goog-remb 협상 시 REMB 를 보내는지 미검증 | M4 첫 작업으로 실기기에서 RTCP 수신 로그 확인 [확인중 : Pi Browser 실기기]. 안 오면 NACK 비율·RR 손실만으로 판정하는 대체 경로 |
| Pi Browser 코덱·simulcast | WKWebView 의 VP8 simulcast·H.264 simulcast 지원 여부 | M0·M4 실기기 확인 [확인중 : 실기기]. 발행은 PC/일반 브라우저 발표자로 한정하는 안도 검토 [TBD : 마스터] |
| 층 전환 TS 정렬 | 층별 SR 이 없으면 전환이 지연(5.5) | 발행자 SR 주기 확인, SR 없을 때 경과시간 기준 대체 규칙을 우리 설계에 포함 |
| 측정 공정성 | LiveKit 은 자사 클라이언트 SDK(적응형 스트림·dynacast 신호)와 함께 동작 — 순수 브라우저 API 클라이언트와 조건이 다를 수 있음 | 양쪽 모두 같은 측정 페이지(브라우저 표준 API + 각 엔진 최소 시그널링)로 맞추고, 차이는 문서화 [TBD] |
| 운영 | LiveKit 비교용 서버를 같은 VM 에서 돌릴 때 포트·자원 간섭 | 측정은 번갈아 단독 실행 |

## 9. 근거 파일 목록 (커밋 `095e339`)

| 파일 | 본 내용 |
|---|---|
| `go.mod` | Go·pion 버전, pion 포크 교체, mediatransportutil |
| `LICENSE`, `NOTICE`, `pkg/sfu/NOTICE` | Apache-2.0, ion-sfu(MIT) 유래 |
| `pkg/config/config.go` | 버퍼 크기·PLI 조절·혼잡 제어 기본값(596-614) |
| `pkg/rtc/config.go` | 발행·구독 PC 의 RTP 확장·RTCP 피드백(146-224) |
| `pkg/rtc/transport.go` | 인터셉터 레지스트리(462), BWE·pacer·할당기 생성(580-626), SRTP 재전송 방지(396-412) |
| `pkg/rtc/participant.go`, `room.go`, `subscriptionmanager.go`, `subscribedtrack.go`, `mediatrack.go`, `mediatracksubscriptions.go` | 방·참가자·구독 구조, 구독 설정 디바운스, 병렬 임계 |
| `pkg/rtc/dynacast/dynacastmanagervideo.go` | 발행자 층 끄기·하향 디바운스 |
| `pkg/sfu/buffer/buffer_base.go`, `buffer.go` | 수신·손실·NACK 큐·버킷 확장·PLI·RTCP 생성 |
| `pkg/sfu/receiver_base.go`, `receiver.go` | 층별 전달 루프, PLI 간격, 분배 |
| `pkg/sfu/utils/downtrackspreader.go` | 다수 구독자 병렬 분배 |
| `pkg/sfu/downtrack.go` | 쓰기·RTCP 처리·재전송·탐침·키프레임 요청 |
| `pkg/sfu/sequencer.go` | 재전송 메타데이터 링·중복 억제 |
| `pkg/sfu/forwarder.go` | 할당 함수·층 전환·TS 정렬·RTX 필터 |
| `pkg/sfu/rtpmunger.go`, `codecmunger/vp8.go` | 순번·TS·VP8 헤더 재작성 |
| `pkg/sfu/videolayerselector/simulcast.go` | simulcast 층 선택 |
| `pkg/sfu/streamtracker/streamtracker_packet.go`, `streamtracker.go`, `pkg/sfu/streamtrackermanager.go` | 층 활성 감지·비트레이트 보고 |
| `pkg/sfu/streamallocator/streamallocator.go`, `track.go`, `streamstateupdate.go` | 대역폭 할당·우선순위·정렬·일시정지 |
| `pkg/sfu/bwe/bwe.go`, `bwe/remotebwe/remote_bwe.go`, `channel_observer.go`, `nack_tracker.go`, `probe_controller.go` | REMB 기반 혼잡 판정·탐침 제어 |
| `pkg/sfu/bwe/sendsidebwe/congestion_detector.go`, `send_side_bwe.go` | 송신 측 BWE(미채택, 개념만) |
| `pkg/sfu/ccutils/trenddetector.go`, `prober.go`, `probe_regulator.go` | 추세 판정·탐침 간격 |
| `pkg/sfu/connectionquality/scorer.go`, `connectionstats.go` | 품질 점수 |
| `pkg/sfu/forwardstats.go` | 전달 지연 통계 |
| `pkg/sfu/rtpstats/rtpstats_base_lite.go` | PLI 조절 판정 |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-25 | v0.1 — LiveKit `095e339` 소스 정독, pkg/sfu 중심 분석, 모듈별 반영안·M4 지표·시나리오·목표 초안 |
| 2026-10-25 | v0.2 — 반박 검증 반영(아래 '검증 기록' 정정 8건) |

## 검증 기록

- 검증 일자 : 2026-10-25 · 대상 소스 LiveKit 커밋 `095e339`(version 1.13.10 확인) · 방법 : 인용한 경로·줄·함수명을 소스 해당 줄과 직접 대조(빌드·실행 없음)
- 검증 건수 : 72건(경로·줄·함수명 인용 약 55건, 수치·동작 설명 약 17건). 일치 64건, 정정 8건, 확인 불가 1건 추가 표시
- S-2 점검 : 원본 코드 블록 복사 없음(6.2 Go 인터페이스는 우리 설계로 LiveKit 타입과 다름). S-1 점검 : 반영안에 pion 기본 인터셉터 사용 없음 — 모순 없음

| # | 위치 | 정정 전 | 정정 후 · 근거 |
|---|---|---|---|
| 1 | 2절 1번 | 모자라면 일시정지 | 일시정지 허용 설정 시에만(기본 꺼짐) — `pkg/config/config.go:603` |
| 2 | 5.1 SRTP | Firefox 탐침 차단 때문 · `transport.go:383-401` | 사유는 "Pion RTX 스트림 미지원 → Firefox 의 옛 패킷 탐침이 replay 차단" · 줄 `:396-412`(7절·9절 동일 정정) |
| 3 | 5.1 발행 PC 피드백 | 발행 PC 는 TWCC·REMB·NACK·PLI·FIR 모두 | 기본은 TWCC·FIR·NACK·PLI(`rtc/config.go:180-188`), REMB 는 `consolidated` 모드만(`:146-156`) |
| 4 | 5.4 첫 층 획득 유예 | 구독 직후 항상 1초 대기 | `EnableStartAtDesiredQuality` 켜진 구독에서만 동작(`forwarder.go:336`), 이 커밋 서버 코드에 켜는 곳 없음 [확인중 : 소스] · 6.4 Q1 근거도 정정 |
| 5 | 5.5 층 활성 판정 | 1주기라도 비면 정지 | 주기당 최소 패킷 수(층0 1개 · 층1·2 5개) 미달 주기 1번이면 정지 — `streamtracker_packet.go:32-44`, `:118 CheckStatus` |
| 6 | 5.7 용량 확정 | 기대 사용량 95% 보다 작을 때 | 95% 이하이고 기존 확정값과 다를 때 — `remote_bwe.go:197 estimateAvailableChannelCapacity` |
| 7 | 5.8 탐침 패킷 | 그 트랙의 RTP 패딩 패킷 | RTX 협상 시 최근 패킷 RTX 재전송, 없으면 패딩. 영상 트랙들을 차례로 돌며 바이트를 채움 — `track.go:137`, `downtrack.go:2505`, `streamallocator.go:799` |
| 8 | 5.10 · 7절 pacer | 하한 30 `scorer.go:36-37` / pacer 기본 pass-through/no-queue | 하한 `:34` / 기본(REMB) 경로 pass-through, no-queue 는 송신 측 BWE 때 — `transport.go:580-611` |

- 일치 확인 주요 항목 : go.mod 버전·포크 교체(`:3`,`:35`,`:42`,`:170`), 파일 줄 수, 버퍼 500/200, PLI 간격 500ms/1s, sequencer 100ms·2RTT·3회, 대기 NACK 5000, 키프레임 루프 200~1000ms, 추세 표본 12/8·−0.6, NACK 비율 8%/4%, 감쇠 0.4·문턱 0.95, 탐침 120%·200kbps·3초·×1.5·2분, 핑 15초/100ms, 우선순위 1/255, 정렬기 3종, dynacast 5초 하향 디바운스, 품질 점수 식·0.8/0.4·등급 80/40/20, 손실 가중 10/8/4·÷1.5, 병렬 임계 20/300·26µs/3.3µs, 전달 지연 20ms, 구독 디바운스 100ms
