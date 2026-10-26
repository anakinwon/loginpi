# M3 경계 정밀화 — 진행 현황 (2026-10-26)

> 기준 : `../../docs/PRD_02_ENGINE_DESIGN.md` 6절 M3 행 ①~⑦ · 통과 기준 "기능 회귀 0, 모듈 의존이 3.1절 구조와 일치"(PRD_01 5절 M3 행과 같음).
> 원칙 : PRD_02 3.2 — M3 **동작 변경은 M2 실기기 확인 뒤**. 이번 단계는 관문 자동화·공백 점검·테스트·문서 정합만 했고 운영 코드는 바꾸지 않았다.
> 경로는 `media/` 기준.

## 1. ①~⑦ 공백 점검

| # | 항목 | 판정 | 근거(파일:줄) | 테스트 |
|---|---|---|---|---|
| ① | 닫힘 연쇄 Transport→Producer/Consumer, Producer→Consumer | **구현** | `internal/bora/lifecycle.go:173` closePeer(① 내 Producer ② 내 Consumer ③ PC·할당기 ④ 표) · `:201` closeProducer(표 제거 → 닫기 → Consumer 정리 → `producerClosed`) · `:230` detachConsumer(레이어 Unsubscribe·RemoveTrack 재협상) | `bora/lifecycle_test.go:82·139`, `bora/cascade_test.go:18·68`(패널 범위·중복 닫기) |
| ② | 늦은 합류자 상태 전달 | **구현** | `bora/lifecycle.go:279` initConsumer(일시정지면 Pause + `producerPaused`, 할당기에 레이어 활성·비트레이트) · `:292` producerInfos(join 응답) · `bora/room.go:211` 입장 시 기존 producer 구독 · `room.go:467` consumerCreated 직후 호출 | `bora/lifecycle_test.go:153`, `bora/cascade_test.go:85` TestLateJoinerState, `:125` TestJoinPausedProducerNotifyOrder(실제 Join 경로 알림 순서) |
| ③ | Decision 4분류 + SeqRewriter(Drop/Sync) | **구현** | `internal/jeju/decision.go:11` Decision · `:39` decide(Drop → `seq.Drop`, 재개 게이트) · `internal/jeju/seqrewriter.go:26` Sync(옛 패킷 floor) · `:36` Drop(메움·접기) · `:54` Input | `jeju/seqrewriter_test.go`, `jeju/jeju_test.go`, `jeju/m3_test.go:188`(재전송 멱등·Sync 이전 Drop)·`:108`(일시정지 우선)·`:122`(이름) |
| ④ | consume paused→resume(resume 즉시 키프레임) | **부분** | Consumer 쪽 완성 : `jeju/decision.go:74-81`(resume → resync + `requestKeyframe(NewConsumer)`), `jeju/replay.go:20`(paused 시작이면 재생 생략), `bora/lifecycle.go:141` ResumeConsumer. **공백** : 방이 만드는 Consumer 는 늘 `paused=false`(`bora/room.go:212`·`:355`), `ConsumerCreated.Paused` 를 채우지 않음(`room.go:463-466`), 공개 `Room.Consume(…, paused)`(`room.go:366`)는 호출자 없음 → 지금 `consumer.resume` 은 producer 일시정지 때만 의미가 있다 | `jeju/m3_test.go:74` TestResumeRequestsKeyframe(발표자 방향 PLI 확인), `jeju/seqrewriter_test.go:133` TestDecidePauseResume |
| ⑤ | 5.2 메시지 확정·`docs/SIGNAL_API.md` | **구현(문서 정합 완료)** | `internal/signal/envelope.go:24-65` 이름·오류 코드 · `../docs/SIGNAL_API.md` v1.0.1(2026-10-26 코드 기준 정정, 아래 3절) · `layersChanged`·`streamState`·`score`(`envelope.go:44-47`)는 정의만, 송신은 M4 | `signal/server_test.go` |
| ⑥ | 레이어 비활성 감지 | **부분** | 판정 : `internal/santorini/activity.go:38` observe(500ms 주기, l 2초·상위 10초 연속) · `:77` Active(연속 + 1초 안 패킷) · `:80` Bitrate. 사용 : `bora/lifecycle.go:309` → `internal/bwe/allocator.go:150·160`(비활성 레이어 제외). **공백** : `jeju/decision.go:85` layerUsable 훅은 호출자 없음(LayerPolicy 가 직접 쓰지 않음) | `santorini/activity_test.go`, `santorini/inactive_test.go`(공개 Active·Bitrate), `jeju/m3_test.go:131` TestLayerUsable(없음·무패킷 = false, 실제 수신 경로로 2초 연속 패킷 = true) |
| ⑦ | 표 형식 단위 테스트 + `-race` | **부분** | 표 형식 테스트 있음(위 열). **`-race` 미검증** — 이 PC 는 CGO 없음(race 검출기는 cgo 필요). CGO 가능한 PC·CI 에서 `go test -race ./...` 1회 필요 | — |

## 2. 관문 — 모듈 의존이 3.1절 구조와 일치

- **판정 : [확인중] — 다이어그램 밖 간선 11개, 마스터 승인 대기** (PASS 아님).
- 기준 : 유일하게 글로 적힌 구조도 `OWNERSHIP.md:57`(`bora → {signal, capri, santorini, jeju, bwe}` · `jeju → {santorini, forward, nack, pli}` · `santorini → {forward, nack, pli, rtcpx, rtpx}` · `record → jeju` · 나머지 내부 의존 없음). cmd/ 에 대한 규칙은 이 줄에 없다. OWNERSHIP.md 는 계약 파일이라 고치지 않았다.
- 테스트 : `internal/archtest/deps_test.go` — `cmd/`·`internal/` 를 하위 디렉터리까지 순회(filepath.WalkDir)해 운영 코드 import 를 읽는다. 구조도 간선 = 통과, `pending` 목록 간선 = 이유와 함께 하위 테스트 SKIP, **둘 다 아닌 간선·구조도에 없는 새 패키지·코드에서 사라진 pending 간선 = 실패**. 외부 의존은 `github.com/pion/` 만.
- 실패 확인 : pending 에서 `jeju → rtpx` 를 지우면 "구조도 위반 jeju → rtpx (파일 : layerpolicy.go)" 로 실패, `internal/rtpx/zz`(bora import) 임시 패키지를 만들면 "구조도에 없는 새 패키지" 로 실패(둘 다 되돌림).

### 보류 간선 11개와 권고

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

권고 문구(마스터 결정용) : `OWNERSHIP.md:57` 을 위 11간선 포함으로 넓히고(metrics 는 "잎 — 누구나 import 가능"으로 한 줄 처리 가능), 승인 뒤 `deps_test.go` 의 pending 항목을 diagram 으로 옮긴다 [확인중 : 마스터 — OWNERSHIP.md:57 확대 승인].

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
| ④ Consumer 를 paused 로 만들고 `consumerCreated.paused:true` → 클라이언트 `consumer.resume` 뒤 송신 | 시험 화면이 `consumer.resume` 을 먼저 보내야 함(SIGNAL_API 4절). 지금 바꾸면 첫 화면 경로(캐시 재생)가 바뀐다 |
| ⑥ `layerUsable` 을 LayerPolicy 전환 후보 선택에 연결하거나 삭제 | M4 전환 정책 실측과 함께. 지금은 할당기 쪽 비활성 제외만 동작 |
| 사용하지 않는 공개 `Room.Consume`(`room.go:366`) 정리 | ④ 결정과 함께(paused 시작이면 이 경로를 쓸 수 있음) |
| `BAD_REQUEST` 오류 코드 분리 | 프로토콜 변경(오류 코드 추가) — SIGNAL_API 개정 + 합의 |
| `-race` 1회 실행 | CGO 가능한 환경 |

## 5. 실행 결과(2026-10-26, Go 1.27.0 windows/amd64)

- `go vet ./...` 통과(5.8초) · `go test -count=1 ./...` 15패키지 전부 통과(15.9초, archtest 는 PASS 이나 보류 간선 11개 SKIP — 2절 [확인중]).
- 새 테스트 `-count=5` 반복 통과 : `TestLayerUsable`(jeju)·`TestJoinPausedProducerNotifyOrder`(bora)·`TestModuleDepsMatchOwnershipDiagram`(archtest).
- 실패 가능성 확인(되돌림) : `layerUsable` 을 `false` 고정 → TestLayerUsable 실패, `initConsumer` 를 transport.subscribe 뒤로 미룸 → TestJoinPausedProducerNotifyOrder 실패.
- `-race` 미실행(CGO 없음).
