# SIGNAL_API — Galápagos 시그널링 프로토콜 (확정판 v1.3.1)

> 작성 2026-10-25 · v1.1 개정 2026-10-26(UI 설계서 `ui-design/ui-design.md` 13절 #1 결정 — 14.7 필수 A~D + `room.end`, 받는 사람·필드 정본 = 설계서 7.2) · v1.1.1 구현 결정 문서화 2026-10-26 · v1.1.3 `ntf score` 송신 2026-10-27(3.4) · **v1.2 후속 E·F·G(사회·레이아웃·발언자) 2026-10-27(3.5) — 아소카 결정(마스터 위임 2026-10-26)** · **v1.3 범용 중계 `app.send`·`ntf app` 2026-10-27(3.6) — 계획서 A-2, 아소카 결정(마스터 위임 2026-10-27)** · v1.3.1 잘못된 UTF-8 연결 종료(1절)·`refresh` 묶어 읽기(3.6) 2026-10-27(검토 지적) · M3 산출물 · 근거 `PRD_02_ENGINE_DESIGN.md` 5절(D-9 봉투·D-11 입장권), REA_02 5.1(수명주기 이벤트)·6.2(동사 경계)
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
| 형식 | 텍스트 프레임, **올바른 UTF-8** JSON 1개 — 잘못된 UTF-8 이면 응답·중계 없이 **연결 종료**(RFC 6455 8.1 서버 의무, 모든 메서드 공통 관문 `session.read`, v1.3.1). `d` 를 그대로 중계하는 요청(`app.send`)이 잘못된 바이트를 받는 사람 전원에게 넘겨 1007 로 끊기게 하는 경로를 막는다 |

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
| `join` | `{ticket}` | `{peerId, role, iceServers, producers, peers, policy, layout?}` | 전원 | M1 (`peers` v1.1 · `policy`·`layout` v1.2) | 첫 메시지여야 함. `producers` = 방에 이미 있는 다른 참가자 producer 목록 `[{id, kind, peer, source}]`(늦은 합류자 상태, `source` v1.1). `peers` = 3.3 A. `policy` = 현재 잠금 `{locked:{audio,video}}`, `layout` = 발표자가 정한 마지막 레이아웃(없으면 생략) — 3.5 |
| `transport.publish` | `{sdp}` (offer) | `{sdp}` (answer) | presenter·panel | M1 | 발행 PC 협상. 클라이언트 offer 고정(D-2 glare 없음) |
| `produce` | `{mid, kind, source, rids?}` | `{producerId}` | presenter·panel | M1 | 역할 검사 2회(signal·방). `kind` `audio`\|`video`(그 밖은 `SDP_INVALID`), `source` `camera`\|`screen`\|`mic`(그 밖은 `camera` 로 간주), `rids` simulcast `["l","m","h"]` — `rids` 는 현재 서버가 읽지 않고 레이어는 수신 트랙의 rid 로 정한다 |
| `transport.subscribe.answer` | `{sdp}` (answer) | `{}` | 전원 | M1 | `ntf transport.subscribe` 에 대한 답 |
| `trickle` | `{pc, candidate}` | `{}` | 전원 | M1 | `pc` `pub`\|`sub`. 원격 SDP 전 도착분은 서버가 보관. **`ntf` 봉투로 보내도 엔진이 받는다**(응답 없음 — 실험실 화면이 이 방식, 설계서 13절 #7) |
| `consumer.resume` | `{consumerId}` | `{}` | 전원 | M3 | 수신 준비 끝 신호 → 서버가 **즉시 키프레임 요청**. producer 가 일시정지면 producer 재개 때 함께 재개 |
| `consumer.setLayer` | `{consumerId, maxSpatial, maxTemporal?}` | `{}` | 전원 | M3 정의·M4 사용 | 화면 크기 기반 **상한**만(0=l·1=m·2=h, 범위 밖은 0~2 로 자름). 실제 레이어는 서버가 정함. 100ms 디바운스. `maxTemporal` 은 현재 무시(시간 레이어 미지원) |
| `producer.pause` | `{producerId}` | `{}` | 소유자 | M3 | 마이크·카메라 끄기. 연결 Consumer 전부 일시정지 + 다른 참가자에게 `ntf producerPaused` |
| `producer.resume` | `{producerId}` | `{}` | 소유자 | M3 | 연결 Consumer 재개(키프레임 요청) + `ntf producerResumed`. 잠금 중(3.5)이면 발표자 외 `LOCKED`(v1.2) |
| `producer.close` | `{producerId}` | `{}` | 소유자 | M3 | 닫힘 연쇄(4절) + `ntf producerClosed` |
| `ping` | `{}` | `{}` | 전원 | M1 | 양방향. 서버가 보낸 `ping` 에도 클라이언트는 `res` 로 답한다 |
| `leave` | `{}` | `{}` | 전원 | M1 | 참가자 닫힘 연쇄(4절) 후 서버가 연결 종료 |
| `chat.send` | `{text}` | `{ts}` | 전원 | M3 (v1.1) | 3.3 C. 저장 안 함(엔진 중계만) |
| `hand.set` | `{raised}` | `{raisedTs}` | audience | M3 (v1.1) | 3.3 C |
| `hand.lowerAll` | `{}` | `{}` | presenter | M3 (v1.1) | 3.3 C |
| `reaction.send` | `{emojis}` | `{}` | 전원 | M3 (v1.1) | 3.3 C |
| `peer.setRole` | `{peerId, role}` | `{}` | presenter | M3 (v1.1) | 3.3 D. `role` `panel`\|`audience` |
| `room.end` | `{}` | `{}` | presenter | M3 (v1.1) | 3.3 D. 세미나 종료 |
| `peer.mute` | `{peerId, kind}` | `{}` | presenter | v1.2 | 3.5 E. `kind` `audio`\|`video` |
| `room.muteAll` | `{kind, lock}` | `{}` | presenter | v1.2 | 3.5 E. `lock:false` = 음소거 + 잠금 해제 |
| `peer.askUnmute` | `{peerId, kind}` | `{}` | presenter | v1.2 | 3.5 E |
| `room.setLayout` | `{mode, spotlight, follow}` | `{}` | presenter | v1.2 | 3.5 F |
| `app.send` | `{topic, d}` | `{}` | 주제별(3.6 주제표) | v1.3 | 3.6. 범용 중계 — `d` 는 엔진이 해석·저장하지 않고 그대로 보낸다(4KB 이하). 잠금과 무관 |

> `pong` 이름(`MPong`)은 코드에 예약돼 있으나 응답 봉투(`res`)로 대신한다 — 클라이언트는 보내지 않아도 된다.
> 소유자가 아닌 producer 에 대한 `producer.*` 요청과 없는 `consumerId` 는 `NOT_FOUND`(존재 여부를 숨기려고 `ROLE_FORBIDDEN` 이 아님).

### 3.2 알림 (S→C)

| 알림 | `d` | 단계 | 받는 사람 · 시점 |
|---|---|---|---|
| `transport.subscribe` | `{sdp}` (서버 offer) | M1 | 구독 PC 재협상 필요 시. 트랙이 연달아 바뀌면 **200ms 묶음** 1회 |
| `trickle` | `{pc, candidate}` | M1 | 서버 ICE 후보(`pc` `pub`\|`sub`). 응답 없음 |
| `consumerCreated` | `{consumerId, producerId, mid, kind, source, peer, paused}` | M1(paused M3·`source` v1.1·`peer` v1.1.2) | 새 producer 가 생기면 기존 참가자 전원, 입장 시 기존 producer 마다. 서버가 자동 생성(왕복 절감). **현재 `paused` 는 항상 `false`**(4절) — 일시정지 상태는 뒤따르는 `producerPaused` 로 안다. 묶음의 `consumerCreated` 들이 먼저, 그다음 `transport.subscribe` |
| `producerClosed` | `{producerId}` | M3 | 소유자를 뺀 전원. 이 알림이 갈 때 연결 Consumer 는 **이미 닫혀 있다** → 클라이언트는 해당 트랙을 지운다 |
| `producerPaused` | `{producerId}` | M3 | 소유자를 뺀 전원. 일시정지 중 늦게 들어온 참가자는 `consumerCreated` 직후 받는다 |
| `producerResumed` | `{producerId}` | M3 | 소유자를 뺀 전원 |
| `layersChanged` | `{consumerId, spatial, temporal}` | M4 | 그 Consumer 의 주인. 서버 레이어 전환 결과 — **이름·형식만 정의, 현재 서버 미송신**(v1.1.3 재확인 : 화면이 쓰는 곳 없음 — 화질 표시는 `score` 로 충분) |
| `streamState` | `{consumerId, state}` | M4 | `active`\|`paused` — 할당기 일시정지(기본 꺼짐이라 드묾) — **현재 서버 미송신**(v1.1.3 재확인) |
| `publishLayers` | `{producerId, rids}` | M4 | 발행자. dynacast — 예 `{"l":true,"m":true,"h":false}`, 하향 5초 디바운스. **송신 중**(`bora/lifecycle.go` publishCaps, 1초마다 판정·바뀔 때만) |
| `score` | `{consumerId, score, grade}` | M4 (v1.1.3 송신) | **그 Consumer 의 주인**(수신자). 5초 주기 판정(LiveKit 식, REA_03 5.10 = `metrics.Scorer`) 중 **등급이 바뀔 때만** — 3.4. `{producerId}` 형(발행자 상류 품질)은 **이름·형식만 정의, 현재 서버 미송신** |
| `error` | `{code, msg}` | M1 | 치명 오류 후 서버가 연결 종료할 수 있음 |
| `peerJoined` | `{peers: [{peerId, name, role, raisedTs}]}` | M3 (v1.1) | 방 전원(들어온 본인 제외). **200ms 묶음** — 3.3 A |
| `peerLeft` | `{peerIds: [string]}` | M3 (v1.1) | 방 전원. **200ms 묶음** — 3.3 A |
| `chat` | `{peerId, name, text, ts}` | M3 (v1.1) | 방 전원(보낸 본인 제외 — 본인은 응답으로 확정) |
| `hand` | `{peerId, raisedTs}` | M3 (v1.1) | **presenter·panel·손든 본인만**(청중끼리 노출 안 함) — 3.3 C |
| `reaction` | `{counts: {[emoji]: n}, ts}` | M3 (v1.1) | 방 전원(보낸 사람 포함). 서버 **300ms 창 합산·익명** |
| `roleChanged` | `{peerId, role, by}` | M3 (v1.1) | 방 전원(대상·요청자 포함) — 3.3 D |
| `mutedBy` | `{kind, by, producerIds}` | v1.2 | **음소거된 본인만** — 서버가 일시정지한 내 producer 목록(본인은 `producerPaused` 를 받지 않음) — 3.5 E |
| `roomPolicy` | `{locked: {audio, video}}` | v1.2 | 방 전원. 잠금이 **바뀔 때만** — 3.5 E |
| `askUnmute` | `{kind, by}` | v1.2 | **대상 본인만**. 자동으로 켜지 않는다 — 3.5 E |
| `layout` | `{mode, spotlight, follow}` | v1.2 | 방 전원(요청자 포함). 값이 **바뀔 때만** — 3.5 F |
| `activeSpeaker` | `{peerId \| null}` | v1.2 | 방 전원. 판정이 바뀔 때만·**방당 500ms 에 최대 1건**, 입장 직후 현재 발언자 1건 — 3.5 G |
| `app` | `{topic, d, from}` | v1.3 | 방 전원(**보낸 본인 제외** — 본인은 응답으로 확정). `from` = 엔진이 채운 보낸 사람 `peerId`. 지난 신호는 보관·재전송 안 함 — 3.6 |

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

### 3.4 `ntf score` 규칙 (v1.1.3 — 아소카 결정(마스터 위임 2026-10-26))

| 항목 | 규칙 |
|---|---|
| 받는 사람 | 그 Consumer 의 주인 1명(구독자). 다른 참가자·발행자에게는 보내지 않는다 |
| 주기 | Consumer 마다 **5초** 판정(송신 고루틴 타이머) |
| 보내는 때 | **등급이 바뀔 때만**(R-P2). 처음 등급 = `excellent` 로 본다 — 좋은 연결은 알림 0건, 클라이언트도 알림 전엔 `excellent` 로 둔다 |
| 입력 | 청중 RR 의 `fractionLost`(손실)·`jitter`, 우리 SR 기준 RTT, 레이어 거리(`setLayer` 상한 중 발행 중인 최고 레이어 − 현재 레이어). 비트레이트 비율은 [TBD : M4 실측] 미사용. 음성은 손실 가중 8·레이어 무시 |
| `score` | 평활 점수 30~100(소수 1자리, 하강 빠르게 0.8·상승 느리게 0.4). `lost` 일 때만 0 |
| `grade` | `>80 excellent` · `>40 good` · `>20 poor` · 그 밖 `lost`. 점수 하한이 30 이라 **`lost` 는 "보냈는데 RR 이 10초 넘게 없음"으로만** 나온다(Chrome 음성 RR 5초 ±50% 를 감안해 주기와 따로 둔다) |
| 판정 보류 | 그 창에 보낸 패킷이 없거나(일시정지·발행 없음) RR 을 한 번도 못 받았으면 판정하지 않고 등급 유지 |
| 화면 | 설계서 14.1·6.3 — `poor`·`lost` 즉시 토스트, 회복 5초 뒤 숨김. 여러 Consumer 중 가장 나쁜 등급으로 표시 |

`consumer.setLayer` 와 짝 : 클라이언트용 `consumer.pause` 는 **없다** — 화면 밖·백그라운드 타일은 `maxSpatial:0`(최저 레이어)으로 낮춘다(설계서 14.2). 완전 정지 메시지는 후속 검토 [TBD].

### 3.5 v1.2 추가 규칙 — 후속 E 사회 · F 레이아웃 · G 발언자 (설계서 14.7, 아소카 결정(마스터 위임 2026-10-26))

공통 : 요청은 전부 **presenter 만**(세션 역할) — 아니면 `ROLE_FORBIDDEN`. `kind` = `audio`(음성 producer 전부) \| `video`(**카메라만** — 화면공유는 사회 대상 아님), 그 밖 값 `SDP_INVALID`. 대상 없음 `NOT_FOUND`, 대상이 presenter(본인 포함) `ROLE_FORBIDDEN`.

**E — 사회**

| 메시지 | 규칙 | 오류 |
|---|---|---|
| `peer.mute{peerId, kind}` | 대상의 그 종류 producer 중 켜진 것을 서버가 일시정지(= `producer.pause` 와 같은 처리, 다른 참가자에게 `producerPaused`) → 새로 멈춘 것이 있으면 대상에게 `ntf mutedBy{kind, by, producerIds}`. 이미 꺼졌거나 발행이 없으면 성공·알림 없음. 대상은 잠금이 없으면 스스로 다시 켤 수 있다 | 공통 |
| `room.muteAll{kind, lock}` | **한 방 고루틴 처리 안에서 순서 고정** : ① 잠금 표시(`lock:true`) 또는 해제(`lock:false`) ② 발표자 외 전원의 그 종류 일시정지 + 각자 `mutedBy` ③ 잠금이 바뀌었으면 전원 `ntf roomPolicy{locked}`. ①과 ② 사이에 다른 요청(`producer.resume`)이 끼어들 수 없다(Jitsi 경합 원천 차단). 잠금 해제는 `lock:false` 로 다시 보낸다 — 잠금 중엔 이미 모두 꺼져 있어 추가 음소거가 없다 | 공통 |
| 잠금 효과 | 발표자 외 참가자의 ⓐ 잠긴 종류 `producer.resume`(꺼진 것 켜기) ⓑ 잠긴 종류 새 `produce`(음성 전부·카메라 — 새 발행으로 우회 차단) ⓒ `peer.askUnmute` 는 `LOCKED`. 끄기(`producer.pause`)·닫기는 언제나 허용. 잠금은 방 메모리에만(방이 닫히면 사라짐), `join` 응답 `policy` 로 늦은 입장자에게 전달 | `LOCKED` |
| `peer.askUnmute{peerId, kind}` | 대상(panel — 발행 가능한 사람)에게 `ntf askUnmute{kind, by}` 만 보낸다. **서버·클라이언트 모두 자동으로 켜지 않는다** — 화면이 [마이크 켜기]/[무시] 를 띄우고 본인 탭으로만 켠다(설계서 14.4 동의 원칙) | 대상이 audience `ROLE_FORBIDDEN`, 잠금 중 `LOCKED` |

**F — 레이아웃**

| 메시지 | 규칙 | 오류 |
|---|---|---|
| `room.setLayout{mode, spotlight, follow}` | `mode` = `auto`(무대 자동, `spotlight` 는 서버가 비움) \| `spotlight`(`spotlight` = 타일 키 `cam:<peerId>`·`screen:<producerId>`, 1~64자). `follow` = 청중 화면도 따라 바뀜. 서버가 방마다 **마지막 값 1개를 보관**해 `join` 응답 `layout` 으로 주고, 값이 바뀌었을 때만 전원 `ntf layout`(Jitsi Follow Me 재시도 불필요). 키가 가리키는 타일이 없으면 클라이언트는 자동 배치로 둔다 | 값 범위 밖 `SDP_INVALID` |

**G — 발언자**

| 항목 | 규칙 |
|---|---|
| 입력 | 발행 PC 음성 m-line 에 `urn:ietf:params:rtp-hdrext:ssrc-audio-level`(RFC 6464) 를 **MediaEngine 확장 등록만으로** 협상(수신 전용 방향, 인터셉터 없음 — S-1). 레이어 수신 고루틴이 확장을 버리기 전에 원소 첫 바이트(V·7비트 레벨 = −dBov)를 직접 읽어(`rtpx.AudioLevel`) 지수 평활(1/8). 0.5초 새 값이 없으면(DTX·끊김) 무음 |
| 판정 | 방 고루틴 **100ms** 마다, 일시정지되지 않은 음성 producer 의 참가자별 가장 큰 값. **−50 dBov 보다 큼**이 말하는 중. 가장 큰 사람이 **300ms 이어지면** 전환, 현재 발언자가 말하는 중이면 **6 dB 더 커야** 후보(히스테리시스), 현재 발언자가 **1.5초** 조용하면 `null` [확인중 : 마스터 실기기 — 수치는 `bora/speaker.go` 손잡이] |
| 송신 | 판정이 바뀔 때만, **방당 500ms 에 최대 1건**(넘으면 미뤘다가 다음 판정에 — 그사이 되돌아오면 안 보냄). 입장 직후 현재 발언자가 있으면 본인에게 1건 |
| 화면 | 말하기 링 = `activeSpeaker` 대상 타일. 엔진이 확장을 협상하지 못한 연결·실험실 등 엔진 판정이 없으면 클라이언트 `AudioContext` 판정(설계서 3절 G7)으로 대체 |

### 3.6 v1.3 추가 규칙 — 범용 중계 `app` (계획서 A-2, 아소카 결정(마스터 위임 2026-10-27))

목적 : 자막·녹화/AI 기록 상태·설문/Q&A 새로고침처럼 **엔진이 내용을 알 필요 없는 화면 신호**를 기능마다 메시지를 늘리지 않고 1쌍으로 보낸다(D-9 메시지 수 증가 억제, 9절). 엔진은 `d` 를 해석·저장하지 않는다 — 내용의 정본은 화면 서버 DB, 엔진은 "지금 전원에게 알리기"만 한다.

| 항목 | 규칙 | 오류 |
|---|---|---|
| `app.send{topic, d}` | 검사 순서 고정(그 전에 프레임이 올바른 UTF-8 — 1절, 아니면 연결 종료) : ① `topic` 이 아래 주제표에 있다 ② `d` 직렬화가 **4096바이트 이하**(받은 JSON 그대로 센다, 생략하면 `null`) ③ 보낸 사람의 세션 역할이 그 주제에 허용된다 ④ 피어당 **초당 2건**(주제 합산, 1초 슬라이딩 창 — `chat.send` 와 같은 방식, 한도는 따로) → 통과하면 보낸 사람 외 전원에게 `ntf app{topic, d, from}`, 응답 `{}`. 앞 단계에서 거절된 요청은 한도를 쓰지 않는다(3.3 v1.1.1 ⑦ 과 같은 원칙) | ① `NOT_FOUND` ② `SDP_INVALID` ③ `ROLE_FORBIDDEN` ④ `RATE_LIMITED` |
| `ntf app{topic, d, from}` | 받는 사람 = 방 전원(보낸 본인 제외 — 본인은 성공 응답으로 확정). `from` = **엔진이 채운** 보낸 사람 `peerId`(보낸 쪽이 위조할 수 없다, 이름은 `peers` 로 찾는다). `d` 는 보낸 값 그대로(공백만 정리될 수 있음). **보관·재전송 없음** — 늦게 들어온 사람은 지난 신호를 받지 못한다 | — |
| 잠금 | `room.muteAll` 잠금(3.5 E)과 **무관** — 잠금 중에도 중계 | — |
| 받는 쪽 | 엔진이 `d` 모양을 검사하지 않으므로 **화면이 주제별로 `d` 를 검사해 맞지 않으면 버린다**. 글은 텍스트로만 표시(HTML 해석 금지). 모르는 `topic` 은 무시(9절). **`refresh` 는 받은 화면이 묶어서 다시 읽는다**(v1.3.1, R-P2·R-P5) — 주제·종류별 1~2초 디바운스, 진행 중인 조회가 있으면 그 결과를 재사용, 읽기 API 는 캐시 헤더(`s-maxage`) 병행. 수신 1건 = 서버 조회 1회로 구현하면 청중 1명의 초당 2건이 방의 나머지 N−1 화면 × 초당 2회 조회(31명 방 초당 60회)로 불어난다. `refresh` 의 `d` 는 다시 읽을 대상 표시용 작은 값만 쓰고 내용은 싣지 않는다. 엔진이 v1.3 이전이면 `app.send` 가 `NOT_FOUND`(없는 메서드) — 화면은 **허용된 주제로 보냈는데 `NOT_FOUND`** 이면 미지원으로 보고 자막·녹화·AI 회의록 항목을 숨긴다(설계서 15절) | — |
| 늦은 입장자 | `state` 처럼 "지금 상태"가 필요한 주제는 보낸 쪽 화면이 `ntf peerJoined` 를 받으면 **1초에 한 번 이하로 묶어** 현재 상태를 다시 보낸다(초당 2건 한도 안) — 엔진 보관(입장 응답에 실기)으로 바꿀지는 [확인중 : Agent10 — SubAgent6·7 화면 계약 확정 때] | — |

**주제표** — 코드 정본 `envelope.go` `AppTopics`. 주제를 늘릴 때는 이 표를 먼저 고친다.

| `topic` | 보낼 수 있는 역할 | 쓰임 | `d` 모양(화면 약속 — 엔진은 검사 안 함) |
|---|---|---|---|
| `caption` | presenter · panel | 말하는 사람 자기 브라우저가 음성 조각을 글로 바꾼 결과를 전원에게(계획서 A-1) | [확인중 : SubAgent3·8 화면 계약 확정 시 기재] |
| `state` | presenter | 녹화·AI 기록 시작/종료 → 전원 배지(마스터 결정 M-4) | [확인중 : SubAgent6·7 화면 계약 확정 시 기재] |
| `refresh` | 전원 | 설문·Q&A 등 화면 서버 데이터가 바뀜 → 받은 사람이 다시 읽기(투표한 청중도 보냄) | [확인중 : SubAgent4 화면 계약 확정 시 기재] |

근거(REA) : `docs/rea/evidence/REA_04/engine-01-app-relay-anchors.json` — REA 가 내보낸 meet.jit.si 배포본(내보내기 Evidence `ev_4be1f45f…`, lib-jitsi-meet sha256 `9eb5dc78…`·app.bundle `e94ef107…`, 재계산 일치)에서 ⓐ 얼굴 표식·반응·텍스트·자막이 **한 통로(EndpointMessage)를 판별 값으로 나눠 쓰고**(판별 키가 `type`·`name` 으로 섞임, relay[4~7]) ⓑ `from` 은 **브리지가 채우며**(relay[0]·[2]) ⓒ 중계 경로에 **크기·속도·역할 검사가 없어** 기능마다 받는 쪽이 보낸 사람을 따로 거른다(자막 = 숨은 전사기만, relay[3]·[8]·[9]). → 우리는 판별 키를 `topic` 하나로 고정하고, 권한(주제×역할)·크기·속도를 엔진 한 곳에서 검사한다(받는 쪽 필터 누락 = 위조 자막 위험 제거). 브리지의 본인 되돌림·서버 상한은 배포 클라이언트로 판단 불가라 근거로 쓰지 않았다. 코드는 옮기지 않았다(S-2 — 구현은 `chat.send` 본보기).

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
| `ROLE_FORBIDDEN` | audience 의 `transport.publish`·`produce`, v1.1·v1.2 권한 밖 요청(3.3 — `hand.set`·`hand.lowerAll`·`peer.setRole`·`room.end`, 3.5 — `peer.mute`·`room.muteAll`·`peer.askUnmute`·`room.setLayout`), 3.6 — 주제표의 역할 밖 `app.send`(v1.3) | 발행·관리 요청 | 유지 |
| `LOCKED` | 발표자 잠금 중 `producer.resume`·잠긴 종류 `produce`·`peer.askUnmute`(3.5 E, v1.2) | 발행 요청 | 유지 |
| `ROOM_CLOSED` | 방 종료(`end` 지남·관리자 종료·`room.end`)·닫힌 방에 요청 | 전부 · `ntf error` | 종료 |
| `DUPLICATE_SESSION` | 같은 방에 같은 `sub` 가 다시 입장 → **기존** 세션에 `ntf error` | `ntf error` | 기존 세션 종료 |
| `SDP_INVALID` | SDP 파싱·적용 실패, 대기 중 offer 없이 온 `transport.subscribe.answer`, **요청 `d` 해석 실패(모든 요청)**, `produce` 의 잘못된 `kind`, `app.send` 의 `d` 4096바이트 초과(3.6, v1.3) [TBD : 일반 `BAD_REQUEST` 코드 분리 여부] | `transport.*` · 전부 | 유지 |
| `NOT_FOUND` | 없는 메서드·producer·consumer, 남의 producer, 주제표에 없는 `app.send` `topic`(3.6, v1.3) | 전부 | 유지 |
| `RATE_LIMITED` | 요청 과다 [TBD : 한도 M5]. v1.1 `chat.send`·`reaction.send` 는 피어당 초당 2건(3.3 C), v1.3 `app.send` 는 피어당 초당 2건(주제 합산, 3.6) | 전부 | 유지 |
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
← {"t":"ntf","m":"consumerCreated","d":{"consumerId":"c_12","producerId":"p_7f3a","mid":"0","kind":"video","source":"camera","peer":"pe_1","paused":false}}
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
- 메시지 종류가 20개를 넘어 관리가 어려우면 JSON Schema 로 생성(D-9 되돌릴 조건). **현재(v1.3) 요청 23 · 알림 23(서버 `trickle` 포함) — 둘 다 20 초과로 되돌릴 조건에 닿았다.** v1.3 은 이후 기능 신호를 `app` 1쌍(3.6 주제표)으로 받아 메시지 수 증가를 멈춘다. v1.2 에서는 전환하지 않고 손으로 쓴 `envelope.go` 를 정본으로 유지(아소카 결정(마스터 위임 2026-10-26) — 밤사이 계약 형식 변경 위험 회피), JSON Schema 생성 전환 여부 [확인중 : 마스터]

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-25 | v1.0 확정 — PRD_02 5절 초안 확정, M3 동작(닫힘 연쇄·늦은 합류자·paused→resume·producer 일시정지) 반영 |
| 2026-10-26 | v1.0.1 문서를 코드에 맞춤(이름·필드 변경 없음) — 10초 시한 초과는 알림 없이 종료·첫 메시지 비join 응답, 서버 `trickle` 알림 추가, 알림 순서(consumerCreated → producerPaused → transport.subscribe), `paused` 항상 false, `produce` kind·source·rids 처리, setLayer 자르기·maxTemporal 무시, `SDP_INVALID` 실제 범위, M4 알림 3종 미송신 표기 |
| 2026-10-26 | **v1.1** — UI 설계서 13절 #1 결정(마스터 채택)으로 14.7 필수 A~D + `room.end` 추가. 요청 6(`chat.send`·`hand.set`·`hand.lowerAll`·`reaction.send`·`peer.setRole`·`room.end`)·알림 6(`peerJoined`·`peerLeft`·`chat`·`hand`·`reaction`·`roleChanged`), `join` 응답 `peers`, `ProducerInfo`·`consumerCreated` 에 `source`, 6절 `role` = 입장 시 초기값(세션 역할 정본, 13절 #9), 3.1 `trickle` `ntf` 허용(13절 #7). 기존 이름·필드 변경 없음, 신규 오류 코드 없음(`LOCKED` 는 후속 E 때) |
| 2026-10-26 | **v1.1.1** 구현 결정 문서화(이름·필드 변경 없음, 3.3) — ① 승격·강등 역할은 같은 `sub` 재입장 때 유지(방 단위 기억, presenter 승격 불가, 방이 닫히면 소멸) ② `room.end` 순서 = 요청자 성공 응답 → 나머지 전원 `ROOM_CLOSED` → 정리 ③ 관리 API `POST /admin/rooms` 로 다시 열면 종료 표시 해제 ④ `reaction.send` 한 요청 안 중복 이모지는 1개로 셈 ⑤ 서버가 강등된 사람의 발행 PC 를 닫음 ⑥ `peerJoined` 는 받는 사람보다 뒤에 들어온 사람만, `peerLeft` 는 모르는 `peerId` 가 섞일 수 있음(무시) ⑦ 값 검사가 속도 제한보다 먼저(잘못된 요청은 한도 미사용) |
| 2026-10-26 | v1.1.2 — `consumerCreated` 에 `peer`(발행자 peerId, `ProducerInfo.peer` 와 같은 값) 추가 : 입장 뒤 생긴 producer 의 주인을 화면이 알 수 있게(W3 검토 지적). 필드 추가 = 하위 호환 |
| 2026-10-27 | **v1.1.3** — `ntf score` 서버 송신 시작(3.4) : 받는 사람 = Consumer 주인, 5초 판정·등급 바뀔 때만, 처음 등급 excellent 기준, `lost` = RR 10초 끊김. `{producerId}` 형·`layersChanged`·`streamState` 는 계속 미송신, `publishLayers` 는 송신 중임을 표기. 이름·필드 변경 없음(`score` 행 `d` 를 실제 송신 형식 `{consumerId, score, grade}` 로 좁혀 적음). 아소카 결정(마스터 위임 2026-10-26) |
| 2026-10-27 | **v1.2** — 후속 E·F·G(3.5, 설계서 14.7) : 요청 4(`peer.mute`·`room.muteAll`·`peer.askUnmute`·`room.setLayout`)·알림 5(`mutedBy`·`roomPolicy`·`askUnmute`·`layout`·`activeSpeaker`)·오류 코드 `LOCKED`, `join` 응답 `policy`·`layout`(필드 추가 = 하위 호환), `producer.resume` 잠금 검사. 잠금 → 일시정지 → 알림 한 처리, 해제 = `muteAll{lock:false}`, `video` = 카메라만, 엔진 RFC 6464 오디오 레벨 판정(100ms·−50 dBov·300ms·6 dB·1.5초·방당 500ms). D-9 메시지 수 22·22 — JSON Schema 전환은 [확인중 : 마스터]. 기존 이름·필드 변경 없음. 아소카 결정(마스터 위임 2026-10-26) |
| 2026-10-27 | **v1.3** — 범용 중계(3.6, 계획서 A-2) : 요청 `app.send{topic, d}`·알림 `app{topic, d, from}` 1쌍. 주제표 `caption`=presenter·panel / `state`=presenter / `refresh`=전원(표 밖 `NOT_FOUND`, 역할 밖 `ROLE_FORBIDDEN`), `d` 4096바이트 이하(`SDP_INVALID`), 피어당 초당 2건 주제 합산(`RATE_LIMITED`), 검사 순서 주제→크기→역할→속도(거절은 한도 미사용), 받는 사람 = 보낸 본인 제외 전원, `from` = 엔진이 채운 peerId, 보관·재전송 없음, 잠금과 무관. 메시지 수 23·23. 신규 오류 코드·기존 이름·필드 변경 없음. 근거 REA_04 엔진편(`docs/rea/evidence/REA_04/engine-01-app-relay-anchors.json`). 아소카 결정(마스터 위임 2026-10-27) |
| 2026-10-27 | **v1.3.1** (검토 지적, 이름·필드·오류 코드 변경 없음) — ① 1절 형식 : 잘못된 UTF-8 텍스트 프레임은 응답·중계 없이 연결 종료(`session.read` 공통 관문, RFC 6455 8.1). `json.RawMessage` 인 `app.send` `d` 가 잘못된 바이트를 그대로 중계해 청중 1명이 방 전원을 1007 로 끊을 수 있던 결함 수정(`chat.send` 는 Go 문자열 디코드로 U+FFFD 치환돼 해당 없음). 시험 `TestInvalidUTF8Closes`·`TestV13AppRelay` 끝 단계 ② 3.6 받는 쪽 : `refresh` 는 받은 화면이 1~2초 묶어 다시 읽고 진행 중 조회를 재사용(엔진 변경 없음) |
