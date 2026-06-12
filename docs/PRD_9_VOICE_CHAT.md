# PRD_9_VOICE_CHAT.md — PiVoice™: WebRTC 실시간 음성 통화

> **작성일**: 2026-06-11
> **버전**: v3.0
> **상태**: 설계 합의 완료 (N:N 다:다 정책 확정 — 코드 구현 단계)
> **작성자**: voice-chat-architect 에이전트 (검토: anakin)
> **관련 문서**: `docs/PRD_4_CHAT.md`(카페 본체) · `.claude/plans/warm-stirring-star.md`(구축 계획)

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| v3.0 | 2026-06-12 | **권한 정책 신설** — 방장 슬롯 보장(무조건 가능) + 멤버 슬롯 4(방장 외 최대 4명, 총 5명). 멤버 처음 2명 자동 연결, 3·4번째는 방장 승인 필요(신청·승인 플로우). 방장 언제든 전원 권한 회수. 인원 상한은 설정값으로 설계(향후 활성화 시 확대 가능). v2.0 "마이크 4명 선착순"을 권한 매트릭스로 대체. | anakin (요구사항) |
| v2.0 | 2026-06-12 | 1:1 MVP 폐기 → N:N 다:다 기본 정책. 1명도 보이스챗 입장 가능(혼자 대기). 방장 마이크 강제 제어(mute/unmute). 최대 동시 마이크 4명 제한. `msg_call_participant` 신규 테이블(참가자 추적). 방장 권한 검증 강화. | voice-chat-architect (사용자 요청) |
| v1.0 | 2026-06-11 | 최초 작성 — 1:1 음성 MVP, 관리형 TURN, 베타 무료. P2P 메시 기준선, Supabase Realtime 시그널링 재사용, msg_call_log/quality_stat 데이터 모델 | voice-chat-architect |

---

## 확정 의사결정 (사용자 승인 — 2026-06-12)

| 항목 | 결정 | 근거 |
|---|---|---|
| 참여자 모델 | **N:N 다:다** — 1명도 가능(혼자 대기) | 1:1 MVP → N:N 확장 로드맵 단순화. 최소 1명부터 입장 가능(다른 참여자 join 대기). |
| 동시 보이스챗 인원 | **방장 1 + 멤버 최대 4 = 총 5명** (v3.0 — 상세는 아래 권한 정책) | P2P 업스트림 대역 관리, 통화 품질 유지. 상한은 설정값으로 — 향후 확대 가능. |
| 방장 마이크 제어 | **OWNER/ADMIN만 원격 mute/unmute + 권한 회수 가능** | 채팅방 거버넌스 일관성. 클라이언트 재연결/낙오 방지. |
| TURN 인프라 | **관리형 서비스로 시작** (Metered 등) | 서버 운영 부담 0, 검증 후 자체 coturn 전환 |
| 수익화 | **베타 완전 무료** | 결제 게이팅 없이 사용성·품질 데이터 수집 우선 |

---

## 보이스챗 권한 정책 (v3.0 — 2026-06-12 요구사항)

### 권한 매트릭스

| # | 규칙 | 비고 |
|---|---|---|
| R1 | **방장(OWNER)은 무조건 보이스챗 가능** | 방장 슬롯은 항상 보장 — 멤버 정원과 무관 |
| R2 | **방장 외 멤버는 최대 4명까지** 보이스챗 가능 | 동시 보이스챗 총원 = 방장 1 + 멤버 4 = **5명** |
| R3 | **멤버 처음 2명은 자동 연결** | 방장 승인 없이 즉시 보이스챗 시작 (현 v2.0 선착순 동작과 동일) |
| R4 | **멤버 3·4번째는 방장 승인 필요** | 신청(PENDING) → 방장 승인(APPROVED) 후에만 연결. 승인 전에는 청취 전용 대기 |
| R5 | **방장은 언제든 모든 인원의 보이스챗 권한 회수 가능** | 회수 시 즉시 mute + 송출 차단 (기존 mic_mute_force 확장) |
| R6 | **신청·승인 가능 인원도 최대 4명(멤버 기준)까지** | 슬롯이 가득 차면 신청 자체 불가 — "정원 초과" 안내 |
| R7 | **인원 상한은 설정값** (`VOICE_AUTO_SLOTS=2`, `VOICE_MAX_MEMBER_SLOTS=4`) | 향후 프로젝트 활성화 시 상한 확대 가능 — 하드코딩 금지 |

### 승인 상태 머신 (멤버 기준)

```
입장(join) ─┬─ 자동 슬롯(1·2번째) 여유 → CONNECTED (즉시 송출 가능)
            └─ 자동 슬롯 소진 ─┬─ 멤버 슬롯(3·4번째) 여유 → PENDING (신청 — 청취 전용 대기)
                               │     └─ 방장 승인 → CONNECTED / 방장 거절 → LISTEN_ONLY
                               └─ 멤버 슬롯 4명 가득 → 신청 불가 (청취 전용 입장만 허용)

방장 권한 회수(REVOKE): CONNECTED → LISTEN_ONLY (즉시 mute, 재신청 가능 여부는 방장 재량)
```

### 구현 영향 (v2.0 구현 대비 변경 필요 사항)

- ⚠️ **현 구현은 v2.0 기준** — "방장 구분 없는 선착순 마이크 4명". v3.0 적용 시 다음 변경 필요:
  - `msg_call_participant`에 승인 상태 컬럼 추가 (`mic_st_cd`: CONNECTED/PENDING/LISTEN_ONLY 등) 또는 `mic_yn` 확장
  - `join` API: 방장 슬롯 보장 분기 + 자동 슬롯(2)/승인 슬롯(2) 계산
  - 신규 API: 보이스챗 신청(`request`) · 방장 승인/거절(`approve`/`deny`) — broadcast 이벤트 `mic_request`/`mic_approve`/`mic_deny`
  - `mic-control` API: 권한 회수(REVOKE) 의미 확장 — 회수 시 재신청 정책 반영
  - UI: 방장에게 신청 대기 목록 + 승인/거절 버튼, 신청자에게 대기 상태 표시
  - 상한 설정값 env 또는 `PLAN_CAPS` 연동 (`VOICE_AUTO_SLOTS`/`VOICE_MAX_MEMBER_SLOTS`)

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

PiCafé 카페 참여자 간 **브라우저 기반 실시간 음성 통화**(1~4명 P2P 메시)를 추가한다. 별도 앱 설치 없이 Pi Browser·일반 브라우저에서 즉시 통화한다. 최소 1명부터 입장 가능 — 혼자 대기 중에도 다른 참여자 join 시 자동 연결된다.

**핵심가치**
- **추가 인프라 0**: 시그널링을 기존 Supabase Realtime Broadcast로 처리 — 신규 WebSocket 서버 불필요
- **서버 미디어 비용 0**: P2P 직결(N:N 메시) — 음성 트래픽이 서버를 거치지 않음(릴레이 시에만 TURN 경유)
- **방장 거버넌스**: 채팅방 방장(OWNER/ADMIN)이 참여자 마이크를 원격 제어(mute/unmute) 가능 — 채팅 방 환경 유지
- **Pi Browser 모바일 1급**: 모바일 비중이 높으므로 Wi-Fi↔LTE 전환·UDP 차단망을 1급 시나리오로 설계

**목표**: 카페 멤버 간 1~4명 음성 통화 입장·대기·연결·종료, 통화 품질(packet loss/jitter/RTT) 로깅, 방장 마이크 원격 제어, Pi Browser 실기기 동작.

**비목표(후속 단계)**: 2~4명 초과 대규모 그룹(5인+), 영상 통화, 통화 녹음, 결제 게이팅 — 모두 데이터 검증 후 후속 단계.

---

## 2. 아키텍처 선택 근거

### P2P vs SFU 비교

| 기준 | P2P 메시 (채택) | SFU (LiveKit 등) |
|---|---|---|
| 1~4명 서버 미디어 비용 | **0** (직결, Full Mesh) | 항상 서버 경유 |
| 동시 마이크 제어 | 클라-서버 신호로 간단 | 미디어 서버 오버헤드 |
| 5인+ | 업스트림 대역 폭증 → 부적합 | **적합** |
| 인프라 | 시그널링+TURN만 | 미디어 서버 운영(높은 비용) |
| 확장 난이도 | 4명 이하 최적 | 무제한 확장 |

**결정**: **1~4명 P2P 메시** — N:N 모든 참여자가 양방향 미디어 송수신(Full Mesh). 1명도 입장 가능(혼자 대기). 최대 4명 동시 마이크 제한으로 업스트림 관리. **4인 초과는 불허**(향후 LiveKit 오디오 전용 SFU로 확장 여지 명시).

향후 동일 P2P 파이프라인에 영상 트랙을 추가하면 1:1 화상으로 확장 가능(별도 재검토).

---

## 3. 구성요소별 역할

### 시그널링 — Supabase Realtime Broadcast 재사용
- **송신(서버)**: `broadcastToRoom(roomId, event, payload)` (`src/lib/realtime-broadcast.ts`) — REST + `SUPABASE_SERVICE_ROLE_KEY`. 클라이언트 직접 broadcast 금지(신원 보증)
- **수신(클라)**: `getSupabaseClient()` + `channel.on('broadcast', { event }, …)` (`src/hooks/use-chat-room.ts` 패턴). 채널 `room:${roomId}` 재사용
- **신규 이벤트 타입**:
  - `call_participant_join` — 사용자 음성채널 입장 (1명도 가능, 혼자 대기 표시)
  - `webrtc_offer` / `webrtc_answer` / `webrtc_candidate` — SDP 및 ICE 교환(피어 간)
  - `call_participant_leave` — 음성채널 퇴장
  - `mic_mute_force` — 방장이 특정 참여자의 마이크 강제 mute (usr_id 명시)
  - `mic_unmute_allow` — 방장이 특정 참여자의 마이크 unmute 허용
  - `mic_status_sync` — 방 전체 마이크 상태 동기화(참가자 join 시 기존 상태 적용)
- **벨소리/통화중 상태**: 같은 채널의 presence(`channel.track({ voiceActive })`) — 참가자 목록 실시간 추적

### 미디어 — 브라우저 RTCPeerConnection P2P (Full Mesh)
- **토폴로지**: 각 참여자가 현재 음성채널의 **다른 모든 참여자와 쌍방 연결**(N:N Full Mesh). 예: 3명이면 각각 2개씩 PeerConnection(총 3개).
- **참여자별 마이크 상태**: `msg_call_participant.mic_yn` — 참여자별 마이크 활성 여부. 방장이 강제 제어 가능.
- **코덱**: **Opus 24~32kbps + DTX 활성화**(무음 구간 전송 중단 → 실효 대역폭 절반↓)
- `getUserMedia` 제약: `echoCancellation`·`noiseSuppression`·`autoGainControl` 3종 필수(모바일 스피커폰)

### TURN — 관리형 서비스 (Metered 등)
- 직접 연결 실패(통상 10~20%) 시에만 릴레이
- **임시 자격증명을 서버가 발급**(Pi 토큰 검증 후) — 클라이언트 하드코딩 금지(릴레이 도용 → 대역폭 비용 폭주)
- **TURN over TLS 443**(`turns:…:443?transport=tcp`)을 UDP와 함께 개방(통신사망·제한망 대비)

---

## 4. 구현 핵심 포인트

### 4.1 음성채널 입장 — 1인 대기 (서버)
```typescript
// POST /api/voice/rooms/[roomId]/join — 음성채널 입장(1명도 가능, 혼자 대기)
export async function POST(req: Request, { params: { roomId } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  
  // 카페 멤버 확인
  const member = await getRoomMember(roomId, user.id)
  if (!member) return NextResponse.json({ error: '접근 불가' }, { status: 403 })
  
  // 현재 활성(mic_yn='Y') 참가자 수 확인 → 4명 이상이면 청취 전용(mic_yn='N' 강제)
  const activeMicCount = await sql`
    SELECT COUNT(*) as cnt FROM msg_call_participant 
    WHERE room_id=${roomId} AND mic_yn='Y' AND del_yn='N'
  `
  const micYn = activeMicCount[0].cnt >= 4 ? 'N' : 'Y'
  
  // msg_call_participant 삽입 — 1:1 통화 아님, room 레벨 관리
  const participant = await sql`
    INSERT INTO msg_call_participant (room_id, call_id, usr_id, mic_yn, ...)
    VALUES (${roomId}, NULL, ${user.id}, ${micYn}, ...)
    RETURNING *
  `
  
  // Presence로 음성활성 상태 브로드캐스트(참여자 목록 실시간 추적)
  await broadcastToRoom(roomId, 'call_participant_join', { 
    usr_id: user.id, 
    mic_yn: micYn,
    participantsList: [...현재 활성 참가자 목록]
  })
  
  return NextResponse.json({ micYn, activeMicCount: micCount[0].cnt })
}
```

### 4.2 TURN 자격증명 발급 (서버)
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

### 4.3 방장 마이크 원격 제어 (서버)
```typescript
// POST /api/voice/rooms/[roomId]/mic-control — 방장만 특정 참여자의 마이크 강제 제어
export async function POST(req: Request, { params: { roomId } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  
  // 방장 권한 확인 (OWNER 또는 ADMIN)
  const member = await getRoomMember(roomId, user.id)
  if (member?.mbr_role_cd !== 'OWNER' && member?.mbr_role_cd !== 'ADMIN') {
    return NextResponse.json({ error: '방장만 제어 가능' }, { status: 403 })
  }
  
  const { targetUsrId, micAction } = await req.json() // 'mute' | 'unmute'
  
  // 타겟 참여자가 현재 음성채널에 있는지 확인
  const targetParticipant = await sql`
    SELECT * FROM msg_call_participant 
    WHERE room_id=${roomId} AND usr_id=${targetUsrId} AND del_yn='N'
  `
  if (!targetParticipant) return NextResponse.json({ error: '참가자 없음' }, { status: 404 })
  
  // 4명 마이크 제한 재확인 (unmute 시)
  if (micAction === 'unmute') {
    const activeMicCount = await sql`
      SELECT COUNT(*) as cnt FROM msg_call_participant 
      WHERE room_id=${roomId} AND mic_yn='Y' AND del_yn='N'
    `
    if (activeMicCount[0].cnt >= 4) {
      return NextResponse.json({ error: '최대 마이크 4명 제한' }, { status: 400 })
    }
  }
  
  // 브로드캐스트 (서버 경유만 가능 — 신뢰도)
  const eventType = micAction === 'mute' ? 'mic_mute_force' : 'mic_unmute_allow'
  await broadcastToRoom(roomId, eventType, { 
    targetUsrId,
    requestedBy: user.id
  })
  
  return NextResponse.json({ success: true })
}
```

### 4.4 통화 상태 머신
**음성채널 참여 중**: 
- 클라이언트가 현재 방의 다른 활성 참여자 목록을 `presence`에서 가져옴
- 새 피어 join 이벤트 → offer 생성 (SDP 교환)
- `connectionstatechange === 'disconnected'` → **ICE restart**로 자동 재연결(Wi-Fi↔LTE 전환 대응)
- 방장의 `mic_mute_force` 이벤트 수신 → `RTCRtpSender.replaceTrack(null)`로 자가 track mute(서버가 직접 제어 안 함)

### 4.5 품질 로깅
`pc.getStats()`로 packet loss/jitter/RTT를 음성채널 퇴장 시 `msg_call_quality_stat`에 적재. 지역·통신사별 품질, TURN 경유 비율을 데이터로 판단(자체 coturn 전환 근거).

### 4.6 클라이언트 게이트 (Pi Browser 무한 루프 방지)
`getSessionUser()` null 시 **redirect 금지** → `ClientVoiceChannel` 위임(`ClientChatRoom` 패턴 그대로). 모든 통화 API 호출은 `piFetch`(X-Pi-Token 자동 첨부).

### 4.7 권한
`getRoomMember(roomId, userId)` + `mbr_role_cd`로 입장/마이크 제어 자격 확인. 카페 멤버(GUEST 제외)만 허용(GUEST 만료 자동 차단).

### 신규/재사용 매핑

**재사용**: `broadcastToRoom`, `getSupabaseClient`+presence, `piFetch`/`getSessionUser`, `ClientChatRoom`/page 게이트, `getRoomMember`, `payments/complete` 분기(향후), `env.ts`, DA DDL 패턴.

**신규**: `sql/028_voice_call.sql` · `POST /api/voice/rooms/[roomId]/join`(입장·1인 대기) · `POST /api/voice/rooms/[roomId]/leave`(퇴장) · `POST /api/voice/rooms/[roomId]/mic-control`(방장 제어) · `POST /api/voice/turn-credentials` · `src/hooks/use-webrtc-channel.ts`(N:N 메시 로직) · `src/components/chat/client-voice-channel.tsx`(음성채널 UI) · `src/app/[locale]/chat/[roomId]/voice/page.tsx`.

---

## 5. 데이터 모델 (DA 표준)

`msg_` 접두사, 시스템 컬럼 4개, `del_yn`+`del_dtm`, `TIMESTAMPTZ`, `WHERE del_yn='N'` 부분 인덱스. `da-ddl-guard` Hook 통과 위해 `-- DA-APPROVED:` 주석 필수.

```sql
-- sql/028_voice_call.sql (구현 단계에서 생성 — 024는 sys_batch_log, 027은 카카오 연동 점유)
-- DA-APPROVED: 음성통화 Phase 14 신규 N:N 다:다 구조 — call_log(통화 메타만) + participant 추적. (2026-06-12)

CREATE TABLE IF NOT EXISTS public.msg_call_log (
  call_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID         NOT NULL REFERENCES public.msg_room(room_id),
  -- v2.0: 1:1 MVP → N:N 다:다로 변경. caller/callee 없음(room 레벨 통화 세션).
  start_dtm       TIMESTAMPTZ,                           -- 첫 참여자 입장 시각
  end_dtm         TIMESTAMPTZ,                           -- 마지막 참여자 퇴장 시각
  duration_sec    INTEGER,                               -- 통화 지속(초)
  end_rsn_cd      VARCHAR(15)  CHECK (end_rsn_cd IN ('ALL_LEFT','TIMEOUT','FAILED')),
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- v2.0 신규: 음성채널 참여자 추적 (1~4명, 마이크 상태 포함)
CREATE TABLE IF NOT EXISTS public.msg_call_participant (
  participant_id  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID         NOT NULL REFERENCES public.msg_room(room_id),
  usr_id          UUID         NOT NULL REFERENCES public.sys_user(id),
  mic_yn          CHAR(1)      NOT NULL DEFAULT 'Y' CHECK (mic_yn IN ('Y','N')),
                  -- 'Y': 마이크 활성 (≤4명) | 'N': 청취 전용(5명+) 또는 방장 강제 mute
  join_dtm        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leave_dtm       TIMESTAMPTZ,                           -- 퇴장 시각
  duration_sec    INTEGER,                               -- 음성채널 참여 지속(초)
  del_yn          CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,
  regr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (room_id, usr_id, join_dtm)                    -- 같은 방 같은 사람 중복 입장 시간 기록
);

CREATE TABLE IF NOT EXISTS public.msg_call_quality_stat (
  stat_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID         NOT NULL REFERENCES public.msg_room(room_id),
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
  UNIQUE (room_id, usr_id)
);

CREATE INDEX IF NOT EXISTS idx_msg_call_log_room      ON public.msg_call_log (room_id) WHERE del_yn='N';
CREATE INDEX IF NOT EXISTS idx_msg_call_participant   ON public.msg_call_participant (room_id, usr_id) WHERE del_yn='N';
CREATE INDEX IF NOT EXISTS idx_msg_call_qual_room     ON public.msg_call_quality_stat (room_id) WHERE del_yn='N';
```

**컬럼 명명**: `_id`(식별자)·`_cd`(코드)·`_dtm`(일시)·`_yn`(여부)·`_sec`/`_ms`/`_pct`(단위 명시).

**v2.0 주요 변경**:
- `msg_call_log`: `caller_usr_id`/`callee_usr_id` 제거 (N:N이므로 단일 발신자/수신자 없음). Room 레벨 통화 세션 메타만 기록.
- `msg_call_participant` 신규: 참여자별 마이크 상태(`mic_yn`)와 입퇴장 시각 추적. 방장 제어 이력은 별도 감사 테이블로 나중에 추가 가능.
- `msg_call_quality_stat`: `call_id` → `room_id` (통화 세션은 room 단위)

---

## 6. 보안·운영 체크리스트

- [ ] **TURN 자격증명 서버 발급** — Pi 토큰 검증 후 TTL 1h 임시 발급, 클라이언트 하드코딩 절대 금지
- [ ] **TURN over TLS 443** 경로 개방(제한망 대비)
- [ ] **시그널링 서버 발신** — `broadcastToRoom` service key 경유로 신원 보증(클라 직접 broadcast 차단)
- [ ] **piFetch 인증** — 모든 음성 API에 X-Pi-Token 이중 경로, `getSessionUser()`/`getRoomMember()` 서버 검증
- [ ] **방장 권한 검증** — `mic-control` API에서 `getRoomMember()`로 OWNER/ADMIN만 확인
- [ ] **mic_mute_force 브로드캐스트** — 서버 `broadcastToRoom` 경유(클라이언트 직접 신호 차단)
- [ ] **4명 마이크 제한 서버 강제** — `/api/voice/rooms/[roomId]/join`에서 `mic_yn` 강제(초과 시 청취 전용)
- [ ] **redirect 금지** — 음성채널 페이지 null 세션 시 ClientVoiceChannel 위임
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

**향후 설계(미적용)**: 기존 2PC 결제 패턴 재사용. 메인넷 단건 결제(`metadata.type='VOICE_CALL_CREDIT'`, 예: 일일 무료 10분 + 30분권 X Pi). `PLAN_CAPS`에 `voiceDailyFreeMinutes` 추가, `getVoiceDailyQuota()`로 `msg_call_participant` 당일 `duration_sec` 합산(참여자별). 활성화 시점은 S3에서 사용량 데이터로 결정. N:N 구조에서는 각 참여자가 독립적으로 카운트됨(예: 3명이 10분 통화 → 각 30분 사용으로 계산).

---

## 9. 로드맵·마일스톤

| 단계 | 내용 | Go/No-Go |
|---|---|---|
| **S0 스파이크** | Pi Browser 실기기 마이크 권한 + `getUserMedia` 동작 확인 | iOS/Android Pi Browser 마이크 캡처 성공 여부 |
| **S1 N:N 기본** | 시그널링(기존 broadcast) + 관리형 TURN 발급 + 1~4명 메시 UI + 방장 마이크 제어 + `msg_call_participant` | 1인 대기·2~4명 연결·퇴장, 방장 원격 제어, 품질 로깅 적재 |
| **S2 품질 검증** | `getStats()` packet loss/jitter/RTT·TURN 경유율 수집·분석 | 릴레이 비율·품질이 자체 coturn 전환 필요성 판단 |
| **S3 확장 결정** | LiveKit 오디오 SFU(5인+) / 결제 게이팅 활성화(음성 크레딧) | 베타 사용량·비용·5인+ 요청 추이 |

---

## 10. 미해결 질문/리스크

- **iOS Pi Browser WebRTC 제약** *(최우선)*: WKWebView `getUserMedia` 지원 여부가 S0 스파이크의 go/no-go 핵심 — 미지원 시 전체 재검토
- **관리형 TURN 무료 티어 한도**: 베타 트래픽 초과 시 자체 coturn 조기 전환
- **시그널링 채널 분리**: S1은 `room:${roomId}` 재사용. 통화 트래픽이 카페 broadcast와 섞이는 부하는 S2에서 측정 후 `voice:${roomId}` 분리 검토
- **동시 다중 음성채널**: 사용자가 여러 채팅방의 음성채널에 동시 입장 가능한지? 초안: 1명 = 1개 활성 음성채널만 허용(이미 활성이면 새 join 실패)
- **N:N 메시 피어 최대**: 4명 이하에서는 peer count = (n-1). 5명 이상은 음성채널 입장 불가(또는 청취 전용). 테스트 후 상한 조정 가능.
- **결정 필요(추후)**: 관리형 TURN 업체 선정(Metered/Twilio/Cloudflare), 무료 통화 시간·추가권 가격(S3)

---

## 11. 트러블슈팅 (실전 해결 사례)

### 사례 #1 — 모바일 실기기 간 "입장·상대 표시는 OK, 음성만 안 들림" (2026-06-12 해결 ✅)

**증상**: Pi Browser 실기기 2대(모바일)에서 음성채널 입장·참여자 목록 표시·마이크 권한은 모두 정상인데, **상대 음성이 전혀 전달되지 않음**.

**근본 원인 — 2가지가 겹침**:

| # | 레이어 | 원인 |
|---|---|---|
| 1 | **미디어 경로** | `TURN_HOST`/`TURN_SECRET` 미설정 → STUN-only 폴백. 모바일 캐리어 **CGNAT(대칭 NAT)** 양쪽은 STUN만으로 P2P 성립 불가 → ICE `failed`, 미디어(RTP) 0바이트 |
| 2 | **재생 레이어** | `RemoteAudio`가 `display:none`(Tailwind `hidden`) + `autoPlay` 의존 → iOS WebView(Pi Browser)에서 **숨긴 미디어 재생 차단 + autoplay 정책으로 조용한 실패** |

**진단 방법 (두 갈래 구분)** — 음성채널 패널 하단의 빨간 ⚠️ 진단 메시지로 판별:
- **빨간 "NAT 통과 불가" 메시지 O** → ICE 연결 실패 = TURN 문제(#1)
- **메시지 없이 무음** → 연결은 됐는데 재생 차단 = RemoteAudio 문제(#2)

**해결**:
1. **TURN relay 확보** (`api/voice/turn-credentials`, 커밋 `4797854`): TURN 미설정 시 폴백에 무료 공개 TURN(Metered Open Relay) 추가 → 모바일 CGNAT 간 relay 경로 확보. *임시·검증용 — 음성은 DTLS-SRTP 암호화 중계되나 대역폭·가동률 무보장.*
2. **원격 오디오 재생** (`voice-channel-panel.tsx` `RemoteAudio`, 커밋 `ecc1a38`): `display:none` → 화면 밖 1px 배치(`position:fixed; left:-9999`), `autoPlay` 의존 → 명시적 `el.play()` + autoplay 차단 시 다음 사용자 터치/클릭에서 1회 재개.
3. **진단 가시화** (`use-voice-channel.ts`, 커밋 `4797854`): ICE `connectionState === 'failed'` 시 화면 진단 메시지 + `restartIce()` 자동 재시도, `connected` 복구 시 메시지 해제.

**운영 권장 (필수)**: 무료 공개 TURN은 검증용. 모바일 운영은 **전용 TURN**을 `TURN_HOST`/`TURN_SECRET`로 설정(코드 무수정 오버라이드):
- **자체 coturn**(VPS): `static-auth-secret`=`TURN_SECRET`, `use-auth-secret` — 코드의 HMAC 패턴(`username=만료:userId`, `credential=HMAC-SHA256(secret, username)`)과 정확히 호환
- Cloudflare Realtime TURN(무료 1TB/월): 자격증명 API 방식이라 코드 일부 수정 필요

**교훈**:
- WebRTC "연결됐는데 무음"은 **미디어 경로(TURN)** 와 **재생 레이어(autoplay/display:none)** 를 항상 분리해 진단한다.
- 참여자 목록 표시(GET API)는 **시그널링 broadcast 동작을 보장하지 않는다** — 표시가 돼도 offer/answer 교환은 별도 검증.
- 모바일↔모바일은 거의 항상 CGNAT → **TURN relay가 사실상 필수**, STUN-only는 동일 네트워크에서만 동작.

---

## 자기검증 체크리스트 (제출 전 점검 — 완료)

- [x] Pi Browser 쿠키 미저장 제약 위반 없음(piFetch + X-Pi-Token, redirect 금지)
- [x] TURN 자격증명 클라이언트 비노출(서버 발급 + Pi 토큰 검증)
- [x] TURN over TLS 443 경로 포함
- [x] 테이블 설계 DA 표준 준수(시스템 컬럼 4개, del_yn/del_dtm, TIMESTAMPTZ, 논리삭제)
- [x] 모바일 네트워크 전환·UDP 차단 시나리오 포함
- [x] 결제 게이팅 향후 설계가 기존 2PC 패턴과 일관(N:N 참여자별 독립 집계)
- [x] N:N 다:다 구조 명확화(1~4명 Full Mesh, 방장 제어 권한)
- [x] 1인 대기 로직 설명(혼자도 채널 입장, 다른 피어 join 시 자동 offer)
- [x] 방장 마이크 제어 API 보안(서버 검증, broadcast 경유, 4명 제한 재확인)
- [x] `msg_call_participant` 신규 테이블로 참여자 추적(대체 이전 1:1 caller/callee)
