# SIGNAL_API — Galápagos 시그널링 프로토콜 (확정판 v1.0)

> 작성 2026-10-25 · M3 산출물 · 근거 `PRD_02_ENGINE_DESIGN.md` 5절(D-9 봉투·D-11 입장권), REA_02 5.1(수명주기 이벤트)·6.2(동사 경계)
> 코드 정본 : `media/internal/signal/envelope.go`(이름·필드·오류 코드), `session.go`(시간 상수), `ticket.go`(입장권). **이 문서와 코드가 다르면 코드를 고치기 전에 이 문서를 먼저 고친다**(이름·필드 변경은 M3 합의 필요).
> 표준 SDP 를 그대로 주고받는다 — 클라이언트 라이브러리가 필요 없다(D-9).

## 1. 연결

| 항목 | 값 |
|---|---|
| 주소 | `wss://<미디어 서버>/signal` (개발 `ws://localhost:7880/signal`, Next env `NEXT_PUBLIC_MEDIA_WS_URL`) |
| Origin | `MEDIA_ALLOWED_ORIGINS` 목록만 허용 |
| 세션 | WebSocket 연결 1개 = 세션 1개 = 참가자 1명 |
| 입장 시한 | 연결 후 **10초** 안에 `join` (넘으면 `ntf error TICKET_INVALID` 후 종료) |
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
| `join` | `{ticket}` | `{peerId, role, iceServers, producers}` | 전원 | M1 | 첫 메시지여야 함. `producers` = 방에 이미 있는 다른 참가자 producer 목록(늦은 합류자 상태) |
| `transport.publish` | `{sdp}` (offer) | `{sdp}` (answer) | presenter·panel | M1 | 발행 PC 협상. 클라이언트 offer 고정(D-2 glare 없음) |
| `produce` | `{mid, kind, source, rids?}` | `{producerId}` | presenter·panel | M1 | 역할 검사 2회(signal·방). `kind` `audio`\|`video`, `source` `camera`\|`screen`\|`mic`, `rids` simulcast `["l","m","h"]` |
| `transport.subscribe.answer` | `{sdp}` (answer) | `{}` | 전원 | M1 | `ntf transport.subscribe` 에 대한 답 |
| `trickle` | `{pc, candidate}` | `{}` | 전원 | M1 | `pc` `pub`\|`sub`. 원격 SDP 전 도착분은 서버가 보관 |
| `consumer.resume` | `{consumerId}` | `{}` | 전원 | M3 | 수신 준비 끝 신호 → 서버가 **즉시 키프레임 요청**. producer 가 일시정지면 producer 재개 때 함께 재개 |
| `consumer.setLayer` | `{consumerId, maxSpatial, maxTemporal?}` | `{}` | 전원 | M3 정의·M4 사용 | 화면 크기 기반 **상한**만(0=l·1=m·2=h). 실제 레이어는 서버가 정함. 100ms 디바운스 |
| `producer.pause` | `{producerId}` | `{}` | 소유자 | M3 | 마이크·카메라 끄기. 연결 Consumer 전부 일시정지 + 다른 참가자에게 `ntf producerPaused` |
| `producer.resume` | `{producerId}` | `{}` | 소유자 | M3 | 연결 Consumer 재개(키프레임 요청) + `ntf producerResumed` |
| `producer.close` | `{producerId}` | `{}` | 소유자 | M3 | 닫힘 연쇄(4절) + `ntf producerClosed` |
| `ping` | `{}` | `{}` | 전원 | M1 | 양방향. 서버가 보낸 `ping` 에도 클라이언트는 `res` 로 답한다 |
| `leave` | `{}` | `{}` | 전원 | M1 | 참가자 닫힘 연쇄(4절) 후 서버가 연결 종료 |

> `pong` 이름(`MPong`)은 코드에 예약돼 있으나 응답 봉투(`res`)로 대신한다 — 클라이언트는 보내지 않아도 된다.
> 소유자가 아닌 producer 에 대한 `producer.*` 요청과 없는 `consumerId` 는 `NOT_FOUND`(존재 여부를 숨기려고 `ROLE_FORBIDDEN` 이 아님).

### 3.2 알림 (S→C)

| 알림 | `d` | 단계 | 받는 사람 · 시점 |
|---|---|---|---|
| `transport.subscribe` | `{sdp}` (서버 offer) | M1 | 구독 PC 재협상 필요 시. 트랙이 연달아 바뀌면 **200ms 묶음** 1회 |
| `consumerCreated` | `{consumerId, producerId, mid, kind, paused}` | M1(paused M3) | 새 producer 가 생기면 기존 참가자 전원, 입장 시 기존 producer 마다. 서버가 자동 생성(왕복 절감) |
| `producerClosed` | `{producerId}` | M3 | 소유자를 뺀 전원. 이 알림이 갈 때 연결 Consumer 는 **이미 닫혀 있다** → 클라이언트는 해당 트랙을 지운다 |
| `producerPaused` | `{producerId}` | M3 | 소유자를 뺀 전원. 일시정지 중 늦게 들어온 참가자는 `consumerCreated` 직후 받는다 |
| `producerResumed` | `{producerId}` | M3 | 소유자를 뺀 전원 |
| `layersChanged` | `{consumerId, spatial, temporal}` | M4 | 그 Consumer 의 주인. 서버 레이어 전환 결과 |
| `streamState` | `{consumerId, state}` | M4 | `active`\|`paused` — 할당기 일시정지(기본 꺼짐이라 드묾) |
| `publishLayers` | `{producerId, rids}` | M4 | 발행자. dynacast — 예 `{"l":true,"m":true,"h":false}`, 하향 5초 디바운스 |
| `score` | `{consumerId}`\|`{producerId}` + `{score, grade}` | M4 | 5초 주기 품질 점수(LiveKit 식, REA_03 5.10) |
| `error` | `{code, msg}` | M1 | 치명 오류 후 서버가 연결 종료할 수 있음 |

## 4. 수명주기 (서버 동작 — 클라이언트가 기대할 순서)

```
청중                        서버                                   발표자
 │── join{ticket} ───────▶│ 입장권 검증(4절 오류) · 정원·역할·중복 검사
 │◀─ res{peerId,…,producers:[pa]}
 │◀─ ntf transport.subscribe{sdp} (200ms 묶음)
 │◀─ ntf consumerCreated{ca, pa, paused:true}
 │◀─ ntf producerPaused{pa}   ← pa 가 일시정지 중일 때만(늦은 합류자 상태)
 │── transport.subscribe.answer{sdp} ─▶
 │── consumer.resume{ca} ──▶│ 즉시 키프레임 요청 → 첫 화면
 │                          │◀── producer.close{pa} ───────────────│
 │                          │ ① pa 닫기 ② ca 등 연결 Consumer 전부 닫기 ③ 표 정리
 │◀─ ntf producerClosed{pa} │ ④ 알림(소유자 제외)
```

- **닫힘 연쇄** (REA_02 5.1) : 참가자 닫힘(`leave`·연결 끊김·45초 무수신·`DUPLICATE_SESSION`) → ① 그 참가자의 producer 각각 닫힘 연쇄 ② 그 참가자의 consumer 를 레이어에서 떼고 닫기 ③ 발행·구독 PC 와 할당기 닫기 ④ 방 표에서 제거.
  producer 닫힘 → ① 방 표에서 빼 새 구독 차단 ② producer 수신 중단 ③ 연결 consumer 전부 닫고 각 참가자 표에서 제거 ④ `producerClosed`.
- **consume paused → resume** : 서버가 만든 consumer 는 `paused:true` 로 시작할 수 있다. 클라이언트는 트랙을 붙이고 `consumer.resume` 을 보낸다. 재개된 영상은 첫 키프레임부터 출력되며 RTP 순번은 끊김 없이 이어진다(서버 SeqRewriter, REA_02 5.6).
- **producer 일시정지 중 consumer.resume** : 응답은 성공, 실제 재개는 `producer.resume` 때.

## 5. 오류 코드

| 코드 | 의미 | 주로 나오는 곳 | 연결 |
|---|---|---|---|
| `TICKET_INVALID` | 서명·`aud`·형식·`jti` 재사용 실패, 10초 안에 join 없음 | `join` | 종료 |
| `TICKET_EXPIRED` | `exp` 지남(오차 5초) | `join` | 종료 |
| `ROOM_FULL` | 정원(`cap`) 초과 | `join` | 종료 |
| `ROLE_FORBIDDEN` | audience 의 `transport.publish`·`produce` | 발행 요청 | 유지 |
| `ROOM_CLOSED` | 방 종료(`end` 지남·관리자 종료)·닫힌 방에 요청 | 전부 · `ntf error` | 종료 |
| `DUPLICATE_SESSION` | 같은 방에 같은 `sub` 가 다시 입장 → **기존** 세션에 `ntf error` | `ntf error` | 기존 세션 종료 |
| `SDP_INVALID` | SDP 파싱·적용 실패 | `transport.*` | 유지 |
| `NOT_FOUND` | 없는 메서드·producer·consumer, 남의 producer | 전부 | 유지 |
| `RATE_LIMITED` | 요청 과다 [TBD : 한도 M5] | 전부 | 유지 |
| `INTERNAL` | 서버 내부 오류 | 전부 | 유지 |

- 입장권 실패는 **200ms 지연 후** 응답한다(추측 공격 완화, REA_01 5.11).

## 6. 입장권 클레임 요약 (D-11, C-8 승인 대기)

JWT 압축 직렬화, **HS256 고정**(헤더 `alg` 불신), 키 `MEDIA_TOKEN_SECRET`(32자 이상), 발급은 화면 서버 `/api/media/ticket`(로그인·결제 확인 후).

| 클레임 | 형식 | 검증 |
|---|---|---|
| `aud` | `"seminar-media"` | 다르면 거부 |
| `room` · `sub` · `name` | 문자열 | 방 ID · 사용자 UUID(중복 입장 판정) · 표시명(전달만) |
| `role` | `presenter`\|`panel`\|`audience` | 발행 권한 |
| `cap` | 정수 | 방 정원(첫 입장 때 고정, 목표 31) |
| `iat` · `exp` | 초 | 수명 60초, 오차 5초, `exp` 필수 |
| `jti` | 128비트 무작위 | `exp` 까지 재사용 거부(메모리) |
| `end` | 초(선택) | 지나면 `ROOM_CLOSED` |

## 7. 예시 — 발표자 발행

```jsonc
→ {"t":"req","id":1,"m":"join","d":{"ticket":"eyJhbGciOiJIUzI1NiJ9...."}}
← {"t":"res","id":1,"ok":true,"d":{"peerId":"pr_1","role":"presenter","iceServers":[{"urls":["stun:stun.l.google.com:19302"]}],"producers":[]}}
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
← {"t":"res","id":1,"ok":true,"d":{"peerId":"au_9","role":"audience","iceServers":[],"producers":[{"id":"p_7f3a","kind":"video","peer":"pr_1"}]}}
← {"t":"ntf","m":"transport.subscribe","d":{"sdp":"v=0\r\n..."}}
← {"t":"ntf","m":"consumerCreated","d":{"consumerId":"c_12","producerId":"p_7f3a","mid":"0","kind":"video","paused":true}}
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
- 메시지 종류가 20개를 넘어 관리가 어려우면 JSON Schema 로 생성(D-9 되돌릴 조건). 현재 요청 12 · 알림 10.

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-25 | v1.0 확정 — PRD_02 5절 초안 확정, M3 동작(닫힘 연쇄·늦은 합류자·paused→resume·producer 일시정지) 반영 |
