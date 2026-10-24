# REA_02 — mediasoup 분석과 seminar.pi 설계 반영 (M3 설계 개념 모델)

> 작성 2026-10-25 · 대상 mediasoup **v3.31.0, 커밋 `aaf6e3ad48853523a99d40f8bc62c8f99f752a96`** (2026-10-22) · 상위 [PRD_01](../PRD_01_MEDIA_ENGINE.md) K-4·M3 · 근거 [DECISION_02](../DECISION_02_REA_TARGET.md)
> 분석 방법 : 로컬 사본 소스 정독(REA MCP 연결 실패 — S-2 합법 범위 안). 빌드·실행 안 함. 실행 관찰(패킷·webrtc-internals)은 [TBD : M3 착수 시].
> **S-2 준수** : 원본 코드 블록을 옮기지 않는다. 근거는 `경로:줄` 또는 `경로 함수명` + 동작 설명으로만 인용한다. 우리 쪽 설계는 Go 의사코드·시그니처로 쓴다.
> 경로 표기 : `w/` = `worker/src/RTC/`, `wi/` = `worker/include/RTC/`, `n/` = `node/src/`.
> **설계 결정 정본은 [PRD_02](../PRD_02_ENGINE_DESIGN.md)이다. 이 문서 6절은 분석 시점의 제안이며, PRD_02와 다르면 PRD_02를 따른다.**

---

## 1. 개요

| 항목 | 내용 |
|---|---|
| 라이선스 | **ISC** (`LICENSE`) — 허용형. 동봉 `worker/deps/libwebrtc`는 BSD 3조항 + `PATENTS` |
| 커밋·버전 | `aaf6e3a` · `package.json` version 3.31.0 |
| 구성 | C++ 워커(미디어 처리, libuv 이벤트 루프 1스레드) + Node.js/Rust 제어 API(FlatBuffers 채널로 워커에 요청) |
| 규모 | 워커 `.cpp` 74,804줄 · 헤더 `.hpp` 37,044줄 · Node `.ts` 26,986줄 |
| 핵심 파일 크기 | `w/Transport.cpp` 4,126 · `w/Consumer.cpp` 2,145 · `w/Producer.cpp` 1,840 · `w/Router.cpp` 1,131 · `w/SimulcastProducerStreamManager.cpp` 1,345 · `w/RTP/RtpStreamRecv.cpp` 1,180 · `w/RTP/RtpStreamSend.cpp` 873 · `w/NackGenerator.cpp` 383 · `w/SeqManager.cpp` 267 · `w/KeyFrameRequestManager.cpp` 256 |
| 철학 | `README.md:39-40` "시그널링 무관(signaling agnostic)·초저수준 API". 시그널링(protoo 등)은 데모 앱 몫이고 라이브러리에 없다 |
| 이번 버전의 구조 변화 | **Consumer 클래스 통합** — 예전 Simple/Simulcast/Svc/PipeConsumer 4종이 `Consumer` 1개 + `ProducerStreamManager` 전략 4종(Simple·Simulcast·Svc·Pipe)으로 바뀜(`CHANGELOG.md` 3.20.6, PR #1731). **자체 BWE 모듈** `w/BWE/`(28파일)이 빌드 옵션 `ms_use_builtin_bwe`(기본 false, `worker/meson_options.txt:9`)로 들어와 있고, 기본은 여전히 libwebrtc GoogCC 래퍼(`w/TransportCongestionControlClient.cpp`) |

> 주의 : 과제 문서의 "SimpleConsumer/SimulcastConsumer" 이름은 이 커밋에 없다. 같은 역할은 `w/SimpleProducerStreamManager.cpp`·`w/SimulcastProducerStreamManager.cpp`가 맡는다.

---

## 2. 핵심가치 (mediasoup이 잘하는 것)

1. **객체 경계가 명확한 4층 모델** — Worker(프로세스) ⊃ Router(방) ⊃ Transport(참가자 연결) ⊃ Producer/Consumer(트랙). Router는 "producer → consumers" 표만 들고 패킷을 나눠 주고(`w/Router.cpp` `OnTransportProducerRtpPacketReceived` 669), 패킷 가공은 Producer·Consumer가, 소켓·RTCP 분배는 Transport가 한다. 우리 K-4가 노리는 바로 그 경계.
2. **SSRC·PT·순번·타임스탬프 "재매핑" 일관성** — 수신 시 Producer가 원본 SSRC를 *mappedSsrc*로 바꾸고(`w/Producer.cpp` `MangleRtpPacket` 1202), 송신 시 Consumer가 구독자용 SSRC·순번·타임스탬프로 다시 쓴다(`w/Consumer.cpp` `SendRtpPacket` 1222~). 그래서 simulcast 레이어가 바뀌어도 구독자 브라우저는 **한 개의 끊김 없는 스트림**만 본다.
3. **simulcast 전환의 정밀함** — 키프레임 대기·버퍼링, 캡처 시각(SR/abs-capture-time) 기반 타임스탬프 정렬, 최대 75ms 추가 오프셋, 프레임 미완료 시 순번 1칸 건너뛰기, 전환 직후 옛 패킷 걸러내기(`w/SimulcastProducerStreamManager.cpp` `ProcessRtpPacket` 611~1006). 수년간 버그 수정 이력이 CHANGELOG에 누적(예: 3.31.0 "레이어 전환 시 타임스탬프 점프 수정").
4. **NACK 양방향 분리** — 발행자 쪽은 `NackGenerator`(손실 감지→NACK 송신), 구독자 쪽은 `RtpStreamSend` 재전송 버퍼(NACK 수신→재전송). 각각 RTT 기반 재시도·간격 제한이 있다.
5. **키프레임 요청 조절** — `KeyFrameRequestManager`가 SSRC별로 진행 중 요청을 하나만 두고 1초 타임아웃 후 1회 재시도, 선택적 지연(`keyFrameRequestDelay`)으로 구독자 PLI 폭주를 발행자 1건으로 모은다.
6. **수명주기 이벤트의 계단식 정리** — Producer 닫힘 → 연결된 Consumer 전부 `producerclose` → Transport가 Consumer 삭제(`w/Router.cpp` `OnTransportProducerClosed` 513). 누수 없는 정리 순서가 코드로 강제된다.

---

## 3. 기능 목록 (우리에게 필요한 것 위주)

| 기능 | mediasoup 위치 | seminar.pi 필요도 | 단계 |
|---|---|---|---|
| Router = 방, producer→consumers 표 | `w/Router.cpp` 494~850 | 필수 | M1(단순) → M3(경계) |
| WebRtcTransport (ICE·DTLS·SRTP) | `w/WebRtcTransport.cpp`, `w/ICE/`, `w/DtlsTransport.cpp`, `w/SrtpSession.cpp` | 필수 — **우리는 pion이 담당(S-1)** | M1 |
| RtpListener : SSRC → MID → RID 순 Producer 찾기 | `w/RtpListener.cpp` `GetProducer` 187 | 필수(simulcast rid) | M1·M4 |
| Producer : PT·SSRC·확장 재매핑, 수신 스트림 생성 | `w/Producer.cpp` 575·1202 | 필수 | M1 |
| Consumer : 순번·TS 재작성, 일시정지, 점수 | `w/Consumer.cpp` 1222 | 필수 | M1(재작성 최소) → M3 |
| ProducerStreamManager(Simple/Simulcast/Svc/Pipe) | `wi/ProducerStreamManager.hpp`, `w/*ProducerStreamManager.cpp` | Simple·Simulcast 필수, Svc·Pipe 불필요 | M3·M4 |
| SeqManager : 버린 패킷 고려 순번 재작성 | `w/SeqManager.cpp` | 필수 | M3(전환 생기면 필수) |
| NackGenerator (수신측 손실 감지·NACK 송신) | `w/NackGenerator.cpp` | 필수 | M2 |
| RetransmissionBuffer + RtpStreamSend NACK 처리 | `w/RTP/RetransmissionBuffer.cpp`, `w/RTP/RtpStreamSend.cpp` 148·555 | 필수 | M2 |
| KeyFrameRequestManager (PLI/FIR 모으기·재시도) | `w/KeyFrameRequestManager.cpp` | 필수 | M2 |
| RTX(재전송 전용 SSRC) | `w/RTP/RtxStream.cpp`, `RtpStreamSend::RetransmitPendingPackets` | 권장(점수·BWE 정확도) | M2 후반·M4 |
| 스트림 점수(0~10) | `w/RTP/RtpStreamRecv.cpp` `UpdateScore` 936 | 권장(레이어 선택 입력) | M4 |
| 비활성 감지(1.5초 무패킷 → 점수 0) | `w/RTP/RtpStreamRecv.cpp` 19·`OnTimer` 1061 | 필수(발행자 끊김 감지) | M3 |
| TCC 서버(발행자에게 transport-cc 피드백) | `w/TransportCongestionControlServer.cpp` | 권장(발행자 업링크 품질) | M4 |
| TCC 클라이언트(구독자 하향 대역 추정) | `w/TransportCongestionControlClient.cpp`(libwebrtc), `w/BWE/` | **필수** — 우리가 직접 작성(S-1) | M4 |
| 대역 분배(BitrateAllocator / 레이어별 상향) | `w/Transport.cpp` `DistributeAvailableOutgoingBitrate` 2721, `w/BWE/BitrateAllocator.cpp` | 필수 | M4 |
| ActiveSpeaker/AudioLevel Observer | `w/ActiveSpeakerObserver.cpp` 등 | 낮음(패널 발화자 표시 정도) | [TBD : M5 이후] |
| DataProducer/DataConsumer(SCTP) | `w/DataProducer.cpp`, `w/SCTP/` | 낮음 — 채팅·Q&A는 WebSocket 시그널링으로 충분 | 채택 안 함(7절) |
| PipeTransport(라우터 간 연결) | `n/Router.ts` `pipeToRouter` 1021 | 30명 목표에선 불필요 | [TBD : 수백 명 확장 시] |
| PlainTransport(RTP 평문 출력) | `w/PlainTransport.cpp` | 녹화 대안 경로 참고 | M5 검토 |
| trace 이벤트(rtp·keyframe·nack·pli·fir·bwe) | `n/Transport.ts` `enableTraceEvent` 1017 | 권장 → metrics | M5 |

---

## 4. 구조·데이터 흐름

### 4.1 모듈 구조 (텍스트 다이어그램)

```
Node/Rust 앱 (시그널링은 앱이 직접 — protoo는 데모)
   │  FlatBuffers 요청/알림 (Channel)
   ▼
Worker (C++ 1프로세스·libuv 1스레드)
 └─ Router (방)             mapProducers / mapProducerConsumers / mapConsumerProducer
     ├─ WebRtcTransport A (발행자)    ICE·DTLS·SRTP + RtpListener + TCC Server
     │    └─ Producer (video, rid h/m/l)
     │         ├─ RtpStreamRecv ×3 (레이어별)  ── NackGenerator, 점수, 비활성 감지
     │         └─ KeyFrameRequestManager
     └─ WebRtcTransport B..N (청중)   ICE·DTLS·SRTP + TCC Client(BWE)
          └─ Consumer
               ├─ ProducerStreamManager(Simulcast) : 목표/현재 레이어, TS 오프셋
               ├─ SeqManager                     : 순번 재작성
               └─ RtpStreamSend                  : 재전송 버퍼, RR 처리, 점수
```

### 4.2 패킷 한 개의 일생 (발행자 비디오 RTP → 청중 N명)

1. **소켓 수신·복호** — `WebRtcTransport`가 UDP/TCP에서 받아 SRTP 복호 후 `Transport::ReceiveRtpPacket`(`w/Transport.cpp:1738`) 호출. [우리: pion `TrackRemote.ReadRTP`가 이 단계를 대신한다]
2. **확장 ID 적용·TCC 기록** — 수신 측 헤더 확장 ID를 붙이고, TCC 서버에 도착 시각을 넘긴다(1748~1755, 기본 빌드에서만 — `#ifndef MS_USE_BUILTIN_BWE`).
3. **Producer 찾기** — `RtpListener::GetProducer`(`w/RtpListener.cpp:187`)가 SSRC 표 → 없으면 MID 표 → (MID 없을 때만) RID 표 순으로 찾고, 찾으면 SSRC 표에 캐시한다. 못 찾으면 폐기하고 그 SSRC를 닫는다(1777~1793).
4. **Producer 수신 처리** — `Producer::ReceiveRtpPacket`(`w/Producer.cpp:575`) : SSRC로 `RtpStreamRecv`를 찾거나 새로 만든다(rid 기반). 미디어면 `RtpStreamRecv::ReceivePacket`(`w/RTP/RtpStreamRecv.cpp:310`)에서 순번 검증·코덱 파싱(키프레임·레이어 판별)·**NackGenerator 입력**·지터 계산·캡처 시각 저장. RTX면 원본으로 복원 후 같은 처리(412).
5. **키프레임 신호** — 키프레임이면 `KeyFrameRequestManager::KeyFrameReceived`로 대기 중 요청을 해제(653~666). 새 스트림인데 첫 패킷이 키프레임이 아니면 강제 요청(668~676).
6. **재매핑** — `MangleRtpPacket`(1202) : PT를 Router 공통 PT로, SSRC를 mappedSsrc로, 헤더 확장을 표준 집합(MID 등)으로 다시 쓴다. 이후 Router 이하에서는 **발행자 원본 값이 아닌 Router 내부 값**만 다닌다.
7. **Router 분배** — `Router::OnTransportProducerRtpPacketReceived`(`w/Router.cpp:669`) : 해당 Producer의 Consumer 집합을 돌며 MID를 구독자 값으로 바꾸고 `Consumer::SendRtpPacket` 호출. 패킷 복제는 **필요할 때 1번만**(`SharedPacket`, 681~698) — 여러 Consumer의 재전송 버퍼가 같은 복제본을 공유한다.
8. **Consumer 판단** — `Consumer::SendRtpPacket`(`w/Consumer.cpp:1222`) : 비활성(전송 미연결·일시정지·Producer 정지/종료, `wi/Consumer.hpp:127`)이면 버린다(현재 스트림 패킷이면 SeqManager에 "버림" 기록). 지원 안 되는 PT도 같다. 그다음 `ProducerStreamManager::ProcessRtpPacket`에 묻는다 → **FORWARD / DROP(순번 기록) / SILENT_DROP(다른 레이어라 순번 무관) / BUFFER(키프레임 전 도착분 보관)** 4가지 결과(`wi/ProducerStreamManager.hpp` `RtpPacketProcessResult`).
9. **simulcast 결정** — `SimulcastProducerStreamManager::ProcessRtpPacket`(611~) : 다른 레이어면 SILENT_DROP, 목표 레이어의 키프레임이 오면 전환 + 동기화(타임스탬프 오프셋 계산, 순번 sync 값 = 이번 순번 −1, 직전 프레임이 미완료면 −2 — 901), 전환 직후 옛 순번 패킷은 DROP(917~937).
10. **재작성** — 동기화 패킷이면 `SeqManager::Sync`, 그다음 `SeqManager::Input`으로 출력 순번(1344), TS = 원본 − 오프셋, SSRC = 구독자 encodings[0].ssrc, 마커 갱신. 이것을 **패킷을 제자리에서 고쳐 쓰고 보낸 뒤 원래 값으로 되돌리는** 방식으로 한다(1412 "Restore packet fields") — 다음 Consumer가 같은 패킷을 쓰기 때문.
11. **송신 스트림 기록** — `RtpStreamSend::ReceivePacket`(`w/RTP/RtpStreamSend.cpp:102`) : 재전송 버퍼에 (공유 패킷 + 이 구독자용 SSRC·순번·TS·마커) 저장. 같은 순번이 이미 있으면 폐기(중복 송신은 복호 실패·TCC 왜곡).
12. **Transport 송신** — `Transport::OnConsumerSendRtpPacket`(`w/Transport.cpp:3101`) : transport-wide 순번·abs-send-time 기록 → TCC 클라이언트(페이서·BWE)에 "보낼 예정" 등록 → 소켓 송신 콜백에서 "보냄" 통지. 송신 콜백은 Transport가 먼저 사라져도 안전하게 weak 참조로 처리.
13. **버퍼 패킷 방출** — 키프레임 첫 패킷이 나갔으면 그 뒤 순번으로 버퍼에 쌓인 같은 키프레임 조각을 이어서 보낸다(1431~).

### 4.3 역방향(RTCP) 흐름

- **청중 NACK** → `Transport::HandleRtcpPacket`(`w/Transport.cpp:2113`) RTPFB/NACK → `Consumer::ReceiveNack`(`w/Consumer.cpp:1558`) → `RtpStreamSend::ReceiveNack`(148) : 요청 순번을 대기 큐(중복 제거)에 넣고 즉시 2개, 이후 10ms마다 2개씩 재전송(`RetransmitPendingPackets` 555, 상수 18~23). 4초(비디오)/2초(오디오) 넘은 패킷·최근 RTT 안에 이미 재전송한 패킷은 건너뜀.
- **청중 PLI/FIR** → `Consumer::ReceiveKeyFrameRequest`(1585) → 현재 레이어 키프레임 요청 → `Router::OnTransportConsumerKeyFrameRequested`(836) → `Producer::RequestKeyFrame`(`w/Producer.cpp:820`) → `KeyFrameRequestManager::KeyFrameNeeded` → 발행자에게 PLI/FIR 1건.
- **청중 RR** → RTT·손실률 → RTT 계산기, 송신 점수, (기본 BWE) TCC 클라이언트 / (내장 BWE) 손실 기반 추정(2116~2210).
- **청중 TCC 피드백** → TCC 클라이언트(2384~2400) → 가용 대역 → `DistributeAvailableOutgoingBitrate`(2721) → Consumer별 레이어 결정.
- **발행자 쪽 NACK 생성** → `NackGenerator`가 손실을 감지하면 `RtpStreamRecv::OnNackGeneratorNackRequired`(`w/RTP/RtpStreamRecv.cpp:1107`)가 순번 목록을 (기준 순번 + 16비트 마스크) 항목으로 묶어 발행자에게 송신.
- **정기 RTCP** — `Transport::SendRtcp`(2546) : Consumer별 SR, Producer별 RR을 복합 패킷으로 모아 보냄.

---

## 5. 핵심 메커니즘 상세

### 5.1 API 경계와 수명주기 이벤트 (Node 쪽)

| 객체 | 생성 | 주요 제어 | 이벤트(`n/*Types.ts`) |
|---|---|---|---|
| Worker | `createWorker` | — | `died`, `subprocessclose` / observer `newrouter`, `newwebrtcserver` (`n/WorkerTypes.ts:187~200`) |
| Router | `worker.createRouter(mediaCodecs)` | `canConsume`(`n/Router.ts:1444`), `pipeToRouter`(1021) | `workerclose` / observer `newtransport`, `newrtpobserver` (`n/RouterTypes.ts:216~227`) |
| WebRtcTransport | `router.createWebRtcTransport`(`n/Router.ts:295`) | `connect(dtlsParameters)`, `setMaxIncomingBitrate` 등 | `icestatechange`, `iceselectedtuplechange`, `dtlsstatechange`, `sctpstatechange` (`n/WebRtcTransportTypes.ts:246~249`), 공통 `routerclose`, observer `newproducer`/`newconsumer` (`n/TransportTypes.ts:245~266`) |
| Producer | `transport.produce`(`n/Transport.ts:481`) | `pause`/`resume`(`n/Producer.ts:243·263`) | `transportclose`, `score`, `videoorientationchange`, `trace` (`n/ProducerTypes.ts:135`) |
| Consumer | `transport.consume`(`n/Transport.ts:621`) | `pause`/`resume`/`setPreferredLayers`/`setPriority`/`requestKeyFrame`(`n/Consumer.ts:289~418`) | `transportclose`, `producerclose`, `producerpause`, `producerresume`, `score`, `layerschange`, `trace` (`n/ConsumerTypes.ts:227`) |
| DataProducer/Consumer | `produceData`/`consumeData` | pause/resume | `transportclose` 등 |

- **consume 절차**(`n/Transport.ts` `consume` 621~) : 구독자 RTP 능력 검증 → Producer 찾기 → `ortc.getConsumerRtpParameters`(`n/ortc.ts:614`)로 구독자용 파라미터 계산(비디오면 RTX 기본 켬) → MID 자동 부여 → 워커에 요청. 권장 사용법은 **`paused: true`로 만들고 클라이언트가 수신 준비를 끝낸 뒤 resume** (`n/Transport.ts:624` 기본값 false지만 데모 관행 [확인중 : mediasoup 공식 문서 "consume paused" 권고]).
- **닫힘 전파** : Transport 닫힘 → 소속 Producer·Consumer 닫힘(`w/Transport.cpp` `CloseProducersAndConsumers` 244). Producer 닫힘 → Router가 각 Consumer에 `ProducerClosed()` → Consumer가 `producerclose` 알림 → Transport가 Consumer 삭제(`w/Router.cpp:513~556`). Producer pause → Router가 Consumer들에 `producerpause`(558).
- **새 Consumer 합류** : Router가 Producer의 현재 일시정지 상태·기존 스트림 전부·점수를 Consumer에 즉시 알려 준다(`w/Router.cpp` `OnTransportNewConsumer` 739~784). 늦게 들어온 청중도 같은 상태에서 시작.

### 5.2 RtpListener — 수신 패킷의 Producer 결정

- `w/RtpListener.cpp:187~280` : SSRC 표가 1순위. 처음 보는 SSRC는 MID 확장 → (MID가 없을 때만) RID 확장으로 Producer를 찾고 SSRC 표에 등록. simulcast 레이어 3개(rid h/m/l)가 서로 다른 SSRC로 와도 같은 Producer로 모인다.
- 시사점 : Pion은 `OnTrack`에서 rid별 `TrackRemote`를 주므로 이 표를 직접 만들 필요는 적다. 다만 **"트랙 ↔ 우리 Producer·레이어" 매핑표**는 우리가 가져야 한다.

### 5.3 NackGenerator — 발행자 방향 손실 복구 요청

`w/NackGenerator.cpp` (상수 11~15 : 최대 나이 10,000순번, 목록 최대 1,000개, 기본 RTT 100ms, 최대 재시도 10회, 타이머 40ms)
- `ReceivePacket`(43) : 마지막 순번보다 크면 사이 구멍을 NACK 목록에 추가, 작으면 목록에 있던 것(복구됨)인지 확인. 키프레임 순번 목록을 따로 유지.
- `AddPacketsToNackList`(168) : 목록이 넘치면 **가장 최근 키프레임 이전 항목을 잘라내고**(`RemoveNackItemsUntilKeyFrame` 221), 그래도 넘치면 목록을 비우고 **키프레임 요청**으로 전환.
- `GetNackBatch` : 두 경로 — 순번 기준(새 패킷 도착 즉시 첫 NACK)과 시간 기준(40ms 타이머, 마지막 NACK 후 RTT가 지난 항목 재요청). 재시도 10회 넘으면 포기(`GetNackBatch` 246). 선택적 `sendNackDelayMs`로 지연(260, 재정렬 오탐 방지).
- RTX로 들어온 패킷은 `recoveredList`에 기록해 다시 NACK하지 않는다.

### 5.4 RetransmissionBuffer · RtpStreamSend — 청중 방향 재전송

- 버퍼 : 최대 3,000개(`w/RTP/RtpStreamSend.cpp:18`), 순번으로 주소 지정되는 deque(`wi/RTP/RetransmissionBuffer.hpp`), 항목 = 공유 패킷 + 이 구독자용 SSRC·순번·TS·마커·저장 시각·재전송 시각·횟수. 너무 오래된 항목 판정은 저장 후 경과 시간 > 4,000ms(비디오)/2,000ms(오디오)(`wi/RTP/RtpStreamSend.hpp:37·41`, `w/RTP/RetransmissionBuffer.cpp` `IsTooOld` 478).
- 재전송 페이싱 : NACK 요청을 큐에 쌓고 **10ms마다 최대 2개**씩 보낸다(21·23, `RetransmitPendingPackets` 555). 3.29.0에서 추가된 "NACK 재전송 간격 두기"(`CHANGELOG.md` PR #1965) — 대량 NACK이 순간 폭주를 만들지 않게 함.
- RTX 사용 시 RTX SSRC·RTX 순번으로 감싸 보내고 되돌린다. 점수 계산에서 "재전송"·"복구" 횟수를 따로 센다.
- 중복 저장 금지 : 같은 순번이 버퍼에 있으면 송신 자체를 버린다(102~147).

### 5.5 KeyFrameRequestManager — PLI 모으기·조절

`w/KeyFrameRequestManager.cpp`
- SSRC별 "대기 중 요청" 1개만 허용. 대기 중 또 요청이 오면 "타임아웃 때 재시도" 표시만 하고 새로 보내지 않는다(`KeyFrameNeeded`).
- 대기 1,000ms(7) 안에 키프레임이 오면 해제(`KeyFrameReceived`), 안 오면 표시가 있을 때만 **1회 재요청**(`OnKeyFrameRequestTimeout`).
- 선택적 지연기(`KeyFrameRequestDelayer`, Producer 생성 옵션 `keyFrameRequestDelay`, `w/Producer.cpp:204`) : 첫 요청은 바로 보내고, 지연 시간 안에 온 요청은 모았다가 지연이 끝날 때 1건만 보낸다 → **청중 30명이 동시에 PLI를 보내도 발행자에게는 지연 구간당 1건**.
- 새 레이어 스트림 등장 시(첫 패킷이 키프레임이 아니고 Producer가 일시정지 아닐 때) `ForceKeyFrameNeeded`로 강제 요청(`w/Producer.cpp:675`).

### 5.6 SeqManager — 버린 패킷을 고려한 순번 재작성

`w/SeqManager.cpp`
- 상태 : base(출력 − 입력 차), maxInput, maxOutput, 버린 입력 목록(정렬된 vector, 3.20.5에서 set→vector).
- `Sync(input)`(50) : base를 "지금까지 최대 출력 − 입력"으로 맞춰 레이어 전환 후 순번이 이어지게 함.
- `Drop(input)`(66) : 일부러 버린 순번을 기록 → 이후 `Input`(92)이 그 개수만큼 출력 순번을 당겨 **구독자 쪽에서 구멍이 생기지 않게**(구멍이면 구독자가 쓸데없는 NACK을 보냄).
- 버린 순번이 다시 들어오면 송신 거부(재전송 중복 방지).
- 순번 비교는 16비트 래핑 고려(`IsSeqHigherThan`/`IsSeqLowerThan`).
- 구분 : **DROP**은 "현재 스트림인데 우리가 버림"(구멍 메우기 필요), **SILENT_DROP**은 "다른 레이어라 원래 안 보낼 것"(순번 공간에 안 들어감). 이 구분이 정확해야 전환 후 순번이 연속된다.

### 5.7 simulcast 레이어 전환과 타임스탬프 정렬

`w/SimulcastProducerStreamManager.cpp`
- **목표 레이어 계산** `RecalculateTargetLayers`(1125) : 점수 0인 레이어 제외 → 선호 레이어 이하에서 가장 높은 쓸 수 있는 공간 레이어, 시간 레이어는 선호값과 스트림 보유 수의 최소.
- **전환 시점** : 목표 ≠ 현재이고 목표 레이어의 **키프레임**이 도착해야 전환(키프레임 전 패킷은 BUFFER).
- **TS 정렬** `GetTimestampOffset`(1306) : 기준(TS reference) 레이어와 새 레이어의 같은 순간을 abs-capture-time(둘 다 있으면) 또는 SR(NTP↔RTP)로 맞춰 오프셋 계산. 아직 SR이 없으면 키프레임을 버리고 새로 요청(780~807). 기준 레이어가 죽었으면(점수 0) 새 레이어를 기준으로 삼고 경과 시간만큼 TS를 이어 붙임(757~779, `CanGiveUpTsReferenceSpatialLayer` 1292).
- **역행 방지** : 새 키프레임 TS가 이미 보낸 최대 TS 이하이면 추가 오프셋을 더하는데, 75ms(832)를 넘으면 한 번은 키프레임을 다시 요청해 기다리고, 두 번째도 넘으면 그냥 적용(812~870).
- **프레임 미완료 표시** : 직전 송신 패킷에 마커가 없으면(프레임 중간 전환) 순번을 하나 더 건너뛰어 디코더가 이전 프레임을 불완전으로 처리하게 함(901, 이슈 #408).
- **옛 패킷 차단** : 전환 기준 순번보다 낮은 순번은 DROP하고, 기준 + 100순번(`MaxSequenceNumberGap` 11)을 넘는 패킷이 오면 검사를 끝낸다(917~937).
- `CanSwitchToSpatialLayer`(1256) : 정렬 가능한(오프셋 계산 가능) 레이어만 상향 후보.

### 5.8 대역폭 추정·분배

- **기본 경로(libwebrtc)** : `TransportCongestionControlClient`가 GoogCC(`webrtc::GoogCcNetworkControllerFactory`, 42~47)와 페이서·프로버를 감싼다. 송신 패킷마다 transport-wide 순번 기록(`w/Transport.cpp:3155~`), TCC 피드백·REMB·RR을 넣으면 목표 전송률이 나오고 1초 간격 이벤트(`AvailableBitrateEventIntervalMs` 20)로 분배를 트리거.
- **분배(기본)** `DistributeAvailableOutgoingBitrate`(`w/Transport.cpp:2721`, 기본 분기 2745~) : 우선순위>0 Consumer를 모아 **1회차는 모두 한 단계씩**, 이후 우선순위만큼 반복하며 `IncreaseLayer`로 레이어를 한 칸씩 올리고, 마지막에 `ApplyLayers`로 일괄 적용. REMB일 때는 손실률 보정(손실 <2% → ×1.08, >10% → 감산, `w/SimulcastProducerStreamManager.cpp` `IncreaseLayer` 362~395).
- **내장 BWE(옵션)** `w/BWE/` : 지연 기반(Trendline·Overuse), 손실 기반, AIMD, 프로빙, ALR, 수신 측 TCC 피드백 생성까지 자체 구현. 분배는 `BitrateAllocator::Distribute`(`w/BWE/BitrateAllocator.cpp:22`) — 각 후보가 "가능한 비트레이트 지점" 목록을 내고, 1회차는 모두 1지점, 이후 가중치 비례 분배, 라운드 끝에 일괄 적용, **하향 후 재상향에는 1.2배 히스테리시스**(17·205)로 레이어 출렁임 방지.
- **TCC 서버**(`w/TransportCongestionControlServer.cpp`) : 발행자에게 100ms마다 transport-cc 피드백(12), 최대 수신 대역 제한 시 REMB(13). 발행자 브라우저의 GCC가 이를 보고 simulcast 레이어 송신을 조절.

### 5.9 스트림 점수·비활성

- `RtpStreamRecv::UpdateScore`(`w/RTP/RtpStreamRecv.cpp:936`) : 구간별 기대/수신/손실/복구/재전송 수로 "전달 비율의 4제곱 × 10"을 반올림해 0~10 점수로. 손실 수에서 복구(재전송으로 메운) 패킷 수 × 가중치를 빼 주는데, 가중치는 (1/(복구 비율+1))⁴ × (복구/재전송)이라 복구 비율이 높거나 재전송 대비 복구가 적을수록 작아진다(1018~1036).
- 1.5초(DTX 오디오 5초) 무패킷이면 비활성 → 점수 0(19~20, `OnTimer` 1061). 점수 0인 simulcast 레이어는 선택 후보에서 빠진다 → **발행자 업링크가 나빠 h 레이어가 끊기면 자동으로 m/l로 내려가는 근거**.

### 5.10 시그널링을 앱에 맡기는 철학

- 라이브러리는 SDP도 다루지 않는다. 클라이언트(`mediasoup-client`)가 RTP 능력·파라미터 JSON을 만들고, 서버 앱이 원하는 전송 수단(WebSocket·HTTP)으로 `createWebRtcTransport → connect → produce/consume`을 중계한다(`README.md:39~58`). protoo는 데모용 별도 저장소 [확인중 : mediasoup-demo 저장소 — 이번 사본 밖].
- 시사점 : 우리 시그널링 API를 **객체 경계 그대로**(transport·produce·consume·pause·resume·setLayers) 동사로 설계하면 서버 모듈과 1:1 대응. 단, 우리는 표준 WebRTC(SDP offer/answer, pion)를 쓰므로 RTP 파라미터 JSON 교환은 하지 않는다(7절).

### 5.11 BigBlueButton 사례 (공개 문서 범위)

- DECISION_02 1절 : BigBlueButton(LGPL)은 미디어에 mediasoup을 쓴다. 세부(웹캠·화면공유·청취 전용 오디오의 SFU 사용 방식, 기본 전환 버전)는 이번 세션 웹 검색 한도 초과로 확인하지 못했다 → **[확인중 : BigBlueButton 공식 문서 bbb-webrtc-sfu]**. 소스(LGPL)는 읽지 않았고 옮기지 않는다.
- 웨비나 관점에서 참고할 개념(문서 확인 후 확정) : 발표자 화면·웹캠을 각각 별도 Producer로, 청중은 수신 전용 Transport 1개에 Consumer 여러 개. [TBD : 확인 후 6절 반영]

---

## 6. seminar.pi 설계 반영안

**전제(S-1)** : pion은 ICE·DTLS·SRTP·RTP/RTCP 직렬화만. `webrtc.API`를 만들 때 인터셉터 레지스트리를 **비워 둔다**(기본 NACK·TWCC·GCC·RTCP 리포트 인터셉터 미등록). 따라서 SR/RR 생성, NACK 생성·응답, PLI 조절, TWCC 피드백·추정, 재전송 버퍼는 **전부 우리 코드**다.
**전제(웨비나)** : 발표자 1(+패널 소수)만 Producer, 청중 ≤30은 Consumer만. 방 1개 = Router 1개 = goroutine 경계 1개.

### 6.1 개념 매핑표

| mediasoup | seminar.pi 모듈 | 차이·결정 |
|---|---|---|
| Worker | `media` 프로세스 자체 | 프로세스 분리 안 함. Go 런타임이 멀티코어 처리 |
| Router | `room/` | 방 1개당 Router 1개. producer→consumers 표 소유 |
| WebRtcTransport | `transport/` | pion `PeerConnection` 1개 = Transport 1개. 발표자는 송신·수신 겸용 1개로 시작 [TBD : M1에서 PC 1개 vs 2개 결정] |
| RtpListener | `transport/`(OnTrack 매핑) | pion이 rid별 트랙을 주므로 매핑표만 |
| Producer + RtpStreamRecv | `producer/` | 레이어별 수신 스트림, 점수, 비활성, NackGenerator 소유 |
| Consumer + RtpStreamSend | `consumer/` | 구독자별 출력 SSRC 1개, SeqManager, 재전송 버퍼 |
| ProducerStreamManager | `consumer/` 내부 `layerPolicy` | Simple·Simulcast 2종만 |
| Router 분배 루프 | `forward/` | 패킷 1회 수신 → N 구독자 큐 |
| NackGenerator / RetransmissionBuffer | `nack/` | 양방향 모두 |
| KeyFrameRequestManager | `pli/` | 그대로 개념 채택 |
| TCC Client/Server, BitrateAllocator | `bwe/` | 직접 작성(M4), libwebrtc 대응물 없음 |
| trace 이벤트 | `metrics/` | 카운터·히스토그램으로 |
| PlainTransport | `record/` 후보 | M5 검토 |

### 6.2 모듈별 작성 계획

**signal/ (M1 작성 → M3 재정리)**
- M1 : WebSocket, 입장권(HMAC — 방·사용자·역할·만료) 검증, join/offer/answer/trickle/leave.
- M3 : mediasoup 동사 경계로 메시지 재정의 — `join`(역할 확정) → `transport.connect`(SDP) → `produce`(발표자·패널만, 역할 검사) → `consume`(**paused로 생성 → 클라이언트 준비 신호 → resume**) → `consumer.setPreferredLayers`(청중이 화질 고정) → `pause`/`resume` → `leave`. 서버→클라이언트 알림 : `producerClosed`, `producerPaused/Resumed`, `layersChanged`, `score`.
- 역할 검사는 signal에서 1번, room에서 다시 1번(R-P5 서버도 막는다).

**room/ (M1 최소 → M3 경계)**
```go
// Router 개념 — 방 1개의 단일 소유자. 상태 변경은 이 goroutine에서만.
type Room interface {
  AddPeer(p *Peer, role Role) error
  RemovePeer(peerID string)                // Transport 닫힘 → 소속 Producer/Consumer 계단식 정리
  OnNewProducer(pr *producer.Producer)     // 기존 청중 전원에게 Consumer 자동 생성(웨비나 편의)
  OnProducerClosed(pr *producer.Producer)  // 연결 Consumer 전부 Close + 클라이언트 알림
  Consume(peerID, producerID string, paused bool) (*consumer.Consumer, error)
}
```
- 늦게 들어온 청중 : 생성 시 Producer의 pause 상태·레이어 점수를 즉시 넘겨준다(5.1 `OnTransportNewConsumer` 개념).

**transport/ (M1)**
- pion `SettingEngine`(포트 범위·NAT 1:1 IP), 빈 인터셉터 레지스트리, `OnTrack`에서 (rid, ssrc) → Producer 레이어 매핑. RTCP 읽기 루프(`ReadRTCP`)에서 패킷 종류별로 분배 — mediasoup `HandleRtcpPacket`(4.3절)의 switch 구조 그대로 : RR → consumer RTT·손실, NACK → consumer 재전송, PLI/FIR → pli, TWCC → bwe.
- **M1부터 필요한 우리 코드** : 인터셉터를 끄면 pion이 SR/RR도 안 보낸다 → 최소 SR(구독자 방향, 립싱크·RTT용)·RR(발행자 방향) 생성기를 M1 또는 M2 첫 작업에 넣는다 [확인중 : M1 실측 — SR 없이 iOS WKWebView 립싱크 영향].

**producer/ (M1 → M2 → M4)**
```go
type Producer struct { ID string; Kind Kind; Layers []*RecvStream /* rid l,m,h */ }
type RecvStream interface {
  Receive(pkt *rtp.Packet, at time.Time) (keyframe bool)  // 순번 검증·키프레임 판별·NACK 입력
  Score() uint8                                           // 0~10, M4
  Inactive() bool                                         // 1.5초 무패킷
}
```
- 키프레임 판별(VP8·H.264 페이로드 파싱)은 우리가 작성 — Pi Browser iOS는 H.264 우선 가능성 [확인중 : M0 실측 코덱].
- mappedSsrc 개념 : Router 안에서는 "Producer ID + 레이어 번호"로만 식별하고 원본 SSRC는 producer 밖으로 내보내지 않는다.

**consumer/ (M1 최소 → M3 재편 → M4 simulcast)**
```go
type Consumer struct {
  OutSSRC uint32; seq *SeqRewriter; tsOffset uint32
  policy LayerPolicy   // Simple | Simulcast
  rtx *nack.SendBuffer
}
type Decision int // Forward | Drop | SilentDrop | Buffer   ← mediasoup 4분류 채택
type LayerPolicy interface {
  Process(pkt *rtp.Packet, layer int, lastHadMarker bool) (Decision, SyncInfo)
  SetTarget(spatial, temporal int)
  Options() []BitrateOption          // bwe가 쓰는 "가능한 지점" 목록(M4)
}
```
- **패킷 공유와 헤더 재작성** : mediasoup은 같은 버퍼를 고쳐 쓰고 되돌린다(4.2절 10단계). Go에서는 **페이로드 바이트는 공유, 헤더는 구독자별 값 복사**(pion `rtp.Header`는 값 타입)로 한다 — 되돌리기 단계가 없어 goroutine 간 경합이 없다. 단, `rtp.Header`의 `Extensions`·`CSRC`는 슬라이스라 값 복사해도 배열을 공유한다 → 구독자별 MID 확장 갱신(mediasoup `Router.cpp:689~694` `UpdateMid`에 해당) 등 확장을 고칠 때는 `Extensions`를 구독자별로 새로 만들어야 경합이 없다(`go test -race`로 확인). 재전송 버퍼도 (공유 페이로드 + 구독자 헤더 필드)로 저장.
- SeqRewriter : `Sync`/`Drop`/`Input` 3동작(5.6). M1은 단일 레이어라 오프셋 고정, M3에서 Drop 기록 추가, M4 전환 시 Sync.
- 시작 시 키프레임 동기화 : 첫 키프레임 전 패킷은 Buffer, 키프레임 도착 시 Sync + 버퍼 방출(Simple 정책도 동일 — `SimpleProducerStreamManager::ProcessRtpPacket` 222).

**forward/ (M1 → M3)**
- room goroutine이 아니라 **Producer 레이어별 읽기 goroutine → 구독자별 송신 큐(채널, 크기 제한)**. 느린 청중 1명이 전체를 막지 않도록 큐가 차면 그 구독자만 Drop 처리하고 키프레임 요청 대상으로 표시. mediasoup은 단일 스레드라 이 문제가 없다 — **우리가 새로 설계해야 하는 부분**.
- 구독자 30명 기준 복제 비용 : 헤더 복사 30회/패킷, 페이로드 복사 0회.

**nack/ (M2)**
- 발행자 방향 `Generator` : 5.3 규칙 채택 — 목록 상한(초안 1,000)·나이 상한·재시도 10회·RTT 간격 재요청·40ms 타이머·목록 넘치면 키프레임 이전 잘라내기 → 그래도 넘치면 PLI로 전환.
- 구독자 방향 `SendBuffer` : 링 버퍼(순번 인덱스, 초안 비디오 3,000개·4초 / 오디오 2초), NACK 큐 중복 제거, **10ms마다 최대 N개 재전송**(초안 2, M2 netem 3% 손실 실측으로 조정), 최근 RTT 안 재전송 생략, 중복 순번 저장 거부.
```go
type Generator interface { Receive(seq uint16, keyframe, recovered bool); Pending(now time.Time) []uint16; SetRTT(d time.Duration) }
type SendBuffer interface { Store(h rtp.Header, payload []byte, at time.Time); OnNack(seqs []uint16); Tick(now time.Time) []OutPacket }
```
- RTX : M2는 같은 SSRC 재전송으로 시작(브라우저 수용 확인 필요), M2 후반에 RTX(별도 SSRC·PT) [확인중 : M2 — Pi Browser가 RTX 협상하는지].

**pli/ (M2)**
- 5.5 개념 그대로 : SSRC(=Producer 레이어)별 대기 요청 1개, 1초 타임아웃 1회 재시도, 지연기(초안 0ms로 시작, 청중 30명 시험에서 PLI 폭주 보이면 500~1,000ms) [TBD : M4 측정 후].
- 입력원 4가지 : 청중 PLI/FIR, 새 Consumer 합류, 레이어 전환 목표 설정, NACK 목록 넘침.

**bwe/ (M4 — 전부 직접 작성)**
- 수신 측(발행자 방향) : TWCC 피드백 생성기(100ms 간격) — 발행자 브라우저가 simulcast 송신량을 스스로 조절하게.
- 송신 측(청중 방향) : transport-wide 순번 부여 + 송신 시각 기록 → TWCC 피드백 해석 → 지연 기반(도착 간격 기울기) + 손실 기반 추정 → 가용 대역.
- 분배 : 청중 1명당 비디오 Consumer가 보통 1~2개(발표자·패널)라 mediasoup처럼 복잡한 다자 분배는 불필요. **1회차 최저 레이어 보장 → 남는 대역으로 한 단계씩 상향 → 재상향 시 1.2배 히스테리시스 → 라운드 끝 일괄 적용** 4규칙만 채택(5.8).
- 레이어 후보 제한 : 점수 0·비활성 레이어 제외, TS 정렬 불가 레이어 제외(5.7).
- 비교 기준은 LiveKit(K-5) — 추정 알고리즘 상세는 REA_03(LiveKit) 결과와 합쳐 M4 착수 때 확정 [TBD].

**record/ (M5)** — 후보 : (a) 발표자 Producer에 서버 내부 Consumer를 붙여 WebM/IVF로 기록, (b) PlainTransport 개념처럼 평문 RTP를 별도 프로세스(ffmpeg)로. 선택은 M5 [TBD].

**metrics/ (M3 골격 → M5)** — mediasoup trace 종류를 카운터로 : 수신/송신 패킷, NACK 수·재전송 수·복구 수, PLI/FIR 수, 레이어 전환 수, 점수 분포, RTT, 가용 대역. PRD_01 4절 지표(손실 회복 시간·화질 하향 반응)를 계산할 수 있게 레이어 전환·키프레임 도착 시각을 이벤트로 남긴다.

### 6.3 단계별 요약

| 단계 | mediasoup에서 가져올 것 |
|---|---|
| M1 | Router 표(producer→consumers), 키프레임 대기 후 송출(Buffer→Sync), 출력 SSRC 고정, 최소 SR/RR |
| M2 | NackGenerator 규칙, SendBuffer + 재전송 페이싱, KeyFrameRequestManager(대기 1개·1초 재시도·지연기) |
| M3 | 객체 경계·닫힘 전파·늦은 합류 상태 전달, 4분류 Decision, SeqRewriter(Drop/Sync), 시그널링 동사 재정의, consume paused→resume, 비활성 감지 |
| M4 | simulcast 전환 규칙(키프레임·TS 정렬·75ms 상한·프레임 미완료 skip·옛 패킷 차단), 점수, 분배 4규칙, TWCC 양방향 |
| M5 | trace → metrics, 녹화 경로 |

---

## 7. 채택하지 않을 것과 이유

| 항목 | 이유 |
|---|---|
| Worker 별도 프로세스 + FlatBuffers 채널 | Go 단일 프로세스로 충분. 프로세스 간 직렬화 비용·복잡도만 늘어남 |
| 자체 ICE·DTLS·SRTP·SCTP 구현 | S-1 — pion 사용 |
| RTP 능력·파라미터 JSON 교환(ORTC 방식, `n/ortc.ts`) | 우리는 표준 SDP offer/answer. mediasoup-client 같은 클라이언트 라이브러리를 만들지 않는다 |
| libwebrtc GoogCC 이식 | S-1(인터셉터 미사용)·S-2(코드 이식 금지) — 개념만 참고해 직접 작성 |
| SvcProducerStreamManager | Pi Browser(특히 iOS)에서 SVC(VP9/AV1 L3T3) 송신 보장 없음, simulcast로 충분 [확인중 : M0 코덱 실측] |
| PipeTransport·pipeToRouter | 30명 목표에선 VM 1대·Router 1개. 수백 명 확장 시 재검토 |
| DataProducer/DataConsumer(SCTP) | 채팅·Q&A·반응은 WebSocket 시그널링 경로로 충분. 데이터채널 추가 시 Pi WebView 호환 검증 부담 |
| ActiveSpeaker/AudioLevel Observer | 웨비나는 발표자 고정. 패널 발화 표시가 필요해지면 재검토 |
| 패킷 제자리 수정 후 복원 패턴 | 단일 스레드 전제 기법. Go 동시성에서는 헤더 값 복사가 안전 |
| 모든 Consumer 우선순위(`setPriority`) | 청중 Consumer가 1~2개라 의미 작음. 필요 시 발표자 화면 > 패널 웹캠 고정 가중치로 대체 |

---

## 8. 위험·주의

| 구분 | 내용 | 대응 |
|---|---|---|
| 라이선스 | mediasoup ISC·libwebrtc BSD는 허용형이나 **S-2로 코드 이식 자체를 금지**. BigBlueButton은 LGPL, MiroTalk은 AGPL [확인중 : 라이선스 원문] — 소스 열람 범위 밖 유지 | 이 문서처럼 동작 설명·경로 인용만. 리뷰 시 "원본과 같은 구조의 함수 본문" 여부 점검 |
| 복잡도 | simulcast 전환 한 파일이 1,345줄 — 버그 수정 이력 다수(CHANGELOG의 SimulcastConsumer 항목 15건+) | M4에서 **엣지 케이스 목록**(5.7 각 항목)을 단위 테스트 표로 먼저 만들고 구현 |
| 동시성 | mediasoup은 단일 스레드라 경합이 없다. Go로 옮기면 room 상태·consumer 큐·재전송 버퍼 접근 경합이 생김 | 방 상태는 room goroutine 단일 소유, 패킷 경로는 구독자별 goroutine + 값 복사. `go test -race` 필수 |
| 인터셉터 미사용의 빈칸 | pion 기본 인터셉터를 빼면 SR/RR·NACK·TWCC·PLI 모두 사라짐 — M1에서도 SR/RR 부재가 영향 줄 수 있음 | M1 체크리스트에 "SR/RR 최소 생성" 포함, M0/M1 실기기 관찰 |
| Pi Browser | iOS WKWebView의 simulcast 송신(rid)·RTX·TWCC·abs-capture-time 지원 여부 미확인. SR이 늦으면 TS 정렬 불가로 전환 지연(5.7) | M0·M1에서 `webrtc-internals` 대응 관찰 [확인중 : M0 실기기]. abs-capture-time 없으면 SR 경로만 사용 |
| 자동재생·첫 화면 | consume paused→resume 패턴이 첫 화면 시간을 늘릴 수 있음 | 첫 키프레임 요청을 resume 즉시 발행(pli 경로), 4절 "첫 화면 시간"으로 측정 |
| 내장 BWE 성숙도 | mediasoup 자신도 내장 BWE를 기본 꺼 둠(`meson_options.txt:9`) — 아직 실험 단계로 보임 | bwe 설계 근거는 mediasoup 하나에 의존하지 않고 LiveKit(REA_01) 결과와 교차 |
| 운영 | 재전송 버퍼(3,000개×구독자)·NACK 큐가 메모리를 키움 | 페이로드 공유로 구독자당 헤더만 저장, metrics에 버퍼 사용량 |

---

## 9. 근거 파일 목록 (커밋 `aaf6e3a`)

| 파일 | 본 함수·줄 |
|---|---|
| `README.md` | 39~58 (설계 목표·시그널링 무관) |
| `LICENSE`, `worker/deps/libwebrtc/LICENSE`·`PATENTS` | 라이선스 |
| `CHANGELOG.md` | 3.31.0, 3.29.0(PR #1965), 3.20.6(PR #1731), 3.20.5 |
| `worker/meson_options.txt` | 9 (`ms_use_builtin_bwe`) |
| `worker/src/RTC/Router.cpp` | `OnTransportNewProducer` 494, `OnTransportProducerClosed` 513, `OnTransportProducerPaused` 558, `OnTransportProducerRtpPacketReceived` 669, `OnTransportNewConsumer` 739, `OnTransportConsumerClosed` 786, `OnTransportConsumerKeyFrameRequested` 836 |
| `worker/src/RTC/Transport.cpp` | `CloseProducersAndConsumers` 244, `ReceiveRtpPacket` 1738, `HandleRtcpPacket` 2113, `SendRtcp` 2546, `DistributeAvailableOutgoingBitrate` 2721, `OnConsumerSendRtpPacket` 3101, `OnConsumerRetransmitRtpPacket` 3213 |
| `worker/src/RTC/RtpListener.cpp` | `GetProducer` 187 |
| `worker/src/RTC/Producer.cpp` | `ReceiveRtpPacket` 575, `RequestKeyFrame` 820, `GetRtpStream` 856, `MangleRtpPacket` 1202, keyFrameRequestDelay 204 |
| `worker/src/RTC/Consumer.cpp` | `ReceiveNack` 1558, `ReceiveKeyFrameRequest` 1585, `SendRtpPacket` 1222(재작성 1344, 복원 1412, 버퍼 방출 1431), `UserOnPaused` 1720 |
| `worker/include/RTC/Consumer.hpp` | `IsActive` 127 |
| `worker/include/RTC/ProducerStreamManager.hpp` | `Listener`, `RtpPacketProcessResult`, 가상 함수 목록 |
| `worker/src/RTC/SimpleProducerStreamManager.cpp` | `ProcessRtpPacket` 222 |
| `worker/src/RTC/SimulcastProducerStreamManager.cpp` | `MaxSequenceNumberGap` 11, `IncreaseLayer` 362, `ProcessRtpPacket` 611(75ms 832, sync 901, 옛 패킷 917~937), `RecalculateTargetLayers` 1125, `CanSwitchToSpatialLayer` 1256, `CanGiveUpTsReferenceSpatialLayer` 1292, `GetTimestampOffset` 1306 |
| `worker/src/RTC/SeqManager.cpp` | `Sync` 50, `Drop` 66, `Input` 92, `ClearDropped` 232 |
| `worker/src/RTC/NackGenerator.cpp` | 상수 11~15, `ReceivePacket` 43, `AddPacketsToNackList` 168, `RemoveNackItemsUntilKeyFrame` 221, `GetNackBatch` 246 |
| `worker/src/RTC/RTP/RtpStreamRecv.cpp` | 상수 19~25, `ReceivePacket` 310, `ReceiveRtxPacket` 412, `UpdateScore` 936, `OnTimer` 1061, `OnNackGeneratorNackRequired` 1107 |
| `worker/src/RTC/RTP/RtpStreamSend.cpp` | 상수 18~23, `ReceivePacket` 102, `ReceiveNack` 148, `RetransmitPendingPackets` 555 |
| `worker/include/RTC/RTP/RtpStreamSend.hpp` | 37·41 (재전송 최대 지연 4,000/2,000ms) |
| `worker/src/RTC/RTP/RetransmissionBuffer.cpp`, `worker/include/RTC/RTP/RetransmissionBuffer.hpp` | `Item`, `Insert`, `IsTooOld` 478 |
| `worker/src/RTC/KeyFrameRequestManager.cpp` | 7, `KeyFrameNeeded`, `ForceKeyFrameNeeded`, `KeyFrameReceived`, `OnKeyFrameRequestTimeout`, `OnKeyFrameDelayTimeout` |
| `worker/src/RTC/TransportCongestionControlClient.cpp` | 상수 17~20, `InitializeController` 60(GoogCC 42~47) |
| `worker/src/RTC/TransportCongestionControlServer.cpp` | 상수 12~15, `IncomingPacket` 101, `FillAndSendTransportCcFeedback` 164 |
| `worker/src/RTC/BWE/BitrateAllocator.cpp` | `HysteresisFactor` 17, `Distribute` 22 |
| `node/src/Transport.ts` | `produce` 481, `consume` 621, `enableTraceEvent` 1017 |
| `node/src/Router.ts` | `createWebRtcTransport` 295, `pipeToRouter` 1021, `canConsume` 1444 |
| `node/src/Consumer.ts` | `pause` 289, `resume` 309, `setPreferredLayers` 329, `setPriority` 383, `requestKeyFrame` 418 |
| `node/src/ortc.ts` | `getConsumerRtpParameters` 614 |
| `node/src/{Worker,Router,Transport,WebRtcTransport,Producer,Consumer,DataProducer}Types.ts` | 이벤트 타입(5.1 표의 줄) |

## 검증 기록

| 항목 | 내용 |
|---|---|
| 검증 일자 | 2026-10-25 |
| 방법 | 로컬 사본(`aaf6e3a`, 커밋일 2026-10-22, `package.json` 3.31.0) 소스와 직접 대조 — grep·줄 확인, 빌드·실행 없음 |
| 검증 건수 | 사실 주장 112건(경로·줄·함수명·상수·동작 설명·CHANGELOG·Node API 줄·규모 수치) |
| 일치 | 106건 — 규모(74,804/37,044/26,986줄)·핵심 파일 줄 수 10종·BWE 28파일·`meson_options.txt:9`·Router/Transport/Producer/Consumer/SeqManager/NackGenerator/RtpStreamRecv/RtpStreamSend/KFRM/TCC/BitrateAllocator 함수 줄·상수, Node API 줄·이벤트 타입, CHANGELOG(3.31.0 PR #2002, 3.29.0 PR #1965, 3.20.6 PR #1731, 3.20.5 PR #1807) |
| 정정 | 6건 (아래) |
| S-2 | 원본 코드 블록 복사 없음 — Go 코드 블록 3개는 우리 설계 시그니처 |
| S-1 | 모순 없음 — 인터셉터 레지스트리 비움·NACK/TWCC/GCC/SR·RR 직접 작성 전제 일관 |

정정 목록
1. 옛 패킷 차단 줄 `950~964`·`950~959`·`964` → `917~937`(3곳), 동작 설명을 "기준+100순번 넘는 패킷이 오면 검사 종료"로 정확화.
2. `ForceKeyFrameNeeded` 줄 `w/Producer.cpp:673` → `675`, 조건(첫 패킷 비키프레임·Producer 비일시정지) 보강.
3. 점수 설명 "복구 패킷 비중이 클수록 덜 깎는다"(코드와 반대 방향으로 읽힘) → 가중치 식 기준으로 재서술.
4. TCC 서버 도착 시각 기록은 기본 빌드(`#ifndef MS_USE_BUILTIN_BWE`)에서만이라는 조건 추가.
5. `GetNackBatch` 줄(246)·`sendNackDelayMs` 줄(260) 보강.
6. 6.2 consumer 설계 : `rtp.Header` 값 복사 시 `Extensions`·`CSRC` 슬라이스 공유 → 구독자별 확장 재작성 시 경합 위험 주의 추가.

확인 불가로 남긴 것 : consume `paused:true` 권고(공식 문서), protoo 데모 저장소, BigBlueButton 사용 세부, Pi Browser 코덱·RTX·TWCC 지원 — 모두 본문에 이미 [확인중 : 대상] 형식으로 표기.

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-25 | v0.1 — mediasoup `aaf6e3a` 소스 정독 결과, seminar.pi 모듈 매핑·단계별 반영안 |
| 2026-10-25 | v0.2 — 반박 검증 : 112건 대조, 6건 정정(검증 기록 절) |
