# PRD_9_VOICE_CHAT.md — PiVoice™: WebRTC 실시간 음성 통화

> **작성일**: 2026-06-11
> **버전**: v1.0
> **상태**: 초안 (설계 합의용 — 코드 구현 전)
> **작성자**: voice-chat-architect 에이전트 (검토: anakin)
> **관련 문서**: `docs/PRD_4_CHAT.md`(채팅 본체) · `.claude/plans/warm-stirring-star.md`(구축 계획)

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| v1.0 | 2026-06-11 | 최초 작성 — 1:1 음성 MVP, 관리형 TURN, 베타 무료. P2P 메시 기준선, Supabase Realtime 시그널링 재사용, msg_call_log/quality_stat 데이터 모델 | voice-chat-architect |

---

## 확정 의사결정 (사용자 승인 — 2026-06-11)

| 항목 | 결정 | 근거 |
|---|---|---|
| 산출물 범위 | PRD + 구축계획 문서 (코드 별도 단계) | 착수 전 설계 합의·검토 우선 |
| MVP 1차 범위 | **1:1 음성만** | 시그널링·NAT·품질 먼저 검증 → 데이터 기반 4인 확장 |
| TURN 인프라 | **관리형 서비스로 시작** (Metered 등) | 서버 운영 부담 0, 검증 후 자체 coturn 전환 |
| 수익화 | **베타 완전 무료** | 결제 게이팅 없이 사용성·품질 데이터 수집 우선 |

---

## 목차

1. 개요·목표·핵심가치
2. 아키텍처 선택 근거 (P2P vs SFU)
3. 구성요소별 역할 (시그널링/미디어/TURN)
4. 구현 핵심 포인트
5. 데이터 모델 (DA 표준)
6. 보안·운영 체크리스트
7. 비용 추정
8. 결제·수익화 (베타 무료 + 향후 설계)
9. 로드맵·마일스톤
10. 미해결 질문/리스크

---

## 1. 개요·목표·핵심가치

PiChat 채팅방 참여자 간 **브라우저 기반 실시간 1:1 음성 통화**를 추가한다. 별도 앱 설치 없이 Pi Browser·일반 브라우저에서 즉시 통화한다.

**핵심가치**
- **추가 인프라 0**: 시그널링을 기존 Supabase Realtime Broadcast로 처리 — 신규 WebSocket 서버 불필요
- **서버 미디어 비용 0**: 1:1은 P2P 직결 — 음성 트래픽이 서버를 거치지 않음(릴레이 시에만 TURN 경유)
- **Pi Browser 모바일 1급**: 모바일 비중이 높으므로 Wi-Fi↔LTE 전환·UDP 차단망을 1급 시나리오로 설계

**MVP 목표**: 채팅방 멤버 간 1:1 음성 통화 발신·수신·종료, 통화 품질(packet loss/jitter/RTT) 로깅, Pi Browser 실기기 동작.

**비목표(MVP 제외)**: 그룹(2인 초과) 통화, 영상 통화, 통화 녹음, 결제 게이팅 — 모두 데이터 검증 후 후속 단계.

---

## 2. 아키텍처 선택 근거

### P2P vs SFU 비교

| 기준 | P2P 메시 (채택) | SFU (LiveKit 등) |
|---|---|---|
| 1:1 서버 미디어 비용 | **0** (직결) | 항상 서버 경유 |
| 2~4인 | 가능(각 피어 N-1 연결) | 효율적 |
| 5인+ | 업스트림 대역 폭증 → 부적합 | 적합 |
| 인프라 | 시그널링+TURN만 | 미디어 서버 운영 |
| MVP 적합성 | **최적** (1:1) | 과설계 |

**결정**: 1:1~4인은 **P2P 메시**. 4인 초과 불허(향후 LiveKit 오디오 전용 SFU로 확장 여지 명시). MVP는 **1:1만**.

향후 동일 P2P 파이프라인에 영상 트랙을 추가하면 1:1 화상으로 확장 가능(별도 재검토).

---

## 3. 구성요소별 역할

### 시그널링 — Supabase Realtime Broadcast 재사용
- **송신(서버)**: `broadcastToRoom(roomId, event, payload)` (`src/lib/realtime-broadcast.ts`) — REST + `SUPABASE_SERVICE_ROLE_KEY`. 클라이언트 직접 broadcast 금지(신원 보증)
- **수신(클라)**: `getSupabaseClient()` + `channel.on('broadcast', { event }, …)` (`src/hooks/use-chat-room.ts` 패턴). 채널 `room:${roomId}` 재사용
- **신규 이벤트 타입**: `call_invite` · `webrtc_offer` · `webrtc_answer` · `webrtc_candidate` · `call_hangup`
- **벨소리/통화중 상태**: 같은 채널의 presence(`channel.track({ callState })`)

### 미디어 — 브라우저 RTCPeerConnection P2P
- 코덱: **Opus 24~32kbps + DTX 활성화**(무음 구간 전송 중단 → 실효 대역폭 절반↓)
- `getUserMedia` 제약: `echoCancellation`·`noiseSuppression`·`autoGainControl` 3종 필수(모바일 스피커폰)

### TURN — 관리형 서비스 (Metered 등)
- 직접 연결 실패(통상 10~20%) 시에만 릴레이
- **임시 자격증명을 서버가 발급**(Pi 토큰 검증 후) — 클라이언트 하드코딩 금지(릴레이 도용 → 대역폭 비용 폭주)
- **TURN over TLS 443**(`turns:…:443?transport=tcp`)을 UDP와 함께 개방(통신사망·제한망 대비)

---

## 4. 구현 핵심 포인트

### 4.1 TURN 자격증명 발급 (서버)
```typescript
// POST /api/voice/turn-credentials — Pi 토큰 검증 후 TTL 짧은(1h) 임시 자격증명
// 관리형 서비스는 보통 REST API 또는 HMAC(username=expiry:userId, credential=HMAC) 방식
export async function POST() {
  const user = await getSessionUser()           // 쿠키 OR X-Pi-Token
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  // 관리형 TURN의 임시 자격증명 발급 (env: TURN_HOST/TURN_SECRET)
  // iceServers를 클라이언트에 반환 — credential은 TTL 만료
  return NextResponse.json({ iceServers, ttlSec: 3600 })
}
```

### 4.2 통화 상태 머신
`ringing`(타임아웃 30초) → `connected` → `ended`. `connectionstatechange === 'disconnected'`면 **ICE restart**로 자동 재연결(Wi-Fi↔LTE 전환 대응).

### 4.3 품질 로깅
`pc.getStats()`로 packet loss/jitter/RTT를 통화 종료 시 `msg_call_quality_stat`에 적재. 지역·통신사별 품질, TURN 경유 비율을 데이터로 판단(자체 coturn 전환 근거).

### 4.4 클라이언트 게이트 (Pi Browser 무한 루프 방지)
`getSessionUser()` null 시 **redirect 금지** → `ClientVoiceCall` 위임(`ClientChatRoom` 패턴 그대로). 모든 통화 API 호출은 `piFetch`(X-Pi-Token 자동 첨부).

### 4.5 권한
`getRoomMember(roomId, userId)` + `mbr_role_cd`로 발신/수신 자격 확인. 1:1 MVP는 채팅방 멤버 간만 허용(GUEST 만료 자동 차단).

### 신규/재사용 매핑

**재사용**: `broadcastToRoom`, `getSupabaseClient`+presence, `piFetch`/`getSessionUser`, `ClientChatRoom`/page 게이트, `getRoomMember`, `payments/complete` 분기(향후), `env.ts`, DA DDL 패턴.

**신규**: `sql/024_voice_call.sql` · `POST /api/voice/turn-credentials` · `POST /api/chat/rooms/[roomId]/call`(시작) · `.../call/[callId]/signal`(중계) · `.../call/[callId]/end`(종료) · `src/hooks/use-webrtc-call.ts` · `src/components/chat/client-voice-call.tsx` · `voice-call-panel.tsx` · `src/app/[locale]/chat/[roomId]/call/page.tsx`.

---

## 5. 데이터 모델 (DA 표준)

`msg_` 접두사, 시스템 컬럼 4개, `del_yn`+`del_dtm`, `TIMESTAMPTZ`, `WHERE del_yn='N'` 부분 인덱스. `da-ddl-guard` Hook 통과 위해 `-- DA-APPROVED:` 주석 필수.

```sql
-- sql/024_voice_call.sql (구현 단계에서 생성)
-- DA-APPROVED: 음성통화 Phase 14 신규 — call/quality 외래어 약어 DA 승인. (2026-06-11)

CREATE TABLE IF NOT EXISTS public.msg_call_log (
  call_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID         NOT NULL REFERENCES public.msg_room(room_id),
  caller_usr_id   UUID         NOT NULL,                 -- 발신자 sys_user.id
  callee_usr_id   UUID         NOT NULL,                 -- 수신자 (1:1 MVP)
  call_st_cd      VARCHAR(10)  NOT NULL DEFAULT 'RINGING'
                  CHECK (call_st_cd IN ('RINGING','CONNECTED','ENDED','DECLINED','MISSED')),
  relay_yn        CHAR(1)      NOT NULL DEFAULT 'N' CHECK (relay_yn IN ('Y','N')), -- TURN 경유 여부
  start_dtm       TIMESTAMPTZ,                           -- answer 시각
  end_dtm         TIMESTAMPTZ,
  duration_sec    INTEGER,                               -- 통화 지속(초)
  end_rsn_cd      VARCHAR(15)  CHECK (end_rsn_cd IN ('USER_ENDED','TIMEOUT','REJECTED','FAILED')),
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.msg_call_quality_stat (
  stat_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id         UUID         NOT NULL REFERENCES public.msg_call_log(call_id),
  usr_id          UUID         NOT NULL,                 -- 측정 참여자
  rtt_ms          INTEGER,                               -- Round-trip time
  packet_loss_pct DECIMAL(5,2),                          -- 패킷 손실률(%)
  jitter_ms       DECIMAL(7,2),
  relay_yn        CHAR(1)      NOT NULL DEFAULT 'N' CHECK (relay_yn IN ('Y','N')),
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (call_id, usr_id)
);

CREATE INDEX IF NOT EXISTS idx_msg_call_log_room   ON public.msg_call_log (room_id) WHERE del_yn='N';
CREATE INDEX IF NOT EXISTS idx_msg_call_log_callee ON public.msg_call_log (callee_usr_id) WHERE del_yn='N';
CREATE INDEX IF NOT EXISTS idx_msg_call_qual_call  ON public.msg_call_quality_stat (call_id) WHERE del_yn='N';
```

**컬럼 명명**: `_id`(식별자)·`_cd`(코드)·`_dtm`(일시)·`_yn`(여부)·`_sec`/`_ms`/`_pct`(단위 명시). `caller_usr_id`/`callee_usr_id`는 역할 구분.

---

## 6. 보안·운영 체크리스트

- [ ] **TURN 자격증명 서버 발급** — Pi 토큰 검증 후 TTL 1h 임시 발급, 클라이언트 하드코딩 절대 금지
- [ ] **TURN over TLS 443** 경로 개방(제한망 대비)
- [ ] **시그널링 서버 발신** — `broadcastToRoom` service key 경유로 신원 보증(클라 직접 broadcast 차단)
- [ ] **piFetch 인증** — 모든 통화 API에 X-Pi-Token 이중 경로, `getSessionUser()`/`getRoomMember()` 서버 검증
- [ ] **redirect 금지** — 통화 페이지 null 세션 시 ClientVoiceCall 위임
- [ ] **DA 표준** — 시스템 컬럼 4개·del_yn/del_dtm·TIMESTAMPTZ·msg_ 접두사·DA-APPROVED 주석
- [ ] **모바일 네트워크** — Wi-Fi↔LTE 전환 ICE restart, UDP 차단 시 TURN/TCP/443 폴백
- [ ] (자체 coturn 전환 시) `denied-peer-ip`로 사설 IP 대역(10.x·172.16.x·192.168.x·169.254.x) 차단, `user-quota`/`total-quota` 세션 제한, certbot 자동 갱신

---

## 7. 비용 추정

| 항목 | MVP(관리형 TURN) | 자체 coturn 전환 시 |
|---|---|---|
| 시그널링 | $0 (기존 Supabase) | $0 |
| P2P 직접 통화(80%) | 서버 비용 0 | 0 |
| TURN 릴레이(~20%) | 관리형 무료 티어(월 수GB) | $10/월 VPS(전송 1~2TB) |
| 릴레이 대역 | 약 0.75MB/분(Opus+DTX) | 동일 |

**판단 기준**: 관리형 무료 티어 한도를 베타 트래픽이 초과하면 자체 coturn으로 전환. S2 단계에서 TURN 경유율·전송량 데이터로 손익분기 산출.

---

## 8. 결제·수익화

**베타: 완전 무료** — 결제 게이팅 없이 사용성·품질 데이터 수집.

**향후 설계(미적용)**: 기존 2PC 결제 패턴 재사용. 메인넷 단건 결제(`metadata.type='VOICE_CALL_CREDIT'`, 예: 일일 무료 10분 + 30분권 X Pi). `PLAN_CAPS`에 `voiceDailyFreeMinutes` 추가, `getVoiceDailyQuota()`로 `msg_call_log` 당일 `duration_sec` 합산. 활성화 시점은 S3에서 사용량 데이터로 결정.

---

## 9. 로드맵·마일스톤

| 단계 | 내용 | Go/No-Go |
|---|---|---|
| **S0 스파이크** | Pi Browser 실기기 마이크 권한 + `getUserMedia` 동작 확인 | iOS/Android Pi Browser 마이크 캡처 성공 여부 |
| **S1 1:1 MVP** | 시그널링(기존 broadcast) + 관리형 TURN 발급 + 통화 UI + `msg_call_log` | 동일/상이 네트워크 1:1 연결·종료, 품질 로깅 적재 |
| **S2 품질 검증** | `getStats()` packet loss/jitter/RTT·TURN 경유율 수집·분석 | 릴레이 비율·품질이 자체 coturn 전환 필요성 판단 |
| **S3 확장 결정** | 4인 메시 또는 LiveKit 오디오 SFU / 결제 게이팅 활성화 | 베타 사용량·비용 추이 |

---

## 10. 미해결 질문/리스크

- **iOS Pi Browser WebRTC 제약** *(최우선)*: WKWebView `getUserMedia` 지원 여부가 S0 스파이크의 go/no-go 핵심 — 미지원 시 전체 재검토
- **관리형 TURN 무료 티어 한도**: 베타 트래픽 초과 시 자체 coturn 조기 전환
- **시그널링 채널 분리**: MVP는 `room:${roomId}` 재사용. 통화 트래픽이 채팅 broadcast와 섞이는 부하는 S2에서 측정 후 `call:${callId}` 분리 검토
- **동시 통화 정책**: 1:1 MVP는 사용자당 1개 활성 통화로 제한(이미 통화 중이면 새 발신/수신 거부)
- **결정 필요(추후)**: 관리형 TURN 업체 선정(Metered/Twilio/Cloudflare), 무료 통화 시간·추가권 가격(S3)

---

## 자기검증 체크리스트 (제출 전 점검 — 완료)

- [x] Pi Browser 쿠키 미저장 제약 위반 없음(piFetch + X-Pi-Token, redirect 금지)
- [x] TURN 자격증명 클라이언트 비노출(서버 발급 + Pi 토큰 검증)
- [x] TURN over TLS 443 경로 포함
- [x] 테이블 설계 DA 표준 준수(시스템 컬럼 4개, del_yn/del_dtm, TIMESTAMPTZ, 논리삭제)
- [x] 모바일 네트워크 전환·UDP 차단 시나리오 포함
- [x] 결제 게이팅 향후 설계가 기존 2PC 패턴과 일관
