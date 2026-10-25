# Galápagos M1~M5 병렬 구현 — 파일 소유표·계약

> 작성 2026-10-25 · 설계 정본 `../docs/PRD_02_ENGINE_DESIGN.md`(3.1·3.3·4·5·8절) · 단계 정의 `../docs/PRD_01_MEDIA_ENGINE.md` 5절
> 원칙 : **자기 파일만 고친다.** 다른 단계 파일의 함수는 아래 "고정 계약" 시그니처로만 부른다. 시그니처를 바꿔야 하면 소유자·마스터와 먼저 합의한다.
> 공통 : S-1(빈 인터셉터 레지스트리 유지) · S-2(원본 소스 열람·복사 금지, 출처는 "REA_0x n절"·"PRD_02 D-n") · 새 외부 Go 의존성 금지 · D-10(단일 소유 + 채널, 공유 상태는 atomic·잠금) · git push·운영 배포 금지.
> 새 파일은 자기 패키지·자기 단계 범위 안에서 자유롭게 추가할 수 있다(이 표에 한 줄 추가).

## 1. 단계별 파일 소유표 (경로는 `media/` 기준, Next 는 `seminar.pi/` 기준)

| 단계 | 소유 파일 | 할 일 요약 |
|---|---|---|
| **M1** 발표자 1 → 청중 2 영상 | `cmd/galapagos/*` · `internal/signal/{doc,envelope,session,server}.go` · `internal/bora/{doc,room,manager}.go` · `internal/capri/*` · `internal/santorini/{doc,producer,layer}.go` · `internal/forward/{doc,queue,queue_test}.go` · `internal/jeju/{doc,consumer,rtcp}.go` · `internal/rtpx/*` · `internal/rtcpx/{doc,report,report_test}.go` · Next `src/app/[locale]/lab/sfu/page.tsx`·`sfu-lab.tsx` | WS 서버(/signal·/healthz, RFC 6455 표준 라이브러리 직접), UDP mux, capri.NewAPI(cmd newAPI 이전 + S-1 테스트 유지), Room.Join/Produce/Consume, Layer.Run 수신 루프, Consumer.Run 송신 루프, 하류 SR·상류 RR, 시험 화면 |
| **M2** 끊김 회복·안정화 | `internal/nack/*` · `internal/pli/*` · `internal/forward/congest.go` · `internal/rtcpx/feedback.go` · `internal/santorini/feedback.go` · `internal/jeju/{replay,retransmit}.go` · `internal/metrics/counters.go` | LossTracker·SendMeta 완성, 하류 재전송(억제·3회·PLI 후 중단), 캐시 미스 50ms 묶음 상류 NACK, Limiter 1초 재시도·FIR 순번, 프레임 단위 버림, 신규 구독자 캐시 재생, 카운터 수집 |
| **M3** 엔진 구조 정리 | `internal/jeju/{decision,seqrewriter}.go` · `internal/bora/lifecycle.go` · `../docs/SIGNAL_API.md` | 4분류·SeqRewriter Drop/옛 패킷 차단, paused→resume, 닫힘 연쇄·producerClosed 알림·늦은 합류자 상태 전달, 시그널링 메시지 확정 문서 |
| **M4** 화질 자동 조절·청중 30명 | `internal/bwe/*` · `internal/jeju/layerpolicy.go` · `internal/santorini/activity.go` · `internal/metrics/score.go` · `internal/rtcpx/remb.go` · (신규) `internal/rtpx/vp8pid.go` | Allocator·혼잡 판정·탐침, simulcast 전환 정책, 레이어 활성·비트레이트, 품질 점수(LiveKit 식), REMB 생성·파싱, VP8 picture ID 연속화 |
| **M5** 방 입장·녹화 | `internal/signal/ticket.go` · `internal/record/*` · `internal/bora/admin.go` · (신규) `internal/metrics/export.go` · Next `src/app/api/media/ticket/route.ts`·`src/lib/media-ticket.ts` | JWT HS256 Verify/Sign(60초·jti 일회용·aud "seminar-media", **C-8 승인 대기**), 녹화기, 방 관리 API, 입장권 발급(로그인 확인 후) |
| 계약(이 커밋) | `OWNERSHIP.md` · `go.mod`·`go.sum` · Next `src/env.ts`·`.env.example` | 변경 필요 시 마스터에게 요청 |

- `doc.go` 는 표에 적힌 단계(패키지 주 소유자)가 고친다. 테스트 파일은 그 대상 파일 소유자 것(예 `nack/cache_test.go` = M2, `jeju/jeju_test.go` 중 SeqRewriter = M3 · singleLayer = M4 — 겹치면 각자 새 `_test.go` 파일을 만든다).
- **합류 지점(다른 단계가 채우는 빈 함수)** — 호출자는 지금 시그니처 그대로 부르고, 본문은 소유자가 채운다.

| 호출자(단계) | 부르는 함수 | 소유 파일(단계) | 지금 동작 |
|---|---|---|---|
| Layer.Run(M1) | `l.feedback(now, ssrc, rtt) []rtcp.Packet` | santorini/feedback.go(M2) | Limiter Tick 이면 PLI |
| Layer.Run(M1) | `l.observe(n, now)` | santorini/activity.go(M4) | 없음 |
| Layer.Run(M1) | `l.cache.Store` · `l.loss.Receive` | nack(M2) | 캐시 동작 · 손실 기록 없음 |
| Consumer.Run(M1) | `c.replay() bool` | jeju/replay.go(M2) | false → 호출자가 키프레임 요청 |
| Consumer.Run(M1) | `c.decide(it) bool` | jeju/decision.go(M3) | policy 판정 + Sync/Drop |
| Consumer.Run(M1) | `c.seq.Input(ext)` | jeju/seqrewriter.go(M3) | 오프셋 재작성 |
| Consumer.Run(M1) | `c.recordSent(out, it, now)` | jeju/retransmit.go(M2) | SendMeta.Push(빈 동작) |
| Consumer.OnRTCP(M1) | `c.onNACK(n)` | jeju/retransmit.go(M2) | 없음 |
| Consumer(M1) | `newPolicy(p)` · `LayerPolicy` | jeju/layerpolicy.go(M4) | 단일 레이어, 첫 키프레임 전 Buffer |
| Room.Leave/Close(M1) | `r.closePeer(id)` · `r.closeProducer(id)` | bora/lifecycle.go(M3) | 자원 닫기·표 제거 |
| Queue.Offer(M1) | `q.dropping(it)` · `q.onFull(it)` | forward/congest.go(M2) | 그 패킷만 버림 + 키프레임 필요 |
| signal.NewServer(M1) | `(*Verifier).Verify(raw, now)` | signal/ticket.go(M5) | 전부 거부(200ms 지연) |
| cmd/galapagos(M1) | `bora.AdminHandler(m, secret)` | bora/admin.go(M5) | 501 |
| capri.OnREMB(M1 연결점) | `(*bwe.Allocator).OnREMB` | bwe(M4) | 없음 |

## 2. 고정 계약 요약

| 패키지 | 계약 |
|---|---|
| rtpx | `SeqExtender.Extend(uint16) uint64`(1<<16 위 시작) · `SeqLess(a,b)` · `IsVP8Keyframe(payload) bool` |
| forward | `Item{ExtSeq, Idx, Key, Marker, Layer, At}` · `NewQueue(size)` · `Offer(it) (dropped bool)` 비차단·다중 생산자 안전 · `C()` · `TakeKeyframeNeed()` · `Dropped()` |
| nack | `NewPacketCache(slots)` · `Store(ext, ts, key, marker, pkt) idx` · `GetAt(ext, idx, dst) n` · `Get(ext, dst) n` · `LastKeyframe()` / `LossTracker{Receive, Due(now, rtt) []rtcp.NackPair, Overflow}` / `SendMeta{Push(out, src, layer, at), Resolve(out, now, rtt) (src, layer, ok)}` |
| pli | `Reason`(SubscriberPLI·SubscriberFIR·NewConsumer·LayerSwitch·NackOverflow·QueueDrop) · `NewLimiter(layer)` · `Need(r)` · `KeyframeSeen()` · `Tick(now) bool` — 레이어 수신 고루틴 전용 |
| rtcpx | `NTPTime` · `RTT(lsr, dlsr, now)` · `SenderReport` · `ReceiverReport` · `NACK` · `PLI` · `FIR(…, seq)` · `REMB` · `ParseREMB` |
| santorini | `Kind`(Audio·Video) · `Source` · `LayerIndex(rid)` · `New(id, peerID, kind, src)` · `AddLayer(rid, Reader, RTCPWriter) *Layer` · `Layer(i)` · `Priority/SetPriority` · `Close/Done` / Layer : `Cache()` · `LastSR() (SR, ok)` · `OnSR(ntp, ts, at)` · `RequestKeyframe(r)` 비차단 · `Subscribe/Unsubscribe(q)` · `Active()` · `Bitrate()` · `Run(r, up)` |
| jeju | `Writer{WriteRTP(*rtp.Packet)}` · `New(id, producer, out, outSSRC, paused)` · `Run()` · `OnRTCP([]rtcp.Packet)`(capri.RTCPSink) · `Pause/Resume`(resume 즉시 키프레임) · `SetTarget(layer, paused)`(bwe.Target) · `SetMax(layer)` · `Close/Done` · `Decision{Forward, Drop, SilentDrop, Buffer}` · `Switch{From, To}` · `LayerPolicy{Decide, SetTarget, SetMax, State}` · `SeqRewriter{Sync, Drop, Input}` |
| capri | `Dir{Publish, Subscribe}` · `Config{UDPPort, PublicIP}` · `RTCPSink` · `New(api, dir, ice)` · `ApplyOffer` · `CreateOffer` · `ApplyAnswer` · `AddCandidate` · `OnCandidate` · `OnConnected` · `OnTrack(fn(tr, rx))` · `AddTrack(track, sink)` · `RemoveTrack` · `OnREMB` · `WriteRTCP` · `Close` |
| bora | `NewRoom(id, cap, end)` · `Join(t, s) (*Peer, *signal.Error)` · `Leave` · `Produce(peerID, kind, src)` · `Consume(peerID, producerID, paused)` · `SetPriority` · `Close` / `NewManager()`(signal.Handler 구현) · `Rooms()` · `CloseRoom(id)` · `AdminHandler(m, secret)` |
| signal | `Envelope{t,id,m,ok,d,e}` · 메서드·알림 상수 `M*`/`N*` · `ErrCode` 10종 · 페이로드 타입(JoinReq/JoinRes/SDP/ProduceReq/…/ScoreNtf) · `Session{ID, Send, Close}` · `Handler{Join, Request, Left}` · `NewServer(h, v)` · `Role`·`Ticket` 클레임 · `NewVerifier(secret)` · `Verify(raw, now)` · `Sign(t, secret)` |
| bwe | `AllocState{Stable, Deficient}` · `Target` · `ConsumerView`(값 복사) · `NewAllocator()` · `Add/Remove` · `OnREMB` · `OnNackStats` · `OnConsumerChanged` · `State` · `Close` |
| record | `New(path) (*Recorder, error)` · `WriteRTP`(jeju.Writer) · `Close` |
| metrics | `Counters`(atomic 필드) · `Global` · `Sample` · `Score(s) (score, grade)` |

의존 방향(순환 없음, `go list` 확인) : `bora → {signal, capri, santorini, jeju, bwe}` · `jeju → {santorini, forward, nack, pli}` · `santorini → {forward, nack, pli, rtcpx, rtpx}` · `record → jeju` · 나머지(signal·capri·forward·nack·pli·bwe·rtcpx·rtpx·metrics)는 내부 의존 없음.

## 3. 환경변수

### 엔진(`cmd/galapagos`, M1 이 읽기 구현)

| 이름 | 기본 | 의미 | 단계 |
|---|---|---|---|
| `MEDIA_LISTEN` | `:7880` | HTTP(/signal WS·/healthz) 대기 주소 | M1 |
| `MEDIA_UDP_PORT` | `7882` [TBD] | UDP mux 단일 포트(SettingEngine) | M1 |
| `MEDIA_PUBLIC_IP` | 없음 | NAT 1:1 공인 IP(VM) | M1 |
| `MEDIA_TOKEN_SECRET` | 없음(필수, 32자 이상) | 입장권 HS256 키 — Next 와 같은 값 | M5(M1 은 읽어서 NewVerifier 로) |
| `MEDIA_DEV_TICKET` | 없음 | `1` 이면 개발용 입장권 발급 엔드포인트 허용 — 운영 금지(R-P6 : `NODE_ENV`·운영 가드 첫 줄) | M1 |
| `MEDIA_ALLOWED_ORIGINS` | 없음 | WS Origin 허용 목록(쉼표) | M1 |
| `MEDIA_ICE_SERVERS` | 없음 | join 응답 iceServers(JSON) — TURN 은 M2 | M1·M2 |
| `MEDIA_RECORD_DIR` | 없음(미설정 = 녹화 끔) | 녹화 파일 저장 위치 | M5 |

### Next(`src/env.ts`·`.env.example`, 이 커밋)

| 이름 | 구분 | 검증 |
|---|---|---|
| `MEDIA_TOKEN_SECRET` | server | `min(32)`, optional |
| `NEXT_PUBLIC_MEDIA_WS_URL` | client | `ws://`·`wss://`, optional (예 `ws://localhost:7880/signal`) |

## 4. 확인 방법(각 단계 공통)

```bash
export PATH="/c/Program Files/Go/bin:$PATH"; cd sitemap/seminar.pi/media
go vet ./... && go build ./... && go test ./...   # CGO 없음 → -race 불가, 보고에 "race 미검증" 명시
cd .. && pnpm exec tsc --noEmit                     # Next 변경 시. pnpm build·pnpm dev 금지(마스터 dev 3003 사용 중)
```
