# SIGNAL_API — Galápagos 시그널링 프로토콜 (확정판 v1.1.1)

> 작성 2026-10-25 · v1.1 개정 2026-10-26(UI 설계서 `ui-design/ui-design.md` 13절 #1 결정 — 14.7 필수 A~D + `room.end`, 받는 사람·필드 정본 = 설계서 7.2) · v1.1.1 구현 결정 문서화 2026-10-26 · M3 산출물 · 근거 `PRD_02_ENGINE_DESIGN.md` 5절(D-9 봉투·D-11 입장권), REA_02 5.1(수명주기 이벤트)·6.2(동사 경계)
> 코드 정본 : `media/internal/signal/envelope.go`(이름·필드·오류 코드), `session.go`(시간 상수), `ticket.go`(입장권). **이 문서와 코드가 다르면 코드를 고치기 전에 이 문서를 먼저 고친다**(이름·필드 변경은 M3 합의 필요).
> 표준 SDP 를 그대로 주고받는다 — 클라이언트 라이브러리가 필요 없다(D-9).

## 1. 연결

| 항목 | 값 |
|---|---|
| 주소 | `wss://<미디어 서버>/signal` (개발 `ws://localhost:7880/signal`, Next env `NEXT_PUBLIC_MEDIA_WS_URL`) |
| Origin | `MEDIA_ALLOWED_ORIGINS` 목록만 허용 |
| 세션 | WebSocket 연결 1개 = 세션 1개 = 참가자 1명 |
| 입장 시한 | 연결 후 **10초** 안에 `join` (넘으면 **알림 없이** 연결 종료). 첫 메시지가 `join` 요청이 아니면 `res ok:false TICKET_INVALID` 후 종료 |
| 생존 확인 | 20초 무수신이면 서버가 `ping`, **45초** 무수신이면 종료 |
| 메시지 크기 | 최대 **64KB** [TBD : M1 실측] — 넘으면 종료 |
| 형식 | 텍스트 프레임, UTF-8 JSON 1개 |

## 2. 봉투 (D-9)

```jsonc
// 요청 (C→S, 서버 ping 은 S→C) — id 는 보낸 쪽이 정하는 양의 정수, 세션 안에서 유일
{"t":"req","id":7,"m":"produce","d":{...}}
// 응답 — 같은 id. 성공이면 ok:true + d, 실패면 ok:false + e
{"t":"res","id":7,"ok":true,"d":{"producerId":"p_x1"}}
{"t":"res","id":7,"ok":false,"e":{"code":"ROLE_FORBIDDEN","msg":"audience 는 발행할 수 없음"}}
// 알림 — id 없음, 응답 없음
{"t":"ntf","m":"producerClosed","d":{"producerId":"p_x1"}}
```

| 필드 | 형식 | 설명 |
|---|---|---|
| `t` | `"req"`\|`"res"`\|`"ntf"` | 봉투 종류 |
| `id` | 정수 | 요청·응답 짝. 알림엔 없음 |
| `m` | 문자열 | 메서드·알림 이름(3절) |
| `ok` | 불리언 | 응답에만 |
| `d` | 객체 | 데이터. 데이터 없는 요청·응답은 `{}` 또는 생략 |
| `e` | `{code, msg}` | 실패 응답에만(5절) |

## 3. 메시지 목록

### 3.1 요청 (C→S)

| 메서드 | `d` | 응답 `d` | 역할 | 단계 | 비고 |
|---|---|---|---|---|---|
| `join` | `{ticket}` | `{peerId, role, iceServers, producers, peers}` | 전원 | M1 (`peers` v1.1) | 첫 메시지여야 함. `producers` = 방에 이미 있는 다른 참가자 producer 목록 `[{id, kind, peer, source}]`(늦은 합류자 상태, `source` v1.1). `peers` = 3.3 A |
| `transport.publish` | `{sdp}` (offer) | `{sdp}` (answer) | presenter·panel | M1 | 발행 PC 협상. 클라이언트 offer 고정(D-2 glare 없음) |
| `produce` | `{mid, kind, source, rids?}` | `{producerId}` | presenter·panel | M1 | 역할 검사 2회(signal·방). `kind` `audio`\|`video`(그 밖은 `SDP_INVALID`), `source` `camera`\|`screen`\|`mic`(그 밖은 `camera` 로 간주), `rids` simulcast `["l","m","h"]` — `rids` 는 현재 서버가 읽지 않고 레이어는 수신 트랙의 rid 로 정한다 |
| `transport.subscribe.answer` | `{sdp}` (answer) | `{}` | 전원 | M1 | `ntf transport.subscribe` 에 대한 답 |
| `trickle` | `{pc, candidate}` | `{}` | 전원 | M1 | `pc` `pub`\|`sub`. 원격 SDP 전 도착분은 서버가 보관. **`ntf` 봉투로 보내도 엔진이 받는다**(응답 없음 — 실험실 화면이 이 방식, 설계서 13절 #7) |
| `consumer.resume` | `{consumerId}` | `{}` | 전원 | M3 | 수신 준비 끝 신호 → 서버가 **즉시 키프레임 요청**. producer 가 일시정지면 producer 재개 때 함께 재개 |
| `consumer.setLayer` | `{consumerId, maxSpatial, maxTemporal?}` | `{}` | 전원 | M3 정의·M4 사용 | 화면 크기 기반 **상한**만(0=l·1=m·2=h, 범위 밖은 0~2 로 자름). 실제 레이어는 서버가 정함. 100ms 디바운스. `maxTemporal` 은 현재 무시(시간 레이어 미지원) |
| `producer.pause` | `{producerId}` | `{}` | 소유자 | M3 | 마이크·카메라 끄기. 연결 Consumer 전부 일시정지 + 다른 참가자에게 `ntf producerPaused` |
| `producer.resume` | `{producerId}` | `{}` | 소유자 | M3 | 연결 Consumer 재개(키프레임 요청) + `ntf producerResumed` |
| `producer.close` | `{producerId}` | `{}` | 소유자 | M3 | 닫힘 연쇄(4절) + `ntf producerClosed` |
| `ping` | `{}` | `{}` | 전원 | M1 | 양방향. 서버가 보낸 `ping` 에도 클라이언트는 `res` 로 답한다 |
| `leave` | `{}` | `{}` | 전원 | M1 | 참가자 닫힘 연쇄(4절) 후 서버가 연결 종료 |
| `chat.send` | `{text}` | `{ts}` | 전원 | M3 (v1.1) | 3.3 C. 저장 안 함(엔진 중계만) |
| `hand.set` | `{raised}` | `{raisedTs}` | audience | M3 (v1.1) | 3.3 C |
| `hand.lowerAll` | `{}` | `{}` | presenter | M3 (v1.1) | 3.3 C |
| `reaction.send` | `{emojis}` | `{}` | 전원 | M3 (v1.1) | 3.3 C |
| `peer.setRole` | `{peerId, role}` | `{}` | presenter | M3 (v1.1) | 3.3 D. `role` `panel`\|`audience` |
| `room.end` | `{}` | `{}` | presenter | M3 (v1.1) | 3.3 D. 세미나 종료 |

> `pong` 이름(`MPong`)은 코드에 예약돼 있으나 응답 봉투(`res`)로 대신한다 — 클라이언트는 보내지 않아도 된다.
> 소유자가 아닌 producer 에 대한 `producer.*` 요청과 없는 `consumerId` 는 `NOT_FOUND`(존재 여부를 숨기려고 `ROLE_FORBIDDEN` 이 아님).

### 3.2 알림 (S→C)

| 알림 | `d` | 단계 | 받는 사람 · 시점 |
|---|---|---|---|
| `transport.subscribe` | `{sdp}` (서버 offer) | M1 | 구독 PC 재협상 필요 시. 트랙이 연달아 바뀌면 **200ms 묶음** 1회 |
| `trickle` | `{pc, candidate}` | M1 | 서버 ICE 후보(`pc` `pub`\|`sub`). 응답 없음 |
| `consumerCreated` | `{consumerId, producerId, mid, kind, source, paused}` | M1(paused M3·`source` v1.1) | 새 producer 가 생기면 기존 참가자 전원, 입장 시 기존 producer 마다. 서버가 자동 생성(왕복 절감). **현재 `paused` 는 항상 `false`**(4절) — 일시정지 상태는 뒤따르는 `producerPaused` 로 안다. 묶음의 `consumerCreated` 들이 먼저, 그다음 `transport.subscribe` |
| `producerClosed` | `{producerId}` | M3 | 소유자를 뺀 전원. 이 알림이 갈 때 연결 Consumer 는 **이미 닫혀 있다** → 클라이언트는 해당 트랙을 지운다 |
| `producerPaused` | `{producerId}` | M3 | 소유자를 뺀 전원. 일시정지 중 늦게 들어온 참가자는 `consumerCreated` 직후 받는다 |
| `producerResumed` | `{producerId}` | M3 | 소유자를 뺀 전원 |
| `layersChanged` | `{consumerId, spatial, temporal}` | M4 | 그 Consumer 의 주인. 서버 레이어 전환 결과 — **이름·형식만 정의, 현재 서버 미송신** |
| `streamState` | `{consumerId, state}` | M4 | `active`\|`paused` — 할당기 일시정지(기본 꺼짐이라 드묾) — **현재 서버 미송신** |
| `publishLayers` | `{producerId, rids}` | M4 | 발행자. dynacast — 예 `{"l":true,"m":true,"h":false}`, 하향 5초 디바운스 |
| `score` | `{consumerId}`\|`{producerId}` + `{score, grade}` | M4 | 5초 주기 품질 점수(LiveKit 식, REA_03 5.10) — **현재 서버 미송신** |
| `error` | `{code, msg}` | M1 | 치명 오류 후 서버가 연결 종료할 수 있음 |
| `peerJoined` | `{peers: [{peerId, name, role, raisedTs}]}` | M3 (v1.1) | 방 전원(들어온 본인 제외). **200ms 묶음** — 3.3 A |
| `peerLeft` | `{peerIds: [string]}` | M3 (v1.1) | 방 전원. **200ms 묶음** — 3.3 A |
| `chat` | `{peerId, name, text, ts}` | M3 (v1.1) | 방 전원(보낸 본인 제외 — 본인은 응답으로 확정) |
| `hand` | `{peerId, raisedTs}` | M3 (v1.1) | **presenter·panel·손든 본인만**(청중끼리 노출 안 함) — 3.3 C |
| `reaction` | `{counts: {[emoji]: n}, ts}` | M3 (v1.1) | 방 전원(보낸 사람 포함). 서버 **300ms 창 합산·익명** |
| `roleChanged` | `{peerId, role, by}` | M3 (v1.1) | 방 전원(대상·요청자 포함) — 3.3 D |

### 3.3 v1.1 추가 규칙 (UI 설계서 7.2·14.4·14.7 — 13절 #1·#2·#4·#6·#8·#9 결정)

공통 : 시각(`ts`·`raisedTs`)은 **서버 시각 Unix 밀리초**(클라이언트 시계 불신). `peerId` 는 `join` 응답 `peerId`·`ProducerInfo.peer` 와 **같은 값**(조인 키). 권한 검사는 전부 서버가 **세션 역할**(6절)로 한다. 요청 `d` 해석 실패·값 범위 밖은 기존 규칙대로 `SDP_INVALID`, 닫힌 방의 요청은 `ROOM_CLOSED`. **값 검사는 속도 제한보다 먼저**(v1.1.1) — `SDP_INVALID` 로 거부된 요청은 초당 한도를 쓰지 않는다.

**A — 참가자**

| 항목 | 규칙 | 오류 |
|---|---|---|
| `join` 응답 `peers` | 방 참가자 전원(**본인 포함**) `[{peerId, name, role, raisedTs}]`. `name` = 입장권 `name`. 받는 사람이 audience 면 **본인 외 `raisedTs` 는 0** 으로 가린다(`ntf hand` 범위와 같게) | — |
| `ntf peerJoined` | 입장 폭주 방지로 **200ms 창 묶음**(첫 입장이 창을 열고 200ms 뒤 1회). 새 참가자 `raisedTs` 는 0. 받는 사람마다 **자기보다 뒤에 들어온 사람만** 담는다(앞서 들어온 사람은 자기 `join` 응답 `peers` 에 이미 있음 — 같은 창 안 입장자는 자기 뒤 순서만, v1.1.1). `role` 은 보내는 시점의 세션 역할 | — |
| `ntf peerLeft` | 닫힘 연쇄(4절) ④ 뒤, 같은 200ms 창 묶음. 한 창 안에서는 `peerJoined` 를 먼저 보낸다. 방 전원에게 같은 목록을 보내므로 **받는 사람이 모르는 `peerId` 가 섞일 수 있다**(창 안에 들어왔다 나간 사람·자기보다 먼저 나간 사람) — 클라이언트는 모르는 값을 무시한다(v1.1.1) | — |

**B — 출처** : `ProducerInfo.source`·`consumerCreated.source` = `produce` 의 `source`(`camera`\|`screen`\|`mic`, `produce` 에서 그 밖 값은 `camera` 로 간주된 값). 필드 추가 = 하위 호환(9절).

**C — 상호작용**

| 메시지 | 규칙 | 오류 |
|---|---|---|
| `chat.send{text}` | 앞뒤 공백 제거 후 1~**500자**(유니코드 문자 수). 성공 응답 `{ts}` 로 보낸 사람이 확정, 나머지에게 `ntf chat{peerId, name, text, ts}`. **저장 안 함**(늦게 들어온 사람은 이전 대화 없음, 13절 #2). 속도 제한 = 피어당 초당 2건 [TBD : M5 실측] | 빈 값·500자 초과 `SDP_INVALID`, 한도 초과 `RATE_LIMITED`(전송 안 함) |
| `hand.set{raised}` | audience 만. 올림 = 서버 시각을 `raisedTs` 로 기록(이미 올린 상태면 처음 시각 유지·알림 없음), 내림 = 0. 바뀌었을 때만 `ntf hand{peerId, raisedTs}` → presenter·panel·본인. 응답 `{raisedTs}` | presenter·panel 이 보내면 `ROLE_FORBIDDEN` |
| `hand.lowerAll{}` | presenter 만. 올린 사람마다 `raisedTs` 0 + `ntf hand`(받는 사람 위와 같음) | `ROLE_FORBIDDEN` |
| `reaction.send{emojis}` | 허용 7종 `👍` `👏` `😀` `😮` `🙁` `😶` `💖`(13절 #4)만, 1~**3개**(클라이언트 500ms 묶음). 피어당 **초당 2건**. 한 요청 안의 **중복 이모지는 1개로 센다**(v1.1.1 — 개수 1~3 검사는 중복 제거 전 배열 길이). 서버는 첫 반응이 연 **300ms 창**에 개수를 합산해 `ntf reaction{counts, ts}` 를 방 전원에게 1회 — 보낸 사람 정보 없음(익명) | 허용 밖·0개·4개 이상 `SDP_INVALID`, 한도 초과 `RATE_LIMITED`(합산 안 함) |

**D — 역할·종료**

| 메시지 | 규칙 | 오류 |
|---|---|---|
| `peer.setRole{peerId, role}` | presenter 만. `role` = `panel`\|`audience`(무대 초대·내리기, 13절 #3·#9 ⓐ — 세션 중 바로 전환, 재입장 없음). 같은 역할이면 성공·알림 없음. **승격(→panel)** : 역할 변경 → 손이 올라가 있으면 내림(`ntf hand` raisedTs 0) → `ntf roleChanged{peerId, role, by}`(전원, `by` = 요청자 peerId) → 승격된 사람에게 현재 올라가 있는 손마다 `ntf hand`(이제 받는 범위에 들어옴). 마이크는 **자동으로 켜지지 않는다** — 본인이 `transport.publish`·`produce` 로 발행. **강등(→audience)** : 역할 변경 → 그 사람 producer 전부 닫힘 연쇄(4절, 다른 참가자에게 `producerClosed`) → `ntf roleChanged`. **서버도 강등된 사람의 발행 PC 를 닫는다**(v1.1.1 — 다시 승격되면 새 `transport.publish` 로 새 PC 를 협상, 이전 PC 재사용 없음). 강등된 클라이언트는 자기 트랙·발행 PC 를 정리하고 손 목록을 비운다(이후 `transport.publish`·`produce` 는 `ROLE_FORBIDDEN`). **바뀐 역할은 재입장해도 유지**(v1.1.1) — 엔진이 방마다 입장권 `sub` → 세션 역할을 기억해 같은 `sub` 의 다음 `join` 은 입장권 `role`(초기값) 대신 그 역할로 들어온다(`join` 응답 `role`·`peers` 도 그 값). panel·audience 만 기억하므로 이 경로로 presenter 가 되는 일은 없고, presenter 입장권은 입장권 그대로. 방이 닫히면(종료·정리) 기억도 사라진다 | presenter 아님·대상이 presenter(본인 포함) `ROLE_FORBIDDEN`, 대상 없음 `NOT_FOUND`, `role` 이 그 밖 값 `SDP_INVALID` |
| `room.end{}` | presenter 만(13절 #6). 순서 : 종료 표시(이후 `join` 차단) → **요청자에게 성공 응답을 먼저 보낸 뒤** → 나머지 전원에게 `ntf error{code:"ROOM_CLOSED"}`·닫힘 연쇄·연결 종료 → 요청자에게도 `ntf error{code:"ROOM_CLOSED"}` 후 종료(v1.1.1 — 요청자는 다른 사람이 닫히기 전에 응답을 받는다). 엔진 메모리에 종료 표시를 남겨 같은 방 ID 의 이후 `join` 은 `ROOM_CLOSED` — 관리 API `POST /admin/rooms` 로 같은 방 ID 를 새로 열면 지워진다(v1.1.1), 그 밖에는 엔진 재시작 시 초기화 | `ROLE_FORBIDDEN` |

## 4. 수명주기 (서버 동작 — 클라이언트가 기대할 순서)

```
청중                        서버                                   발표자
 │── join{ticket} ───────▶│ 입장권 검증(4절 오류) · 정원·역할·중복 검사
 │◀─ res{peerId,…,producers:[pa]}
 │◀─ ntf consumerCreated{ca, pa, paused:false}   (200ms 묶음 안의 consumer 마다)
 │◀─ ntf producerPaused{pa}   ← pa 가 일시정지 중일 때만(늦은 합류자 상태), 해당 consumerCreated 바로 뒤
 │◀─ ntf transport.subscribe{sdp} (묶음당 1회, consumerCreated 들 다음)
 │── transport.subscribe.answer{sdp} ─▶
 │                          │ answer·연결 뒤 송신 시작 → 캐시 재생 또는 키프레임 요청 → 첫 화면
 │                          │◀── producer.close{pa} ───────────────│
 │                          │ ① pa 닫기 ② ca 등 연결 Consumer 전부 닫기 ③ 표 정리
 │◀─ ntf producerClosed{pa} │ ④ 알림(소유자 제외)
```

- **닫힘 연쇄** (REA_02 5.1) : 참가자 닫힘(`leave`·연결 끊김·45초 무수신·`DUPLICATE_SESSION`) → ① 그 참가자의 producer 각각 닫힘 연쇄 ② 그 참가자의 consumer 를 레이어에서 떼고 닫기 ③ 발행·구독 PC 와 할당기 닫기 ④ 방 표에서 제거.
  producer 닫힘 → ① 방 표에서 빼 새 구독 차단 ② producer 수신 중단 ③ 연결 consumer 전부 닫고 각 참가자 표에서 제거 ④ `producerClosed`.
- **consume paused → resume** : 현재 서버가 자동으로 만드는 consumer(입장 시·새 producer 발행 시)는 **`paused:false` 로 시작**하며, `consumer.resume` 없이 구독 PC 연결 뒤 바로 보낸다(2026-10-25 검토 지적 반영 — 문서를 동작에 맞춤). `consumer.resume` 은 받으면 성공으로 응답하고, 일시정지된 consumer 만 재개한다. 재개된 영상은 첫 키프레임부터 출력되며 RTP 순번은 끊김 없이 이어진다(서버 SeqRewriter, REA_02 5.6). paused 시작으로 바꾸려면 시험 화면에 `consumer.resume` 송신을 먼저 넣는다.
- **producer 일시정지 중 consumer.resume** : 응답은 성공, 실제 재개는 `producer.resume` 때.

## 5. 오류 코드

| 코드 | 의미 | 주로 나오는 곳 | 연결 |
|---|---|---|---|
| `TICKET_INVALID` | 서명·`aud`·형식·`jti` 재사용 실패, 첫 메시지가 `join` 아님(10초 시한 초과는 알림 없이 종료) | `join` | 종료 |
| `TICKET_EXPIRED` | `exp` 지남(오차 5초) | `join` | 종료 |
| `ROOM_FULL` | 정원(`cap`) 초과 | `join` | 종료 |
| `ROLE_FORBIDDEN` | audience 의 `transport.publish`·`produce`, v1.1 권한 밖 요청(3.3 — `hand.set`·`hand.lowerAll`·`peer.setRole`·`room.end`) | 발행·관리 요청 | 유지 |
| `ROOM_CLOSED` | 방 종료(`end` 지남·관리자 종료·`room.end`)·닫힌 방에 요청 | 전부 · `ntf error` | 종료 |
| `DUPLICATE_SESSION` | 같은 방에 같은 `sub` 가 다시 입장 → **기존** 세션에 `ntf error` | `ntf error` | 기존 세션 종료 |
| `SDP_INVALID` | SDP 파싱·적용 실패, 대기 중 offer 없이 온 `transport.subscribe.answer`, **요청 `d` 해석 실패(모든 요청)**, `produce` 의 잘못된 `kind` [TBD : 일반 `BAD_REQUEST` 코드 분리 여부] | `transport.*` · 전부 | 유지 |
| `NOT_FOUND` | 없는 메서드·producer·consumer, 남의 producer | 전부 | 유지 |
| `RATE_LIMITED` | 요청 과다 [TBD : 한도 M5]. v1.1 `chat.send`·`reaction.send` 는 피어당 초당 2건(3.3 C) | 전부 | 유지 |
| `INTERNAL` | 서버 내부 오류 | 전부 | 유지 |

- 입장권 실패는 **200ms 지연 후** 응답한다(추측 공격 완화, REA_01 5.11).

## 6. 입장권 클레임 요약 (D-11, C-8 승인 대기)

JWT 압축 직렬화, **HS256 고정**(헤더 `alg` 불신), 키 `MEDIA_TOKEN_SECRET`(32자 이상), 발급은 화면 서버 `/api/media/ticket`(로그인·결제 확인 후).

| 클레임 | 형식 | 검증 |
|---|---|---|
| `aud` | `"seminar-media"` | 다르면 거부 |
| `room` · `sub` · `name` | 문자열 | 방 ID · 사용자 UUID(중복 입장 판정) · 표시명(전달만) |
| `role` | `presenter`\|`panel`\|`audience` | **입장 시 초기값**. 같은 방에 같은 `sub` 로 재입장하면 엔진이 기억한 세션 역할이 우선(3.3 D, v1.1.1). 입장 뒤에는 엔진의 **세션 역할이 정본**(`peer.setRole` 로 바뀜, v1.1 — 설계서 13절 #9 ⓐ) — 발행·관리 권한은 세션 역할로 검사. 입장권 발급은 현재 presenter(관리자)·audience 만, panel 은 승격으로만 생김(13절 #8) |
| `cap` | 정수 | 방 정원(첫 입장 때 고정, 목표 31) |
| `iat` · `exp` | 초 | 수명 60초, 오차 5초, `exp` 필수 |
| `jti` | 128비트 무작위 | `exp` 까지 재사용 거부(메모리) |
| `end` | 초(선택) | 지나면 `ROOM_CLOSED` |

## 7. 예시 — 발표자 발행

```jsonc
→ {"t":"req","id":1,"m":"join","d":{"ticket":"eyJhbGciOiJIUzI1NiJ9...."}}
← {"t":"res","id":1,"ok":true,"d":{"peerId":"pr_1","role":"presenter","iceServers":[{"urls":["stun:stun.l.google.com:19302"]}],"producers":[],"peers":[{"peerId":"pr_1","name":"발표자","role":"presenter","raisedTs":0}]}}
→ {"t":"req","id":2,"m":"transport.publish","d":{"sdp":"v=0\r\no=- ..."}}
← {"t":"res","id":2,"ok":true,"d":{"sdp":"v=0\r\no=- ..."}}
→ {"t":"req","id":3,"m":"trickle","d":{"pc":"pub","candidate":{"candidate":"candidate:1 1 udp ...","sdpMid":"0","sdpMLineIndex":0}}}
← {"t":"res","id":3,"ok":true}
→ {"t":"req","id":4,"m":"produce","d":{"mid":"0","kind":"video","source":"camera","rids":["l","m","h"]}}
← {"t":"res","id":4,"ok":true,"d":{"producerId":"p_7f3a"}}
→ {"t":"req","id":5,"m":"producer.pause","d":{"producerId":"p_7f3a"}}
← {"t":"res","id":5,"ok":true}
```

## 8. 예시 — 청중 수신·오류

```jsonc
→ {"t":"req","id":1,"m":"join","d":{"ticket":"eyJ..."}}
← {"t":"res","id":1,"ok":true,"d":{"peerId":"au_9","role":"audience","iceServers":[],"producers":[{"id":"p_7f3a","kind":"video","peer":"pr_1","source":"camera"}],"peers":[{"peerId":"pr_1","name":"발표자","role":"presenter","raisedTs":0},{"peerId":"au_9","name":"청중","role":"audience","raisedTs":0}]}}
← {"t":"ntf","m":"consumerCreated","d":{"consumerId":"c_12","producerId":"p_7f3a","mid":"0","kind":"video","source":"camera","paused":false}}
← {"t":"ntf","m":"transport.subscribe","d":{"sdp":"v=0\r\n..."}}
→ {"t":"req","id":2,"m":"transport.subscribe.answer","d":{"sdp":"v=0\r\n..."}}
← {"t":"res","id":2,"ok":true}
→ {"t":"req","id":3,"m":"consumer.resume","d":{"consumerId":"c_12"}}
← {"t":"res","id":3,"ok":true}
→ {"t":"req","id":4,"m":"consumer.setLayer","d":{"consumerId":"c_12","maxSpatial":1}}
← {"t":"res","id":4,"ok":true}
→ {"t":"req","id":5,"m":"produce","d":{"mid":"1","kind":"audio","source":"mic"}}
← {"t":"res","id":5,"ok":false,"e":{"code":"ROLE_FORBIDDEN","msg":"audience 는 발행할 수 없음"}}
← {"t":"ntf","m":"producerClosed","d":{"producerId":"p_7f3a"}}
```

## 9. 호환 규칙

- 알 수 없는 알림은 클라이언트가 무시한다. 알 수 없는 메서드는 서버가 `NOT_FOUND`.
- 필드 추가는 하위 호환(무시 가능)으로만. 이름 변경·삭제는 이 문서 개정 + M3 합의.
- 메시지 종류가 20개를 넘어 관리가 어려우면 JSON Schema 로 생성(D-9 되돌릴 조건). 현재(v1.1) 요청 18 · 알림 17(서버 `trickle` 포함) — 후속 E(사회 기능) 착수 때 요청이 20을 넘으므로 그때 전환 판단 [확인중 : 마스터].

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-25 | v1.0 확정 — PRD_02 5절 초안 확정, M3 동작(닫힘 연쇄·늦은 합류자·paused→resume·producer 일시정지) 반영 |
| 2026-10-26 | v1.0.1 문서를 코드에 맞춤(이름·필드 변경 없음) — 10초 시한 초과는 알림 없이 종료·첫 메시지 비join 응답, 서버 `trickle` 알림 추가, 알림 순서(consumerCreated → producerPaused → transport.subscribe), `paused` 항상 false, `produce` kind·source·rids 처리, setLayer 자르기·maxTemporal 무시, `SDP_INVALID` 실제 범위, M4 알림 3종 미송신 표기 |
| 2026-10-26 | **v1.1** — UI 설계서 13절 #1 결정(마스터 채택)으로 14.7 필수 A~D + `room.end` 추가. 요청 6(`chat.send`·`hand.set`·`hand.lowerAll`·`reaction.send`·`peer.setRole`·`room.end`)·알림 6(`peerJoined`·`peerLeft`·`chat`·`hand`·`reaction`·`roleChanged`), `join` 응답 `peers`, `ProducerInfo`·`consumerCreated` 에 `source`, 6절 `role` = 입장 시 초기값(세션 역할 정본, 13절 #9), 3.1 `trickle` `ntf` 허용(13절 #7). 기존 이름·필드 변경 없음, 신규 오류 코드 없음(`LOCKED` 는 후속 E 때) |
| 2026-10-26 | **v1.1.1** 구현 결정 문서화(이름·필드 변경 없음, 3.3) — ① 승격·강등 역할은 같은 `sub` 재입장 때 유지(방 단위 기억, presenter 승격 불가, 방이 닫히면 소멸) ② `room.end` 순서 = 요청자 성공 응답 → 나머지 전원 `ROOM_CLOSED` → 정리 ③ 관리 API `POST /admin/rooms` 로 다시 열면 종료 표시 해제 ④ `reaction.send` 한 요청 안 중복 이모지는 1개로 셈 ⑤ 서버가 강등된 사람의 발행 PC 를 닫음 ⑥ `peerJoined` 는 받는 사람보다 뒤에 들어온 사람만, `peerLeft` 는 모르는 `peerId` 가 섞일 수 있음(무시) ⑦ 값 검사가 속도 제한보다 먼저(잘못된 요청은 한도 미사용) |
