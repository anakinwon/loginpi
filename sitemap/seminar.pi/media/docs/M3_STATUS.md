# M3 경계 정밀화 — 진행 현황 (2026-10-26)

> 기준 : `../../docs/PRD_02_ENGINE_DESIGN.md` 6절 M3 행 ①~⑦ · 통과 기준 "기능 회귀 0, 모듈 의존이 3.1절 구조와 일치"(PRD_01 5절 M3 행과 같음).
> 원칙 : PRD_02 3.2 — M3 **동작 변경은 M2 실기기 확인 뒤**. 이번 단계는 관문 자동화·공백 점검·테스트·문서 정합만 했고 운영 코드는 바꾸지 않았다.
> 경로는 `media/` 기준.

## 1. ①~⑦ 공백 점검

| # | 항목 | 판정 | 근거(파일:줄) | 테스트 |
|---|---|---|---|---|
| ① | 닫힘 연쇄 Transport→Producer/Consumer, Producer→Consumer | **구현** | `internal/bora/lifecycle.go:173` closePeer(① 내 Producer ② 내 Consumer ③ PC·할당기 ④ 표) · `:201` closeProducer(표 제거 → 닫기 → Consumer 정리 → `producerClosed`) · `:230` detachConsumer(레이어 Unsubscribe·RemoveTrack 재협상) | `bora/lifecycle_test.go:82·139`, `bora/cascade_test.go`(패널 범위·중복 닫기) |
| ② | 늦은 합류자 상태 전달 | **구현** | `bora/lifecycle.go:279` initConsumer(일시정지면 Pause + `producerPaused`, 할당기에 레이어 활성·비트레이트) · `:292` producerInfos(join 응답) · `bora/room.go:211` 입장 시 기존 producer 구독 · `room.go:467` consumerCreated 직후 호출 | `bora/lifecycle_test.go:153`, `bora/cascade_test.go` TestLateJoinerState |
| ③ | Decision 4분류 + SeqRewriter(Drop/Sync) | **구현** | `internal/jeju/decision.go:11` Decision · `:39` decide(Drop → `seq.Drop`, 재개 게이트) · `internal/jeju/seqrewriter.go:114` Sync(옛 패킷 floor) · `:124` Drop(메움·접기) · `:142` Input | `jeju/seqrewriter_test.go`, `jeju/jeju_test.go`, `jeju/m3_test.go`(재전송 멱등·Sync 이전 Drop·일시정지 우선·이름) |
| ④ | consume paused→resume(resume 즉시 키프레임) | **부분** | Consumer 쪽 완성 : `jeju/decision.go:66-81`(resume → resync + `requestKeyframe(NewConsumer)`), `jeju/replay.go:20`(paused 시작이면 재생 생략), `bora/lifecycle.go:141` ResumeConsumer. **공백** : 방이 만드는 Consumer 는 늘 `paused=false`(`bora/room.go:212`·`:355`), `ConsumerCreated.Paused` 를 채우지 않음(`room.go:463-466`), 공개 `Room.Consume(…, paused)`(`room.go:366`)는 호출자 없음 → 지금 `consumer.resume` 은 producer 일시정지 때만 의미가 있다 | `jeju/m3_test.go` TestResumeRequestsKeyframe(발표자 방향 PLI 확인), `jeju/seqrewriter_test.go:133` |
| ⑤ | 5.2 메시지 확정·`docs/SIGNAL_API.md` | **구현(문서 정합 완료)** | `internal/signal/envelope.go:24-65` 이름·오류 코드 · `../docs/SIGNAL_API.md` v1.0.1(2026-10-26 코드 기준 정정, 아래 3절) · `layersChanged`·`streamState`·`score`(`envelope.go:44-47`)는 정의만, 송신은 M4 | `signal/server_test.go` |
| ⑥ | 레이어 비활성 감지 | **부분** | 판정 : `internal/santorini/activity.go:38` observe(500ms 주기, l 2초·상위 10초 연속) · `:77` Active(연속 + 1초 안 패킷) · `:80` Bitrate. 사용 : `bora/lifecycle.go:309` → `internal/bwe/allocator.go:150·160`(비활성 레이어 제외). **공백** : `jeju/decision.go:85` layerUsable 훅은 호출자 없음(LayerPolicy 가 직접 쓰지 않음) | `santorini/activity_test.go`, `santorini/inactive_test.go`(공개 Active·Bitrate), `jeju/m3_test.go` TestLayerUsable |
| ⑦ | 표 형식 단위 테스트 + `-race` | **부분** | 표 형식 테스트 있음(위 열). **`-race` 미검증** — 이 PC 는 CGO 없음(race 검출기는 cgo 필요). CGO 가능한 PC·CI 에서 `go test -race ./...` 1회 필요 | — |

## 2. 관문 — 모듈 의존이 3.1절 구조와 일치

- 테스트 : `internal/archtest/deps_test.go`(go/build 로 `cmd/*`·`internal/*` 운영 코드 import 를 읽어 허용표와 대조, 외부 의존은 `github.com/pion/` 만).
- 허용표는 PRD_02 3.1(역할)·3.3(시그니처)·4.1(정방향 1~10단계)·4.2(RTCP)를 간선마다 주석으로 인용했다. 표에 없는 import·표에 없는 새 패키지·사라진 패키지는 실패.
- **결과 : PASS(위반 0)** — 실제 간선

| 패키지 | 내부 import |
|---|---|
| cmd/galapagos | bora · capri · signal |
| bora | bwe · capri · jeju · metrics · pli · record · santorini · signal |
| santorini | forward · metrics · nack · pli · rtcpx · rtpx |
| jeju | forward · metrics · nack · pli · rtcpx · rtpx · santorini |
| forward | metrics |
| record | jeju |
| signal · capri · nack · pli · bwe · rtcpx · rtpx · metrics | 없음 |

- **문서 드리프트(코드 위반 아님)** : `OWNERSHIP.md:57` 의존 방향 줄이 실제보다 좁다 — 빠진 간선 `bora → {metrics, pli, record}`, `jeju → {metrics, rtcpx, rtpx}`, `santorini → metrics`, `forward → metrics`. 모두 PRD_02 근거가 있는 간선(관문 주석 참조)이라 표는 넓혔지만 OWNERSHIP 은 "계약" 파일이라 고치지 않았다 [확인중 : 마스터 — OWNERSHIP.md:57 을 관문 표로 갱신 승인].
- 근거가 약한 간선 2개(검토 권고) : `bora → metrics`(관리 API `bora/admin.go` 의 내보내기 — PRD_02 는 내보내기 위치를 정하지 않음), `bora → record`(녹화 Consumer 를 방이 만든다 — PRD_02 3.3 record 는 "내부 Consumer"만 명시). M5 내보내기(`metrics/export.go`) 때 위치 재확인.

## 3. SIGNAL_API ↔ 코드 불일치(문서 쪽 정정 완료, 필드·이름 변경 없음)

1. 10초 안에 join 없음 → 문서는 `ntf error TICKET_INVALID`, 코드는 알림 없이 종료(`signal/server.go:198-201`).
2. 첫 메시지가 join 이 아니면 `res ok:false TICKET_INVALID` 후 종료(`server.go:202-205`) — 문서에 없었음.
3. 서버 → 클라이언트 `ntf trickle`(`bora/room.go:227`) — 알림 목록에 없었음. 클라이언트 `trickle` 을 `ntf` 로 보내도 처리(`server.go:240`).
4. 알림 순서 : 코드는 `consumerCreated`(+`producerPaused`) 들 → `transport.subscribe`(`room.go:462-474`), 문서 4절·8절 예시는 반대였음.
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

- `go vet ./...` 통과(4.6초) · `go test -count=1 ./...` 15패키지 전부 통과(19.0초) · 새 시간 의존 테스트 `-count=5` 반복 통과.
- `-race` 미실행(CGO 없음).
