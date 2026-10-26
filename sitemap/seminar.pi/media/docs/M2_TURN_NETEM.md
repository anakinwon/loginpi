# Galápagos M2 — TURN 경유·손실 시험 설정 초안

> 작성 2026-10-25 · 상태 **초안** — 실제 네트워크 실측 대기, 5절만 프로세스 내 모의 측정(2026-10-26) · 근거 PRD_02 6절 M2 ⑦⑨⑩·7.2, D-4·D-5

## 1. TURN 경유 (M2 ⑨)

- 자격 증명은 cafe.pi `POST /api/voice/turn-credentials` 방식을 그대로 쓴다(PRD_01 51행) — 우선순위 Cloudflare Realtime TURN → HMAC(coturn·Metered) → 공개 TURN(검증용). 영구 비밀은 서버에만, 클라이언트엔 단기 자격 증명만.
- seminar.pi 에 같은 라우트를 두고(Next, [TBD : 담당 단계·마스터 결정]) 시험 화면이 받은 `iceServers` 를 `RTCPeerConnection` 에 넣는다.
- 엔진 쪽은 TURN 서버가 아니라 **ICE 후보 상대**일 뿐이다. 엔진 join 응답의 `iceServers`(`MEDIA_ICE_SERVERS`, JSON 배열 `[{urls, username?, credential?}]`)는 정적 STUN 용이고, TURN 단기 자격 증명은 화면 서버가 직접 준다. [TBD : 엔진 응답에 TURN 을 실을지 — 실으면 엔진이 HMAC 비밀을 알아야 함]
- 강제 경유 시험 : 브라우저에서 `iceTransportPolicy: 'relay'` 로 연결해 relay 후보만으로 화면이 나오는지 본다(Galène relay 전용 시험 옵션 개념, REA_01 6.2 8).

## 2. 같은 SSRC 재전송과 SRTP 재전송 보호 창 (M2 ⑦, D-5)

- 재전송은 RTX 없이 **같은 SSRC·같은 출력 순번**으로 다시 보낸다(`jeju/retransmit.go`). pion 의 SRTP 재전송 보호 창이 작으면 늦은 재전송이 재전송 공격으로 오인돼 버려질 수 있다.
- 설정 지점 : capri `SettingEngine` — `SetSRTPReplayProtectionWindow(512)`·`SetSRTCPReplayProtectionWindow(512)`(REA_01 5.1 의 512 출발). 보호 끄기(`DisableSRTPReplayProtection`)는 보안 약화라 쓰지 않는다.
- 확인 : T2 에서 청중 `getStats` 의 `nackCount` 대비 `retransmittedPacketsReceived` 가 0 이 아닌지, 서버 `metrics.Retransmits` 와 비교. [확인중 : M2 실측]

## 3. 손실·지연 시험 (`media/scripts/netem.sh`, M2 ⑩)

| 시나리오 | 명령(서버 VM, 청중 IP 지정) | 보는 지표 | M2 통과 기준 |
|---|---|---|---|
| T2 균일 손실 3% | `sudo ./netem.sh eth0 t2 <청중IP>` | Q3·Q6·Q7, 캐시 미스율 | 화면 깨짐이 회복된다(PRD_02 6절) |
| T3 버스트 10% 5초 | `sudo ./netem.sh eth0 t3 <청중IP>` | Q3·Q7·Q8 | 5초 뒤 회복, PLI 레이어 간격 이하 |
| T6 150ms±30ms | `sudo ./netem.sh eth0 t6 <청중IP>` | Q2·Q7 | 억제 min(100ms,2RTT) 로 중복 NACK 이 폭주하지 않음 |
| T7 상류 3% | 발표자 쪽 장치에서 `t7` | Q3·Q8 | 청중 30명 PLI 가 레이어당 l 2회/초·m·h 1회/초 이하로 모임 |
| T4 대역 제한 | `RATE=2mbit … t4` → `… t4` | Q4 | M4 범위(여기선 도구만) |

- 해제 : `sudo ./netem.sh eth0 clear` · 확인 : `… show`.
- 서버 카운터(`metrics.Global`) : NACKIn·NACKOut·Retransmits·DuplicateNACK·CacheMiss·PLIOut·QueueDrops. 캐시 미스율 = CacheMiss / NACKIn — **5% 를 넘으면 D-3 되돌림 조건**(RTT 기반 캐시 크기 조정 앞당김).
- 재기 전 할 일 : 엔진 VM(Linux) 확보, 합성 청중 도구 승인 [확인중 : 마스터 — PRD_02 7.2 도구 승인].

## 4. 실측으로 정할 값 [TBD]

| 값 | 지금 | 파일 |
|---|---|---|
| 영상 캐시 슬롯 | 512 | `nack/cache.go` VideoSlots |
| 상류 대기 NACK 상한 | 1000 | `nack/loss.go` MaxPendingNACK |
| 피드백 주기 | 20ms | `santorini/feedback.go` FeedbackInterval |
| 구독자 큐 | 32 | `forward/queue.go` QueueSize |
| SRTP 보호 창 | 512 | capri(M1) |

## 5. 로컬 손실 하네스 결과(프로세스 내 모의 — 실제 네트워크 netem 아님)

> 측정 2026-10-26 · Windows 11 · 루프백 · `go test ./cmd/galapagos -run Loss -v` · 코드 `cmd/galapagos/loss_harness_test.go`(모의 소켓·봇)·`loss_e2e_test.go`(시나리오)

### 5.1 방식과 한계

- 시험 봇(발표자·청중)의 UDP 소켓을 `net.PacketConn` 래퍼로 감싸 RTP·RTCP(RFC 7983 첫 바이트 128~191)만 버리거나 늦춘다. STUN·DTLS 는 건드리지 않는다(연결 수립은 손실 없이). 엔진 코드는 바꾸지 않았다.
- 봇은 pion 빈 인터셉터 API(S-1)로 만들고 NACK·PLI·RR 을 직접 만든다 : 구멍을 보면 즉시 NACK, 100ms 마다 재요청(최대 10회 — RTT 를 모르는 브라우저 기본값 흉내), 1초 RR(LSR·DLSR), 1초 넘게 안 메워진 구멍이 있으면 PLI. 키프레임이 와도 NACK 목록을 비우지 않는다(엔진 회복 능력만 보려고).
- 발표자 송출 : VP8 모양 1000B 패킷, 프레임당 8개, 2초마다 키프레임, 목표 200pps — Windows 타이머로 실제 약 160pps(엔진 packetsOut 기준). 엔진 NACK 엔 이력에서 같은 순번 재전송, PLI 엔 다음 프레임 키프레임.
- 손실·지연은 warmup(첫 패킷 + 1.5초) 뒤에 걸고, 카운터는 그 시점 스냅숏 대비 증가분이다(`metrics.Global` 이 전역이라 이 패키지 시험은 병렬 금지).
- 한계 : ① 지연은 FIFO(netem 기본 jitter 는 순서를 뒤바꾼다 — 순서 뒤바뀜에 따른 헛 NACK 은 미측정) ② T3 상관 25% 미모사(구간 균일 10%), 버스트 5초 → 2초 ③ T6 은 지연만이면 NACK 이 없어 3% 손실을 함께 걸었다 ④ 봇 SRTP 재전송 보호 창은 pion 기본값 — T6 중복 재전송이 청중 쪽 '중복 수신 0' 으로 보이는 것은 봇 SRTP 재생 방지가 같은 순번을 버린 것으로 추정(브라우저 창 크기는 [확인중 : 실기기]) ⑤ 청중 30명이 아니라 5명 ⑥ 시드는 고정이지만 타이밍이 달라 수치는 실행마다 조금씩 다르다(1회 측정값).

### 5.2 통과 기준(시험 전 확정, 실패해도 낮추지 않음)

회복률(구멍 난 출력 순번 중 메워진 비율) ≥ 99% · 회복 시간 p95 ≤ 1초(Q3) · 캐시 미스율 CacheMiss/NACKIn ≤ 5%(D-3, 하류 손실 시나리오 T2·T3) · T6 손실 순번당 재전송 ≤ 2.0 · T3 PLIOut ≤ 2회/초 · T7 폭주 중 발표자 PLI ≤ 2회/초·간격 ≥ 450ms(레이어 l, Q8).

### 5.3 결과 — 4건 모두 통과

| 시나리오 | 조건 | 엔진 증가분 | 청중 쪽 | 판정 |
|---|---|---|---|---|
| T2 | 청중 1 하류 3%, 12초 | NACKIn 58 · Retransmits 58 · DuplicateNACK 0 · CacheMiss 0(0%) · PLIOut 0 · QueueDrops 0 | 구멍 56 → 회복 56(100%), p50 7ms · p95 23ms · max 107ms | 통과 |
| T3 | 청중 1 하류 10% 2초(8초 중 2~4초) | NACKIn 46 · Retransmits 46 · DuplicateNACK 0 · CacheMiss 0 · PLIOut 0 · QueueDrops 0 | 구멍 44 → 44(100%), p50 5ms · p95 14ms · max 106ms | 통과 |
| T6 | 청중 1 하류 150ms±30ms(FIFO) + 3%, 12초 | NACKIn 140 · Retransmits 109 · DuplicateNACK 31 · CacheMiss 0 · PLIOut 0 · QueueDrops 0 | 구멍 64 → 64(100%), p50 192ms · p95 222ms · max 240ms, 재전송/손실 1.70 | 통과(관찰 1) |
| T7 | 발표자 상류 3%, 청중 5, 10초 | NACKOut 51(= 상류 버림 51) · 발표자 재전송 51 · NACKIn 255 · CacheMiss 254(99.6%) · Retransmits 0 · PLIOut 8(폭주 포함) · QueueDrops 0 | 5명 모두 구멍 49 → 49(100%), p50 22ms · p95 61ms · max 131ms | 통과 |
| T7 폭주 | 이어서 3초간 청중 5명 × 100ms 마다 PLI(150건) | — | 발표자 수신 6건/3초 = 2.0/초, 간격 ≥ 450ms | 통과(25:1 합치기) |

실행 시간 : `go vet ./...` 2.4초 · `go test ./...` 80초(cmd/galapagos 75초 — 손실 4건이 약 70초) · `go test -short ./cmd/galapagos` 23초(T2 만).

### 5.4 관찰

1. **T6 중복 재전송** — 억제 간격 min(100ms, 2RTT) 은 RTT 150ms 에서 100ms 라 RTT 보다 짧다. 청중이 100ms 마다 재요청하면 첫 재전송이 도착하기 전에 두 번째 NACK 이 억제를 통과해 한 번 더 나간다(손실 64 · 재전송 109 · 억제 31 → 손실당 0.7회 여분). 기준 안이지만 대역 낭비. 권고 : 억제 간격을 RTT 이상으로(예 `max(min(100ms,2RTT), RTT×1.2)`) — `internal/nack/sendmeta.go` Resolve 의 gap 계산(엔진 코드라 이번엔 고치지 않음).
2. **T7 캐시 미스율 99.6% 는 설계상 정상** — 상류에서 잃은 패킷은 캐시에 없으므로 청중 NACK 가 전부 미스가 되고, 50ms 묶음 재요청은 이미 대기 중인 LossTracker 항목과 합쳐진다. D-3 의 5% 규칙은 **하류 손실 시나리오에만** 적용해야 한다(운영 집계에서 상류 손실과 섞이면 오판 — 미스를 '상류 대기 중'과 '덮임'으로 나눠 세는 카운터 권고).
3. T7 에서 Retransmits 는 0 — 상류 재전송으로 늦게 온 패킷은 재전송이 아니라 정상 전달(SeqRewriter 가 원래 출력 순번에 넣음)로 나간다. 청중 회복을 Retransmits 만으로 보면 상류 회복이 안 보인다.

### 5.5 [TBD] 값에 주는 근거(4절 표)

| 값 | 지금 | 이번 수치가 말하는 것 |
|---|---|---|
| 영상 캐시 슬롯 `VideoSlots` | 512 | 최대 회복 240ms(T6) × 160pps ≈ 40슬롯만 필요했고 T2·T3·T6 캐시 미스 0 → RTT 150ms 까지 512 는 충분. 줄일 근거는 실 비트레이트(300~500pps)·실 RTT 실측 전엔 없음 |
| 상류 대기 NACK 상한 `MaxPendingNACK` | 1000 | 3% 상류 손실에서 동시 대기는 수 개 수준 — 상한·Overflow PLI 가 걸리지 않음. 상한 결정은 상류 버스트·긴 단절 실측 필요 |
| 하류 억제 `RtxSuppress`·min(100ms,2RTT) | 100ms | 관찰 1 — RTT>100ms 에서 손실당 0.7회 중복 재전송. 바꿀지 [TBD : 실망 RTT 분포] |
| 피드백 주기 `FeedbackInterval` | 20ms | T7 상류 회복 p50 22ms · p95 61ms(첫 NACK 대기 4패킷 + 20ms 주기) — 1초 목표 대비 여유 큼 |
| 구독자 큐 `QueueSize` | 32 | QueueDrops 0(160pps · 청중 5명) — 이 시험으론 정할 수 없음, T4 대역 제한에서 |
| SRTP 보호 창 | 512 | 엔진 → 청중 재전송이 봇 SRTP 에서 거부되지 않음(회복 100%), 발표자 → 엔진 재전송도 T7 에서 전부 반영. 브라우저 쪽 창은 [확인중 : 실기기] |
| Limiter 간격(l 500ms) | 500ms | 폭주 시 정확히 2.0/초로 모임 — Q8 충족 |
