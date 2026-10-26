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

> 측정 2026-10-26 · Windows 11 · 루프백 · Go(CGO 없음, `-race` 미사용) · `go test ./cmd/galapagos -run Loss -count=5 -v` · 코드 `cmd/galapagos/loss_harness_test.go`(모의 소켓·봇)·`loss_e2e_test.go`(시나리오)

### 5.1 방식과 한계

- 시험 봇(발표자·청중)의 UDP 소켓을 `net.PacketConn` 래퍼로 감싸 RTP·RTCP(RFC 7983 첫 바이트 128~191)만 버리거나 늦춘다. STUN·DTLS 는 건드리지 않는다(연결 수립은 손실 없이). 엔진 코드는 바꾸지 않았다.
- 봇은 pion 빈 인터셉터 API(S-1)로 만들고 NACK·PLI·RR 을 직접 만든다 : 구멍을 보면 즉시 NACK, 100ms 마다 재요청(최대 10회 — RTT 를 모르는 브라우저 기본값 흉내), 1초 RR(LSR·DLSR), 1초 넘게 안 메워진 구멍이 있으면 PLI. 봇 SRTP·SRTCP 재생 방지 창은 Chrome 과 같은 1024(libwebrtc `pc/srtp_session.cc` `policy.window_size = 1024`, 5.4 원인 참조). 키프레임이 와도 NACK 목록을 비우지 않는다(엔진 회복 능력만 보려고).
- 발표자 송출 : VP8 모양 1000B 패킷, 프레임당 8개, 2초마다 키프레임, 목표 200pps — Windows 타이머로 실제 약 160pps(엔진 packetsOut 기준). 엔진 NACK 엔 이력에서 같은 순번 재전송, PLI 엔 다음 프레임 키프레임.
- 손실·지연은 warmup(첫 패킷 + 1.5초) 뒤에 걸고, 카운터는 그 시점 스냅숏 대비 증가분이다(`metrics.Global` 이 전역이라 이 패키지 시험은 병렬 금지).
- 끝 구간 : run 이 끝나면 손실을 풀고 300ms 더 보낸 뒤 송출을 멈춘다(마지막 손실도 뒤 패킷으로 구멍이 드러나게). 발표자는 자기 순번을 페이로드 끝 2바이트에 적고, 청중이 받은 최대 발표자 순번이 발표자 마지막 순번과 다르면(끝구간 ≠ 0) 실패로 본다 — 구멍으로도 안 잡힌 손실을 놓치지 않으려는 확인.
- 한계 : ① 지연은 FIFO(netem 기본 jitter 는 순서를 뒤바꾼다 — 순서 뒤바뀜에 따른 헛 NACK 은 미측정) ② T3 상관 25% 미모사(구간 균일 10%), 버스트 5초 → 2초 ③ T6 은 지연만이면 NACK 이 없어 3% 손실을 함께 걸었다 ④ 청중 쪽 '중복' 은 구조상 늘 0 — 이미 받은 순번은 창 크기와 무관하게 SRTP 재생 방지가 버리므로 봇 `ReadRTP` 까지 오지 않는다. 중복 재전송은 엔진 카운터(Retransmits/구멍)로만 본다 ⑦ 끝 구간 300ms 동안의 재전송은 손실 없이 지나간다(run 마지막 구멍의 회복이 약간 유리) ⑤ 청중 30명이 아니라 5명 ⑥ 시드는 고정이지만 타이밍이 달라 수치는 실행마다 다르다 — 시나리오별 5회(T6 은 10회 추가) 반복 결과를 범위로 적는다.

### 5.2 통과 기준(시험 전 확정, 실패해도 낮추지 않음)

회복률(구멍 난 출력 순번 중 메워진 비율) ≥ 99% · 회복 시간 p95 ≤ 1초(Q3) · 캐시 미스율 CacheMiss/NACKIn ≤ 5%(D-3, 하류 손실 시나리오 T2·T3) · T6 손실 순번당 재전송 ≤ 2.0 · T3 PLIOut ≤ 2회/초 · T7 폭주 중 발표자 PLI ≤ 2회/초·간격 ≥ 450ms(레이어 l, Q8) · T7 손실 구간 PLIOut ≤ 2회/초 · 끝구간 0(전 시나리오).
폭주 건수는 첫 PLI 가 창 시작 경계에 걸릴 수 있어 (n−1) ≤ 3초/500ms(Limiter 간격)로 센다(검토 지적 — 종전 n/3 ≤ 2 는 경계에서 정상 Limiter 도 떨어뜨릴 수 있었음, 간격 ≥ 450ms 판정은 그대로).

### 5.3 결과 — 시나리오별 5회 반복, 20/20 통과 (코드 c66cffb0)

`go test ./cmd/galapagos -run Loss -count=5 -v` 1회(352초). 값은 5회의 최소~최대(T7 청중 값은 5회 × 5명 = 25건).

| 시나리오 | 조건 | 통과 | 엔진 증가분(최소~최대) | 청중 쪽(최소~최대) |
|---|---|---|---|---|
| T2 | 청중 1 하류 3%, 12초 | 5/5 | NACKIn 56~76 · Retransmits 56~76 · DuplicateNACK 0 · CacheMiss 0% · PLIOut 0 · QueueDrops 0 | 구멍 53~74, 회복 100% · 포기 0 · 끝구간 0, p50 5~6ms · p95 7~104ms · max 101~107ms |
| T3 | 청중 1 하류 10% 2초(8초 중 2~4초) | 5/5 | NACKIn 44~46 · Retransmits 44~46 · DuplicateNACK 0 · CacheMiss 0% · PLIOut 0 | 구멍 40~42, 회복 100% · 끝구간 0, p50 2~9ms · p95 101~106ms · max 106~111ms |
| T6 | 청중 1 하류 150ms±30ms(FIFO) + 3%, 12초 | 5/5 (+ 단독 10/10) | NACKIn 123~143 · Retransmits 56~70 · DuplicateNACK 64~73 · CacheMiss 0% · PLIOut 0 | 구멍 56~66, 회복 100% · 포기 0 · 끝구간 0, p50 189~190ms · p95 227~237ms · max 237~493ms, 재전송/손실 1.00~1.08 |
| T7 | 발표자 상류 3%, 청중 5, 10초 | 5/5 | NACKOut 50~58 · NACKIn 250~290 · CacheMiss 100%(설계상, 관찰 2) · Retransmits 0 · 손실 구간 PLIOut 0/초 | 25건 모두 구멍 50~55 → 회복 100% · 끝구간 0, p50 24~29ms · p95 35~112ms · max 58~134ms |
| T7 폭주 | 이어서 3초간 청중 5명 × 100ms 마다 PLI | 5/5 | — | 발표자 수신 6건/3초(5회 모두), 간격 ≥ 450ms — 판정 (n−1) ≤ 3초/500ms |

T6 단독 반복(`-run LossT6 -count=10`) : **수정 전 6/10**(실패 4회 : 포기 1·2·1·1, 회복 96.67~98.31%), **수정 후 10/10**. 수정 전 측정은 봇 창을 64(pion 기본값)로 되돌려 같은 코드에서 다시 쟀다. 그 전 엔진 억제 간격 하한 1.2RTT(d73ea5f1) 만으로는 여전히 약 40% 실패.

`go test ./...` 전체 통과(cmd/galapagos 74초).

### 5.4 원인과 관찰

1. **T6 간헐 포기의 원인 = 청중 봇 SRTP 재생 방지 창 64(pion 기본값)** — 엔진이 아니라 시험 봇 문제였다.
   - 근거 : 임시 계측(봇 소켓 도착 시각 기록, 커밋 전 제거)에서 포기한 순번 1건의 재전송 2건이 봇 소켓엔 도착(구멍 발견 +464ms·+757ms)했지만 `ReadRTP` 에는 나오지 않았다. 첫 재전송(+약 190ms)은 3% 손실로 사라졌고, 억제 간격 1.2RTT 뒤 나간 두 번째·세 번째는 그 사이 약 70·120패킷이 더 지나가 창 64 밖이라 재생으로 버려졌다.
   - 계산 : 하류 약 160pps · RTT 150ms 에서 첫 재전송이 도착할 때 이미 약 30패킷 뒤, 두 번째는 약 70패킷 뒤 → 창 64 이면 "첫 재전송 손실(3%)" 이 곧 포기. 구멍 약 60개 × 3% ≈ 회당 1.8건 기대 — 관찰된 포기 1~3건과 맞는다. MaxRetransmits 3 이 모자란 것도, 엔진 RTT 추정이 틀린 것도 아니다(Retransmits 는 나갔고 소켓까지 왔다).
   - 수정 : 봇 `SettingEngine.SetSRTPReplayProtectionWindow(1024)`·SRTCP 동일(9d6878dd) — Chrome 의 실제 값에 맞춘 것이고 통과 기준(99%)은 그대로다.
   - 운영 함의 : Chrome 청중은 창 1024 라 같은 SSRC 재전송(D-5)이 RTT 150ms·500pps 에서도 약 2초 분량까지 받아들여진다. **창이 64 인 클라이언트(pion 기본값 봇·일부 비브라우저 SDK)는 RTT 가 크면 두 번째 이후 재전송을 못 받는다** — RTX(별도 SSRC) 도입 여부 판단 근거. Safari·Firefox 창 크기는 [확인중 : 실기기].
2. **T6 중복 재전송** — 억제 간격 하한 1.2RTT(d73ea5f1) 뒤 재전송/손실 1.00~1.08(이전 1회 측정 1.70). DuplicateNACK 64~73 은 청중이 100ms 마다 재요청한 NACK 이 억제된 것으로 정상.
3. **T7 캐시 미스율 100% 는 설계상 정상** — 상류에서 잃은 패킷은 캐시에 없으므로 청중 NACK 가 전부 미스가 되고, 50ms 묶음 재요청은 이미 대기 중인 LossTracker 항목과 합쳐진다. D-3 의 5% 규칙은 **하류 손실 시나리오에만** 적용해야 한다(운영 집계에서 상류 손실과 섞이면 오판 — 미스를 '상류 대기 중'과 '덮임'으로 나눠 세는 카운터 권고).
4. T7 에서 Retransmits 는 0 — 상류 재전송으로 늦게 온 패킷은 재전송이 아니라 정상 전달(SeqRewriter 가 원래 출력 순번에 넣음)로 나간다. 청중 회복을 Retransmits 만으로 보면 상류 회복이 안 보인다.
5. T7 PLIOut 8(5회 모두)은 폭주 구간 6건 + 준비 구간 몫 — 손실 구간만 떼면 0/초.

### 5.5 [TBD] 값에 주는 근거(4절 표)

| 값 | 지금 | 이번 수치가 말하는 것 |
|---|---|---|
| 영상 캐시 슬롯 `VideoSlots` | 512 | 최대 회복 약 490ms(T6 5회 최대) × 160pps ≈ 80슬롯 이하만 필요했고 T2·T3·T6 캐시 미스 0 → RTT 150ms 까지 512 는 충분. 줄일 근거는 실 비트레이트(300~500pps)·실 RTT 실측 전엔 없음 |
| 상류 대기 NACK 상한 `MaxPendingNACK` | 1000 | 3% 상류 손실에서 동시 대기는 수 개 수준 — 상한·Overflow PLI 가 걸리지 않음. 상한 결정은 상류 버스트·긴 단절 실측 필요 |
| 하류 억제 `RtxSuppress`·max(min(100ms,2RTT), 1.2RTT) | 100ms | d73ea5f1 뒤 T6 재전송/손실 1.00~1.08(이전 1.70). 실망 RTT 분포로 재확인 [TBD : 실망 RTT 분포] |
| 피드백 주기 `FeedbackInterval` | 20ms | T7 상류 회복 p50 22ms · p95 61ms(첫 NACK 대기 4패킷 + 20ms 주기) — 1초 목표 대비 여유 큼 |
| 구독자 큐 `QueueSize` | 32 | QueueDrops 0(160pps · 청중 5명) — 이 시험으론 정할 수 없음, T4 대역 제한에서 |
| SRTP 보호 창 | 512 | 엔진 쪽 512 는 엔진이 **받는** 방향(발표자 → 엔진) 창이다 — T7 상류 재전송이 전부 반영됨. 엔진 → 청중 재전송은 **청중 쪽 창**이 정한다 : 봇 창 64(pion 기본)에서는 T6 두 번째 이후 재전송이 거부돼 포기(5.4 원인), Chrome 값 1024 로 맞춘 뒤 회복 100%. Safari·Firefox 창은 [확인중 : 실기기] |
| Limiter 간격(l 500ms) | 500ms | 폭주 시 정확히 2.0/초로 모임 — Q8 충족 |
