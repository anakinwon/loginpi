# M3 경계 정밀화 — 진행 현황 (2026-10-26 · 2026-10-29 갱신 7절 · 2026-10-31 ⑦ -race 통과·**M3 통과** 8절 — ④ paused 시작 보류 승인(메인 결정, 마스터 위임 2026-10-31))

> 기준 : `../../docs/PRD_02_ENGINE_DESIGN.md` 6절 M3 행 ①~⑦ · 통과 기준 "기능 회귀 0, 모듈 의존이 3.1절 구조와 일치"(PRD_01 5절 M3 행과 같음).
> 원칙 : PRD_02 3.2 — M3 **동작 변경은 M2 실기기 확인 뒤**. 이번 단계는 관문 자동화·공백 점검·테스트·문서 정합만 했고 운영 코드는 바꾸지 않았다.
> 경로는 `media/` 기준.

## 1. ①~⑦ 공백 점검

| # | 항목 | 판정 | 근거(파일:줄) | 테스트 |
|---|---|---|---|---|
| ① | 닫힘 연쇄 Transport→Producer/Consumer, Producer→Consumer | **구현** | `internal/bora/lifecycle.go:173` closePeer(① 내 Producer ② 내 Consumer ③ PC·할당기 ④ 표) · `:201` closeProducer(표 제거 → 닫기 → Consumer 정리 → `producerClosed`) · `:230` detachConsumer(레이어 Unsubscribe·RemoveTrack 재협상) | `bora/lifecycle_test.go:82·139`, `bora/cascade_test.go:18·68`(패널 범위·중복 닫기) |
| ② | 늦은 합류자 상태 전달 | **구현** | `bora/lifecycle.go:279` initConsumer(일시정지면 Pause + `producerPaused`, 할당기에 레이어 활성·비트레이트) · `:292` producerInfos(join 응답) · `bora/room.go:211` 입장 시 기존 producer 구독 · `room.go:467` consumerCreated 직후 호출 | `bora/lifecycle_test.go:153`, `bora/cascade_test.go:85` TestLateJoinerState, `:125` TestJoinPausedProducerNotifyOrder(실제 Join 경로 알림 순서) |
| ③ | Decision 4분류 + SeqRewriter(Drop/Sync) | **구현** | `internal/jeju/decision.go:11` Decision · `:39` decide(Drop → `seq.Drop`, 재개 게이트) · `internal/jeju/seqrewriter.go:26` Sync(옛 패킷 floor) · `:36` Drop(메움·접기) · `:54` Input | `jeju/seqrewriter_test.go`, `jeju/jeju_test.go`, `jeju/m3_test.go:188`(재전송 멱등·Sync 이전 Drop)·`:108`(일시정지 우선)·`:122`(이름) |
| ④ | consume paused→resume(resume 즉시 키프레임) | **서버 쪽 완료(2026-10-29)** — paused 시작은 프로토콜 제안, **2026-10-31 판정 : 지금 불필요(8.2절)** — PRD_02 5.2 표(`consumerCreated` "paused는 M3"·`consumer.resume` "수신 준비 끝 신호")와 다른 보류라 **보류 승인(메인 결정, 마스터 위임 2026-10-31)** | Consumer 쪽 완성 : `jeju/decision.go:74-81`(resume → resync + `requestKeyframe(NewConsumer)`), `jeju/replay.go:20`(paused 시작이면 재생 생략), `bora/lifecycle.go:141` ResumeConsumer. **공백** : 방이 만드는 Consumer 는 늘 `paused=false`(`bora/room.go:212`·`:355`), `ConsumerCreated.Paused` 를 채우지 않음(`room.go:463-466`), 공개 `Room.Consume(…, paused)`(`room.go:366`)는 호출자 없음(**2026-10-29 삭제**) → 지금 `consumer.resume` 은 producer 일시정지 때만 의미가 있다 | `jeju/m3_test.go:74` TestResumeRequestsKeyframe(발표자 방향 PLI 확인), `jeju/seqrewriter_test.go:133` TestDecidePauseResume |
| ⑤ | 5.2 메시지 확정·`docs/SIGNAL_API.md` | **구현(문서 정합 완료)** | `internal/signal/envelope.go:24-65` 이름·오류 코드 · `../docs/SIGNAL_API.md` v1.0.1(2026-10-26 코드 기준 정정, 아래 3절) · `layersChanged`·`streamState`·`score`(`envelope.go:44-47`)는 정의만, 송신은 M4 | `signal/server_test.go` |
| ⑥ | 레이어 비활성 감지 | **구현(2026-10-29)** | 판정 : `internal/santorini/activity.go:38` observe(500ms 주기, l 2초·상위 10초 연속) · `:77` Active(연속 + 1초 안 패킷) · `:80` Bitrate. 사용 : `bora/lifecycle.go:309` → `internal/bwe/allocator.go:150·160`(비활성 레이어 제외). ~~공백 : layerUsable 호출자 없음~~ → M4 에서 점수 입력(`jeju/score.go:76`)이 쓰고, 2026-10-29 LayerPolicy 목표(`jeju/layerpolicy.go` eff)도 비활성 레이어를 뺀다(7절) | `jeju/layerpolicy_test.go` TestSimulcastInactiveLayer, `santorini/activity_test.go`, `santorini/inactive_test.go`(공개 Active·Bitrate), `jeju/m3_test.go:131` TestLayerUsable(없음·무패킷 = false, 실제 수신 경로로 2초 연속 패킷 = true) |
| ⑦ | 표 형식 단위 테스트 + `-race` | **구현(2026-10-31 -race 통과)** | 표 형식 테스트 있음(위 열). `-race` : Docker `golang:1.27`(Go 1.27.3 linux/amd64·gcc 14.2)에서 실행 — 첫 실행 race 4건(전부 bora 테스트 대역 세션, 운영 코드 아님) 수정 뒤 0건(8절) | `bora/lifecycle_test.go` fakeSession·`bora/interact_test.go` recSession 잠금, `-race -count=10 ./internal/bora` |

## 2. 관문 — 모듈 의존이 3.1절 구조와 일치

- **판정 : PASS(2026-10-26)** — 마스터가 아래 11간선 확대를 승인("OWNERSHIP 구조도에 의존 11개를 추가 승인함")해 `OWNERSHIP.md:57` 과 `deps_test.go` diagram 에 반영, 보류 0. 간선 하나를 지우면 "구조도 위반" 으로 실패함을 변이 시험으로 확인.
- 기준 : 유일하게 글로 적힌 구조도 `OWNERSHIP.md:57` — 2026-10-26 마스터 승인으로 11간선 확대 반영(현재 정본은 그 줄). 승인 전 기준(기록용) : `bora → {signal, capri, santorini, jeju, bwe}` · `jeju → {santorini, forward, nack, pli}` · `santorini → {forward, nack, pli, rtcpx, rtpx}` · `record → jeju` · 나머지 내부 의존 없음, cmd/ 규칙 없음.
- 테스트 : `internal/archtest/deps_test.go` — `cmd/`·`internal/` 를 하위 디렉터리까지 순회(filepath.WalkDir)해 운영 코드 import 를 읽는다. 구조도 간선 = 통과, `pending` 목록 간선 = 이유와 함께 하위 테스트 SKIP, **둘 다 아닌 간선·구조도에 없는 새 패키지·코드에서 사라진 pending 간선 = 실패**. 외부 의존은 `github.com/pion/` 만.
- 실패 확인 : pending 에서 `jeju → rtpx` 를 지우면 "구조도 위반 jeju → rtpx (파일 : layerpolicy.go)" 로 실패, `internal/rtpx/zz`(bora import) 임시 패키지를 만들면 "구조도에 없는 새 패키지" 로 실패(둘 다 되돌림).

### 승인된 11간선과 사유(2026-10-26 승인 — 기록용)

| 간선 | 쓰는 곳 | 권고 | 근거 |
|---|---|---|---|
| bora → metrics | `bora/admin.go:105` GET /admin/metrics | 확대 승인 | 관리 API 가 방 관리자에 있는 한 필요. M5 `metrics/export.go` 가 생기면 cmd 로 옮길지 재검토 |
| bora → pli | `bora/room.go:289` RequestKeyframe(pli.NewConsumer) | 확대 승인 | santorini 공개 시그니처가 pli.Reason 을 받으므로 호출자는 pli 를 피할 수 없다(잎 패키지, 순환 위험 없음) |
| bora → record | `bora/lifecycle.go:22·28` 녹화기 | 확대 승인 | 녹화 Consumer 수명은 방이 관리(할당기 제외). record 는 jeju 만 의존 → 순환 없음 |
| jeju → metrics | `jeju/consumer.go:197`·`retransmit.go:27`·`layerpolicy.go:249` | 확대 승인 | metrics 는 의존 없는 잎(atomic 카운터) — 모든 데이터 경로 패키지에 허용하는 편이 단순 |
| jeju → rtcpx | `jeju/consumer.go:145·220` 하류 SR | 확대 승인 | 하류 SR 0.5초(PRD_02 4.2)는 Consumer 송신 고루틴 소유 — 구조도 누락으로 보인다 |
| jeju → rtpx | `jeju/layerpolicy.go:84` VP8Munger | 확대 승인 | 레이어 전환 시 picture ID 다시 쓰기(PRD_02 4.1 6~10단계)는 jeju 몫 — 구조도 누락으로 보인다 |
| santorini → metrics | `santorini/layer.go:203`·`feedback.go:23·30` | 확대 승인 | jeju → metrics 와 같음 |
| forward → metrics | `forward/congest.go:61` 큐 버림 | 확대 승인 | 같음. forward 를 잎으로 두려면 카운터를 Offer 결과로 돌려주는 대안(동작 변경, M2 뒤) |
| cmd/galapagos → bora | `cmd/galapagos/main.go:25·31` | 확대 승인 | 진입점은 조립만 한다 — 구조도 줄에 cmd 규칙 자체가 없음(누락) |
| cmd/galapagos → capri | `cmd/galapagos/main.go:47` | 확대 승인 | 같음(UDP mux·API 설정) |
| cmd/galapagos → signal | `cmd/galapagos/main.go:27·37` | 확대 승인 | 같음(/signal WS 서버) |

권고 문구(마스터 결정용) : `OWNERSHIP.md:57` 을 위 11간선 포함으로 넓히고(metrics 는 "잎 — 누구나 import 가능"으로 한 줄 처리 가능), 승인 뒤 `deps_test.go` 의 pending 항목을 diagram 으로 옮긴다 → **승인·반영 완료(2026-10-26)**.

- 실제 간선(`go list ./...`, 2026-10-26)

| 패키지 | 내부 import |
|---|---|
| cmd/galapagos | bora · capri · signal |
| bora | bwe · capri · jeju · metrics · pli · record · santorini · signal |
| santorini | forward · metrics · nack · pli · rtcpx · rtpx |
| jeju | forward · metrics · nack · pli · rtcpx · rtpx · santorini |
| forward | metrics |
| record | jeju |
| signal · capri · nack · pli · bwe · rtcpx · rtpx · metrics | 없음 |

## 3. SIGNAL_API ↔ 코드 불일치(문서 쪽 정정 완료, 필드·이름 변경 없음)

1. 10초 안에 join 없음 → 문서는 `ntf error TICKET_INVALID`, 코드는 알림 없이 종료(`signal/server.go:198-201`).
2. 첫 메시지가 join 이 아니면 `res ok:false TICKET_INVALID` 후 종료(`server.go:202-205`) — 문서에 없었음.
3. 서버 → 클라이언트 `ntf trickle`(`bora/room.go:227`) — 알림 목록에 없었음. 클라이언트 `trickle` 을 `ntf` 로 보내도 처리(`server.go:240`).
4. 알림 순서 : 코드는 `consumerCreated`(+`producerPaused`) 들 → `transport.subscribe`(`room.go:462-473`, 검증 `bora/cascade_test.go:125`), 문서 4절·8절 예시는 반대였음.
5. `consumerCreated.paused` 는 항상 false(`room.go:463-466`).
6. `produce` : 잘못된 `kind` 는 `SDP_INVALID`, 잘못된 `source` 는 camera, `rids` 는 읽지 않음(`bora/manager.go:170-192`).
7. `consumer.setLayer` : maxSpatial 0~2 로 자름, maxTemporal 무시(`room.go:556`).
8. 요청 `d` 해석 실패는 모든 요청에서 `SDP_INVALID`(`manager.go:147`, 코드에 이미 [TBD]).
9. `layersChanged`·`streamState`·`score` 는 정의만, 현재 미송신.

## 4. M2 실기기 통과 뒤로 미룬 일(동작 변경)

| 일 | 이유·조건 |
|---|---|
| ④ Consumer 를 paused 로 만들고 `consumerCreated.paused:true` → 클라이언트 `consumer.resume` 뒤 송신 | 시험 화면이 `consumer.resume` 을 먼저 보내야 함(SIGNAL_API 4절). 지금 바꾸면 첫 화면 경로(캐시 재생)가 바뀐다 — **2026-10-29 재판정 : 프로토콜 변경이라 제안으로만(7절)** |
| ~~⑥ `layerUsable` 을 LayerPolicy 전환 후보 선택에 연결하거나 삭제~~ | **완료(2026-10-29, 7절)** |
| ~~사용하지 않는 공개 `Room.Consume` 정리~~ | **완료(2026-10-29 삭제, 7절)** — paused 시작을 하게 되면 방 고루틴 `consume(…, paused)` 로 충분 |
| `BAD_REQUEST` 오류 코드 분리 | 프로토콜 변경(오류 코드 추가) — SIGNAL_API 개정 + 합의 |
| ~~`-race` 1회 실행~~ | **완료(2026-10-31, 8절)** |

## 5. 실행 결과(2026-10-26, Go 1.27.0 windows/amd64)

- `go vet ./...` 통과(5.8초) · `go test -count=1 ./...` 15패키지 전부 통과(15.9초) — 승인 반영 뒤 archtest 보류 0·PASS(2026-10-26).
- 새 테스트 `-count=5` 반복 통과 : `TestLayerUsable`(jeju)·`TestJoinPausedProducerNotifyOrder`(bora)·`TestModuleDepsMatchOwnershipDiagram`(archtest).
- 실패 가능성 확인(되돌림) : `layerUsable` 을 `false` 고정 → TestLayerUsable 실패, `initConsumer` 를 transport.subscribe 뒤로 미룸 → TestJoinPausedProducerNotifyOrder 실패.
- `-race` 미실행(CGO 없음).

## 6. 시그널링 v1.1 구현(2026-10-26, `../docs/SIGNAL_API.md` 3.3 정본)

권한은 전부 서버가 **세션 역할**(`Peer.Role` — 입장권 role 로 시작, `peer.setRole` 로 바뀜)로 방 고루틴에서 검사한다. 발행(`transport.publish`·`produce`) 검사도 `Peer.Role` 로 바꿨다(`bora/room.go`).

| 묶음 | 구현 위치 | 시험 |
|---|---|---|
| A 참가자 | `bora/room.go:234` joinState(join 응답 producers·peers 를 한 번의 방 고루틴 실행에서 — 별도 exec 1회 제거) · `bora/interact.go:39` peerInfos(청중에게 남의 raisedTs 0) · `:54-95` peerJoined/peerLeft 200ms 묶음(받는 사람마다 자기보다 뒤에 들어온 사람만, 입장 먼저) · `bora/lifecycle.go:197` 닫힘 연쇄 ④ 뒤 queueLeft | `bora/interact_test.go` TestPeerBatch·TestHandRecipientsAndOrder(가림), e2e |
| B 출처 | `bora/lifecycle.go` producerInfos `source` · `bora/room.go` negotiate consumerCreated `source` | e2e(`source:"mic"`) |
| C 상호작용 | `bora/interact.go:98` Chat(공백 제거 1~500자 → SDP_INVALID, 초당 2건 → RATE_LIMITED, 보낸 사람 제외) · `:120` sendHand(presenter·panel·본인) · `:130` SetHand(청중만, 재올림 시각 유지·알림 없음) · `:156` LowerAllHands · `:172` React(7종·1~3개·초당 2건, 300ms 창 합산·익명, 보낸 사람 포함) · `:27` rateLimit(1초 슬라이딩 창) | TestRateLimit·TestHandRecipientsAndOrder·TestLowerAll·TestReaction·TestChat, e2e |
| D 역할 | `bora/interact.go:230` SetRole — 승격 : 역할 → 손 내림 → roleChanged → 올라간 손마다 ntf hand / 강등 : 역할 → producer 닫힘 연쇄(producerClosed) → 발행 PC 닫기 → roleChanged | TestSetRoleErrors·TestPromote·TestDemote, e2e(승격 뒤 produce 성공·강등 뒤 publish/produce ROLE_FORBIDDEN) |
| 종료 | `bora/manager.go:285` endRoom(종료 표시 `Manager.ended` → 목록에서 빼기 → 요청자 외 ROOM_CLOSED·연쇄 정리) · `signal/session.go` EndSession · `signal/server.go:240`(요청자는 성공 응답 뒤 ntf error ROOM_CLOSED) · `manager.go` room()(종료된 방 join → ROOM_CLOSED) | e2e(전원 ROOM_CLOSED·이후 join ROOM_CLOSED) |

- 의존 : 새 간선 없음(bora → signal 기존), archtest 표 수정 없이 PASS. 외부 의존 추가 없음.
- 실행(Go windows/amd64) : `go vet ./...` 통과 · `go test -count=1 ./...` 15패키지 통과 · 시간 민감 시험 `-count=5` 통과(bora v1.1 시험 전부, `cmd/galapagos` TestV11Interactions). `-race` 미실행(CGO 없음).
- 실패 가능성 확인(되돌림) : sendHand 받는 사람을 전원으로·peerJoined 앞선 입장자 제외를 끄면 bora 시험 4개 실패.
- 남은 일 : 채팅·반응 속도 한도는 [TBD : M5 실측]. (구현 자의 판단 2건 — 강등 시 발행 PC 닫기·종료 표시 유지 — 은 6.1 에서 결정·문서화로 해소)

### 6.1 W1 검토 후속(v1.1.1, 2026-10-26 — 메인 세션 결정 4건 + 구현 결정 문서화)

| 결정 | 구현 위치 | 시험(되돌리면 실패 확인) |
|---|---|---|
| ① 승격·강등 역할은 재입장해도 유지 — 방마다 `Room.roles`(입장권 sub → 세션 역할), join 은 입장권 role(초기값) 대신 사용, presenter 입장권·빈 sub 는 제외, panel·audience 만 기록(발표자 승격 불가), 방이 닫히면 소멸. join 응답 `role` 도 세션 역할(`p.Role`) | `bora/room.go` join · `bora/interact.go` SetRole · `bora/manager.go` Join | TestRoleSurvivesRejoin(표 5행 + 승격→재입장→강등→재입장→새 방), e2e(A1 재입장 panel·이전 세션 DUPLICATE_SESSION) |
| ② `room.end` 순서 = 종료 표시 → 요청자 성공 응답(큐) → 나머지 전원 ROOM_CLOSED·정리 → 요청자 ROOM_CLOSED | `signal/session.go` EndSession.After · `signal/server.go`(reply → After → Close) · `bora/manager.go` endRoom(표시만)·After=shutRoom | TestEndSessionOrder(After 가 클라이언트 응답 수신을 기다림), TestRoomEndOrderAndReopen(응답 전 다른 세션 열림·방 살아 있음) |
| ③ 관리 API `POST /admin/rooms` 로 새로 열면 그 방 ID 의 종료 표시 해제 | `bora/admin.go` OpenRoom | TestRoomEndOrderAndReopen, e2e(room.end 뒤 POST 201 → join 성공·역할 기억 없음) |
| ④ `reaction.send` 한 요청 안 중복 이모지는 1개로 셈(개수 1~3 검사는 중복 제거 전 길이 — 기존 4개 거부 유지) | `bora/interact.go` React | TestReaction(👍 합계 4→3, 중복 4개 거부), e2e(`["👍","👍"]`) |

- 문서 : `../docs/SIGNAL_API.md` v1.1.1 — 위 4건 + 서버가 강등된 사람 발행 PC 를 닫음, `peerJoined` = 받는 사람보다 뒤 입장자만, `peerLeft` 의 모르는 peerId 는 무시, 값 검사가 속도 제한보다 먼저.
- 실행(Go windows/amd64) : `go vet ./...` 통과 · `go test -count=1 ./...` 15패키지 통과 · 새 시간 민감 시험 `-count=5` 통과(bora TestRoleSurvivesRejoin·TestRoomEndOrderAndReopen·TestReaction·TestPeerBatch, signal TestEndSessionOrder, `cmd/galapagos` TestV11Interactions). `-race` 미실행(CGO 없음). archtest 표 수정 없음·외부 의존 추가 없음.
- 관찰 : 변이 시험 중 1회 `cmd/galapagos` TestLossT3Burst10 이 실패(역할 변이와 무관한 기존 손실 시험, 이후 전체 실행 통과) — 시간 민감 시험으로 기록만.

## 7. M2 뒤 동작 변경(2026-10-29)

M2 실기기 완료(2026-10-29)로 4절의 미룬 일을 재검토했다. 시그널링 메시지 형식·의미는 바꾸지 않았다(SIGNAL_API 개정 없음).

| # | 한 일 | 위치 | 시험(되돌리면 실패 확인) |
|---|---|---|---|
| ⑥ | LayerPolicy 실제 목표 `eff()` = min(target, max) 이하에서 **가장 높은 활성 레이어**(없으면 0 — 할당기 `desired()` 와 같은 규칙). 효과 : 할당기에 들지 않는 **녹화 Consumer(최고 레이어 고정)** 가 발행자가 상위 레이어를 끊으면 멈추던 경로 → 낮은 레이어 키프레임 요청·다음 키프레임 경계에서 하향. 시청 Consumer 는 할당기가 이미 비활성 제외 목표를 주므로 동작 같음(할당기 주기 지연만 없어짐). 재상향은 santorini 의 상위 10초 연속 판정 그대로 | `internal/jeju/layerpolicy.go` layerSource `Active()`·eff | `jeju/layerpolicy_test.go` TestSimulcastInactiveLayer(h 비활성 → m 키프레임 요청·하향, 전부 비활성 = 0, 재활성 = 2). eff 의 활성 검사를 빼면 실패 |
| ④ | 호출자 없는 공개 `Room.Consume` 삭제(방 고루틴 `consume(…, paused)` 는 유지) | `internal/bora/room.go` | 컴파일·bora 시험 |

### 7.1 ④ paused 시작 — 프로토콜 제안(구현 안 함)

웹 앱 `src/components/room/use-room.ts:377` 은 `consumerCreated.paused` 를 **"발표자가 일시정지함" 표시**로 해석하고(`pausedRef`), `consumer.resume` 을 보내지 않는다. 서버가 Consumer 를 paused 로 만들고 `paused:true` 를 보내면 ① 화면이 '일시정지' 로 보이고 ② 영상이 영영 흐르지 않는다 → 앱 변경 없이는 불가.
제안(마스터·앱 합의 필요) : `consumerCreated` 에 새 필드(예 `startPaused`)를 더하거나 `paused` 의미를 "consumer 일시정지" 로 고정하고 producer 일시정지는 `producerPaused` 로만 알림 + 앱이 화면에 붙인 뒤 `consumer.resume` 송신. 이득은 보이지 않는 타일의 하류 대역 절감(M4 할당기와 겹침)이라 급하지 않다.

### 7.2 ⑦ -race

~~이 PC 는 여전히 CGO 불가(gcc·clang 없음, Docker 데몬 꺼짐) → 미실행.~~ → **2026-10-31 Docker Desktop 을 켜고 `golang:1.27` 컨테이너에서 실행·통과(8절)**.

### 7.3 실행 결과(2026-10-29, Go 1.27.0 windows/amd64)

- `go vet ./...` 통과 · `go test -count=1 ./...` **15패키지 전부 통과**(archtest 의존 관문 PASS — 새 간선 없음, 외부 의존 추가 없음). `TestSimulcast*` `-count=5` 통과.
- 변이 확인(되돌림) : eff 의 `Active()` 검사를 빼면 TestSimulcastInactiveLayer 실패.
- 관찰 : 다른 에이전트가 함께 돌던 첫 전체 실행에서 `cmd/galapagos` TestLossT7Upstream3("transport.publish 응답 없음")·TestV12Moderation(activeSpeaker 0건)이 각각 1회 실패 — 두 시험 모두 단독 실행·재실행에서 변경본·HEAD 원본 둘 다 통과, 변경과 무관한 시간 민감 시험으로 기록만.
- 엔진 교체 : ~~다음 엔진 빌드 때 함께 반영~~ → **반영됨** — ⑥ 커밋 `05d63243` 은 `1f23d219` 의 조상(`git merge-base --is-ancestor` 확인)이고, `1f23d219` 빌드로 2026-10-30 집 PC 엔진 교체·접속 확인 완료(`../docs/ROADMAP.md` 26행). `1f23d219` 이후 `media/internal`·`media/cmd` 커밋 0건이라 그 뒤 빌드(Vultr 이전 포함)도 같은 엔진 코드다(2026-10-31 검토 확인).

## 8. ⑦ -race 실행·④ 판정(2026-10-31) — **M3 통과**(④ 보류 승인, 마스터 위임 2026-10-31)

### 8.1 ⑦ -race

- 환경 : 이 PC(Windows, CGO 없음) 대신 **Docker Desktop 29.4.3 + 이미지 `golang:1.27`**(Go 1.27.3 linux/amd64, `CGO_ENABLED=1`, gcc Debian 14.2.0). `go.mod` 의 `go 1.27.0` 충족.
- 명령(저장소 `media/` 에서, Git Bash 는 `MSYS_NO_PATHCONV=1`) :
  `docker run --rm -v "<media 절대경로>:/src" -v seminar-gomod:/go/pkg/mod -v seminar-gocache:/root/.cache/go-build -w /src golang:1.27 go test -race -count=1 ./...`
- 1차 결과 : **race 4건, 모두 `internal/bora` TestJoinPausedProducerNotifyOrder** — 테스트 대역 `fakeSession.Send`(`bora/lifecycle_test.go`)를 방 고루틴(negotiate)과 pion ICE 콜백 고루틴(`bora/room.go` trickleSender → `ntf trickle`)이 동시에 부르고, 시험이 `exec` 안에서 `got` 을 읽음.
  - 운영 코드 결함 아님 : `signal.Session` 계약이 "Send 는 비차단·여러 고루틴 안전"(`signal/session.go:22`)이고 운영 구현 `signal/server.go` session.Send 는 채널 큐(enqueue)라 안전. **대역만 계약을 어겼다.**
- 수정(테스트 파일만, 운영 코드·동작 변경 0) :
  - `bora/lifecycle_test.go` fakeSession — `sync.Mutex` 로 Send·Close 잠금 + 복사 접근자 `msgs()`. `bora/cascade_test.go` 의 대기 루프는 `exec` 대신 `d.msgs()` 로 읽음.
  - 형제(같은 원인) : `bora/interact_test.go` recSession — `TestRoleSurvivesRejoin` 이 실제 ICE(`r.api`)와 함께 써서 같은 경합이 잠재(이번 실행에선 미검출). Send·Close 잠금 + `take()` 에서 잠금. 패턴 `func (…) Send(n signal.Notification)` 테스트 대역 · 매치 2 · 처리 2.
- 2차 결과 : `go test -race -count=10 ./internal/bora` **ok(32.0초)** → 전체 `go test -race -count=1 ./...` **race 0건·exit 0**(`ok seminar.pi/media/cmd/galapagos 69.5s` 외 internal 14패키지 ok, `? tools/probe [no test files]`, 전체 1분 12초).
- 검토 재실행(2026-10-31, 문서 정정 뒤) : 그 사이 M1 이 `tools/probe/main_test.go` 를 추가해 결과가 `ok seminar.pi/media/tools/probe` 로 바뀜 — Linux `-race ./...` **race 0건·exit 0**(`cmd/galapagos` 70.6초, 16패키지 ok) · Windows `go vet` 통과 · `go test -count=1 ./...` 16패키지 ok(`cmd/galapagos` 103.9초) · `gofmt -l internal cmd tools` 출력 없음.
- 실패 가능성 확인 : 수정 전 원본이 같은 명령에서 race 4건·FAIL 을 낸 것이 곧 변이 확인(되돌리면 다시 실패).
- Windows 기본 실행(수정 뒤) : `go vet ./...` 통과 · `go test -count=1 ./...` 15패키지 + `tools/probe` 전부 ok(`cmd/galapagos` 102.7초). archtest 의존 관문 PASS(새 간선 없음, 외부 의존 추가 없음).
- 엔진 교체 : **불필요** — 바뀐 것은 `_test.go` 3개뿐, 운영 바이너리 동일.
- 관찰 : 실행 도중 M1 이 만들던 `tools/probe`(미추적)가 한 번 빌드 실패(`undefined: start`, 편집 중) → M1 완료 뒤 재실행 통과. `tools/probe` 는 `internal/signal` 을 import 하지만 archtest 는 `cmd/`·`internal/` 만 순회해 관문 밖이다(아래 8.3).

### 8.2 ④ paused 시작 — 판정 : 지금 불필요(제안 유지, 구현 안 함 · 보류 승인 2026-10-31 — 재검토 조건 아래)

- PRD_02 5.2 표는 `ntf consumerCreated` 의 `paused` 를 "M3", `consumer.resume` 을 "클라이언트가 수신 준비를 끝낸 신호" 로 정했다. 이 판정은 그 산출물에서 벗어나는 결정이라 **마스터 승인 전까지 확정이 아니다**. 승인되면 PRD_02 5.2 표 285·286행(또는 결정 표 D-/C-)에 보류와 아래 재검토 조건을 남긴다(M3 파일 범위 밖 — 마스터 몫).

- 이유 ① M4 완료로 화면 밖·작은 타일은 이미 `consumer.setLayer maxSpatial:0`(최저 레이어)로 낮춘다(`src/components/room/use-room.ts:1032`, `room-rules.ts:278`). paused 시작이 더 줄이는 하류는 `consumerCreated` → 타일 부착 사이 수백 ms 뿐.
- 이유 ② 앱이 `consumerCreated.paused` 를 "발표자 일시정지" 로 해석(`use-room.ts:377`) — 서버만 바꾸면 화면 '일시정지'·영상 영구 정지. SIGNAL_API 개정 + 앱 동시 변경이 필요한 프로토콜 변경이라 이득 대비 위험이 크다.
- 더 큰 이득은 paused 시작이 아니라 **클라이언트 `consumer.pause`(보이지 않는 타일 완전 정지, SIGNAL_API 3.4 [TBD])** 쪽이다.
- 재검토 조건(바뀌면 결정이 달라지는 관찰) : 실사용 세미나에서 `/admin/metrics` 또는 `ntf score` 로 **청중 하류 대역 초과·품질 저하가 화면 밖 타일 탓**으로 확인될 때 → 그때 `consumer.pause` 와 묶어 SIGNAL_API 개정(`consumerCreated` 에 `startPaused` 추가 또는 `paused` 의미 고정, 7.1 제안).

### 8.3 M3 통과 판정

- 통과 기준 "기능 회귀 0, 모듈 의존이 3.1절 구조와 일치" : Windows `go test ./...`·`go vet ./...` 통과 · Linux `-race ./...` race 0건 · archtest PASS → **기술 통과 기준 충족(2026-10-31)**. 운영 코드 변경 없음이라 실기기 재확인 대상 없음.
- 산출물 ①~⑦ : ①②③⑤⑥⑦ 구현 · ④ 서버 쪽 구현(resume 즉시 키프레임, producer 일시정지 경로) · **④ paused 시작은 PRD_02 5.2 표와 달리 보류(보류 승인 2026-10-31, 재검토 조건 8.2)** → **M3 완료(2026-10-31)**. tools/(M1 탐침)는 운영 바이너리 밖 도구라 archtest 순회 밖에 둔다(같은 결정).
- 기준 문서 불일치(M3 파일 범위 밖 — 마스터 취합 때 정정) : `../OWNERSHIP.md` 51행 bora 공개 API 표에 2026-10-29 삭제된 `Consume(peerID, producerID, paused)` 가 남아 있다(실제는 방 고루틴 전용 소문자 `consume`).
- 남은 결정(마스터) : `tools/`(M1 계측 도구)를 archtest 순회에 넣을지 — 넣으면 구조도에 `tools/* → signal` 간선 승인 필요(OWNERSHIP.md:57). 운영 바이너리에 들어가지 않는 도구라 지금은 관문 밖으로 둬도 무방.
