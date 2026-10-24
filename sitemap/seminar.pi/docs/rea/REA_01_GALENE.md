# REA_01: Galène 분석 — 첫 구현 교본(M1·M2)

> 작성 2026-10-25 · 대상 Galène 커밋 `e2bc84f26d4f5f92a6deb9cd6cfc27acae2cacc4`(2026-10-23, CHANGES 기준 1.2.1 이후) · 상위 [PRD_01](../PRD_01_MEDIA_ENGINE.md) K-3 · 근거 [DECISION_02](../DECISION_02_REA_TARGET.md)
> 분석 방법 : 로컬 사본 소스 정독(S-2 합법 범위). REA MCP는 이번 세션 연결 실패 → 실행 관찰(패킷·webrtc-internals)은 하지 않았다. 실행 근거가 필요한 항목은 [확인중 : M1 실측]으로 표시.
> 인용 규칙 : 원본 코드 블록은 옮기지 않는다(S-2). 근거는 `경로:줄` 또는 `경로 함수명`으로만 적는다. 경로는 Galène 저장소 루트 기준.
> **설계 결정 정본은 [PRD_02](../PRD_02_ENGINE_DESIGN.md)이다. 이 문서 6절은 분석 시점의 제안이며, PRD_02와 다르면 PRD_02를 따른다.**

---

## 1. 개요

| 항목 | 내용 | 근거 |
|---|---|---|
| 라이선스 | MIT (Copyright 2020 Juliusz Chroboczek) | `LICENCE:1-3` |
| 커밋·버전 | `e2bc84f`, 최근 릴리스 1.2.1(2026-09-08) | `CHANGES:1` |
| 언어 | Go 1.24, 브라우저 클라이언트 JavaScript | `go.mod:3`, `static/galene.js`(4,114줄)·`static/protocol.js`(2,311줄) |
| 핵심 의존 | pion/webrtc v4.2.20, pion/rtp·rtcp·sdp·ice·turn, gorilla/websocket, golang-jwt v5 | `go.mod:5-20` |
| 규모 | Go(테스트 제외) 14,361줄. 이 중 **미디어 경로 핵심**(conn·rtpconn 3파일·packetcache·packetmap·estimator·jitter·rtptime·codecs·unbounded) **3,108줄**(11개 파일 실측). 나머지는 webclient(시그널링 2,259)·group·webserver·galenectl(관리 CLI)·diskwriter(녹화) | `wc -l` 실측 |
| 형태 | 단일 바이너리 SFU + 내장 TURN + 웹 클라이언트 + 녹화(WebM) | `galene.go`, `turnserver/turnserver.go`, `diskwriter/diskwriter.go` |

**한 줄 요약** : 우리와 같은 Go + pion 스택에서, **pion 인터셉터를 하나도 쓰지 않고** NACK·PLI·RTCP 보고·속도 제어를 직접 작성한 소형 SFU다. S-1 원칙과 구조가 정확히 일치하는 유일한 참고모델이다.

---

## 2. 핵심가치 (Galène이 잘하는 것)

1. **S-1과 같은 설계 선택 — 빈 인터셉터 레지스트리.** pion API를 만들 때 인터셉터 레지스트리를 비워 넘긴다(`group/group.go:412-418` `APIFromCodecs`). NACK 생성·응답, 수신 보고(RR), 송신 보고(SR), REMB, 키프레임 요청을 전부 자체 코드로 처리한다. "pion은 ICE·DTLS·SRTP·직렬화만" 이라는 우리 원칙이 실제로 동작하는 증거다.
2. **패킷 한 개의 경로가 짧고 읽힌다.** 수신 루프 1개(`rtpconn/rtpreader.go readLoop`) → 패킷 캐시 저장 → 작성자(writer) 고루틴 → 구독 트랙 `Write`. 함수 4~5개만 따라가면 SFU 전체 흐름이 보인다.
3. **캐시 중심 설계.** 들어온 패킷은 먼저 링 버퍼 캐시에 넣고, 이후 전달·재전송·신규 구독자 즉시 화면(마지막 키프레임부터 재생)이 모두 이 캐시를 재사용한다(`packetcache/packetcache.go`, `rtpconn/rtpwriter.go:258-273`). 캐시 저장 때 복사 1회, 작성자(writer)가 꺼낼 때 작성자마다 복사 1회(`GetAt`)로 여러 기능을 해결한다.
4. **혼잡 시 "프레임 단위로 버린다".** 구독자 쪽 큐가 차면 영상은 프레임 끝(marker)까지 버리고, 음성은 짧게 기다렸다 재시도한다(`rtpconn/rtpwriter.go:107-160`). 느린 작성자가 발표자 수신 루프를 막지 않는다. 단 버림(`drop`)은 작성자 단위라 같은 작성자를 공유하는 구독 트랙(최대 4개, 16 초과 시 √n개)도 함께 버려진다 — 청중 1명 단위 격리는 아니다.
5. **NACK·PLI 조절이 단순하고 보수적이다.** NACK는 20ms 또는 2패킷 지연 기준, PLI는 0.5초에 1회, 하류 NACK는 50ms 모아서 상류로 보낸다. 상한·지연값이 모두 상수로 드러나 있어 우리 값의 출발점으로 쓰기 좋다.
6. **강의형 권한 모델과 토큰 입장.** `op`·`present`·`message`·`observe` 권한 묶음(`group/description.go:30-34`)으로 발표자/청중을 나누고, 발행(offer)은 `present` 권한이 있어야만 받는다(`rtpconn/webclient.go:1481-1499`). 입장은 짧은 수명 JWT(`token/jwt.go`)로 할 수 있어 우리 HMAC 입장권 구조와 같다.

---

## 3. 기능 목록 (우리에게 필요한 것 위주)

| 기능 | Galène 구현 | 위치 | 우리 단계 | 채택 |
|---|---|---|---|---|
| WebSocket 시그널링(JSON, 대칭·비동기) | handshake→join→request→offer/answer/ice→close | `galene-protocol.md:53-303`, `rtpconn/webclient.go handleClientMessage` | M1 | 구조 참고(메시지 이름은 우리 것) |
| 스트림당 PeerConnection 1개, 단방향 | 발행 = 클라이언트가 offer, 구독 = **서버가 offer** | `galene-protocol.md:17-27`, `webclient.go negotiate:540-575`, `gotOffer:589-628` | M1 | 채택(M3에서 재검토) |
| 발행 권한 검사 | offer 수신 시 `present` 없으면 abort | `webclient.go:1481-1499` | M1 | 채택 |
| 권한 회수 시 발행 종료 | `present` 제거되면 업 연결 강제 종료 | `webclient.go:1261-1274` | M5 | 채택 |
| 트랙 전달(팬아웃) | readLoop + writer pool | `rtpreader.go:16-150`, `rtpwriter.go` | M1 | 채택(단순화) |
| 신규 구독자 빠른 첫 화면 | 마지막 키프레임이 40패킷 이내면 캐시에서 재생, 아니면 PLI | `rtpwriter.go:258-273` | M2 | 채택 |
| 패킷 캐시(링 버퍼) | 고정 1504바이트 슬롯, 인덱스 조회 | `packetcache/packetcache.go:13-204,259-273` | M2 | 채택 |
| 캐시 크기 자동 조정 | (RTT+4×지터)×속도×4, 영상 128~1024 | `rtpconn.go:1247-1283`, `packetcache.go:321-340` | M2 | 채택(M2는 고정값) |
| 상류 NACK(발표자에게 요청) | 손실 비트맵 → NACK | `rtpreader.go:96-126`, `packetcache.go:31-153` | M2 | 채택 |
| 하류 NACK(청중 요청에 재전송) | 캐시 조회 → 재전송, 없으면 50ms 모아 상류 NACK | `rtpconn.go:766-810`, `rtpwriter.go:316-368` | M2 | 채택 |
| PLI/FIR 조절 | 하류 PLI·FIR → 키프레임 요청 1개로 합침, 0.5초 상한 | `rtpconn.go:1173-1192`, `rtpreader.go:136-148` | M2 | 채택 |
| 키프레임 판별 | VP8·VP9·AV1·H.264 페이로드 해석 | `codecs/codecs.go Keyframe:17` | M1(VP8만) | 채택 |
| RR 송신(상류) | 1초마다 손실률·지터·LSR/DLSR | `rtpconn.go:932-1031` | M2 | 채택 |
| SR 송신(하류) + 립싱크 | 0.5초마다 발표자 NTP/RTP 시각 환산 | `rtpconn.go:1033-1111` | M2 | 채택 |
| RTT 측정 | 하류 RR의 LSR/DLSR | `rtpconn.go:1220-1245` | M2 | 채택 |
| 하류 속도 추정(손실 기반) | 손실<약 2%(5/256)이고 실제 속도가 상한의 3/4 이상이면 ×1.05(269/256), 손실>약 10%(25/256)면 ×(1−손실/2) | `rtpconn.go:1113-1147` | M4 참고 | 출발점만 |
| REMB 상류 전달 | 하류 최대치 집계 → 발표자에게 REMB | `rtpconn.go:891-930,984-1016` | M4 참고 | 출발점만 |
| simulcast | 2레이어(고·저 ~100kbps), 선택은 **클라이언트가 화면 크기로 결정**해 재요청 | `galene-protocol.md:233-239`, `webclient.go requestedTracks:758-816`, `static/galene.js reconsiderDownRate:1528-1568` | M4 | **부분 채택**(아래 5.8) |
| SVC 레이어(sid/tid) 전환 | VP9·AV1 계층 버림 + 순번 다시 매기기 | `rtpconn.go:225-308,335-367`, `packetmap/packetmap.go` | — | 1차 미채택 |
| 순번·picture id 재매핑 | 버린 패킷만큼 순번 압축, 역매핑으로 NACK 처리 | `packetmap/packetmap.go:28-62,146,185-210` | M4 | 채택(레이어 전환용) |
| 토큰 입장(JWT) | aud=그룹 URL, sub, permissions, exp 필수 | `token/jwt.go:159-258`, `group/group.go:1019-1066` | M1(개발용)·M5 | 개념 채택(형식은 우리 HMAC) |
| 방 입장 제한 | 잠금·시작/종료 시각·최대 인원 | `group/group.go:605-700` | M5 | 채택 |
| 연결 생존 확인 | 20초 무응답 시 ping, 45초면 끊음 | `webclient.go:963-1034` | M1 | 채택 |
| UDP 단일 포트(mux) | 모든 PC를 포트 1개로 | `group/group.go:373-377,401-405` | M1 | 채택(VM 방화벽 단순화) |
| 녹화 | 녹화기 = 또 하나의 구독 클라이언트 | `diskwriter/diskwriter.go:38-171` | M5 | 구조 채택 |
| 내장 TURN | pion/turn 서버 동봉 | `turnserver/turnserver.go` | — | 미채택(cafe.pi 방식) |
| 채팅·파일 전송·자막 | WebSocket 메시지 | `galene-protocol.md:306-540` | — | 범위 밖 |

---

## 4. 구조·데이터 흐름

### 4.1 모듈 구성

```
webserver/        HTTP·WebSocket 진입(wsHandler) ───────────┐
                                                            ▼
rtpconn/webclient.go   클라이언트 1명 = webClient (시그널링 상태기계, actions 큐)
   │  join → group.AddClient (권한·잠금·인원)
   │  offer  → 업 연결 rtpUpConnection  (발표자 → 서버, PC 1개/스트림)
   │  push   → 다운 연결 rtpDownConnection (서버 → 청중, PC 1개/스트림)
   ▼
group/            방(Group) = 클라이언트 맵 + 설명(Description) + 권한
conn/             인터페이스 4개 : Up · UpTrack · Down · DownTrack   ← 녹화기도 이 인터페이스로 붙음
rtpconn/rtpconn.go    rtpUpTrack(수신 트랙) · rtpDownTrack(송신 트랙) · RTCP 송수신 루프
rtpconn/rtpreader.go  readLoop : 수신 → 캐시 → NACK 판단 → 작성자에게 전달 → PLI
rtpconn/rtpwriter.go  rtpWriterPool·rtpWriter : 팬아웃 고루틴, 혼잡 시 버림, nackWriter
packetcache/      링 버퍼 + 손실 비트맵 + 수신 통계 + 마지막 키프레임
packetmap/        순번·picture id 재매핑(버린 패킷 보정)
codecs/           키프레임 판별·패킷 플래그·패킷 재작성
estimator/ jitter/ rtptime/   속도(바이트/초)·지터·시간 단위(jiffies)
token/ ice/ turnserver/ diskwriter/
```

### 4.2 패킷 한 개가 들어와서 나갈 때까지

1. **수신** — 발표자 업 연결의 `OnTrack`에서 트랙마다 캐시(영상 128, 음성 24슬롯)·속도 추정기·지터 추정기를 만들고 `readLoop`와 `rtcpUpListener` 고루틴을 띄운다(`rtpconn.go:667-690`).
2. **읽기·해석** — `readLoop`가 pion `TrackRemote.Read`로 복호화된 RTP 바이트를 받고(`rtpreader.go:58`) 속도·지터를 누적, 키프레임 여부를 판별한다(`:65-78`).
3. **헤더 확장 제거** — 확장 헤더(mid·rid·abs-send-time 등)를 지우고 다시 직렬화한다(`:79-87`). 하류는 확장 없이 나간다 → TWCC를 쓰지 않는 설계와 일관.
4. **캐시 저장** — `cache.Store`가 순번·타임스탬프·키프레임·marker와 함께 슬롯에 복사하고 손실 비트맵을 갱신, 저장 인덱스를 돌려준다(`:89-92`, `packetcache.go:157-204`).
5. **상류 NACK 판단** — 비트맵 시작 순번과 현재 순번 차이가 "20ms어치 패킷(최소 2, 최대 24)"을 넘으면 최근 4패킷을 뺀 구간의 구멍을 NACK로 보낸다(`rtpreader.go:96-126`). 보낸 개수만큼 기대 패킷 수를 늘려 손실률 계산을 보정(`rtpconn.go:714-726`).
6. **팬아웃** — `writers.write(순번, 인덱스, …)`로 각 작성자 채널에 (순번, 인덱스)만 넣는다(`rtpreader.go:133`, `rtpwriter.go:107-160`). 데이터 복사는 아직 없다.
7. **작성자 루프** — 작성자 고루틴이 `cache.GetAt(순번, 인덱스)`로 꺼내(슬롯이 덮였으면 건너뜀) 담당 구독 트랙들에 `Write`(`rtpwriter.go:294-310`). 작성자 1개는 구독 트랙 4개(구독 16 초과 시 √n개)를 맡는다(`:44-84`).
8. **구독 트랙 송신** — `rtpDownTrack.Write`가 코덱 플래그를 읽어 레이어 판단, 필요 시 순번 재매핑·패킷 재작성 후 pion `TrackLocalStaticRTP.Write`로 SRTP 송신(`rtpconn.go:225-316`).
9. **PLI 처리** — 키프레임이 필요하다고 표시돼 있으면 0.5초 간격으로 발표자에게 PLI(`rtpreader.go:136-148`).
10. **피드백(별도 고루틴)** — 청중 RTCP는 `rtcpDownListener`가 읽어 NACK→재전송, PLI/FIR→키프레임 요청, RR→RTT·손실·속도, REMB→상한 갱신(`rtpconn.go:1149-1218`). 서버는 1초마다 발표자에게 RR+REMB(`:1020-1031`), 0.5초마다 청중에게 SR(`:1100-1111`).

---

## 5. 핵심 메커니즘 상세

### 5.1 pion 사용 범위(S-1 대조)
- `APIFromCodecs`: SettingEngine(SRTP 재전송 보호 창 512, active TCP 끔, mDNS 끔, UDP mux/포트 범위) + MediaEngine(코덱 등록, simulcast 확장 헤더) + **빈 interceptor.Registry**(`group/group.go:379-419`).
- SRTP 재전송 보호 창을 512로 넓힌 이유 : NACK 재전송을 **같은 SSRC로 다시 보내므로**(RTX 미사용, Go 소스(테스트 제외)에 `rtx` 없음 — `sdpfrag/sdpfrag_test.go`의 시험용 SDP에만 등장) 오래된 순번이 재전송 공격으로 오인되지 않게 하기 위함으로 보인다 [확인중 : M2 실측 — 창 크기에 따른 재전송 거부 여부].
- 업 연결은 SDP를 파싱해 미디어 섹션 수만큼 recvonly 트랜시버를 미리 추가한다(`rtpconn.go:652-663`).
- 다운 트랙 코덱의 RTCP 피드백을 서버가 이해하는 것으로 교체한다 — **영상만** `goog-remb`·`nack`·`nack pli`·`ccm fir`이고 **음성은 피드백 없음**(`AudioRTCPFeedback` = nil, `webclient.go:384-390`, `group/group.go:268-278`). 즉 하류 음성은 NACK 재전송 대상이 아니다. 페이로드 타입은 고정한다(`webclient.go:408-426`).

### 5.2 패킷 캐시
- 슬롯 = 순번 + 길이·marker(1비트+15비트) + 타임스탬프 + 1504바이트 배열(`packetcache.go:13-29`). 할당은 생성 시 1회, 이후 덮어쓰기만 → GC 부담 없음.
- `Store`는 tail 위치에 복사하고 tail을 한 칸 전진, 인덱스를 반환(`:192-203`). `GetAt`은 인덱스로 O(1) 조회 후 순번이 맞는지 검증(`:259-273`), `Get`은 순번으로 선형 탐색(`:217-247`, 재전송 경로용).
- 같은 캐시가 수신 통계(expected/received/cycle, `:161-184`, `GetStats:351-370`)와 마지막 키프레임 위치(`:187-190`, `Keyframe:276-284`)도 들고 있다 → RR 작성과 신규 구독자 재생이 같은 자료를 쓴다.
- 크기 조정 : 1초마다 `updateUpTrack`이 구독자들 중 최대 RTO(RTT+4×지터)를 구하고 "RTO 동안 들어올 패킷 × 4"로 목표 크기를 잡아 128(영상 최소)~1024 사이로 자른다(`rtpconn.go:1254-1283`). `ResizeCond`는 현재 크기가 목표의 3/4~2배면 바꾸지 않고, 줄일 때 최근 인덱스가 무효화되면 포기(`packetcache.go:321-340`).

### 5.3 손실 비트맵과 상류 NACK
- 비트맵 = 시작 순번 + 32비트(`packetcache.go:31-36`). 받은 순번 비트를 세우고, 앞쪽이 연속으로 채워지면 시작점을 전진(`set:93-118`). 너무 오래된 순번(256 초과)은 비트맵 초기화(`seqnoInvalid:80-90`).
- `BitmapGet(next)`은 최대 17비트를 꺼내 "첫 구멍 순번 + 이후 16비트 마스크" = RTCP NACK 한 쌍(PID+BLP) 모양 그대로 돌려준다(`:123-153`). 즉 비트맵 설계가 NACK 패킷 형식에 맞춰져 있다.
- 지연 기준 : 패킷 속도/50(=20ms) 개, 2~24로 제한. 근거로 "TCP의 중복 ACK 2개"를 든다(`rtpreader.go:100-109`). 최근 4패킷은 순서 뒤바뀜일 수 있어 NACK에서 뺀다(`:110-115`).

### 5.4 하류 NACK(청중 → 서버 재전송)
- 청중 NACK의 각 순번을 `packetmap.Reverse`로 원래 순번으로 되돌리고 상류 트랙 `GetPacket`으로 캐시 조회, 있으면 그 청중에게만 `Write`(`rtpconn.go:766-786`).
- 캐시에 없으면 `bufferedNACKs`에 모으고, 비어 있다가 처음 채워질 때만 `nackWriter` 고루틴 1개를 띄운다(`:788-810`).
- `nackWriter`는 50ms 기다린 뒤(그 사이 readLoop 자체 NACK로 복구될 기회), 마지막 키프레임 이전 순번은 버리고(키프레임 이전은 복구해도 쓸모 없음), 이미 도착한 것은 빼고, 정렬해 상류 NACK로 묶어 보낸다(`rtpwriter.go:316-368`). NACK 쌍은 최대 240개(`rtpconn.go:741-744`).

### 5.5 PLI/FIR 조절
- 청중 PLI → `remote.RequestKeyframe()`, FIR은 같은 FIR 순번이면 무시(`rtpconn.go:1173-1192`). 단 `lastFirSeqno`를 갱신하지 않아 중복 제거가 사실상 첫 값(0)과만 비교된다 — 우리 코드에서는 갱신할 것.
- `RequestKeyframe`은 바로 PLI를 보내지 않고 readLoop 액션 큐에 "키프레임 필요"만 넣는다(`:457-460`). readLoop는 키프레임이 실제로 도착하면 플래그를 내리고(`rtpreader.go:75-78`), 아직이면 **0.5초에 1회**만 PLI를 보낸다(`:136-148`). 청중 30명이 동시에 PLI를 보내도 발표자에게는 0.5초에 1번.
- 신규 구독자 : 마지막 키프레임부터 현재까지가 40패킷 미만이면 캐시에서 순서대로 바로 보내고(`rtpwriter.go:209-224,258-269`), 아니면 PLI. 첫 화면 시간(4절 지표)에 직접 영향.

### 5.6 혼잡 시 버림(writer)
- 작성자 채널 용량 32(`rtpwriter.go:185`). 넣을 수 없으면 영상은 `drop=7`로 프레임 끝까지(최대 7패킷) 버리고, 음성은 `delay/(2×작성자 수)`만큼 타이머로 재시도(`:123-151`). 죽은 작성자는 정리(`:154-159`).
- 버린 영상은 청중 쪽에서 손실로 보이고 NACK로 다시 요청된다 → 캐시가 버퍼 역할을 한다.

### 5.7 RTCP 보고·RTT·속도
- 상류 RR : 손실률(구간 expected−received), 누적 손실, 확장 최고 순번, 지터, LSR·DLSR(`rtpconn.go:944-982`).
- 상류 REMB : 음성 100kbps, 저레이어(`rid=l`) `LowBitrate`, 나머지는 `maxUpBitrate`(하류 상한 중 최소×2^tid 와 최대 중 작은 값), 합계 최대 `MaxBitrate`(`:984-1016`, `group/group.go:98-102`).
- 하류 SR : 발표자 SR의 NTP/RTP 쌍을 현재 시각으로 외삽해 우리 SSRC로 다시 보낸다 → 음성·영상 립싱크 유지(`rtpconn.go:1033-1098`). 첫 SR을 받으면 즉시 하류에 SR 전파(`:865-878`).
- RTT : 우리가 보낸 SR의 NTP 중간 32비트와 RR의 LSR 비교, DLSR 빼서 계산, 3:1 지수평균(`:1220-1245`).
- 하류 속도 상한 : 손실 기반(위 3절 표) + 청중 REMB 중 작은 값(`GetMaxBitrate:318-330`). 30초(`receiverReportTimeout`) 보고가 없으면 손실 기반 값은 무효 처리돼 **기본 512 kbit/s**로, REMB 값은 무시된다(`:29-45,59,318-330`). `updateRate`도 최근 피드백이 없으면 512,000으로 초기화(`:1113-1147`).

### 5.8 simulcast
- 발행자는 rid 기반 2레이어(첫째 고화질, 둘째 ~100kbps)로 보낸다. 3개 이상이면 처음·마지막만 쓴다(`galene-protocol.md:233-239`, `static/galene.js:1029,1108-1121`).
- 서버는 레이어마다 별도 `rtpUpTrack`을 만든다(`Label()`=rid, `rtpconn.go:484-486`). 구독자가 `video`를 요청하면 첫 영상 트랙, `video-low`면 마지막 영상 트랙을 붙인다(`webclient.go:758-816`).
- **전환은 서버 자동이 아니다.** 웹 클라이언트가 영상 요소 면적(가로×세로)이 320×240 이하이면(사용자가 `force`로 고정 가능) `video-low`로 `requestStream`을 보내고(`static/galene.js:1528-1568`), 서버는 다운 트랙을 교체하고 재협상한다(`webclient.go:1471-1480,736-744`, `pushDownConn:1036-1098`, `replaceTracks:465-538`). 즉 SSRC가 바뀌고 offer/answer가 한 번 더 돈다.
- 서버 자동 조정(`adjustLayer`)은 **한 트랙 안의 SVC 레이어(sid/tid)** 에만 적용된다(`rtpconn.go:335-367`). VP8 simulcast + 대역폭 기반 자동 전환(PRD consumer의 "레이어 전환 때 SSRC·순번·타임스탬프 다시 매기기")은 Galène에 없다 → **M4는 LiveKit 분석으로 채운다.**

### 5.9 시그널링 프로토콜
- JSON 메시지, 공통 필드 `type·kind·id·source·dest·value·error`(`galene-protocol.md:59-82`). 요청/응답 짝이 없는 대칭·비동기 방식(`:53-57`).
- 연결 : 15초 안에 handshake 필수, 버전 협상(`webclient.go:823-894`), 메시지 최대 1MB(`:833`). 생존 : 10초 주기 점검에서 20초 무수신이면 ping, 45초면 종료(`:969-972,1018-1031`) — 실제 판정은 최대 10초 늦을 수 있다.
- 순서 : `handshake` → `join`(token) → `joined`(permissions, rtcConfiguration=ICE 서버) → `request`(라벨별 원하는 트랙) → 서버 `offer` → 클라이언트 `answer` → 양방향 `ice` → `close`/`abort`(`galene-protocol.md:84-303`).
- answer 전에 온 ICE 후보는 보관했다가 원격 SDP 설정 후 비운다(`rtpconn.go:369-396,587-599`).
- 다운 트랙을 상류에 실제로 연결(`AddLocal`)하는 시점은 **PC가 connected 된 뒤**(`webclient.go:651-666`) → 연결 전 패킷 낭비·큐 적체 방지.
- 업 트랙이 여러 개 연달아 생길 때 하류 푸시를 200ms 묶어 한 번만 재협상(`rtpconn.go:619-634`).

### 5.10 강의형 방·권한
- 권한 묶음 : `op`={op, present, message, caption, token}, `present`={present, message}, `message`={message}, `observe`={}(`group/description.go:30-34`). 녹화 허용 방이면 op에 record 추가(`:72-77`).
- 입장 검사 : op가 아니면 잠금·시작 전·종료 후·autokick(운영자 없음)·최대 인원 초과를 거부(`group/group.go:605-675`). 입장 시 기존 참가자 목록을 서로 통지(`:688-698`).
- 운영자는 다른 사용자에게 present/unpresent·op/unop·shutup·kick 가능(`webclient.go:1892-1958`).

### 5.11 토큰 인증
- JWT 검증 : 만료 필수, iat 검증, 시계 오차 5초(`token/jwt.go:159-189`). `aud`의 호스트·경로가 이 그룹이어야 하고, `sub`가 사용자명, `permissions` 클레임이 권한(`:207-258`). 프로토콜 문서는 수명 30초 수준을 권장(`galene-protocol.md:573-588`). `aud` 호스트 비교는 `CanonicalHost` 설정 시에만 수행(`token/jwt.go:232-239`) — 입장 1회에만 쓰기 때문.
- `GetPermission`이 토큰 우선, 없으면 비밀번호(`group/group.go:1019-1066`). 인증 실패 시 200ms 지연 후 응답(`webclient.go` join 처리, 무차별 대입 완화).
- 상태 저장 토큰(`token/stateful.go`)은 파일 기반 발급·폐기 관리 — 우리는 화면 서버가 발급하므로 불필요.

### 5.12 녹화기 = 구독 클라이언트
- `diskwriter.Client`가 `group.Client` 인터페이스를 구현하고 `PushConn`으로 업 트랙을 받아 `DownTrack`처럼 `Write`를 받는다(`diskwriter/diskwriter.go:38-171,305-476` — `diskTrack.Write:427`). 미디어 경로를 고치지 않고 녹화를 붙인 설계 — 우리 record/도 consumer 하나로 붙인다.

---

## 6. seminar.pi 설계 반영안

### 6.1 M1 최소 구성 요소와 작성 순서 (Galène 경로를 따라감)

| 순서 | 만들 것 | Galène 대응 | 통과 확인 |
|---|---|---|---|
| 1 | `media/` Go 모듈, pion API 생성 함수 — 빈 인터셉터 레지스트리, VP8+Opus만, UDP mux 단일 포트 | `group/group.go:379-437` | 단위 테스트 : 레지스트리 비어 있음 확인 |
| 2 | `signal/` WebSocket 서버 — handshake·join·ping, 개발용 입장권(HMAC) 검증 | `webclient.go StartClient·clientLoop`, `token/jwt.go Check` | wscat류 수동 시험 |
| 3 | `room/` 방 = 참가자 맵 + 역할(presenter·panel·audience), 입장 통지 | `group/group.go AddClient` | 2명 입장 시 상호 통지 |
| 4 | `transport/`+`producer/` 발행 수신 — offer 받아 answer, OnTrack에서 Producer 생성, 역할 검사 | `gotOffer`, `newUpConn` | 발표자 offer 수락, 청중 offer 거부 |
| 5 | `forward/` 수신 루프 — 읽기·확장 헤더 제거·구독자들에게 쓰기(캐시 없이 직접 복사) | `readLoop`(캐시·NACK 부분 제외) | 서버 로그 패킷 수 |
| 6 | `consumer/` 서버 offer 기반 구독 PC, connected 후 연결 | `pushDownConn`, `negotiate`, `gotAnswer:651-666` | 청중 2명 화면 |
| 7 | 신규 구독자 첫 화면용 PLI(단순 : 구독 시 1회 + 0.5초 상한) | `rtpreader.go:136-148` | 늦게 들어온 청중도 화면 |
| 8 | 하류 SR(립싱크) — M1은 생략 가능, 음성·영상 어긋나면 M2 | `sendSR` | — |

M1 통과 기준(PRD) : 같은 LAN·LTE에서 발표자 1 → 청중 2 영상. NACK 없음.

### 6.2 M2 추가 (안정화)

| 순서 | 만들 것 | Galène 대응 |
|---|---|---|
| 1 | `nack/` 패킷 캐시 — 고정 슬롯 링 버퍼(영상 128·음성 24에서 시작), Store→인덱스, GetAt·Get, 마지막 키프레임, 수신 통계 | `packetcache.go` |
| 2 | 전달 경로를 "캐시 저장 → (순번, 인덱스) 전달"로 교체, 구독자 큐 꽉 차면 영상 프레임 끝까지 버림 | `rtpwriter.go:107-160` |
| 3 | 상류 NACK — 손실 비트맵, 20ms/2~24패킷 기준 | `packetcache.go:31-153`, `rtpreader.go:96-126` |
| 4 | 하류 NACK — 캐시 재전송, 없으면 50ms 모아 상류 NACK, 키프레임 이전 버림 | `rtpconn.go:766-810`, `rtpwriter.go:316-368` |
| 5 | `pli/` — PLI·FIR 합치기, 키프레임 도착 시 해제, 0.5초 상한, FIR 순번 중복 제거(갱신 포함) | `rtpconn.go:1173-1192`, `rtpreader.go:136-148` |
| 6 | 신규 구독자 캐시 재생(키프레임 40패킷 이내) | `rtpwriter.go:209-273` |
| 7 | RTCP — 상류 RR 1초, 하류 SR 0.5초, RTT, 캐시 크기 자동 조정 | `rtpconn.go:932-1111,1220-1283` |
| 8 | TURN 경유(cafe.pi 자격 증명 라우트 재사용), `tc netem` 3% 손실 시험 | `ice/ice.go:117-118`(relay 전용 시험 옵션) |

### 6.3 모듈별 반영안 (S-1 전제 : 아래는 전부 우리가 직접 작성)

| 모듈 | 단계 | 무엇을 어떻게 | Galène에서 가져올 개념 |
|---|---|---|---|
| **signal** | M1 → M3 | WebSocket JSON, `type` 기반, 대칭·비동기. 메시지 : hello(입장권)·joined·produce(offer)·answer·consume(request)·offer·ice·close·ping. 15초 handshake, 20/45초 생존, 1MB 상한. M3에서 mediasoup 단위(transport·producer·consumer)로 API 이름 재정리 | 5.9 |
| **room** | M1 | `Room{id, peers, producers}`, 역할 = presenter·panel(발행+구독)·audience(구독만). 정원·시작/종료 시각은 입장권 클레임으로 받음(DB 미접근) | 5.10 |
| **transport** | M1 | pion PC 생성·ICE 후보 보관·connected 콜백까지만. **M1은 Galène처럼 스트림당 PC 1개**(재협상 경합 회피), M3에서 참가자당 송·수신 PC 2개로 합칠지 결정 [확인중 : 마스터 취합 — mediasoup 분석과 대조] | 5.1, 5.9 |
| **producer** | M1·M2 | 수신 트랙 1개 = Producer 1개(simulcast면 rid별 레이어), 소유 : 캐시·속도·지터·키프레임 상태·구독자 목록. readLoop 1 고루틴 | 4.2-1~5 |
| **consumer** | M1·M4 | 송신 트랙 + 레이어 상태 + 순번 재매핑. M1은 그대로 전달, M4에서 simulcast 전환 시 SSRC 고정·순번/타임스탬프 연속화(LiveKit 참고) | 5.8, packetmap |
| **forward** | M1·M2 | M1 : consumer별 고루틴+버퍼 채널(청중 30명이면 30 고루틴로 충분). M2 : 큐 꽉 차면 영상은 프레임 끝까지 버림, 음성은 짧은 재시도. Galène의 √n 작성자 풀은 측정 후 필요하면 | 5.6 |
| **nack** | M2 | 캐시·비트맵·상류/하류 NACK 전부 직접. RTX 미사용(같은 SSRC 재전송) + SRTP 재전송 보호 창 확대 | 5.2~5.4 |
| **pli** | M1(최소)·M2 | 키프레임 필요 플래그 + 0.5초 상한, 신규 구독자 캐시 재생 | 5.5 |
| **bwe** | M4 | Galène은 손실 기반 + REMB만(TWCC·지연 기반 없음). M2에서 손실률·RTT 수집까지만 해 두고, 추정 알고리즘은 LiveKit 분석 후 작성 | 5.7 |
| **record** | M5 | 녹화기 = 서버 내부 consumer 하나(미디어 경로 수정 없음) | 5.12 |
| **metrics** | M2 수집·M5 내보내기 | 트랙별 속도·패킷 수·손실·지터·RTT·NACK/PLI 횟수·캐시 적중률. Galène `stats/stats.go`·`rtpconn/rtpstats.go`가 항목 목록 참고 | 5.7 |

### 6.4 우리 인터페이스 초안 (Go, 우리 설계 — Galène 코드 아님)

- `type Producer interface { ID() string; Kind() Kind; Layer() string; AddConsumer(c Consumer) error; RemoveConsumer(c Consumer); GetPacket(seq uint16, dst []byte) int; RequestKeyframe() }`
- `type Consumer interface { ID() string; WriteRTP(pkt []byte) error; OnNACK(seqs []uint16); OnPLI() }`
- `type PacketCache interface { Store(seq uint16, ts uint32, keyframe, marker bool, pkt []byte) (idx uint16); GetAt(seq, idx uint16, dst []byte) int; Get(seq uint16, dst []byte) int; LastKeyframe() (uint16, bool); MissingSince(next uint16) (first uint16, bitmap uint16, ok bool); Stats(reset bool) RecvStats }`
- `type KeyframeLimiter interface { Need(); Seen(); Tick(now time.Time) (sendPLI bool) }` — 0.5초 상한
- 의사코드(readLoop) : 읽기 → 확장 제거 → 키프레임이면 limiter.Seen → idx = cache.Store → 손실 구간이 기준 초과면 상류 NACK → 각 consumer 큐에 (seq, idx) 넣기(꽉 차면 영상 프레임 끝까지 버림) → limiter.Tick이면 PLI

---

## 7. 채택하지 않을 것과 이유

| 항목 | 이유 |
|---|---|
| Galène 코드 이식 | S-2(MIT라 법적으로는 가능하나 마스터 원칙상 설계만 배운다) |
| 클라이언트 주도 simulcast 전환(화면 크기 기준 재요청·재협상) | 전환마다 재협상·SSRC 변경 → Pi Browser(WKWebView)에서 깜박임 위험. 서버 자동 전환(M4, LiveKit)으로 대체 |
| SVC(VP9·AV1 sid/tid) 처리 | 1차 코덱 VP8 고정, iOS WKWebView VP9 송신 지원 불확실 [확인중 : M0 실기기] |
| 내장 TURN 서버 | cafe.pi 자격 증명 방식 재사용(PRD 3절) |
| 상태 저장 토큰·비밀번호 로그인·관리 CLI(galenectl)·관리 API | 입장권은 화면 서버가 발급, 미디어 서버는 DB·사용자 저장소 없음 |
| 채팅·파일 전송·자막·그룹 JSON 설정 파일 | seminar.pi 화면(Next) 쪽 기능 또는 범위 밖 |
| WHIP(`webserver/whip.go`) | 발행자는 브라우저 1종, 1차 불필요 [TBD : OBS 송출 요구 시] |
| √n 작성자 풀 | 청중 30명 규모에선 consumer별 고루틴으로 충분 — M4 측정에서 CPU가 문제면 도입 |
| REMB 기반 상류 제어만으로 bwe 완성 | Chrome 계열은 TWCC 중심으로 옮겨 가는 중, M4에서 LiveKit 방식과 비교 후 결정 |

---

## 8. 위험·주의

| 위험 | 내용 | 대응 |
|---|---|---|
| 라이선스 | MIT — 출처 표기만 의무. 우리는 코드 이식을 안 하므로 영향 없음. 문서 인용은 경로·함수명만 | S-2 유지, 이 문서 9절로 출처 기록 |
| 복잡도 과소평가 | 핵심 약 3,100줄이지만 순번 비교(2^16 모듈러), 비트맵 이동, 캐시 인덱스 무효화 등 경계 조건이 촘촘하다 | M2 nack/에 순번 감김(65535→0)·순서 뒤바뀜·캐시 덮어쓰기 단위 테스트 필수 |
| 동시성 | Galène은 원자 변수·잠금·무제한 채널(`unbounded`)을 섞어 쓴다. 그대로 따라 하면 경합 버그 | 패킷 경로는 producer 고루틴 1개가 소유, 외부는 채널로만 요청. `go test -race` 상시 |
| 재전송 = 같은 SSRC | RTX 미사용 시 SRTP 재전송 보호에 걸릴 수 있음(Galène은 창 512로 대응) | M2에서 3% 손실 시험으로 확인 [확인중 : M2 실측] |
| simulcast 공백 | Galène에 서버 자동 simulcast 전환·지연 기반 bwe 없음 → M4 품질 목표를 Galène만으로 못 맞춤 | M4 착수 전 LiveKit 분석(PRD 5절 일정 그대로) |
| Pi Browser | 스트림당 PC, 서버 offer 방식이 iOS WKWebView·Android WebView에서 문제없는지, VP8 simulcast 송신 가능한지 미확인 | M0 관문 + M1 LTE 시험에서 확인 [확인중 : M0·M1 실기기] |
| 헤더 확장 제거 | 확장을 지우면 하류에서 TWCC·abs-send-time을 못 쓴다 | M4에서 bwe 방식 정할 때 다시 판단(우리 TWCC 작성 시 하류용 확장은 서버가 새로 붙임) |
| 실행 근거 부족 | 이번 분석은 소스 정독만, REA MCP 연결 실패 | M1 구현 후 Galène 실행 관찰은 하지 않고 우리 엔진 webrtc-internals로 검증 |

---

## 9. 근거 파일 목록 (커밋 `e2bc84f`)

| 파일 | 본 범위 |
|---|---|
| `LICENCE`, `CHANGES`, `go.mod` | 라이선스·버전·의존성 |
| `galene-protocol.md` | 1-303(시그널링), 542-602(토큰) |
| `conn/conn.go` | 전체(인터페이스 4개) |
| `rtpconn/rtpreader.go` | 전체(readLoop) |
| `rtpconn/rtpwriter.go` | 전체(작성자 풀·nackWriter) |
| `rtpconn/rtpconn.go` | 29-1283(업·다운 트랙, RTCP, NACK, PLI, 속도, 캐시 크기) |
| `rtpconn/webclient.go` | 277-830(연결·협상·요청), 836-1098(클라이언트 루프·푸시), 1261-1274, 1395-1500(join·offer), 1892-1958(사용자 조치), 2007-2070(토큰 파싱) |
| `packetcache/packetcache.go` | 전체 |
| `packetmap/packetmap.go` | 1-64, 146, 185-212 |
| `estimator/estimator.go`, `jitter/jitter.go`, `rtptime/rtptime.go` | 전체 |
| `codecs/codecs.go` | 17-186(Keyframe), 248-310(PacketFlags) |
| `group/group.go` | 96-115, 196-280, 373-437(API), 605-700(AddClient), 1019-1066(GetPermission) |
| `group/description.go` | 30-86(권한 묶음) |
| `token/jwt.go` | 159-262 |
| `diskwriter/diskwriter.go` | 38-171, 305-476(구조만) |
| `ice/ice.go` | 67-140(relay 전용 옵션) |
| `webserver/webserver.go` | 565~(wsHandler) |
| `static/galene.js` | 1029-1121(simulcast 송신), 1500-1568(전환 판단) |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-25 | v0.1 — Galène `e2bc84f` 소스 정독 분석, M1·M2 작성 순서·모듈 반영안 |
| 2026-10-25 | v0.2 — 반박 검증 반영(아래 '검증 기록' 12건 정정) |

## 검증 기록

- 검증 일자 : 2026-10-25 · 대상 커밋 `e2bc84f26d4f5f92a6deb9cd6cfc27acae2cacc4`(2026-10-23) · 방법 : 인용 경로·줄·함수명을 로컬 사본 소스와 1:1 대조
- 검증 건수 : 사실 주장 62건 대조 → 일치 50건, 정정 12건, 확인 불가 0건(실행 수치는 기존 [확인중 : M1·M2 실측] 유지)
- S-2 점검 : 원본 코드 블록 복사 없음(4.1 모듈도·6.4 인터페이스는 우리 설계) · S-1 점검 : pion 인터셉터 사용 설계 없음(빈 `interceptor.Registry`는 `group/group.go:412,417` 단 1곳 확인)

| # | 정정 전 | 정정 후(근거) |
|---|---|---|
| 1 | 미디어 경로 핵심 약 3,300줄 | 3,108줄(11개 파일 `wc -l` 실측) |
| 2 | 캐시가 "복사 1회"로 여러 기능 해결 | 저장 1회 + 작성자마다 `GetAt` 복사 1회(`rtpwriter.go:299`) |
| 3 | 느린 청중 1명이 다른 청중을 막지 않음 | `drop`은 작성자 단위 — 같은 작성자의 최대 4개(√n) 트랙이 함께 버려짐(`rtpwriter.go:108-136,174-181`) |
| 4 | 권한 회수 `webclient.go:1255-1270` | `:1261-1274` |
| 5 | 손실 기반 속도 : <2% ×1.05 | 손실 <5/256 **이고** 실제 속도 ≥ 상한 3/4일 때만 ×269/256, >25/256이면 ×(512−loss)/512(`rtpconn.go:1125-1143`) |
| 6 | RTCP 피드백 교체 = 4종 | 영상만 4종, 음성은 nil(`group/group.go:268-278`) → 하류 음성 NACK 없음 |
| 7 | 30초 보고 없으면 상한 무한대 취급 | 손실 기반 값 무효 → 기본 512 kbit/s, REMB는 무시(`rtpconn.go:39-45,318-330`) |
| 8 | 소스 전체에 `rtx` 없음 | Go 소스(테스트 제외)에 없음, `sdpfrag/sdpfrag_test.go`에만 등장 |
| 9 | simulcast 전환 = 영상 크기 320×240 이하 | 면적(가로×세로) ≤ 320×240, `force` 고정 가능(`static/galene.js:1548-1560`) |
| 10 | 생존 확인 `:1012-1031` | 10초 티커 기반 `:969-972,1018-1031`(판정 최대 10초 지연) |
| 11 | 토큰 권장 수명 `galene-protocol.md:570-584` | `:573-588`, `aud` 호스트 비교는 `CanonicalHost` 설정 시만(`token/jwt.go:232-239`) |
| 12 | 줄 인용 오차 : diskwriter `305-424`, codecs `11-60`·`233-250`, webserver `558-585` | `305-476`(Write `:427`), Keyframe `17-186`·PacketFlags `248-310`, wsHandler `:565` |
