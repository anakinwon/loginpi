# Galápagos M2 — TURN 경유·손실 시험 설정 초안

> 작성 2026-10-25 · 상태 **초안, 실측 대기**(이 문서의 어떤 수치도 아직 측정하지 않았다) · 근거 PRD_02 6절 M2 ⑦⑨⑩·7.2, D-4·D-5

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
