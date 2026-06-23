# PRD_13_MSG.md — 판매자 주문 알림 (Telegram)

> **작성일**: 2026-06-18
> **버전**: v1.1
> **상태**: ✅ Phase 1 구현 완료·실기기 연동 확인 (2026-06-18), Phase 2 기획
> **작성자**: 아소카 (Telegram Order Notifier Design Specialist)
> **검토**: 아나킨 마스터님

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| v1.1 | 2026-06-18 | **Phase 1 구현 완료·실기기 연동 확인** — `sql/064`(Outbox+sys_user Telegram 컬럼, DA 승인)·`markEscrow` enqueue·`telegram.ts`/`mps-noti.ts` 디스패처·온보딩(딥링크+webhook)·안읽은 뱃지·**결제완료 즉시 발송**(cron 의존 제거)·인앱 Realtime 토스트 제스처 분리·보안 하드닝(webhook fail-closed·재바인딩 차단). 설계 대비: webhook을 Phase 1로 앞당김, cron 주기발송→즉시발송+cron 안전망. (ROADMAP Phase 18) | 아소카 |
| v1.0 | 2026-06-18 | **Phase 1 설계 완료** — Outbox 패턴 + HTML parse_mode sendMessage/sendPhoto 템플릿 + url 딥링크 버튼 + Realtime Webhook 준비(Phase 2) | 아소카 |

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [용어 정의](#2-용어-정의)
3. [핵심 설계 원칙](#3-핵심-설계-원칙)
4. [기능 요건 (FR)](#4-기능-요건-fr)
5. [비기능 요건 (NFR)](#5-비기능-요건-nfr)
6. [데이터 모델](#6-데이터-모델)
7. [메시지 템플릿 명세](#7-메시지-템플릿-명세)
8. [인라인 버튼 및 딥링크](#8-인라인-버튼-및-딥링크)
9. [판매자 온보딩 플로우](#9-판매자-온보딩-플로우)
10. [발송 아키텍처 (3계층)](#10-발송-아키텍처-3계층)
11. [Webhook & 콜백 (Phase 2)](#11-webhook--콜백-phase-2)
12. [환경변수 및 설정](#12-환경변수-및-설정)
13. [에러 처리 및 재시도](#13-에러-처리-및-재시도)
14. [보안 및 PII 정책](#14-보안-및-pii-정책)
15. [테스트 및 검증](#15-테스트-및-검증)
16. [마일스톤 및 로드맵](#16-마일스톤-및-로드맵)
17. [미해결 이슈](#17-미해결-이슈)

---

## 1. 프로젝트 개요

### 1-1. 제품명

**Order Notifier (주문 알림 시스템)** — Telegram Bot API 기반 판매자 즉시 알림

### 1-2. 한 줄 요약

cafe.pi에서 상품 주문이 확정되는 순간, **판매자의 Telegram**으로 주문 내역(상품명·금액·구매자별칭·픽업방식·주문시각)을 즉시 푸시로 알리고, 앱 내 "받은 주문" 화면에는 읽지 않은 뱃지로 최종 보장한다.

### 1-3. 배경 및 목적

#### 신뢰의 뿌리 = 안내성(Notification Assurance)

판매자가 가장 두려워하는 상황은 **"주문이 들어왔는데 몰랐다"**는 것이다. 이를 근원적으로 차단하기 위해:

1. **Outbox 패턴**: 주문 확정 트랜잭션과 함께 알림 레코드를 DB에 기록 → "주문 들어옴·알림 누락" 불가능
2. **3계층 발송**: 동기(Realtime broadcast) + 비동기(Telegram push) + Pull(앱 안읽은 뱃지)로 다층 보장
3. **멱등성**: 몇 번 재시도해도 판매자는 **1회만** 도달 (orderId로 중복 방지)

#### Pi Browser 제약 우회

Pi WebView는:
- Web Push API / Service Worker 미지원
- 쿠키 저장 불가
- 실시간 알림 수신이 기술적으로 약함

→ **외부 메신저(Telegram)를 주 채널**로 삼아 Pi Browser 제약을 정면 우회한다.

### 1-4. 핵심 가치

| # | 가치 | 설명 |
|---|------|------|
| 1 | **신뢰 보장** | Outbox 패턴 + 3계층 발송으로 "주문 누락 걱정 0" |
| 2 | **즉시 반응** | Telegram push로 앱 미실행 중에도 폰 알림 도달 |
| 3 | **간단 셋업** | 판매자 1회 연동으로 이후 자동 발송 |
| 4 | **글로벌 지원** | Telegram 사용처가 많은 국가들에 대응 (Phase 1) / 카카오톡 별도 추가(Phase 2) |
| 5 | **PII 절제** | 본문엔 상품·금액·별칭만, 민감정보(실명·전화·주소)는 앱 딥링크로 |

---

## 2. 용어 정의

| 용어 | 정의 |
|------|------|
| **Outbox** | 발송 대기 큐. 주문 확정 시 INSERT, 발송 완료 시 UPDATE(`sent_yn='Y'`) |
| **Phase 1** | 단방향 발송 (이 PRD 범위) — sendMessage/sendPhoto만 사용 |
| **Phase 2** | 양방향 인터랙션 — Telegram Webhook 수신으로 "준비 시작"/"거절" 버튼 콜백 처리 |
| **Realtime** | Supabase Realtime broadcast — 앱 실행 중이면 즉시 수신 (Websocket) |
| **Telegram Bot API** | Telegram이 제공하는 REST API, 봇→사용자 메시지 발송 |
| **Chat ID** | 개별 Telegram 사용자의 고유 ID. 메시지 발송 대상 식별자 |
| **Inline Keyboard** | Telegram 메시지에 붙는 인터랙티브 버튼 배열 (`inline_keyboard`) |
| **Callback Data** | 버튼 클릭 시 전송되는 데이터 (최대 64바이트) |
| **Parse Mode** | 메시지 본문 포맷: `HTML` 또는 `MarkdownV2` |
| **Meliodate** | 구매자가 주문 시 입력한 별칭/닉네임 (실명 아님) |
| **멱등키** | 중복 방지 고유값. 여기선 `order_id` |

---

## 3. 핵심 설계 원칙

### 3-1. Outbox 패턴 (신뢰의 기초)

```
주문 확정 트랜잭션
    │
    ├─ [1] mps_order: order_st_cd = 'ORDERED' 또는 'TRADING' 으로 전환
    ├─ [2] msg_noti_outbox: INSERT (동일 트랜잭션 내)
    │       {order_id, recv_user_id, noti_body(스냅샷), sent_yn='N', ...}
    │
    └─ COMMIT → "주문 확정 + 알림 큐 동시 기록" 원자성 보장

발송 디스패처 (외부)
    │
    ├─ SELECT * FROM msg_noti_outbox WHERE sent_yn='N' LIMIT 1000
    ├─ 각 행마다 Telegram sendMessage 호출
    │   (실패 → retry_cnt 증가, failed_reason 기록)
    │   (성공 → UPDATE sent_yn='Y', sent_dtm=NOW())
    │
    └─ 멱등성: order_id 기준으로만 1회 발송
```

**이 설계로 보장하는 것**:
- 트랜잭션 실패 = 주문·알림 모두 롤백 (일관성)
- 발송 실패 = outbox에 대기 (재시도 자동)
- 재시도 몇 번 = 판매자는 1회만 수신 (중복 없음)

### 3-2. 3계층 발송 아키텍처

1. **Layer 1 (즉시 동기)**: `markEscrow()` 직후 → `supabase.realtime.broadcast()` → 앱 실행 중이면 즉시 Websocket 수신 → 소리·뱃지·alert
2. **Layer 2 (비동기 push)**: Telegram sendMessage (5~10초 안에) → 앱 미실행 중에도 폰 알림 도달
3. **Layer 3 (pull 안전망)**: 판매자 앱 "받은 주문" 화면의 안읽은 뱃지 + 주문 카드 → app re-open 시 DB pull로 재확인

**목표**: "세 채널 중 하나 이상 반드시 도달"

### 3-3. 트리거 지점 = markEscrow() 호출 시점

```typescript
// src/lib/mps-order.ts — 라인 188~244
export async function markEscrow(
  orderId: string,
  buyerId: string,
  txid: string,
  amountPi: number,
)
```

**호출 시점**: `/api/payments` 또는 `/api/chat/subscribe` 등 결제 성공 콜백 핸들러가 `markEscrow()`를 호출할 때

**흐름**:
```
결제 완료(pi_pymnt.payment_status = 'COMPLETED')
  ↓
  handlePaymentComplete() [API 라우트]
  ↓
  markEscrow(orderId, buyerId, txid, amountPi)
  ├─ UPDATE mps_order: order_st_cd = 'ORDERED' (오프라인) 또는 'TRADING' (P2P)
  ├─ INSERT msg_noti_outbox ← [우리가 추가]
  └─ INSERT mps_txn_hist: ESCROW_IN 기록
  ↓
  [Layer 1] supabase.realtime.broadcast('order:new', {...})
  [Layer 2] Telegram sendMessage (outbox 비동기 처리)
```

**중요**: PENDING 상태에서는 발송 금지. ORDERED/TRADING 확정 시점에만 발송.

### 3-4. Parse Mode = HTML (Phase 1 권장)

| 모드 | 특징 | 이스케이프 |
|------|------|-----------|
| **HTML** | `<b>굵게</b>`, `<i>기울임</i>`, `<a href="...">링크</a>` | 단순 (`<`, `>`, `&` 3개만) |
| MarkdownV2 | `*굵게*`, `_기울임_`, `[링크](URL)` | 복잡 (`_*[]()~\`>#+−=\|{}.!` 모두 escape) |

**선택 이유**: 동적 값(상품명·금액·시각)이 많으므로 HTML이 이스케이프 오버헤드 적음 → 버그 위험 낮음.

### 3-5. 딥링크 = 인증된 앱 내 상세화면

```
Telegram 메시지의 "주문 확인하기" 버튼
  ↓ 클릭
  https://cafe.pi/{locale}/orders/{orderId}
  ↓
  [Pi Browser 또는 일반 브라우저]
  ├─ URL 로드 + locale 매칭 (next-intl)
  ├─ getSessionUser() 검증 (쿠키 또는 X-Pi-Token 헤더)
  └─ OrderDetail 페이지 렌더
      ├─ 고객 실명·전화·주소 표시
      ├─ "준비 시작" 버튼 (= markPreparing()) [Phase 1은 수동]
      ├─ "거절" 버튼 (= markCancelled()) [Phase 1은 수동]
      └─ 거래 상태 타임라인
```

**PII 정책**: 본문에 실명·전화·주소 없고, 앱 딥링크로만 확인 → Telegram 외부 서버에 민감정보 노출 안 함.

---

## 4. 기능 요건 (FR)

### FR-MSG-01: Outbox 테이블 생성 및 관리

**설명**: 주문 발생 시 alert 레코드를 DB에 영속화

**범위**: Phase 1

**상세**:
- 테이블명: `msg_noti_outbox` (**확정 2026-06-18** — 메시지(msg) 도메인. DA 표준단어 NOTI(알림)·OUTBOX(발송대기함) 등록 필요)
- 시스템 컬럼 4개(regr_id, reg_dtm, modr_id, mod_dtm) + 논리 삭제(del_yn) 필수
- 컬럼:
  - `noti_id` (UUID, PK)
  - `order_id` (FK → mps_order.order_id, 멱등키)
  - `recv_user_id` (FK → sys_user.id, 판매자)
  - `noti_chnl_cd` (CHAR(10): TELEGRAM / REALTIME / KAKAO, Phase 1은 TELEGRAM/REALTIME만)
  - `noti_body` (TEXT, JSON 또는 plain text 스냅샷) — **주문 시점의 상품명·금액·구매자별칭·픽업 스냅샷**
  - `sent_yn` (CHAR(1), 기본 'N')
  - `sent_dtm` (TIMESTAMPTZ, 발송 완료 시각)
  - `retry_cnt` (INT, 기본 0)
  - `fail_reason` (TEXT, 에러 메시지)
  - `telegram_msg_id` (BIGINT, Phase 2에서 사용 — 콜백 대응)

**인덱스**: `idx_msg_noti_outbox_sent_yn`, `idx_msg_noti_outbox_order_id`

### FR-MSG-02: markEscrow() 호출 시 Outbox 자동 INSERT

**설명**: 결제 완료 → 주문 상태 전환 시 동일 트랜잭션으로 알림 레코드 생성

**범위**: Phase 1

**수정 파일**: `src/lib/mps-order.ts` — `markEscrow()` 함수 내

**상세**:
```typescript
export async function markEscrow(
  orderId: string,
  buyerId: string,
  txid: string,
  amountPi: number,
) {
  const db = getSupabaseAdmin()
  
  // [기존] mps_order 상태 전환
  const { data: order } = await db
    .from('mps_order')
    .update({
      order_st_cd: nextState,  // 'ORDERED' 또는 'TRADING'
      escrow_txid: txid,
      modr_id: buyerId,
      mod_dtm: new Date().toISOString(),
    })
    .eq('order_id', orderId)
    // ... 
    .maybeSingle()
  
  if (!order) return null
  
  // [신규] msg_noti_outbox INSERT — 판매자(seller_id) 조회 + 스냅샷 구성
  const { data: itemData } = await db
    .from('mps_item')
    .select('item_nm, seller_id')
    .eq('item_id', order.item_id)
    .maybeSingle()
  
  const notiBody = {
    order_id: orderId,
    item_nm: itemData?.item_nm,
    order_price_pi: order.order_price_pi,
    buyer_alias: buyerId,  // 구매자 별칭(실명 아님)
    order_mthd_cd: order.order_mthd_cd || 'UNKNOWN',
    reg_dtm: order.reg_dtm,
  }
  
  await db.from('msg_noti_outbox').insert({
    order_id: orderId,
    recv_user_id: itemData?.seller_id,
    noti_chnl_cd: 'TELEGRAM',
    noti_body: JSON.stringify(notiBody),
    sent_yn: 'N',
    regr_id: buyerId,
    modr_id: buyerId,
  })
  
  return order as MpsOrder
}
```

**멱등성**: `(order_id, noti_chnl_cd)` 복합 Unique Key는 나중에 추가. 지금은 발송 로직에서 체크.

### FR-MSG-03: Telegram 봇 토큰 환경변수 관리

**설명**: 봇 토큰을 안전하게 환경변수로 관리

**범위**: Phase 1

**상세**: `src/env.ts`에 정의, `.env.local`(커밋 금지)과 `.env.example`(예시값)에 모두 기재

### FR-MSG-04: Layer 1 - Realtime Broadcast

**설명**: markEscrow() 직후 Supabase Realtime broadcast로 앱 실행 중 판매자에게 즉시 알림

**범위**: Phase 1

**상세**:
```typescript
// markEscrow() 후 추가
supabase.realtime.broadcast('order:new', {
  order_id: orderId,
  seller_id: itemData.seller_id,
  item_nm: itemData.item_nm,
  order_price_pi: order.order_price_pi,
  buyer_alias: buyerId,
  timestamp: new Date().toISOString(),
})
```

**클라이언트 리스너**:
```typescript
// src/components/seller/SellerOrderNotifier.tsx 신규
useEffect(() => {
  const subscription = supabase
    .channel(`order:${user.id}`)
    .on('broadcast', { event: 'order:new' }, (payload) => {
      // 앱 포그라운드 → 즉시 sound + alert
      playNotificationSound()
      showBadge('+1')
    })
    .subscribe()
  return () => subscription.unsubscribe()
}, [user.id])
```

### FR-MSG-05: Layer 2 - Telegram SendMessage (Async Dispatcher)

**설명**: Outbox의 sent_yn='N' 행을 읽어 Telegram API로 발송

**범위**: Phase 1

**상세**:
- 엔드포인트: `/api/cron/order-notifier` (기존 `/api/cron/order-autocomplete`에 통합 또는 분리)
- 트리거: Cron Job (현재 1회/day, Vercel Pro 전환 후 10분 간격 + 동기 발송)
- 로직:
  ```typescript
  export async function notifyOrderViaOutbox() {
    const pending = await getSupabaseAdmin()
      .from('msg_noti_outbox')
      .select('*')
      .eq('sent_yn', 'N')
      .eq('del_yn', 'N')
      .lt('retry_cnt', 3)
      .limit(1000)
    
    for (const row of pending.data || []) {
      const telegramRes = await sendTelegramMessage(
        row.recv_user_id,  // 판매자 chat_id
        row.noti_body,
      )
      
      if (telegramRes.ok) {
        await getSupabaseAdmin()
          .from('msg_noti_outbox')
          .update({
            sent_yn: 'Y',
            sent_dtm: new Date().toISOString(),
            telegram_msg_id: telegramRes.result.message_id,
            modr_id: 'SYSTEM',
          })
          .eq('noti_id', row.noti_id)
      } else {
        await getSupabaseAdmin()
          .from('msg_noti_outbox')
          .update({
            retry_cnt: row.retry_cnt + 1,
            fail_reason: telegramRes.error,
            modr_id: 'SYSTEM',
          })
          .eq('noti_id', row.noti_id)
      }
    }
  }
  ```

### FR-MSG-06: Layer 3 - Pull (앱 내 안읽은 뱃지)

**설명**: 판매자가 앱을 열었을 때 "받은 주문" 화면에서 미확인 주문 카드 + 뱃지 표시

**범위**: Phase 1

**상세**:
- 쿼리: `SELECT * FROM msg_noti_outbox WHERE recv_user_id = ? AND viewed_yn = 'N' AND del_yn = 'N'`
- UI: "받은 주문(3)" ← 안읽은 개수 배지
- 카드 클릭 → `OrderDetail` 페이지 → viewed_yn = 'Y' 로 UPDATE

### FR-MSG-07: Telegram 판매자 연동 (온보딩)

**설명**: 판매자가 처음 Telegram 봇 연동을 1회 수행

**범위**: Phase 1

**상세**: 아래 § 9 "판매자 온보딩 플로우" 참조

### FR-MSG-08: 메시지 템플릿 — sendMessage

**설명**: Telegram HTML parse_mode 기반 주문 알림 메시지

**범위**: Phase 1

**상세**: 아래 § 7 "메시지 템플릿 명세" 참조

### FR-MSG-09: 메시지 템플릿 — sendPhoto (선택)

**설명**: 상품 이미지가 있으면 사진과 함께 발송

**범위**: Phase 1 (선택)

**상세**: 아래 § 7 참조

### FR-MSG-10: 딥링크 버튼 — cafe.pi/orders/{orderId}

**설명**: Telegram 메시지의 URL 버튼이 cafe.pi 앱 주문 상세로 연결

**범위**: Phase 1

**상세**: 아래 § 8 "인라인 버튼 및 딥링크" 참조

---

## 5. 비기능 요건 (NFR)

### NFR-MSG-01: 멱등성 (Idempotency)

**설명**: 발송 로직이 몇 번 재시도되어도 판매자는 **1회만** 알림 수신

**구현**: 
- `order_id` + `noti_chnl_cd` 복합 unique key
- Outbox의 `sent_yn='Y'` 행은 재발송 제외

### NFR-MSG-02: 스냅샷 저장 (Immutability)

**설명**: 주문 생성 시점의 상품명·금액을 `noti_body`에 저장. 나중에 상품명 변경되어도 알림은 원래 값 유지

**구현**: `noti_body`는 JSON으로 주문 시점의 값들(item_nm, order_price_pi, buyer_alias, order_mthd_cd, reg_dtm) 스냅샷

### NFR-MSG-03: Pi Browser WebView 호환성

**설명**: Pi Browser는 Web Push/Service Worker 미지원 → Telegram 외부 push 필수

**구현**: Telegram을 주 채널, Realtime broadcast는 보조

### NFR-MSG-04: Telegram API 레이트 리밋 대응 (429)

**설명**: Telegram API는 초당 30 req/sec 제한. 대량 발송 시 재시도

**구현**: 아래 § 13 "에러 처리 및 재시도" 참조

### NFR-MSG-05: 신뢰할 수 있는 발송 순서

**설명**: 다중 주문 발생 시 발송 순서는 `reg_dtm` 오래된 순 (FIFO)

**구현**: Outbox SELECT 시 `ORDER BY reg_dtm ASC`

### NFR-MSG-06: 다국어 (i18n) 지원

**설명**: 판매자 locale에 따라 메시지 언어 전환

**범위**: Phase 2

**상세**: 판매자 `sys_user.prfrrd_lcl` 기준 → `src/messages/{locale}.json`에서 로드

---

## 6. 데이터 모델

### 6-1. msg_noti_outbox 테이블 (초안)

**주제영역**: msg (메시징)

**약어**: noti_outbox (NOTI, OUTBOX는 표준사전 미등재이므로 DA 승인 필요)

**표준용어**: `noti_id`, `recv_usr_id`, `noti_chnl_cd`, `sent_yn`, `sent_dtm`, `retry_cnt`, `fail_reason`

```sql
CREATE TABLE IF NOT EXISTS msg_noti_outbox (
  -- PK
  noti_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- FK & 멱등키
  order_id UUID NOT NULL REFERENCES mps_order(order_id) ON DELETE CASCADE,
  recv_usr_id UUID NOT NULL REFERENCES sys_user(id) ON DELETE CASCADE,
  
  -- 알림 채널 & 본문
  noti_chnl_cd VARCHAR(10) NOT NULL DEFAULT 'TELEGRAM'
    CHECK (noti_chnl_cd IN ('TELEGRAM', 'REALTIME', 'KAKAO')),
  noti_body TEXT NOT NULL,  -- JSON 스냅샷: {order_id, item_nm, order_price_pi, buyer_alias, order_mthd_cd, reg_dtm}
  
  -- 발송 상태
  sent_yn CHAR(1) NOT NULL DEFAULT 'N' CHECK (sent_yn IN ('Y', 'N')),
  sent_dtm TIMESTAMPTZ,
  retry_cnt INT NOT NULL DEFAULT 0,
  fail_reason TEXT,
  
  -- Telegram Phase 2
  telegram_msg_id BIGINT,  -- Phase 2: 콜백 대응용
  
  -- 열람 상태 (Pull 레이어)
  viewed_yn CHAR(1) NOT NULL DEFAULT 'N' CHECK (viewed_yn IN ('Y', 'N')),
  viewed_dtm TIMESTAMPTZ,
  
  -- 시스템 컬럼
  regr_id TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- 논리 삭제
  del_yn CHAR(1) NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ,
  
  -- 인덱스
  UNIQUE (order_id, noti_chnl_cd),
  INDEX idx_msg_noti_outbox_sent_yn (sent_yn, del_yn),
  INDEX idx_msg_noti_outbox_recv_usr_id (recv_usr_id, viewed_yn)
) PARTITION BY RANGE (YEAR(reg_dtm)) (
  -- 월별 파티션 (성능 최적화)
);

-- mod_dtm 자동 갱신 트리거
CREATE TRIGGER trg_msg_noti_outbox_mod_dtm
BEFORE UPDATE ON msg_noti_outbox
FOR EACH ROW
SET NEW.mod_dtm = CURRENT_TIMESTAMP;
```

**DA 승인 대기**: 표준사전에 `NOTI` / `OUTBOX` 등록 필요

### 6-2. 판매자 Telegram 매핑 (확정 2026-06-18 — 옵션 A: `sys_user` 컬럼 확장)

판매자 1인 = Telegram 계정 1개 단순 매핑이므로 별도 테이블 없이 `sys_user`에 컬럼을 확장한다. 조인 불필요·구현 단순. (다중 채널이 늘어 컬럼이 비대해지면 Phase 3에서 별도 매핑 테이블로 분리 검토)

```sql
-- DA-APPROVED 대기: tlgm 표준단어(Telegram) 등록 필요
ALTER TABLE sys_user
  ADD COLUMN IF NOT EXISTS tlgm_chat_id  BIGINT,                     -- Telegram chat_id (Telegram 발급, 위변조 불가)
  ADD COLUMN IF NOT EXISTS tlgm_conn_yn  CHAR(1) NOT NULL DEFAULT 'N'  -- 연동 여부
    CHECK (tlgm_conn_yn IN ('Y', 'N')),
  ADD COLUMN IF NOT EXISTS tlgm_conn_dtm TIMESTAMPTZ;                 -- 연동 완료 시각

COMMENT ON COLUMN sys_user.tlgm_chat_id IS 'Telegram chat_id — 주문 알림 발송 대상';
COMMENT ON COLUMN sys_user.tlgm_conn_yn IS 'Telegram 봇 연동 여부(Y/N)';
```

> 발송 시 `WHERE tlgm_conn_yn = 'Y' AND tlgm_chat_id IS NOT NULL`로 미연동 판매자를 거른다(이 경우 Realtime+Pull 안전망만 동작).

---

## 7. 메시지 템플릿 명세

### 7-1. 기본 정보 요소 (필수)

모든 메시지는 다음을 포함해야 한다:

| 요소 | 예시 | 설명 |
|------|------|------|
| 헤더 | 🛒 새 주문이 들어왔습니다 | 이모지 + 굵은 글자 + 한국어 |
| 상품명 | 아이스 아메리카노 | 정확한 상품명 (스냅샷) |
| 매장명 | (cclemong 매장) | 판매자 매장명 (기울임) |
| 금액 | 17.3 π | Pi 단위, 소수점 1자리 |
| 구매자 | anakin2 | 구매자 별칭 (실명 아님) |
| 픽업 | 매장 수령 | DINE_IN / PICKUP / DELIVERY |
| 주문시각 | 2026-06-18 09:49 | YYYY-MM-DD HH:mm (판매자 로컬 시간) |

### 7-2. 메시지 템플릿 (HTML parse_mode)

#### 기본형 (상품 1개, 오프라인 매장)

```html
<b>🛒 새 주문이 들어왔습니다</b>

<b>📦 상품</b>   아이스 아메리카노
<b>🏪 매장</b>   cclemong 매장
<b>💰 금액</b>   17.3 π
<b>👤 구매자</b>  anakin2
<b>📍 픽업</b>   매장 수령
<b>🕐 시각</b>   2026-06-18 09:49

[ 주문 확인하기 ]
```

#### HTML 이스케이프 처리

Telegram HTML에서 이스케이프 필요한 문자:

| 문자 | 이스케이프 | 사용처 |
|------|-----------|--------|
| `<` | `&lt;` | 꺾쇠 |
| `>` | `&gt;` | 꺾쇠 |
| `&` | `&amp;` | 앰퍼샌드 (가장 중요!) |
| `"` | 없음 | HTML 속성은 따옴표 불필요 (text 본문에만) |

**주의**: 상품명(예: "AT&T")에 `&`가 포함되면 `AT&amp;T`로 변환 필수.

**TypeScript 이스케이프 함수**:
```typescript
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// 사용
const body = `
<b>🛒 새 주문이 들어왔습니다</b>

<b>📦 상품</b>   ${escapeHtml(itemName)}
<b>💰 금액</b>   ${amountPi.toFixed(1)} π
<b>👤 구매자</b>  ${escapeHtml(buyerAlias)}
`
```

### 7-3. 페이로드 예시 (sendMessage)

```json
{
  "method": "sendMessage",
  "chat_id": 123456789,
  "text": "<b>🛒 새 주문이 들어왔습니다</b>\n\n<b>📦 상품</b>   아이스 아메리카노\n<b>🏪 매장</b>   cclemong 매장\n<b>💰 금액</b>   17.3 π\n<b>👤 구매자</b>  anakin2\n<b>📍 픽업</b>   매장 수령\n<b>🕐 시각</b>   2026-06-18 09:49",
  "parse_mode": "HTML",
  "reply_markup": {
    "inline_keyboard": [
      [
        {
          "text": "📲 주문 확인하기",
          "url": "https://cafe.pi/ko/orders/550e8400-e29b-41d4-a716-446655440000"
        }
      ]
    ]
  }
}
```

**URL 구조**: `https://cafe.pi/{locale}/orders/{orderId}`
- `{locale}`: 판매자 `sys_user.prfrrd_lcl` (기본 ko)
- `{orderId}`: UUID

### 7-4. 페이로드 예시 (sendPhoto — 선택)

상품 이미지가 있으면 **sendPhoto** 사용:

```json
{
  "method": "sendPhoto",
  "chat_id": 123456789,
  "photo": "https://cdn.example.com/product/ice-coffee-001.jpg",
  "caption": "<b>🛒 새 주문이 들어왔습니다</b>\n\n<b>📦 상품</b>   아이스 아메리카노\n<b>🏪 매장</b>   cclemong 매장\n<b>💰 금액</b>   17.3 π\n<b>👤 구매자</b>  anakin2\n<b>📍 픽업</b>   매장 수령\n<b>🕐 시각</b>   2026-06-18 09:49",
  "parse_mode": "HTML",
  "reply_markup": {
    "inline_keyboard": [
      [
        {
          "text": "📲 주문 확인하기",
          "url": "https://cafe.pi/ko/orders/550e8400-e29b-41d4-a716-446655440000"
        }
      ]
    ]
  }
}
```

**주의**: `caption` 길이는 **1024자 제한**. 초과하면 텍스트 부분을 별도 sendMessage로 분리.

---

## 8. 인라인 버튼 및 딥링크

### 8-1. 버튼 설계 (Phase 1 — URL only)

```json
{
  "reply_markup": {
    "inline_keyboard": [
      [
        {
          "text": "📲 주문 확인하기",
          "url": "https://cafe.pi/ko/orders/550e8400-e29b-41d4-a716-446655440000"
        }
      ]
    ]
  }
}
```

**버튼 기능**:
- 클릭 → cafe.pi 앱의 주문 상세 페이지 (`/orders/{orderId}`) 열기
- 앱 인증 경로: `/orders/[orderId]`에서 getSessionUser() 검증
- 판매자만 접근 가능 (구매자 주문 수정은 불가)

### 8-2. 딥링크 URL 구조

```
https://cafe.pi/{locale}/orders/{orderId}
```

**예**:
- 한국어: `https://cafe.pi/ko/orders/550e8400-e29b-41d4-a716-446655440000`
- 영어: `https://cafe.pi/en/orders/550e8400-e29b-41d4-a716-446655440000`

**locale 결정**: 판매자 `sys_user.prfrrd_lcl` (기본값 'ko')

### 8-3. OrderDetail 페이지 요구사항

- URL: `/app/[locale]/orders/[orderId]/page.tsx`
- 접근 제어: `getSessionUser()` 검증 → 판매자 또는 구매자인지 확인
- 표시 정보:
  - 상품명·가격
  - 고객 실명·전화·주소 (⭐ PII는 본문 불포함, 여기만)
  - 거래 상태 타임라인
  - "준비 시작", "거절" 등 액션 버튼 (Phase 1은 UI만, 실제 처리는 Phase 2)

---

## 9. 판매자 온보딩 플로우

### 9-1. 온보딩 목표

판매자가 Telegram 봇과 1회 연동 → `sys_user.tlgm_chat_id` 저장 + `tlgm_conn_yn = 'Y'` → 이후 주문 시 자동 발송

### 9-2. 흐름 (권장)

#### 옵션 A: 딥링크 + /start 페이로드 (권장)

```
1️⃣ 판매자가 cafe.pi 앱 → "내 정보" → "Telegram 알림 연동" 클릭
   ↓
2️⃣ 버튼: "Telegram 봇 열기"
   ↓
3️⃣ 딥링크로 Telegram 봇 오픈:
   https://t.me/cafe_pi_noti_bot?start=<auth_code>
   ↓
4️⃣ 봇이 /start 메시지 수신
   - 페이로드: auth_code (예: JWT 토큰, 12시간 유효)
   - 봇이 auth_code → cafe.pi API 검증 → chat_id 저장
   ↓
5️⃣ 봇 응답:
   "✅ Telegram 알림 연동되었습니다!"
   "이제 주문이 들어오면 여기로 알림을 받습니다."
   ↓
6️⃣ 판매자 앱으로 돌아감 (앱이 자동 폴링으로 연동 상태 확인)
```

#### 옵션 B: 인증 코드 입력 (대체)

```
1️⃣ 판매자 앱 → "내 정보" → 6자리 코드 생성 (예: ABC123)
   ↓
2️⃣ 판매자가 Telegram 봇에 "/verify ABC123" 입력
   ↓
3️⃣ 봇이 코드 검증 → chat_id 저장
   ↓
4️⃣ 앱이 폴링으로 연동 완료 확인
```

### 9-3. 백엔드 API (신규)

#### POST /api/auth/telegram/verify

```json
{
  "method": "POST",
  "endpoint": "/api/auth/telegram/verify",
  "auth": "Bearer <X-Pi-Token 또는 쿠키>",
  "body": {
    "telegram_uid": "@johndoe",
    "chat_id": 123456789,
    "auth_code": "jwt_token_..."
  },
  "response": {
    "ok": true,
    "message": "✅ Telegram 연동되었습니다"
  }
}
```

#### GET /api/auth/telegram/connection-status

```json
{
  "method": "GET",
  "endpoint": "/api/auth/telegram/connection-status",
  "response": {
    "connected": true,
    "chat_id": 123456789,
    "connected_at": "2026-06-18T09:00:00Z"
  }
}
```

### 9-4. UI 화면

**"내 정보" 페이지 섹션 신규**:
```
[ Telegram 알림 ]

현재 상태: ✅ 연동됨 (@johndoe, #123456789)
마지막 업데이트: 2026-06-18 09:00

[ 재연동 하기 ] 버튼 → 다시 온보딩 플로우 시작
```

또는 미연동 시:
```
[ Telegram 알림 ]

현재 상태: 🔕 미연동

[ Telegram 봇 열기 ] → https://t.me/cafe_pi_noti_bot?start=...
```

---

## 10. 발송 아키텍처 (3계층)

### 10-1. 전체 시퀀스 다이어그램

```
[구매자 결제 완료]
  │
  ├─ Pi Network 결제 API → 콜백 (COMPLETED)
  │
  ├─ handlePaymentComplete() [/api/payments 또는 /api/chat/subscribe]
  │  │
  │  ├─ [1] markEscrow(orderId, buyerId, txid, amountPi)
  │  │  ├─ UPDATE mps_order: order_st_cd = 'ORDERED' | 'TRADING'
  │  │  ├─ INSERT msg_noti_outbox
  │  │  └─ INSERT mps_txn_hist: ESCROW_IN
  │  │
  │  ├─ [2] supabase.realtime.broadcast('order:new', {...})
  │  │  └─ [앱 실행 중] → 즉시 소리+뱃지+alert
  │  │
  │  └─ return OrderConfirm UI
  │
  ├─ [Layer 2 Async] — Cron: /api/cron/order-notifier (5~60분 후)
  │  │
  │  ├─ SELECT FROM msg_noti_outbox WHERE sent_yn='N' AND retry_cnt < 3
  │  │
  │  └─ FOR EACH row:
  │     ├─ sendTelegramMessage(chat_id, template)
  │     ├─ UPDATE sent_yn='Y' (성공) | retry_cnt++ (실패)
  │     └─ 로깅
  │
  └─ [Layer 3 Pull] — 판매자 앱 "받은 주문" 화면
     ├─ SELECT FROM msg_noti_outbox WHERE recv_user_id=? AND viewed_yn='N'
     ├─ 안읽은 개수 배지 표시
     └─ 클릭 → viewed_yn='Y' UPDATE
```

### 10-2. 동기 발송 (markEscrow 직후)

**목적**: Realtime broadcast로 앱 실행 중 판매자에게 즉시 알림

**구현**:
```typescript
// src/lib/mps-order.ts — markEscrow() 말미
if (order) {
  // Realtime broadcast
  const channel = supabase.channel(`seller:${sellerId}`)
  await channel.send({
    type: 'broadcast',
    event: 'order:new',
    payload: {
      order_id: orderId,
      item_nm: itemData.item_nm,
      order_price_pi: order.order_price_pi,
      buyer_alias: buyerId,
      timestamp: new Date().toISOString(),
    },
  })
}
```

**클라이언트 리스너** (SellerDashboard 컴포넌트):
```typescript
useEffect(() => {
  const subscription = supabase
    .channel(`seller:${user.id}`)
    .on('broadcast', { event: 'order:new' }, (payload) => {
      // 로컬 상태 업데이트 + 소리 + alert
      setNewOrder(payload.payload)
      playNotificationSound()
      updateBadgeCount(prev => prev + 1)
    })
    .subscribe()
  
  return () => subscription.unsubscribe()
}, [user.id])
```

### 10-3. 비동기 발송 (Cron dispatcher)

**목적**: 앱 미실행 시에도 Telegram push로 폰 알림 도달

**구현 위치**: `/api/cron/order-notifier` (신규) 또는 `/api/cron/order-autocomplete` (기존 확장)

**Cron 설정**:
- 현재 (Vercel Hobby): 1회/day 또는 수동 트리거
- 목표 (Vercel Pro): 10분 간격 자동

**코드**:
```typescript
// src/app/api/cron/order-notifier/route.ts (신규)
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // Cron secret 검증
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await notifyOrderViaOutbox()
    return NextResponse.json({ ok: true, message: 'Notifier processed' })
  } catch (error) {
    console.error('Notifier error:', error)
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    )
  }
}

async function notifyOrderViaOutbox() {
  const db = getSupabaseAdmin()
  
  // sent_yn='N' 이면서 retry_cnt < 3인 행 조회
  const { data: pending, error } = await db
    .from('msg_noti_outbox')
    .select('*')
    .eq('sent_yn', 'N')
    .eq('del_yn', 'N')
    .lt('retry_cnt', 3)
    .order('reg_dtm', { ascending: true })
    .limit(1000)

  if (error) throw error

  for (const row of pending || []) {
    try {
      // 판매자의 Telegram chat_id 조회
      const { data: seller } = await db
        .from('sys_user')
        .select('id, tlgm_chat_id, prfrrd_lcl')
        .eq('id', row.recv_usr_id)
        .maybeSingle()

      if (!seller?.tlgm_chat_id) {
        // 연동 안 됨 — 건너뛰기
        console.warn(`User ${row.recv_usr_id} has no Telegram chat_id`)
        continue
      }

      // 메시지 본문 렌더링
      const notiBody = JSON.parse(row.noti_body)
      const html = renderOrderNotificationHtml(notiBody, seller.prfrrd_lcl)

      // Telegram API 호출
      const telegramRes = await sendTelegramMessage(
        seller.tlgm_chat_id,
        html,
        notiBody.order_id
      )

      if (telegramRes.ok) {
        // 성공 — sent_yn='Y' UPDATE
        await db
          .from('msg_noti_outbox')
          .update({
            sent_yn: 'Y',
            sent_dtm: new Date().toISOString(),
            telegram_msg_id: telegramRes.result?.message_id || null,
            modr_id: 'SYSTEM',
            mod_dtm: new Date().toISOString(),
          })
          .eq('noti_id', row.noti_id)

        console.log(`[OK] Order ${notiBody.order_id} notified to ${seller.id}`)
      } else {
        // 실패 — retry_cnt 증가
        const retryCount = row.retry_cnt + 1
        await db
          .from('msg_noti_outbox')
          .update({
            retry_cnt: retryCount,
            fail_reason: telegramRes.error_description || 'Unknown error',
            modr_id: 'SYSTEM',
            mod_dtm: new Date().toISOString(),
          })
          .eq('noti_id', row.noti_id)

        console.warn(
          `[FAIL] Order ${notiBody.order_id} attempt #${retryCount}: ${telegramRes.error_description}`
        )
      }
    } catch (err) {
      console.error(`Error processing notification ${row.noti_id}:`, err)
    }
  }
}

async function sendTelegramMessage(
  chatId: number,
  htmlText: string,
  orderId: string
): Promise<{ ok: boolean; result?: any; error_description?: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`

  const payload = {
    chat_id: chatId,
    text: htmlText,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '📲 주문 확인하기',
            url: `https://cafe.pi/ko/orders/${orderId}`, // locale은 판매자 prfrrd_lcl 사용 권장
          },
        ],
      ],
    },
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await response.json()
  return data
}

function renderOrderNotificationHtml(
  body: {
    order_id: string
    item_nm: string
    order_price_pi: number
    buyer_alias: string
    order_mthd_cd: string
    reg_dtm: string
  },
  locale: string
): string {
  const mthd = {
    DINE_IN: '오프라인 약속',
    PICKUP: '매장 수령',
    DELIVERY: '배송',
  }[body.order_mthd_cd] || '직거래'

  const isoDate = new Date(body.reg_dtm)
  const dateStr = isoDate.toLocaleString(locale === 'en' ? 'en-US' : 'ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return `<b>🛒 새 주문이 들어왔습니다</b>

<b>📦 상품</b>   ${escapeHtml(body.item_nm)}
<b>💰 금액</b>   ${body.order_price_pi.toFixed(1)} π
<b>👤 구매자</b>  ${escapeHtml(body.buyer_alias)}
<b>📍 픽업</b>   ${mthd}
<b>🕐 시각</b>   ${dateStr}`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
```

### 10-4. Pull 레이어 (앱 내 안읽은 뱃지)

**목적**: 판매자가 앱을 열었을 때 미확인 주문 표시

**구현**:
```typescript
// src/app/[locale]/(seller)/orders/received/page.tsx (신규)
'use client'

import { useEffect, useState } from 'react'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { useSession } from '@/lib/auth-check'

export default function ReceivedOrdersPage() {
  const user = useSession() // 판매자만
  const [orders, setOrders] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!user?.id) return

    const fetchOrders = async () => {
      const { data } = await getSupabaseAdmin()
        .from('msg_noti_outbox')
        .select('*, mps_order(*)')
        .eq('recv_usr_id', user.id)
        .eq('del_yn', 'N')
        .order('reg_dtm', { ascending: false })

      setOrders(data || [])
      setUnreadCount(data?.filter(o => o.viewed_yn === 'N').length || 0)
    }

    fetchOrders()
  }, [user?.id])

  const handleViewOrder = async (notiId: string) => {
    await getSupabaseAdmin()
      .from('msg_noti_outbox')
      .update({ viewed_yn: 'Y', viewed_dtm: new Date().toISOString() })
      .eq('noti_id', notiId)

    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  return (
    <div>
      <h1>받은 주문 ({unreadCount})</h1>
      <div className="grid gap-4">
        {orders.map(order => (
          <div
            key={order.noti_id}
            className={order.viewed_yn === 'N' ? 'border-2 border-blue-500' : ''}
          >
            <OrderCard order={order} onView={handleViewOrder} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## 11. Webhook & 콜백 (Phase 2)

### 11-1. Phase 2 목표

판매자가 Telegram 메시지의 "준비 시작" 또는 "거절" 버튼을 누르면:
1. Telegram이 cafe.pi 백엔드으로 webhook 콜백 전송
2. 백엔드가 `markPreparing()` 또는 `markCancelled()` 호출
3. 구매자에게 실시간 상태 업데이트 push

### 11-2. Webhook 엔드포인트 (설계)

```
POST /api/telegram/webhook
```

**요청 본문** (Telegram 공식 format):
```json
{
  "update_id": 123456,
  "callback_query": {
    "id": "query_id_123",
    "from": {
      "id": 123456789,
      "is_bot": false,
      "username": "johndoe"
    },
    "chat_instance": "1234567890",
    "data": "order:accept:550e8400-e29b-41d4-a716-446655440000",
    "message": {
      "message_id": 999,
      "chat": { "id": 123456789 },
      "text": "..."
    }
  }
}
```

**응답**:
```json
{
  "ok": true,
  "message": "Webhook processed"
}
```

### 11-3. Callback Data 포맷

**구조**: `<namespace>:<action>:<order_id>`

| 형식 | 설명 | 바이트 |
|------|------|--------|
| `order:accept:550e8400-e29b-41d4-a716-446655440000` | 준비 시작 | ~50 |
| `order:reject:550e8400-e29b-41d4-a716-446655440000` | 주문 거절 | ~50 |

**제약**: Telegram callback_data는 **최대 64바이트** → orderId만 담고, 판매자 ID는 서버 검증으로 확인

### 11-4. 시크릿 토큰 (보안)

Telegram은 Webhook 요청에 `X-Telegram-Bot-Api-Secret-Token` 헤더 자동 첨부.

**설정**:
```bash
# Telegram 봇 설정
POST https://api.telegram.org/bot{BOT_TOKEN}/setWebhook
{
  "url": "https://cafe.pi/api/telegram/webhook",
  "secret_token": "{SECRET_TOKEN}"
}
```

**검증 코드**:
```typescript
const secretToken = req.headers.get('x-telegram-bot-api-secret-token')
if (secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
}
```

### 11-5. 멱등성 (Phase 2)

**문제**: Telegram이 webhook 응답을 못 받으면 재전송 → 중복 처리 위험

**해결**:
- DB에 `telegram_msg_id` 저장 (발송 시)
- Webhook 수신 시 해당 주문의 상태가 이미 변경되었으면 무시 (상태 가드)

```typescript
// /api/telegram/webhook
const currentState = order.order_st_cd
if (currentState === 'PREPARING') {
  // 이미 준비 시작 상태 → 중복 처리, 무시
  console.log('Already processed')
  return NextResponse.json({ ok: true })
}
```

---

## 12. 환경변수 및 설정

### 12-1. src/env.ts (t3-env)

```typescript
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    // ... 기존 변수들
    
    // Telegram Order Notifier
    TELEGRAM_BOT_TOKEN: z.string().min(1).describe('Telegram Bot Token from @BotFather'),
    TELEGRAM_WEBHOOK_SECRET: z.string().min(1).describe('Secret token for webhook validation'),
    TELEGRAM_WEBHOOK_URL: z.string().url().optional().describe('Webhook URL (optional, for testing)'),
  },
  // ...
})
```

### 12-2. .env.example

```bash
# Telegram Order Notifier (Phase 1)
TELEGRAM_BOT_TOKEN=123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh
TELEGRAM_WEBHOOK_SECRET=your-secret-token-here
TELEGRAM_WEBHOOK_URL=https://cafe.pi/api/telegram/webhook
```

### 12-3. .env.local (실제 값 — 커밋 금지)

```bash
# .gitignore에 이미 포함됨
TELEGRAM_BOT_TOKEN=실제_토큰
TELEGRAM_WEBHOOK_SECRET=실제_시크릿
```

### 12-4. Vercel 환경변수 설정

```bash
vercel env add TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_WEBHOOK_SECRET
```

---

## 13. 에러 처리 및 재시도

### 13-1. Telegram API 에러 코드

| 코드 | 원인 | 대응 |
|------|------|------|
| **429** | Rate limit (30 req/sec) | 재시도(backoff: 1s → 5s → 30s) |
| **400** | 잘못된 파라미터 | 로깅 + 스킵 (재시도 안 함) |
| **403** | 봇 차단됨 | 로깅 + 알림 (판매자 재연동 필요) |
| **404** | chat_id 존재 안 함 | 로깅 + 판매자 연동 상태 리셋 |
| **500** | Telegram 서버 오류 | 재시도(exponential backoff) |

### 13-2. 재시도 전략

**Outbox dispatcher에서**:

```typescript
const maxRetries = 3
const backoffMs = [1000, 5000, 30000]

for (const row of pending) {
  let success = false
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const telegramRes = await sendTelegramMessage(...)
    
    if (telegramRes.ok) {
      success = true
      break
    }
    
    // 429 또는 5xx만 재시도
    if (
      telegramRes.error_code === 429 ||
      (telegramRes.error_code >= 500 && telegramRes.error_code < 600)
    ) {
      if (attempt < maxRetries - 1) {
        await sleep(backoffMs[attempt])
        continue
      }
    }
    // 4xx (400, 403 등) — 재시도 안 함
    break
  }
  
  if (success) {
    // UPDATE sent_yn='Y'
  } else {
    // UPDATE retry_cnt++, fail_reason
  }
}
```

### 13-3. 로깅 및 모니터링

**로깅 수준**:
```typescript
console.log(`[OK] Order ${orderId} → chat_id ${chatId}`)  // 성공
console.warn(`[RETRY] Order ${orderId} attempt #${retry}`)  // 재시도
console.error(`[FAIL] Order ${orderId} after 3 attempts: ${reason}`)  // 최종 실패
```

**모니터링 대시보드** (향후):
- 시간당 발송 건수
- 평균 레이턴시
- 실패율
- API 에러 분포

---

## 14. 보안 및 PII 정책

### 14-1. PII (Personally Identifiable Information) 절제

**Telegram 메시지 본문에는 포함 금지**:
- ❌ 고객 실명
- ❌ 고객 전화번호
- ❌ 배송 주소
- ❌ 결제 계좌

**본문에 포함 가능**:
- ✅ 상품명 (공개 상품)
- ✅ 금액 (거래액)
- ✅ 구매자 별칭 (마스킹됨)
- ✅ 픽업 방식 (DINE_IN/PICKUP/DELIVERY)
- ✅ 주문 시각 (거래 기록)

**실명/전화/주소**:
- 앱 딥링크의 OrderDetail 페이지에서만 확인 (인증된 판매자만)

### 14-2. 봇 토큰 보안

**금지**:
- 클라이언트 사이드에서 토큰 사용 (프론트엔드 코드에 노출)
- Git에 실제 토큰 커밋

**필수**:
- 서버 환경변수만 사용 (`process.env.TELEGRAM_BOT_TOKEN`)
- `.env.local` → `.gitignore` 추가 (자동)
- Vercel에서 별도 관리

### 14-3. Webhook 시크릿 검증

**모든 Webhook 요청에**:
```typescript
const secret = req.headers.get('x-telegram-bot-api-secret-token')
if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
}
```

### 14-4. Chat ID 위변조 방지

**규칙**:
- Telegram chat_id는 Telegram 시스템에서만 발급 (위변조 불가)
- 판매자 매핑 시 `/start` 페이로드의 JWT 토큰으로 사용자 검증

```typescript
// 봇의 /start 핸들러
const payload = context.startPayload  // auth_code
const decoded = jwt.verify(payload, process.env.JWT_SECRET)
const userId = decoded.user_id

// 최종 매핑 — sys_user 컬럼 갱신 (옵션 A 확정)
await db.from('sys_user').update({
  tlgm_chat_id: context.chat.id,
  tlgm_conn_yn: 'Y',
  tlgm_conn_dtm: new Date().toISOString(),
  modr_id: 'TELEGRAM_BOT',
  mod_dtm: new Date().toISOString(),
}).eq('id', userId)
```

### 14-5. Telegram 외부 통신

**https only**:
- 모든 Telegram API 호출은 `https://api.telegram.org/bot...`
- Webhook URL도 HTTPS 필수

---

## 15. 테스트 및 검증

### 15-1. 로컬 환경 테스트

#### 1단계: 봇 생성 및 토큰 발급

```bash
# Telegram에서 @BotFather 찾기
# /newbot → 봇이름 입력 → 토큰 받기
# 예: 123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh
```

#### 2단계: .env.local 설정

```bash
TELEGRAM_BOT_TOKEN=실제_토큰
TELEGRAM_WEBHOOK_SECRET=test-secret-12345
TELEGRAM_WEBHOOK_URL=https://localhost:3000/api/telegram/webhook
```

#### 3단계: 로컬 서버 실행

```bash
pnpm dev
# http://localhost:3000
```

#### 4단계: ngrok 터널 (Webhook 수신용)

```bash
# Telegram은 public URL이 필요
ngrok http 3000
# https://xxxxx.ngrok.io → 복사
```

#### 5단계: 봇에 Webhook 설정

```bash
curl -X POST https://api.telegram.org/bot{TOKEN}/setWebhook \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://xxxxx.ngrok.io/api/telegram/webhook",
    "secret_token": "test-secret-12345"
  }'
```

#### 6단계: 메시지 발송 테스트

```typescript
// 테스트 스크립트: test-telegram.ts
import fetch from 'node-fetch'

const token = process.env.TELEGRAM_BOT_TOKEN
const chatId = 123456789  // 본인 Telegram ID (bot에 /start 후 확인)

const payload = {
  chat_id: chatId,
  text: '<b>🛒 테스트 메시지</b>\n\n<b>📦 상품</b>   테스트 아메리카노',
  parse_mode: 'HTML',
  reply_markup: {
    inline_keyboard: [
      [
        {
          text: '📲 주문 확인하기',
          url: 'https://cafe.pi/ko/orders/test-order-id',
        },
      ],
    ],
  },
}

const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})

const data = await res.json()
console.log(data)
```

### 15-2. 실제 환경 검증 (Staging)

1. **판매자 온보딩 테스트**
   - 판매자 계정으로 로그인
   - "내 정보" → "Telegram 알림 연동"
   - 봇 열기 → /start → 연동 완료 확인

2. **주문 알림 테스트**
   - 테스트 상품 등록 (판매자)
   - 구매자 계정으로 주문 + 결제 완료
   - Telegram에서 알림 수신 확인
   - 메시지 내용 정확성 점검 (상품명, 금액, 구매자별칭)
   - "주문 확인하기" 버튼 클릭 → cafe.pi OrderDetail 페이지 로드 확인

3. **멀티 주문 테스트**
   - 여러 구매자가 동시 주문
   - 판매자가 중복 알림 받지 않는지 확인

4. **에러 시나리오**
   - 봇이 차단된 판매자에게 발송 → 403 에러 처리 확인
   - Telegram API 다운 시뮬레이션 → 재시도 + 로깅 확인
   - 잘못된 chat_id → 에러 로깅 확인

### 15-3. 실제 카페 픽업 흐름 (E2E)

```
1️⃣ 판매자 A가 오프라인 매장(cclemong) 등록 + Telegram 연동
   ↓
2️⃣ 구매자 B가 cafe.pi 접속 → cclemong 매장 선택 → 아메리카노 주문 → 결제
   ↓
3️⃣ 결제 완료 (Pi Network)
   ↓
4️⃣ markEscrow() 호출
   ├─ msg_noti_outbox INSERT
   └─ realtime.broadcast → 판매자 앱 (실행 중이면 즉시 alert)
   ↓
5️⃣ [~5분 후] Cron dispatcher 실행
   ├─ Telegram sendMessage → 판매자 휴대폰 push 알림
   └─ msg_noti_outbox.sent_yn = 'Y' UPDATE
   ↓
6️⃣ 판매자가 Telegram 메시지 확인
   ├─ "주문 확인하기" 클릭
   ├─ cafe.pi OrderDetail 페이지 열림
   ├─ 고객 실명/전화/픽업시간 확인
   └─ "준비 시작" (Phase 1: 수동, Phase 2: 버튼)
   ↓
7️⃣ 판매자 앱의 "받은 주문" 화면에서도 주문 확인
   └─ 카드 클릭 → 더 자세히 보기
```

---

## 16. 마일스톤 및 로드맵

### Phase 1: 단방향 발송 — ✅ 구현 완료 (2026-06-18)

| 항목 | 상태 | 완료일 |
|------|------|----------|
| Outbox 테이블 설계 + DDL (`sql/064`, DA 승인·Supabase 적용) | ✅ 완료 | 2026-06-18 |
| markEscrow() 통합 (`enqueueOrderNoti`) | ✅ 완료 | 2026-06-18 |
| Realtime broadcast (Layer 1) — 기존 자산 + 토스트 제스처 분리 개선 | ✅ 완료 | 2026-06-18 |
| Telegram 디스패처 (Layer 2) `mps-noti.ts` + cron 안전망 통합 | ✅ 완료 | 2026-06-18 |
| **결제완료 즉시 발송** (cron 의존 제거 — `payments/complete`) | ✅ 완료 | 2026-06-18 |
| Pull 레이어 (Layer 3) 안읽은 뱃지 | ✅ 완료 | 2026-06-18 |
| 판매자 온보딩 UI (봇 연동 딥링크 + webhook) | ✅ 완료 | 2026-06-18 |
| 보안 하드닝 (webhook fail-closed · 재바인딩 차단) | ✅ 완료 | 2026-06-18 |
| 운영 셋업 (BotFather 봇 · env 3종 · setWebhook) | ✅ 실기기 연동 확인 | 2026-06-18 |

> **설계 대비 변경점**
> - **Webhook을 Phase 1에 구현**: 판매자 연동(chat_id 저장)에 webhook이 필수라 Phase 2에서 앞당김(단, 양방향 버튼 콜백은 여전히 Phase 2).
> - **cron 주기 발송 → 결제완료 즉시 발송**: 사장님은 즉시 알림이 필요한데 Vercel cron은 분 단위가 최소(초 단위 불가)라, `payments/complete`에서 디스패처를 동기 호출해 즉시 발송. cron(`*/5`)은 즉시 발송 실패·유실분만 줍는 **안전망**으로 격하.
> - **보안 하드닝 추가**: 자동 보안 리뷰 대응(webhook fail-closed, 연동 재바인딩 차단).

### Phase 2: 양방향 인터랙션

| 항목 | 설명 | 예상 기한 |
|------|------|----------|
| Webhook 엔드포인트 구현 | `/api/telegram/webhook` 추가 | 2026-07-20 |
| "준비 시작" 콜백 | Telegram 버튼 → `markPreparing()` | 2026-07-25 |
| "거절" 콜백 | Telegram 버튼 → `markCancelled()` | 2026-07-25 |
| 구매자 실시간 알림 | 상태 변경 시 구매자 push | 2026-07-28 |
| 다국어 메시지 | i18n 적용 (i118n_message) | 2026-08-01 |
| **Phase 2 출시** | **양방향 상태 동기** | **2026-08-05** |

### Phase 3: 다중 채널 (선택)

| 항목 | 설명 | 예상 기한 |
|------|------|----------|
| 카카오 알림톡 | noti_chnl_cd='KAKAO' 추가 | 미정 |
| SMS (선택) | noti_chnl_cd='SMS' 추가 | 미정 |
| Web Push | Pi Browser 지원 시 | 미정 |

---

## 17. 미해결 이슈

### 17-1. 판매자 chat_id 저장 위치 (✅ 결정 완료 2026-06-18)

**결정**: **옵션 A — `sys_user` 컬럼 확장** (`tlgm_chat_id`, `tlgm_conn_yn`, `tlgm_conn_dtm`)

**근거**: 판매자 1인 = Telegram 1계정 단순 매핑이라 조인 불필요·구현 단순. 다중 채널로 컬럼이 비대해지면 Phase 3에서 별도 매핑 테이블 분리 재검토. (상세 DDL은 6-2 참조)

---

### 17-2. Outbox 테이블 이름 (✅ 결정 완료 2026-06-18)

**결정**: **`msg_noti_outbox`** (메시지 도메인, 범용)

**근거**: 알림은 메시지(msg) 도메인에 속하며, 향후 PiChat·PiShop™·이벤트 등 다양한 채널(KAKAO/SMS/Web Push) 알림을 한 큐로 통합 가능. PRD 번호(PRD_13_MSG)와도 일관.

**잔여 작업**: DA 표준단어 `NOTI`(알림)·`OUTBOX`(발송대기함)·`TLGM`(Telegram) 등록 + DDL `-- DA-APPROVED` 승인

---

### 17-3. 동기 vs 비동기 발송 트레이드오프

**문제**: markEscrow() 직후 Telegram 호출할지 말지

**옵션 A**: 동기 (즉시)
- 장점: 순간 응답성 최고
- 단점: API 느림 시 주문 응답 지연, 타임아웃 위험

**옵션 B**: 비동기 (아웃박스 + 크론)
- 장점: 안정적, 재시도 용이, 주문 응답 빠름
- 단점: 5~10분 레이턴시 (Layer 1 Realtime으로 보완)

**결정**: **옵션 B (이 PRD 적용)**. Layer 1 Realtime으로 즉시성 보장.

---

### 17-4. i18n 적용 (Phase 2 연기 vs Phase 1 포함)

**문제**: 메시지를 다국어로 렌더링할지, Phase 1은 한국어만 할지

**현재 상태**: Phase 1은 **한국어 고정** (`src/messages/ko.json`)

**Phase 2에서**:
```typescript
const locale = seller.prfrrd_lcl  // 'ko' | 'en' | ...
const template = messages[locale].ORDER_NOTIFICATION
```

**결정**: Phase 1은 한국어만, Phase 2에서 i18n 통합

---

### 17-5. 상품 이미지 (sendPhoto) 필수 vs 선택

**문제**: 모든 주문에 이미지를 보낼지, 있으면 보낼지

**옵션 A**: 필수 (모든 상품에 이미지 필요)
- 장점: 판매자가 더 직관적
- 단점: 이미지 없는 상품은 어떻게?

**옵션 B**: 선택 (이미지 있으면 sendPhoto, 없으면 sendMessage)
- 장점: 유연성, 호환성

**결정**: **선택** (이 PRD 적용). `mps_item.item_img_url`이 NULL이면 text only sendMessage.

---

### 17-6. Outbox 파티셔닝 전략

**문제**: msg_noti_outbox가 시간이 지나며 커질 텐데, 성능 최적화는?

**옵션**: 월별 또는 연별 파티셔닝 + 자동 아카이빙

**현재**: 설계 초안에만 포함. 구현은 데이터량 확인 후.

---

### 17-7. 결정 대기 항목 체크리스트

아나킨 마스터님 최종 승인 필요:

- [x] 17-1: chat_id 저장 위치 → **옵션 A (sys_user 컬럼 확장)** 확정 2026-06-18
- [x] 17-2: Outbox 테이블명 → **`msg_noti_outbox`** 확정 2026-06-18 (DA 표준단어 등록은 잔여)
- [ ] 17-3: 발송 아키텍처 트레이드오프 (확인)
- [ ] 17-4: i18n Phase (1 vs 2)
- [ ] 17-5: 이미지 정책 (필수 vs 선택)
- [ ] 17-6: 파티셔닝 로드맵

---

## 맺음말

이 PRD는 **신뢰를 근본에서 보장하는 Outbox 패턴** 기반으로 설계되었습니다.

주문이 들어오면:
1. **DB에 기록** (트랜잭션 원자성)
2. **Realtime으로 즉시** (앱 실행 중)
3. **Telegram으로 푸시** (외부 채널)
4. **앱 내 뱃지로 최종** (pull 안전망)

세 채널이 협력해 **판매자가 절대 주문을 놓치지 않도록** 보장합니다.

---

**작성**: 아소카 (Telegram Order Notifier Design Specialist)
**검토 대기**: 아나킨 마스터님
**최종 승인 대기**: DA 팀 (표준사전 검토)
