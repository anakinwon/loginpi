# PRD_02: seminar.pi 자체 화상 엔진 통합 설계 (확정안)

> 버전 v1.0 · 작성 2026-10-25 · 상위 [PRD_01](PRD_01_MEDIA_ENGINE.md)(K-1~K-5, M0~M5) · 근거 [REA_01 Galène](rea/REA_01_GALENE.md) · [REA_02 mediasoup](rea/REA_02_MEDIASOUP.md) · [REA_03 LiveKit](rea/REA_03_LIVEKIT.md) · 작성 마스터 에이전트(취합·의사결정)
> 분석 대상 커밋 : Galène `e2bc84f`(MIT) · mediasoup `aaf6e3a` v3.31.0(ISC) · LiveKit `095e339` v1.13.10(Apache-2.0). 세 문서 모두 반박 검증 완료(사실 주장 62·112·72건 대조, 정정 12·6·8건 반영).
> **S-1** pion은 ICE·DTLS·SRTP·RTP/RTCP 직렬화만 쓴다. 인터셉터 레지스트리는 비워 둔다. **S-2** 아래 설계와 Go 의사코드는 모두 우리 설계다. 원본 코드는 옮기지 않았고 출처는 "솔루션 + REA 문서 절"로만 적는다.
> 표기 : 미확정 값은 [TBD], 확인이 필요한 항목은 [확인중 : 대상]으로 적는다. 결정 번호는 D-n이며 8절에 모아 둔다.

---

## 1. 결론 요약

1. **뼈대는 Galène에서 배운다.** 빈 인터셉터 레지스트리, 레이어당 수신 루프 1개, 패킷 캐시 하나로 전달·재전송·첫 화면을 모두 처리하는 구조를 M1·M2에서 처음부터 직접 짠다(REA_01 2·4.2절).
2. **경계는 M1부터 mediasoup 것을 쓰고, 이름은 섬 이름으로 짓는다(마스터 승인 C-1).** `bora`(=Router)·`capri`(=Transport)·`santorini`(=Producer)·`jeju`(=Consumer), 엔진은 Galápagos로 시작하고 M3에서는 이름을 바꾸지 않는다. 대신 닫힘 연쇄, 4분류 판정, 순번 재작성(SeqRewriter), 시그널링 동사를 정밀하게 다듬는다(D-1, REA_02 5.1·5.6절).
3. **품질 장치는 LiveKit 기본값을 출발점으로 한다.** 서버가 키프레임 경계에서 simulcast 레이어를 자동으로 바꾸고, 구독자 PC마다 할당기(STABLE/DEFICIENT)를 두며, BWE는 REMB와 NACK 비율로 판단한다. 재전송은 본문 1벌과 구독자별 메타 링으로 한다(D-3·D-7·D-8, REA_03 5.3~5.8절).
4. **Go에 맞게 새로 설계하는 부분이 있다.** 방 상태는 bora(방) 고루틴 1개가 소유한다. 패킷 경로는 "레이어 수신 고루틴 → 구독자별 크기 제한 큐 → 구독자 송신 고루틴"으로 흐르고, 느린 청중은 자기 큐에서만 버린다. 헤더는 구독자별 값으로 복사한다(D-10).
5. **품질 판정은 LiveKit 공식 배포판과 나란히 잰다.** 같은 VM에서 Q1~Q11 지표와 T1~T9 시나리오(`tc netem`)로 측정하고, 목표값은 M4 첫 측정 뒤 마스터가 확정한다(7절).

---

## 2. 세 솔루션 핵심가치 비교

| 관점 | Galène (첫 구현 교본) | mediasoup (설계 개념 모델) | LiveKit (목표 품질 기준) | **seminar.pi 채택** |
|---|---|---|---|---|
| 구조 단순성 | 미디어 경로 핵심 3,108줄. 함수 4~5개만 따라가면 전체가 보인다(REA_01 1·2절) | C++ 워커 약 7.5만 줄. 단일 스레드라 경합이 없다(REA_02 1절) | `pkg/sfu`만 약 4만 줄, 핵심 3파일 약 7천 줄(REA_03 1절) | Galène 규모로 시작하고 M4에서 LiveKit 축소판을 더한다 |
| 패킷 경로 | readLoop → 캐시 Store → (순번, 인덱스) → writer → Write(REA_01 4.2) | RtpListener → Producer 재매핑 → Router 분배 → Consumer 4분류 → SeqManager → 송신(REA_02 4.2) | 레이어별 forwardRTP 고루틴 → DownTrack.WriteRTP → Forwarder 변환 → pacer(REA_03 4.2) | Galène 경로 + mediasoup 4분류·재작성(D-3·D-10) |
| NACK | 비트맵 상류 NACK(20ms, 2~24패킷), 하류 재전송, 캐시에 없으면 50ms 모아 상류로(REA_01 5.3·5.4) | NackGenerator(RTT 간격, 10회, 넘치면 PLI) + 구독자별 재전송 버퍼(10ms마다 2개)(REA_02 5.3·5.4) | 본문 1벌 + sequencer 메타 링, min(100ms,2RTT) 억제, 최대 3회, 대기 5000개, PLI 후 중단(REA_03 5.3) | 상류는 Galène 비트맵 + mediasoup 재요청 규칙, 하류는 LiveKit 억제 규칙(D-4) |
| PLI | 키프레임 필요 플래그 + 0.5초 상한, 신규 구독자는 캐시 재생(REA_01 5.5) | SSRC별 대기 요청 1개, 1초 재시도, 지연기(REA_02 5.5) | 레이어별 간격(l 500ms, m·h 1s), RTCP 묶음당 1회, 레이어 고정 대기 루프(REA_03 5.4) | 세 방식을 합친 레이어별 KeyframeLimiter(D-6) |
| simulcast | 클라이언트가 화면 크기로 재요청하고 재협상한다. 서버 자동 전환은 없다(REA_01 5.8) | 키프레임 대기, SR/abs-capture-time으로 TS 정렬, 75ms 상한, 프레임 미완료 skip(REA_02 5.7) | target/current 분리, 키프레임 경계 전환, 하향 시 즉시 차단, 레이어 활성 감지(REA_03 5.5) | 서버 자동 전환. 규칙은 mediasoup, 선택은 LiveKit(D-8) |
| BWE | 손실 기반 + REMB 최소값(REA_01 5.7) | 기본은 libwebrtc GoogCC, 내장 BWE는 기본 꺼짐(REA_02 5.8) | 기본은 REMB 추세(Kendall) + NACK 비율, 송신 측 TWCC는 꺼짐(REA_03 5.7) | REMB + NACK 비율, TWCC는 보류(D-7) |
| 방 모델 | 권한 op/present/message/observe, 입장 검사(REA_01 5.10) | Router ⊃ Transport ⊃ Producer/Consumer, 닫힘 연쇄, 늦은 합류자에게 상태 전달(REA_02 5.1) | Room·Participant·구독 관리, 트랙 우선순위(REA_03 4.1·5.6) | mediasoup 경계 + Galène 역할 검사 + LiveKit 우선순위(D-1) |
| 시그널링 | 대칭·비동기 JSON, 15초/20초/45초 생존, 서버 offer(REA_01 5.9) | 라이브러리에는 없다. 동사가 객체 경계와 1:1(REA_02 5.10) | `setLayer`·`streamState`·dynacast 메시지(REA_03 6.1) | 요청/응답/알림 JSON + mediasoup 동사 + 표준 SDP(D-9) |
| 운영성 | 단일 바이너리, UDP mux 단일 포트, 녹화기 = 구독 클라이언트(REA_01 5.1·5.12) | trace 이벤트, 스트림 점수(REA_02 5.9) | 연결 품질 점수, 전달 지연 통계(REA_03 5.10·5.11) | 단일 바이너리 + UDP mux + LiveKit 점수 식(지표 비교용) |

---

## 3. 통합 모듈 설계

### 3.1 Go 패키지 구조 (`sitemap/seminar.pi/media/`)

```
media/
  go.mod                       module seminar.pi/media (Go 최신 안정판, pion/webrtc v4 — 공식판, 포크 금지)
  cmd/galapagos/main.go        엔진 Galápagos 기동 — 설정 로드(env) · UDP mux · HTTP(WSS) 서버
  internal/
    signal/     WebSocket 프로토콜 · 입장권 검증 · 세션 상태기계
    bora/       Router(방) — 방 1개 = 고루틴 1개(제어 평면 단일 소유) · 타입 bora.Room
    capri/      Transport(연결) — pion PC 생성(빈 인터셉터) · ICE 후보 보관 · RTCP 읽기·분배 · 타입 capri.Transport
    santorini/  Producer(송신 원천) — 레이어별 수신 스트림 · 64비트 순번 확장 · 키프레임 판별 · 레이어 활성·비트레이트 · 타입 santorini.Producer
    jeju/       Consumer(청중 수신) — 구독자 × 트랙 상태 · LayerPolicy · SeqRewriter · TS/VP8 재작성 · 송신 · 타입 jeju.Consumer
    forward/    팬아웃 — 구독자별 제한 큐, 혼잡 시 프레임 단위 버림
    nack/       PacketCache(본문) · LossTracker(상류) · SendMeta(하류 메타 링)
    pli/        KeyframeLimiter(레이어별)
    bwe/        REMB·NACK 비율 혼잡 판정 · Allocator(구독자 PC당 1개) · 탐침
    rtcpx/      SR·RR·REMB·NACK·PLI 생성기(인터셉터 대체), RTT 계산
    rtpx/       16비트 순번 비교·확장, VP8 페이로드 해석, abs-send-time 기록
    record/     (M5) 녹화기 = 내부 consumer
    metrics/    카운터·이벤트·품질 점수(LiveKit 식)
```

- `rtcpx`·`rtpx`는 PRD_01 3절 구조도에 없던 공용 패키지다. 인터셉터를 끄면 SR·RR이 사라지고(REA_02 8절), 순번 감김 같은 경계 조건이 여러 모듈에 흩어진다(REA_01 8절). 그래서 한곳에 모았다.
- `internal/`에 둬서 외부 import를 막는다. Next 빌드와는 분리한다(PRD_01 6절).

### 3.2 경계 명명 시점 결정 (D-1 — **마스터 승인 C-1, 2026-10-25 : 섬 이름으로 생성**)

**결정 : M1부터 mediasoup 경계(Router·Transport·Producer·Consumer)로 패키지를 나누되, 패키지 이름은 전세계 아름다운 섬 이름으로 짓는다(마스터 지시). 패키지 안 타입 이름은 역할 이름(Room·Transport·Producer·Consumer)을 그대로 써서 코드가 읽히게 한다. M3은 "재편"이 아니라 "경계 정밀화"로 바꾼다.**

#### 섬 이름 추천과 선정 (C-1)

| 경계(mediasoup) | 역할 | 선정 섬 | 고른 이유 | 패키지 |
|---|---|---|---|---|
| 엔진 전체 | 자체 SFU 엔진 | **Galápagos**(에콰도르) | 진화의 섬 — 세 참고모델에서 배워 진화시키는 우리 엔진 | `cmd/galapagos` |
| Router | 방 — 흐름이 모이고 갈라지는 곳 | **Bora Bora**(프랑스령 폴리네시아) | 산호초가 둘러싼 석호 — 울타리 안에 모인 하나의 방 | `bora` |
| Transport | 연결 — 드나드는 통로 | **Capri**(이탈리아) | 푸른 동굴(Grotta Azzurra) — 좁은 입구로 드나드는 통로 | `capri` |
| Producer | 송신 원천 — 발표자의 영상이 솟는 곳 | **Santorini**(그리스) | 화산 칼데라 — 분출하는 원천 | `santorini` |
| Consumer | 청중 수신 — 받아 보는 쪽 | **Jeju**(대한민국) | 세계 자연유산의 섬 — 우리 청중이 머무는 곳 | `jeju` |

후보로 검토했으나 고르지 않은 섬 : Bali(인도네시아)·Maui(하와이)·Moorea(프랑스령 폴리네시아)·Palawan(필리핀)·Zanzibar(탄자니아)·Mauritius(모리셔스) — 이후 모듈(record·metrics 등)을 섬 이름으로 바꿀 때 후보로 쓴다. 지금은 기능 모듈(signal·forward·nack·pli·bwe·rtcpx·rtpx·record·metrics)은 기능 이름 유지.

이유
1. PRD_01 3절 구조도와 경계가 같다(이름만 섬 이름으로, 역할은 괄호 병기). M1을 Galène 이름(group·upConn·downTrack)으로 짰다가 M3에서 바꾸면 같은 코드를 두 번 옮기게 되고, 그만큼 회귀 위험도 커진다.
2. Galène 개념은 이 경계에 그대로 들어간다. upTrack은 producer 레이어, downTrack은 consumer, group은 room, writer는 forward에 대응한다(REA_01 4.1, REA_02 6.1 매핑표).
3. M3에 남는 일은 이름이 아니라 **의미**다. 닫힘 연쇄, 늦은 합류자에게 상태 전달, 4분류 Decision, SeqRewriter의 Drop/Sync, consume paused→resume, 시그널링 동사 정리가 여기에 해당한다. 이것들은 M2 동작을 먼저 확인한 뒤에 넣어야 안전하다.

### 3.3 모듈 책임·인터페이스

아래 시그니처는 의사코드이고, 단계를 진행하면서 조정한다.

**signal** (M1 → M3 동사 정리) — 참고 : Galène 5.9·5.11, mediasoup 5.10·6.2, LiveKit 6.1
- 역할 : WSS 연결 1개 = 세션 1개. 처음 10초 안에 `join`(입장권)이 와야 한다. 생존 확인은 20초 동안 아무것도 받지 못하면 ping, 45초면 종료한다. 메시지는 최대 64KB다(SDP 기준이며 Galène은 1MB [TBD : M1 실측]). 역할 검사는 signal에서 한 번, room에서 한 번 더 한다(R-P5).
```go
type Ticket struct { Room, Sub, Name string; Role Role; Cap int; Exp, Iat int64; Jti string }
func VerifyTicket(raw string, secret []byte, now time.Time) (Ticket, error) // HS256 고정, 오차 5초, 실패 시 200ms 지연 후 오류
type Session interface { Send(ntf Notification); Close(code ErrCode) }
```

**bora**(Router·방) (M1 최소 → M3 경계) — 참고 : mediasoup 5.1·6.2 `room/`, Galène 5.10, LiveKit 5.6
- 역할 : producer→consumers 표, 참가자 목록, 정원·역할 검사. **상태 변경은 bora(방) 고루틴의 명령 채널로만 한다.** 새 Producer가 생기면 기존 청중 전원에게 Consumer를 자동으로 만든다(웨비나라서 가능한 편의). Producer가 닫히면 연결된 Consumer를 모두 닫고 `producerClosed`를 알린다. 늦게 합류한 Consumer에게는 일시정지 상태와 레이어 활성 정보를 바로 넘긴다.
```go
type Room interface {
  Join(t Ticket, s Session) (*Peer, error)            // 정원·역할·중복 sub 검사
  Leave(peerID string)                                // Transport 닫힘 → Producer/Consumer 연쇄 정리
  Produce(peerID string, tr *webrtc.TrackRemote, kind Kind, rid string) (*santorini.Producer, error) // presenter·panel만
  Consume(peerID, producerID string, paused bool) (*jeju.Consumer, error)
  SetPriority(producerID string, p uint8)             // 화면공유 255 > 발표자 영상 > 패널 영상
}
```

**capri**(Transport·연결) (M1) — 참고 : Galène 5.1, mediasoup 6.2 `transport/`, LiveKit 5.1·6.1
- 역할 : 참가자당 **발행 PC 1개(클라이언트 offer)와 구독 PC 1개(서버 offer)**(D-2). 청중은 구독 PC만 가진다. SettingEngine에는 UDP mux 단일 포트, mDNS 끔, NAT 1:1 IP, SRTP 재전송 보호 창 확대(D-5)를 넣는다. MediaEngine은 VP8+Opus로 하고 H.264는 M0 결과로 정한다. 피드백은 영상 nack·nack pli·ccm fir·goog-remb, 음성은 없음으로 둔다. 구독 PC는 M4부터 abs-send-time 확장을 등록한다. `ReadRTCP` 루프에서 RR은 consumer RTT·손실, NACK은 consumer 재전송, PLI·FIR은 pli, REMB는 bwe로 보낸다.
```go
func NewAPI(cfg Config) *webrtc.API // interceptor.Registry{} 비움 — 단위 테스트로 비어 있음 확인
type Transport interface {
  ApplyOffer(sdp string) (answer string, err error)   // 발행 PC
  CreateOffer() (sdp string, err error); ApplyAnswer(sdp string) error // 구독 PC
  AddCandidate(c webrtc.ICECandidateInit) error       // remote SDP 전 도착분은 보관
  OnConnected(fn func())                              // 구독 트랙 연결은 connected 이후(Galène 5.9)
}
```

**santorini**(Producer·송신 원천) (M1 → M2 → M4) — 참고 : Galène 4.2·5.2, mediasoup 5.9·6.2 `producer/`, LiveKit 5.2·5.5
- 역할 : 들어오는 트랙 1개가 Producer 1개이고, simulcast면 rid l/m/h가 레이어 0/1/2다. 레이어마다 **수신 고루틴 1개**가 읽기, 64비트 순번 확장, 키프레임 판별, 들어온 헤더 확장 제거, 캐시 저장, 손실 기록, forward 투입을 처리한다. 원본 SSRC는 producer 밖으로 내보내지 않고, 밖에서는 (ProducerID, 레이어)로만 식별한다(mediasoup mappedSsrc 개념). 레이어별 SR(NTP↔RTP)을 보관한다. 레이어 활성은 500ms 주기로 판정하는데, 레이어 0은 2초, 상위 레이어는 10초 동안 이어져야 활성이다. 비트레이트는 1초마다 갱신한다(M4).
```go
type Producer interface {
  ID() string; Kind() Kind
  Layer(i int8) LayerSource
}
type LayerSource interface {
  Cache() *nack.PacketCache
  LastSR() (ntp uint64, rtpTS uint32, ok bool)
  Active() bool; Bitrate() int64                       // M4
  RequestKeyframe(reason pli.Reason)                   // pli.Limiter 통과 시에만 실제 PLI
}
```

**forward** (M1 → M2) — 참고 : Galène 5.6, mediasoup 6.2 `forward/`, LiveKit 5.11
- 역할 : 레이어 수신 고루틴이 구독자별 큐에 `(extSeq, cacheIdx, flags)`만 넣는다. 큐는 크기 제한 채널이고 초기값은 32다. 큐가 차면 **그 구독자만** 버린다. 영상은 marker까지 버린 뒤 keyframe 필요로 표시하고, 음성은 버린다. 송신 쪽이 Galène처럼 작성자 묶음을 공유하지 않으므로 청중 1명 단위로 격리된다. Galène은 작성자 하나가 트랙 최대 4개를 함께 버리는데 이 문제를 바로잡은 것이다(REA_01 검증 정정 3).
```go
type Item struct { ExtSeq uint64; Idx uint16; Key, Marker bool; Layer int8; At time.Time }
func (q *Queue) Offer(it Item) (dropped bool)  // 비차단
```

**jeju**(Consumer·청중 수신) (M1 단일 레이어 → M3 4분류 → M4 전환) — 참고 : mediasoup 5.6·5.7·6.2 `consumer/`, LiveKit 5.4·5.5, Galène packetmap
- 역할 : 구독자 × 트랙 1개를 맡는다. **출력 SSRC는 Consumer가 살아 있는 동안 바뀌지 않는다.** 송신 고루틴 1개가 큐에서 꺼낸 항목을 캐시에서 읽고(`GetAt`), LayerPolicy로 판정한 뒤 SeqRewriter·TS 오프셋·VP8 picture ID 재작성을 거쳐 **새 헤더 값**으로 직렬화해 보낸다. `rtp.Header.Extensions`는 구독자별로 새로 만든다(REA_02 검증 정정 6). 보낸 패킷은 SendMeta에 기록한다.
```go
type Decision uint8 // Forward | Drop(순번 기록) | SilentDrop(다른 레이어) | Buffer(첫 키프레임 전)
type LayerPolicy interface {
  Decide(it forward.Item, lastMarker bool) (Decision, *Switch) // Switch != nil 이면 전환 + 재동기화
  SetTarget(l Layer, paused bool)                              // bwe.Allocator만 호출
  State() (current, target, max Layer)
}
type SeqRewriter interface { Sync(in uint64); Drop(in uint64); Input(in uint64) (out uint16, ok bool) }
type Consumer interface {
  OnNACK(seqs []uint16); OnPLI(); OnRR(rr rtcp.ReceptionReport)
  Pause(); Resume()                                            // resume 즉시 키프레임 요청
  Close()
}
```

**nack** (M2) — 참고 : Galène 5.2~5.4, mediasoup 5.3·5.4, LiveKit 5.2·5.3
```go
type PacketCache interface {               // 레이어당 1개, 고정 슬롯(1504B) 링 — 본문 1벌
  Store(extSeq uint64, ts uint32, key, marker bool, pkt []byte) (idx uint16)
  GetAt(extSeq uint64, idx uint16, dst []byte) int // 덮였으면 0
  Get(extSeq uint64, dst []byte) int               // 재전송용
  LastKeyframe() (extSeq uint64, ok bool)
}
type LossTracker interface {               // 상류(발행자 방향)
  Receive(extSeq uint64, key bool)
  Due(now time.Time, rtt time.Duration) []rtcp.NackPair // 첫 NACK 20ms(2~24패킷)·최근 4패킷 제외, 이후 RTT 간격·최대 10회
  Overflow() bool                                       // 상한 초과 → 키프레임 이전 정리 → 그래도 넘치면 PLI
}
type SendMeta interface {                  // 하류(구독자별) — 출력 순번 → 원본 extSeq·레이어·송신 시각·재전송 횟수
  Push(out uint16, src uint64, layer int8, at time.Time)
  Resolve(out uint16, now time.Time, rtt time.Duration) (src uint64, layer int8, ok bool) // min(100ms,2RTT) 억제·최대 3회
}
```
- 하류 NACK의 원본이 캐시에 없으면 Galène처럼 50ms 동안 모은다. 마지막 키프레임 이전 순번은 버리고 나머지를 상류 NACK로 보낸다. 대기 NACK 상한은 초안 1,000개다(LiveKit은 5,000, 30명 규모에 맞춰 축소 [TBD : M2 실측]).
- 구독자가 PLI를 보내면 키프레임이 나갈 때까지 그 구독자에게 재전송을 멈춘다(LiveKit `FlagStopRTXOnPLI` 개념, M2부터).

**pli** (M1 최소 → M2) — 참고 : Galène 5.5, mediasoup 5.5, LiveKit 5.4
```go
type Reason uint8 // SubscriberPLI | SubscriberFIR | NewConsumer | LayerSwitch | NackOverflow
type Limiter interface {                   // 레이어당 1개
  Need(r Reason)                            // 대기 요청 1개만, 나머지는 합침
  KeyframeSeen()                            // 해제
  Tick(now time.Time) (sendPLI bool)        // 최소 간격 l 500ms · m/h 1s, 1s 무응답이면 1회 재요청
}
```
- FIR 중복 제거 순번은 **반드시 갱신**한다. Galène `lastFirSeqno` 미갱신 결함을 우리 코드에서는 고친다(REA_01 5.5).
- 새 Consumer는 먼저 캐시를 재생하고, 그다음에 PLI를 보낸다. 마지막 키프레임부터 현재까지가 40패킷 이내면 캐시에서 순서대로 보내고, 아니면 PLI를 보낸다(Galène 5.5).

**bwe** (M4) — 참고 : LiveKit 5.6~5.8, mediasoup 5.8(분배 4규칙), Galène 5.7(발행자 방향 REMB)
```go
type Allocator interface {                 // 구독자 구독 PC당 1개, 이벤트 큐 1개로 직렬 처리
  OnREMB(bps int64)                         // 추적 SSRC 1개에만 반응
  OnNackStats(sent, repeated uint32)
  OnConsumerChanged(c ConsumerView)         // 레이어 활성·비트레이트·setLayer 상한 변경
  State() AllocState                        // Stable | Deficient
}
```
- 판정 : REMB 하락 추세(Kendall 순위상관, 표본 8~12, 임계 −0.6) 또는 NACK 비율 8%(2~3초 창)이면 혼잡으로 본다. 용량은 손실이 원인이면 기대사용량×(1−0.4×NACK비율), 아니면 REMB로 둔다. 기대사용량의 95% 이하이면서 이전 값과 다를 때만 확정한다(LiveKit 기본값을 초기값으로 사용).
- 분배 : 1회차에는 모든 트랙에 레이어 0을 보장한다. 남는 대역으로 우선순위가 높고 목표에서 먼 트랙부터 한 단계씩 올린다. 내렸던 레이어를 다시 올릴 때는 다음 레이어 비트레이트의 1.2배가 필요하다(mediasoup 히스테리시스). 결과는 라운드가 끝날 때 한꺼번에 적용한다. **일시정지는 기본으로 끈다.** 청중에게는 정지 화면보다 저화질이 낫다.
- 회복 탐침 : 다음 단계 증가분의 120%(최소 200kbps)만큼 보낸다. 간격은 3초로 시작해 실패하면 1.5배씩 늘리고 최대 2분이다. 탐침 패킷은 RTX가 없으므로 RTP 패딩이다(D-5).
- 발행자 방향 : 1초마다 RR+REMB를 보낸다. REMB 값은 구독자들이 요청한 최대 레이어 합계를 상한으로 한다(Galène 5.7 개념). dynacast(레이어 끄기 신호, 하향 5초 디바운스)는 M4 ⑥단계에서 넣는다.

**rtcpx** (M1) — 참고 : Galène 5.7, mediasoup 4.3
- 하류 SR은 0.5초마다 보낸다. 발표자 SR의 NTP/RTP를 현재 시각으로 외삽해 우리 출력 SSRC와 TS 오프셋에 맞춘다(립싱크). 상류 RR은 1초마다 보내고, RTT는 LSR/DLSR로 계산한다.

**metrics** (M2 수집 → M4 비교 → M5 내보내기) — 참고 : LiveKit 5.10·6.4, mediasoup 6.2 `metrics/`, Galène 6.3
- 카운터 : 수신·송신 패킷, NACK·재전송·중복 NACK·캐시 미스, PLI·키프레임, 레이어 전환, 큐 버림, 전달 지연(p50·p99, 20ms 초과 비율)
- 이벤트(시각 포함) : 레이어 전환, 키프레임 도착, 혼잡 판정. Q3·Q4·Q5 계산에 쓴다.
- 품질 점수는 LiveKit과 같은 식으로 계산한다(REA_03 5.10). 같은 식이어야 K-5 비교가 공정하다.

**record** (M5) — 참고 : Galène 5.12, LiveKit 6.1
- 녹화기는 내부 Consumer 1개다. 최고 레이어로 고정하고 할당기에서 뺀다. 미디어 경로는 고치지 않는다. 저장 형식(WebM/IVF)과 외부 프로세스 사용 여부는 [TBD : M5]다.

---

## 4. 데이터 흐름

### 4.1 정방향 (발표자 영상 RTP → 청중 N명)

```
[발표자 브라우저] ──SRTP──▶ pion(복호) ─▶ santorini(Producer) 레이어 수신 고루틴 (rid=h)
   1 ReadRTP → rtpx.Extend(16→64비트) → VP8 키프레임 판별 → 들어온 헤더 확장 제거
   2 nack.PacketCache.Store  → idx            (본문 1벌, 레이어당 캐시 1개)
   3 nack.LossTracker.Receive → 기준 초과 구멍이면 상류 NACK(rtcpx)
   4 pli.Limiter: 키프레임이면 KeyframeSeen / Tick이면 상류 PLI
   5 forward: 구독 Consumer마다 Queue.Offer(extSeq, idx, flags)   ← 데이터 복사 없음
        │ (큐가 차면 그 Consumer만 marker까지 버림 + 키프레임 필요 표시)
        ▼
 jeju(Consumer) 송신 고루틴 (청중 k)
   6 cache.GetAt(extSeq, idx) → 슬롯이 덮였으면 건너뜀(뒤에서 NACK로 복구)
   7 LayerPolicy.Decide → Forward | Drop(SeqRewriter.Drop) | SilentDrop | Buffer
   8 Switch면 SeqRewriter.Sync + TS 오프셋 재계산(레이어별 SR NTP 정렬, 75ms 상한)
   9 출력 헤더 = {고정 OutSSRC, Input(extSeq), ts−offset, VP8 picture ID 연속화, 구독자 확장(M4 abs-send-time)}
  10 직렬화 → TrackLocal 쓰기(SRTP 암호화는 pion) → SendMeta.Push(out, src, layer, now)
```

### 4.2 역방향 (RTCP)

| 출발 | 패킷 | 처리 | 결과 |
|---|---|---|---|
| 청중 | NACK | capri → jeju.OnNACK → SendMeta.Resolve(억제·3회) → PacketCache.Get | 같은 SSRC로 재전송, 캐시 미스면 50ms 모아 상류 NACK |
| 청중 | PLI·FIR | jeju.OnPLI → 재전송 중단 표시 → santorini 현재 레이어 Limiter.Need | 레이어당 최소 간격 안에서 발표자에게 PLI 1건 |
| 청중 | RR | jeju.OnRR → RTT·손실·지터 | SendMeta 억제 간격, LossTracker 간격, 품질 점수 |
| 청중 | REMB | bwe.Allocator.OnREMB | 혼잡 판정 → LayerPolicy.SetTarget |
| 서버 → 발표자 | RR+REMB(1초), NACK, PLI | rtcpx | 발표자 인코더 송신량·손실 복구 |
| 서버 → 청중 | SR(0.5초) | rtcpx | 립싱크, 청중 RR의 LSR 기준 |
| TWCC | — | 1차에서는 협상하지 않는다(D-7) | — |

### 4.3 동시성 소유 규칙 (D-10)

| 상태 | 소유자 | 다른 고루틴의 접근 |
|---|---|---|
| 방·참가자·producer→consumers 표 | bora(방) 고루틴 | 명령 채널로만 |
| 레이어 캐시 쓰기·LossTracker·Limiter | santorini(Producer) 레이어 수신 고루틴 | 캐시 읽기(`GetAt`·`Get`)는 슬롯 순번 검증 + RWMutex [TBD : M2 벤치마크로 잠금 방식 확정] |
| Consumer 상태·SeqRewriter·SendMeta | jeju(Consumer) 송신 고루틴 | RTCP는 채널로 전달 |
| Allocator | 구독 PC당 이벤트 고루틴 | 이벤트 큐 |

- 모든 테스트는 `go test -race`로 돌린다. 순번 감김(65535→0), 순서 뒤바뀜, 캐시 덮어쓰기, 레이어 전환 엣지 케이스(REA_02 5.7 각 항목)를 표 형식 단위 테스트로 먼저 작성한다.

---

## 5. 시그널링 프로토콜 초안 (WebSocket JSON)

### 5.1 봉투 (D-9)

```
요청  {"t":"req","id":<정수>,"m":"<메서드>","d":{...}}
응답  {"t":"res","id":<같은 정수>,"ok":true,"d":{...}} | {"t":"res","id":..,"ok":false,"e":{"code":"<코드>","msg":"..."}}
알림  {"t":"ntf","m":"<이름>","d":{...}}     (응답 없음, 양방향)
```

### 5.2 메시지 목록

| 방향 | 메서드/알림 | 데이터 | 단계 | 비고 |
|---|---|---|---|---|
| C→S | `join` | `{ticket}` | M1 | 연결 후 10초 안. 응답 `{peerId, role, iceServers, producers:[{id,kind,peer}]}` |
| C→S | `transport.publish` | `{sdp}` (offer) | M1 | presenter·panel만. 응답 `{sdp}` (answer) |
| C→S | `produce` | `{mid, kind, source:"camera"\|"screen"\|"mic", rids?}` | M1 | 응답 `{producerId}`. 역할 검사는 2회 |
| S→C | `ntf transport.subscribe` | `{sdp}` (서버 offer) | M1 | 구독 PC 재협상. 트랙이 연달아 생기면 200ms 묶음 |
| C→S | `transport.subscribe.answer` | `{sdp}` | M1 | |
| 양방향 | `trickle` | `{pc:"pub"\|"sub", candidate}` | M1 | remote SDP 전 도착분은 보관 |
| S→C | `ntf consumerCreated` | `{consumerId, producerId, mid, kind, paused}` | M1 (paused는 M3) | |
| C→S | `consumer.resume` | `{consumerId}` | M3 | 클라이언트가 수신 준비를 끝낸 신호. 서버가 즉시 키프레임 요청 |
| C→S | `consumer.setLayer` | `{consumerId, maxSpatial, maxTemporal?}` | M3 정의·M4 사용 | 화면 크기 기반 **상한**만. 실제 레이어는 서버가 정한다. 100ms 디바운스 |
| C→S | `producer.pause` / `producer.resume` / `producer.close` | `{producerId}` | M3 | 발행자 마이크·카메라 끄기 |
| S→C | `ntf producerClosed` / `producerPaused` / `producerResumed` | `{producerId}` | M3 | 닫힘 연쇄 결과 |
| S→C | `ntf layersChanged` | `{consumerId, spatial, temporal}` | M4 | |
| S→C | `ntf streamState` | `{consumerId, state:"active"\|"paused"}` | M4 | 할당기 일시정지(기본 끔이라 드묾) |
| S→C | `ntf publishLayers` | `{producerId, rids:{l:true,m:true,h:false}}` | M4 | dynacast. 하향 5초 디바운스 |
| S→C | `ntf score` | `{consumerId\|producerId, score, grade}` | M4 | 5초 주기 |
| 양방향 | `ping` / `pong` | `{}` | M1 | 20초 무수신이면 ping, 45초면 종료 |
| C→S | `leave` | `{}` | M1 | 연쇄 정리 |
| S→C | `ntf error` | `{code, msg}` 후 종료 가능 | M1 | |

**오류 코드** : `TICKET_INVALID`·`TICKET_EXPIRED`·`ROOM_FULL`·`ROLE_FORBIDDEN`·`ROOM_CLOSED`·`DUPLICATE_SESSION`·`SDP_INVALID`·`NOT_FOUND`·`RATE_LIMITED`·`INTERNAL`

### 5.3 입장권 클레임 (D-11)

| 클레임 | 형식 | 의미·검증 |
|---|---|---|
| `aud` | `"seminar-media"` | 고정값이며 다르면 거부. 서비스 식별자라 엔진 이름(Galápagos)과 무관하게 유지 — 변경은 C-8 확인 때 |
| `room` | 문자열 | 방 ID(화면 서버 기준). 미디어 서버는 첫 입장 때 방을 메모리에 만든다 |
| `sub` | 문자열 | seminar.pi 사용자 UUID. 같은 방에 같은 sub가 다시 들어오면 기존 세션을 닫는다(`DUPLICATE_SESSION`) |
| `name` | 문자열 | 표시명. 미디어 서버는 전달만 한다 |
| `role` | `presenter`\|`panel`\|`audience` | 발행 권한. audience의 `produce`는 거부한다 |
| `cap` | 정수 | 방 정원(첫 목표 31 = 발표 1 + 청중 30). 방을 만들 때 고정한다 |
| `iat`, `exp` | 초 | **수명 60초**(입장 1회에만 사용), 시계 오차 5초, `exp` 필수 |
| `jti` | 무작위 128비트 | 메모리 캐시로 `exp`까지 재사용을 거부한다(DB 없음) |
| `end` | 초(선택) | 방 종료 시각. 지나면 `ROOM_CLOSED` |

- 형식은 JWT 압축 직렬화이고 **알고리즘은 HS256 고정**이다(헤더 `alg`를 믿지 않아 none·RS 혼동 공격을 막는다). 서명 키는 `MEDIA_TOKEN_SECRET`이다. 발급은 화면 서버 `/api/media/token`이 로그인과 결제를 확인한 뒤에만 한다(PRD_01 3절, M1은 개발용 발급).
- 결제·권한 확인은 화면 서버에서만 한다. 미디어 서버는 DB에 접근하지 않는다(PRD_01 3절 경계 유지).

---

## 6. 단계별 구현 계획 (PRD_01 5절 갱신)

PRD_01 5절의 통과 기준은 **그대로 유지**한다. 아래는 작업 목록과 참고 절을 구체화한 것이다. 5절과 다른 점은 표 아래 "충돌·변경"에 이유와 함께 적는다.

| 단계 | 작업 | 참고 | 통과 기준 |
|---|---|---|---|
| **M0** | (진행 중) `/lab/camera` 실기기 관문. **추가 관찰** : `webrtc-internals`에서 VP8/H.264 송신 가능 여부, rid simulcast 송신, RTCP REMB 수신, RTX 협상 | — | PRD_01 그대로 + 관찰 결과를 TROUBLESHOOT에 기록 |
| **M1** | ① `media/` 모듈 + `NewAPI`(빈 레지스트리 **명시 전달** `WithInterceptorRegistry(&interceptor.Registry{})` — 생략하면 pion 이 기본 인터셉터를 자동 등록, TROUBLESHOOT 2026-10-25, VP8+Opus, UDP mux) ② signal : 봉투·join·ping, 개발용 입장권 ③ bora(Router) : 참가자·역할·정원 ④ capri(Transport) : 발행 PC(클라이언트 offer)·구독 PC(서버 offer), trickle 보관, connected 후 연결 ⑤ santorini(Producer) 수신 고루틴 : 64비트 순번·키프레임 판별·확장 제거 ⑥ forward 큐(캐시 없이 패킷 복사) ⑦ jeju(Consumer) : 고정 OutSSRC, 단일 레이어 오프셋, 첫 키프레임 전 Buffer ⑧ pli 최소(구독 시 1회 + 0.5초 상한) ⑨ rtcpx 최소 SR(하류)·RR(상류) | REA_01 6.1, REA_02 6.3 M1, REA_03 6.3 M1 | 같은 LAN과 LTE에서 발표자 1 → 청중 2 영상. 레지스트리 비어 있음 테스트 통과 |
| **M2** | ① PacketCache(영상 512·음성 64슬롯 고정) → 전달을 (extSeq, idx)로 교체 ② LossTracker(상류 NACK·RTT 간격·10회·넘치면 PLI) ③ SendMeta + 하류 재전송(억제·3회·대기 상한·PLI 후 중단) ④ 캐시 미스면 50ms 묶음 상류 NACK ⑤ pli.Limiter 완성(레이어별 간격·FIR 갱신·1초 재시도) ⑥ 신규 구독자 캐시 재생 ⑦ SR 외삽·RTT·SRTP 재전송 보호 창 확대 ⑧ 큐 혼잡 시 프레임 단위 버림 ⑨ TURN(cafe.pi 자격 증명 라우트) ⑩ `tc netem` 시험 환경 ⑪ metrics 카운터 수집 시작 | REA_01 6.2, REA_02 5.3~5.5, REA_03 5.3·5.4 | 3% 손실에서 화면 깨짐이 회복된다. 같은 SSRC 재전송이 SRTP에서 거부되지 않음을 확인 |
| **M3** | ① 닫힘 연쇄(Transport→Producer/Consumer, Producer→Consumer) ② 늦은 합류자 상태 전달 ③ Decision 4분류 + SeqRewriter(Drop/Sync) ④ consume paused→resume(resume 즉시 키프레임) ⑤ 5.2절 메시지 확정·`docs/SIGNAL_API.md` 작성 ⑥ 레이어 비활성 감지 ⑦ 표 형식 단위 테스트 + `-race` | REA_02 5.1·5.6·6.2, REA_03 6.3 M3 | 기능 회귀 0, 모듈 의존이 3.1절 구조와 일치(PRD_01 기준과 같음) |
| **M4** | ① 레이어 활성·비트레이트 ② simulcast 전환(키프레임 경계·SR TS 정렬·75ms 상한·프레임 미완료 skip·옛 패킷 차단·VP8 picture ID) ③ Allocator(REMB만) ④ NACK 비율 혼잡 판정 ⑤ 패딩 탐침 ⑥ dynacast·setLayer ⑦ 품질 점수. **각 단계 끝에 7절 해당 시나리오를 측정** | REA_03 6.3 M4·6.4, REA_02 5.7·5.8 | 7절 목표 충족(목표값은 첫 측정 후 마스터 확정) |
| **M5** | 입장권 = Pi 결제 확인 연동, 방 관리 화면, metrics → schema.pi, 녹화(내부 consumer), 운영 체크리스트 | REA_01 5.12, REA_03 6.1 record | PRD_01 그대로(F-04·F-05·F-07, R-P0~P6, Pi Browser 실기기 결제·입장) |

**충돌·변경 (PRD_01 3·5절 대비)**
1. **M1에서 mediasoup 명칭을 쓴다.** PRD_01은 M3에서 "재구성"하기로 했다. 3.2절 이유에 따라 이름은 M1에 정하고, M3은 경계의 의미를 정밀하게 다듬는 단계로 바꾼다. 통과 기준(회귀 0, 의존 일치)은 그대로다.
2. **M1에 최소 SR/RR을 넣는다.** PRD_01 M1은 NACK을 넣지 않는다. 그런데 인터셉터를 끄면 SR/RR도 없어져서 립싱크와 RTT가 깨질 수 있다(REA_02 8절). NACK이 아니라 보고 패킷이므로 "NACK 없음" 기준과 충돌하지 않는다.
3. **하류 NACK 억제 규칙과 PLI 후 재전송 중단을 M2로 앞당긴다.** REA_03 6.3은 일부를 M4에 뒀지만, 청중 30명이 NACK을 폭주시키는 것을 막는 장치라 M2에 둔다.
4. **metrics 수집을 M2부터 시작한다.** PRD_01은 M5다. 내보내기는 M5에 그대로 두고, M4 비교에 필요한 카운터는 M2부터 쌓는다.
5. **M0 관찰 항목을 추가한다.** D-2·D-5·D-7·D-8의 되돌릴 조건이 Pi Browser 실기기 결과에 달려 있어서다.
6. **PRD_01 3절(구조) 대비 두 가지를 바꾼다.** ① 입장권 수명 : "HMAC, 수 분 유효" → JWT HS256(서명은 HMAC 그대로) 수명 60초·`jti` 일회용(D-11, C-8 승인 대기). 재사용·유출 창을 줄이기 위해서다(5.3절). ② 구독 시그널링 : C→S `consume` 요청 → 서버가 자동으로 `ntf consumerCreated`를 보낸다(5절). 청중은 구독만 하므로 서버가 구독을 만들어 왕복을 줄인다.

---

## 7. 품질 기준 (K-5 — LiveKit 비교)

**측정 원칙** : 같은 VM 사양에서 우리 엔진과 LiveKit **공식 릴리스 바이너리**를 번갈아 단독 실행한다(로컬 다운로드 사본은 빌드 금지). 클라이언트는 양쪽 모두 같은 측정 페이지(브라우저 표준 API + 각 엔진 최소 시그널링)를 쓴다. LiveKit SDK의 adaptive stream·dynacast 신호 차이는 문서로 남긴다(REA_03 8절).

### 7.1 지표

| # | 지표 | 측정 | 출처 |
|---|---|---|---|
| Q1 | 첫 화면 시간 | 입장 클릭 → `getStats` framesDecoded>0 | 클라이언트 |
| Q2 | 화면 지연 | 발표자 화면 ms 시계 촬영 비교 | 클라이언트 |
| Q3 | 손실 회복 | 정지 시작 → 해소(freezeCount·totalFreezesDuration [확인중 : WKWebView 지원]) | 클라이언트 |
| Q4 | 화질 하향 반응 | 대역 제한 시작 → 낮은 레이어 첫 프레임 | 서버 이벤트 + frameWidth |
| Q5 | 화질 상향 복귀 | 제한 해제 → 원래 레이어 | 서버 이벤트 |
| Q6 | 정지 비율 | 총 정지 시간 / 시청 시간 | 클라이언트 |
| Q7 | NACK·재전송 | 구독자별 NACK·재전송·중복·캐시 미스 | 서버 |
| Q8 | PLI·키프레임 | 발행자에게 간 PLI/분, 키프레임/분 | 서버 |
| Q9 | 전달 지연 | 수신 → 송신 p50·p99 | 서버 |
| Q10 | 품질 점수 | LiveKit 식 평균·최저 | 서버 |
| Q11 | 서버 자원 | CPU%·RSS·송신 Mbps·고루틴 수 | VM |

### 7.2 시나리오 (`tc netem`/`tbf`, 발표자 simulcast 3레이어)

| # | 조건 | 주 지표 |
|---|---|---|
| T1 | 발표자 1 + 청중 30, 손실 0, 지연 20ms | Q1·Q2·Q9·Q11 |
| T2 | 청중 1명 하류 균일 손실 3% | Q3·Q6·Q7 |
| T3 | 청중 1명 버스트 손실 10%, 5초 | Q3·Q7·Q8 |
| T4 | 청중 1명 하류 2Mbps → 400kbps | Q4·Q6·Q10 |
| T5 | T4 해제 | Q5 |
| T6 | 하류 150ms ± 30ms | Q2·Q7 |
| T7 | 발표자 상류 손실 3% | Q3·Q8(청중 30명 PLI 합치기) |
| T8 | 30명이 10초 안에 입장 | Q1·Q8·Q11 |
| T9 | iOS·Android Pi Browser 각 1대를 포함해 T1·T4 | Q1·Q4 [확인중 : REMB 송신] |

- 청중 30명은 pion 기반 Go 합성 구독자에 실브라우저 몇 대를 섞어 만든다. 측정 도구 쪽 pion 사용은 S-1 범위 밖이다. [확인중 : 마스터 — 도구 승인]

### 7.3 목표 초안 (첫 측정 후 마스터 확정)

| 지표 | 목표 초안 | 출발 근거 |
|---|---|---|
| Q1 | LiveKit 대비 1.5배 이내 | PRD_01 4절, 캐시 재생(Galène 5.5) |
| Q2 | LiveKit 대비 +100ms 이내 | PRD_01 4절 |
| Q3 | 1초 이내, 정지 비율 1% 미만 [TBD] | 재전송 억제 min(100ms,2RTT), PLI 간격 0.5~1초 |
| Q4 | LiveKit 대비 +2초 이내 [TBD] | REMB 추세 표본 8~12 + 키프레임 대기 |
| Q5 | 30초 이내 [TBD] | 탐침 3초 + 상위 레이어 활성 10초 |
| Q8 | 발행자 PLI : l 초당 2회 이하, m·h 초당 1회 이하 | Limiter 최소 간격(l 500ms, m·h 1s — D-6) |
| Q9 | p99 20ms 미만 | LiveKit forwardstats 기준 |
| Q11 | VM 1대(2 vCPU [TBD]) CPU 50% 미만 | — |

---

## 8. 의사결정 기록 (Decision log)

| # | 결정 항목 | 선택지 | **선택** | 근거 | 되돌릴 조건 |
|---|---|---|---|---|---|
| D-1 | 경계 명명 시점 | (a) M1은 Galène 이름, M3에서 재편 (b) M1부터 mediasoup 이름 | **(b)** M3은 경계 정밀화 · 패키지 이름은 섬 이름(마스터 C-1) | 같은 코드를 두 번 옮기지 않는다. PRD_01 구조도와 경계가 같고 Galène 개념도 1:1로 매핑된다(REA_02 6.1) | M1 구현 중 경계가 Galène 경로를 방해해 일정이 20% 이상 밀리면 M1만 단일 패키지로 짜고 M3에서 분리 |
| D-2 | PeerConnection 구성 | (a) 스트림당 PC(Galène) (b) 참가자당 발행·구독 PC 2개(LiveKit) (c) 단일 PC | **(b)** 발행은 클라이언트 offer, 구독은 서버 offer로 고정 | offer 방향을 고정하면 glare가 생기지 않는다. REMB가 PC 단위라 구독 PC 1개 = 할당기 1개가 자연스럽다(REA_03 5.6·5.7). 청중 1명에 ICE·DTLS 1회 | Pi Browser에서 구독 PC에 트랙을 추가하는 재협상이 실패하거나 화면이 깜박이면 (a)로 [확인중 : M1 실기기] |
| D-3 | 패킷 캐시 구조 | (a) 구독자별 재전송 버퍼(mediasoup) (b) 레이어당 본문 캐시 1벌 + 구독자별 메타 링(Galène 캐시 + LiveKit sequencer) | **(b)** 고정 슬롯 링, 내부 순번 64비트, 영상 512·음성 64슬롯으로 시작 | 30명이 받아도 본문은 1벌이다. 같은 캐시를 전달·재전송·첫 화면에 함께 쓴다(REA_01 5.2, REA_03 5.3). 64비트 확장으로 감김 오류를 줄인다 | M2 netem에서 캐시 미스율이 5%를 넘으면 Galène식 RTT 기반 크기 자동 조정을 앞당긴다. 경합 비용이 크면 구독자 측 복사본으로 |
| D-4 | NACK 정책 | 단일 솔루션 방식 / 조합 | **조합** : 상류는 Galène 비트맵 기준(20ms·2~24패킷·최근 4 제외) + mediasoup 재요청(RTT 간격·10회·넘치면 PLI), 하류는 LiveKit 억제(min(100ms,2RTT)·3회·대기 상한·PLI 후 중단) + 캐시 미스면 Galène 50ms 묶음 | 세 문서가 검증한 규칙 중 서로 겹치지 않는 장치만 골랐다 | T2·T3에서 Q3 목표 미달이면 mediasoup 재전송 페이싱(10ms당 N개)을 추가 |
| D-5 | 재전송 SSRC | (a) 같은 SSRC 재전송 + SRTP 재전송 보호 창 확대(Galène) (b) RTX 별도 SSRC (c) 재전송 보호 끄기(LiveKit) | **(a)** M2. 보안 기본값을 유지한다 | 가장 단순하고 Galène이 같은 pion v4에서 이 방식을 쓴다(REA_01 5.1). (c)는 보안 약화(REA_03 7절) | M2 실측에서 재전송이 거부되거나 M4 탐침에 RTX가 필요하면 (b)로. Pi Browser RTX 협상은 [확인중 : M0] |
| D-6 | 키프레임 요청 조절 | Galène 0.5초 플래그 / mediasoup 대기 1개·1초 재시도 / LiveKit 레이어별 간격 | **레이어별 Limiter** : 대기 1개로 합침 + 키프레임 도착 시 해제 + 최소 간격(l 500ms, m·h 1s) + 1초 무응답 재시도 1회, 신규 구독자는 캐시 재생 먼저 | 청중 30명의 PLI가 발표자에게 레이어당 최대 초당 1~2건으로 모인다. 첫 화면 단축(REA_01 5.5) | T7·T8에서 Q8은 충족했는데 Q1이 미달이면 신규 구독자는 간격 예외(즉시 1회) |
| D-7 | BWE 방식 | (a) REMB + NACK 비율(LiveKit 기본) (b) TWCC 피드백 + 지연 기반 추정 직접 작성(mediasoup 내장 BWE·GCC 개념) | **(a)** M4 1차. TWCC는 협상하지 않음 | LiveKit 상용 기본값이 (a)이고, mediasoup도 내장 BWE를 기본으로 꺼 둔다(REA_02 5.8). 구현량이 몇 배 차이 난다. 손실·RTT 수집은 M2부터 | Pi Browser가 REMB를 보내지 않으면 RR 손실 + NACK 비율만 쓰는 대체 경로로. T4에서 Q4가 목표의 2배를 넘으면 (b) 검토 착수 [확인중 : M0·M4 실기기] |
| D-8 | simulcast 선택 알고리즘 | (a) 클라이언트가 화면 크기로 재요청(Galène) (b) 서버 자동 | **(b)** 클라이언트는 `setLayer`로 상한만 보낸다. 서버는 Allocator(STABLE/DEFICIENT, 레이어 0 보장, 우선순위, 1.2배 히스테리시스, 일시정지 끔)로 목표를 정하고, LayerPolicy가 키프레임 경계에서 전환한다(SR NTP TS 정렬, SR이 없으면 보류하고 키프레임 재요청, 75ms 상한, 프레임 미완료 skip, 옛 패킷 차단, 부족 상태 하향은 즉시 차단). 레이어는 rid l/m/h 3개 | (a)는 재협상과 SSRC 변경이 일어나 WKWebView에서 깜박일 위험이 있다(REA_01 7절). 전환 규칙은 mediasoup이 수년간 고친 엣지 케이스다(REA_02 5.7) | 발표자 기기가 3레이어를 못 보내면 2레이어(Galène식 고·저). SR이 오랫동안 오지 않으면 경과 시간 기준 오프셋으로 대체 [TBD : 대기 한도] |
| D-9 | 시그널링 형식 | (a) Galène 대칭·비동기 (b) 요청/응답/알림 봉투 + mediasoup 동사 + 표준 SDP (c) mediasoup ORTC 파라미터 JSON | **(b)** | `produce`·`consume`은 결과(ID)가 필요해서 요청/응답 짝이 맞다. 표준 SDP라 클라이언트 라이브러리가 필요 없다(REA_02 7절). 동사가 서버 모듈과 1:1 | 메시지 종류가 20개를 넘어 관리가 어려워지면 스키마 파일(JSON Schema)로 생성. 형식 자체를 되돌릴 조건은 없음 |
| D-10 | 동시성 모델 | (a) Galène식 원자 변수·잠금·작성자 풀 (b) 단일 소유 + 채널 | **(b)** bora(방) 고루틴 = 제어 평면, 레이어 수신 고루틴 = 캐시 쓰기, jeju(Consumer) 송신 고루틴 = 구독자 상태, 구독자별 제한 큐(32) | mediasoup의 단일 스레드 무경합 성질을 Go에서 얻는다(REA_02 8절). 청중 1명 단위 격리(REA_01 정정 3) | T1에서 Q11 CPU가 목표를 넘으면 LiveKit식 병렬 분할 또는 √n 작성자 풀 |
| D-11 | 입장권 | (a) 자체 HMAC 형식 (b) JWT HS256(알고리즘 고정) | **(b)** 수명 60초, `jti` 일회용, `cap`·`end` 클레임 | 표준 형식이라 화면 서버(Node)와 Go 양쪽 구현이 쉽고 서명은 PRD의 HMAC 그대로다. Galène 토큰 검증 규칙(만료 필수·5초 오차·실패 지연)을 따른다(REA_01 5.11) | 화면 서버가 JWT 라이브러리를 도입하기 어렵다고 판단되면 (a)로(클레임은 같음) |
| D-12 | 헤더 확장 | (a) 들어온 확장 그대로 전달 (b) 전부 제거하고 필요한 것만 서버가 새로 붙임 | **(b)** | 구독자별 확장을 새로 만들어야 경합이 없다(REA_02 정정 6). TWCC를 쓰지 않으므로 하류에는 abs-send-time(M4)만 있으면 된다(REA_01 5.1) | abs-capture-time 기반 TS 정렬이 필요해지면 해당 확장만 producer에서 보존 |
| D-13 | 코덱 | VP8 / H.264 / VP9·AV1 SVC | **VP8 + Opus 1차**, SVC는 하지 않음 | 세 솔루션 모두 VP8 simulcast를 지원하고 SVC는 Pi Browser 보장이 없다(REA_01·02·03 7절) | M0에서 iOS Pi Browser가 VP8 송신이나 simulcast를 못 하면 H.264 추가 [확인중 : M0] |

---

## 9. 마스터 확인 필요 항목 / 위험

### 9.1 마스터 확인 필요

| # | 항목 | 권고 | 시한 |
|---|---|---|---|
| C-1 | D-1 : M1부터 mediasoup 경계, M3 범위를 경계 정밀화로 축소 | **승인(2026-10-25)** — 패키지 이름은 섬 이름(3.2절 : bora·capri·santorini·jeju, 엔진 Galápagos) | 완료 |
| C-2 | D-2 : 참가자당 발행·구독 PC 2개(Galène 스트림당 PC 대신) | **승인(2026-10-25)**. M1 실기기에서 깨지면 되돌림 | 완료 |
| C-3 | 발표자 기기 범위 : Pi Browser에서 simulcast 발행이 불확실함 → 발표자는 PC/일반 브라우저, Pi Browser는 청중 우선 | [TBD : 마스터] — M0 결과 후 | M0 완료 시 |
| C-4 | LiveKit 공식 릴리스 바이너리를 시험 VM에 설치(비교 측정용) | 승인 필요 | M4 착수 전 |
| C-5 | 시험·운영 VM(리전·사양·비용) | PRD_01 6절 기존 항목 | M1 LTE 시험 전 |
| C-6 | 청중 30명 합성 구독자 도구(pion 기반 Go 클라이언트) 작성 | 승인 권고 | M4 착수 전 |
| C-7 | 7.3 목표값 확정 | 첫 측정 후 확정 | M4 첫 측정 후 |
| C-8 | 입장권 수명 60초·`jti` 일회용·같은 sub 재입장 시 기존 세션 종료 정책 | 승인 권고 | M1 |
| C-9 | BigBlueButton의 mediasoup 사용 세부 확인 | 설계에 영향이 없어 보류 권고 [확인중 : BBB 공식 문서] | 없음 |

### 9.2 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| Pi Browser가 REMB·rid simulcast·RTX를 지원하는지 미확인 | D-5·D-7·D-8 전제 | M0 관찰 항목 추가(6절), 결정마다 되돌릴 조건을 둠 |
| 인터셉터를 끄면 SR/RR이 사라짐 | 립싱크·RTT·전환 TS 정렬 | M1에 rtcpx 최소 SR/RR [확인중 : M1 실측] |
| 층별 SR 지연 | simulcast 전환 보류가 길어짐 | SR이 없으면 보류 + 키프레임 재요청, 경과 시간 대체 규칙 [TBD : 대기 한도] |
| 동시성 경합 | 간헐 장애·데이터 손상 | D-10 소유 규칙, `go test -race` 상시 |
| 순번·전환 엣지 케이스 | 화면 멈춤·TS 점프 | M2(순번)·M4(전환)에서 표 형식 단위 테스트를 먼저 작성 |
| 복잡도(LiveKit 핵심 약 7천 줄) | M4 일정 | 7단계로 나누고 단계마다 측정 |
| 측정 공정성(LiveKit SDK 신호 차이) | K-5 판정 왜곡 | 같은 측정 페이지 사용, 차이를 문서화 |
| S-2 위반(무의식적 구조 복제) | 라이선스·원칙 | 코드 리뷰 때 "원본과 같은 구조의 함수 본문인지" 점검 항목을 둠. 참고는 이 문서와 REA 문서까지만 |
| 외부 모듈 미확인(LiveKit mediatransportutil NACK 큐) | NACK 수치 근거 부족 | 우리 값은 M2 netem 실측으로 정함 |
| 실행 근거 부재(REA MCP 연결 실패, 소스 정독만 함) | 수치가 실제와 다를 수 있음 | 모든 상수는 초기값이고 M1~M4 실측으로 조정 |

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-25 | v1.0 — REA_01·02·03(검증 완료) 취합. 통합 모듈 설계, 데이터 흐름, 시그널링 초안, 단계 계획 갱신, 품질 기준, 결정 D-1~D-13, 마스터 확인 C-1~C-9 |
| 2026-10-25 | v1.1 — 마스터 승인 C-1(경계 M1부터·패키지 섬 이름 bora·capri·santorini·jeju·엔진 Galápagos)·C-2(참가자당 PC 2개) |
