# PRD_24_FEES_STRATAGE.md — 이중 요금제 전략 (Bean Token ↔ Pi Coin)

> **작성일**: 2026-06-29  
> **버전**: v0.2 (설계 검토 반영)  
> **상태**: **검토 완료·핵심 결정 확정** — Pi 모드=진짜 Pi 직결제, 마이크로 무료화. 구현 전 **§0 개정 요지가 본문보다 우선**.  
> **최상위 목표**: Pi 메인넷 등재(A-5: "All transactions in Pi") 국면에서 관리자 토글로 플랫폼 요금 결제를 Bean ↔ Pi로 전환(구독=Pi 직결제 경로 이중화)

---

## 목차
1. [개요 & 전략적 배경](#1-개요--전략적-배경)
2. [환산 규칙 & 정책](#2-환산-규칙--정책)
3. [전략 A vs B 비교](#3-전략-a-vs-b-비교)
4. [Table Set1 — Bean Token 요금제](#4-table-set1--bean-token-요금제)
5. [Table Set2 — Pi Coin 요금제](#5-table-set2--pi-coin-요금제)
6. [관리자 런타임 전환 아키텍처](#6-관리자-런타임-전환-아키텍처)
7. [PI Browser 분기 & 제약](#7-pi-browser-분기--제약)
8. [마이그레이션 & 롤백 시나리오](#8-마이그레이션--롤백-시나리오)
9. [구현 체크리스트](#9-구현-체크리스트)

---

## §0. v0.2 개정 요지 (2026-06-29) — 설계 검토 결정 ⭐ 본문보다 우선

> v0.1 설계 검토에서 **"Pi 모드의 실제 거래가 무엇인가"가 미정의**라는 핵심 모순이 발견되어 개정. 아래 결정이 이전 본문(특히 §3·§6-3의 `fn_bean_apply(Pi)` 모델)보다 **우선**한다.

### 마스터 결정 (2026-06-29)
1. **Pi 모드의 실거래 = 진짜 Pi 직접결제** — `window.Pi.createPayment()` → approve → complete → `pi_pymnt` 기록. "표시만 Pi"가 아니라 실제 Pi 결제로 **A-5를 명확히 충족**(심사관이 코드를 봐도 Pi 거래).
2. **마이크로 요금은 Pi 결제 비현실 → Pi 모드에서 무료화**(등재 기간 한정). 대상: 입장료(0.1 Pi)·번역(0.01 Pi)·AI(0.05 Pi)·배지(0.1 Pi)·부스팅(0.5 Pi). 0.05 Pi를 Pi Browser 승인 왕복으로 결제하는 것은 비현실적이고 Bean의 설계 목적(마이크로 묶음)에 역행.
3. **큰 건(구독)만 Pi 직접결제** — 월 500 Pi·연 5,000 Pi → Pi 결제 적합.

### v0.1 대비 정정 (이전 본문의 오류 — 무효화)
- ❌ **"코드 변경 0" 주장 철회**: Pi 모드 구독은 `fn_bean_apply`(Bean 지갑 차감)가 아니라 **별도 Pi 결제 경로**(`createPayment`/`pi_pymnt`)가 필요 → 구독 결제 경로 **이중화**(상당한 구현). 토글만으로 0 코드가 아니다. A-5 충족과 맞바꾼 트레이드오프.
- ❌ **§6-3 `fn_bean_apply(p_amount=0.1 Pi)` 모델 삭제**: Bean 지갑은 **정수 전용**(`bean-fee.ts` L7)이라 0.1 차감 불가·단위 모순. Pi 모드 결제는 Pi 결제 플로우로 분기한다.
- ⚠️ **단일 출처 보강**: 요금 정본이 `bean_fee_plan`(DB) **+ `bean-fee.ts` 코드 상수**(BADGE_UPGRADE=10·TRANSLATE_ONCE=1·AI_EXTRA=5·ROOM_BOOST=50·`NONSUBSCRIBER_FEE_BEAN`) **이중 존재**. fee 해석/모드 분기는 **양쪽을 모두 커버**해야 한다(§5의 resolveFee가 DB만 보면 코드 상수 경로 누락).
- ⚠️ **캐시 일관성**: `active_mode` 60초 메모리 캐시는 Vercel 서버리스 다인스턴스에서 전환 직후 **Bean/Pi 혼재 거래**를 유발 → 돈 거래엔 부적합. 전환은 **pending tx 0 확인 후 원자 전환**, 결제 시점엔 캐시 대신 DB 직접 조회(또는 매우 짧은 TTL + 무효화).
- ⚠️ **Pi Browser**: Pi 모드 구독 결제 = Pi 직접결제 = **Pi Browser 전용**. 일반 브라우저는 Pi 모드 구독 불가 → 안내·대체(등재 단기간 한정, §7 옵션 A와 정합).
- ⚠️ **DB(sql/140 보강)**: `fee_mode_config`·`fee_mode_audit` **del_yn 논리삭제 컬럼 추가**, 인덱스 중복(`idx_..._mode_mode`) 제거, FK는 코드베이스 "FK 무설계" 관례 검토.

### 재정의된 모드별 결제 경로 (정본)
| 거래 | BEAN 모드 (평상시) | PI 모드 (메인넷 등재 기간) |
|---|---|---|
| **구독**(큰 건) | `fn_bean_subscribe_product` (Bean 지갑 차감) | `window.Pi.createPayment` → `pi_pymnt` (Pi 직결제) |
| **마이크로**(입장·번역·AI·배지·부스팅) | `fn_bean_apply` (Bean 지갑 차감) | **무료화** (등재 기간 면제) |
| **P2P 팁 / O2O 결제** | Pi (기존) | Pi (영향 없음) |

> 따라서 `fee_mode`는 "Bean↔Pi 환산표 토글"이 아니라 **"구독 결제 경로 + 마이크로 과금 정책"의 모드 스위치**다. 환산표(Bean÷100)는 *표시·회계 보조*일 뿐 실제 차감 단위가 아니다.

### v0.3 추가 결정 (2026-06-29) — 롤백 보장·1:100 완벽 매핑·REWARD Pi화

1. **언제든 현재 요금제로 복귀(롤백 보장)**: 모드 전환은 **양방향 무제한**(BEAN↔PI). `fee_mode_audit` 이력 완전 보존 + `fn_rollback_fee_mode()`(직전 모드 원자 복원). 모든 거래는 `bean_txn.pi_amt` 병기로 **모드 무관 회계 일관** → 복귀 후에도 이력 정합.
2. **1:100 완벽 매핑 "관리"**: 단일출처(`bean_fee_plan.amt_bean`) 유지 + Pi = `amt_bean ÷ 100`. **Bean이 정수**라 ÷100은 항상 소수 2자리 이내로 떨어짐 → **수학적으로 완벽 매핑 보장**. "관리"는 별도 Pi 테이블이 아니라 **`v_fee_plan_dual` 뷰**(Bean·Pi 양쪽 동시 표시) + 무결성 검증으로 달성. ⛔ 별도 Pi 요금 테이블 금지(sync 버그).
3. **REWARD도 Pi화(1:100)**: SPEND뿐 아니라 **보상 지급도 모드 적용**. BEAN 모드=`fn_bean_apply('REWARD')` Bean 지급 / PI 모드=**Pi A2U**(`triggerPiReward`) 1:100 지급(예: 후기 60 Bean → 0.6 Pi). 대상=후기(PRD_20)·캠페인 보상. **이벤트는 이미 `reward_pi_amt`(Pi A2U·sql/048)로 일관** → 후기·캠페인을 같은 패턴으로 확장.

> §10 구현 영향 분석(추가/변경 테이블·데이터·화면)이 사전 정의로 명문화됨 — 구현은 그 범위 승인 후 착수.

---

## 1. 개요 & 전략적 배경

### 1-1. 왜 이중 요금제인가?

**메인넷 등재 요건과의 충돌**:
- **Pi 공식 심사 A-5**: *"All transactions must be conducted in Pi, with no support for non-Pi Tokens or fiat currencies"*
- **현상**: Cafe.pi는 플랫폼 거래(구독·생성료·입장료)를 Bean Token(임시 토큰)으로 운영 중
  - 구독료: `bean_fee_plan` 기준 3,000~50,000 Bean
  - 카페생성료: 10 Bean
  - 카페입장료: 10 Bean
  - ...기타 건당 요금들
- **문제**: Bean은 "Pi 아닌 토큰" → 메인넷 등재 거절 리스크 ⚠️

**해결책: 런타임 전환**:
1. **메인넷 등재 국면**(Phase 1, 현재~2주): **Pi Coin 요금제로 전환**(A-5 부합)
   - 플랫폼 거래 = Pi Coin으로 통일
   - 코드 변경 0 (관리자 토글로 요금제만 전환)
2. **Bean Launchpad 온체인 발행**(Phase 2, ~6주): Bean 공식 토큰 → 메인넷 재신청
   - Bean이 공식 토큰화 → A-5 자동 충족
   - Pi Coin 요금제 → Bean 요금제로 복귀
   - 역시 코드 변경 0

→ **이 전략의 핵심가치**: 비즈니스 로직은 한 줄도 바꾸지 않고, **관리자 화면 토글**만으로 메인넷 등재 요건을 시점별로 만족한다.

### 1-2. 정책 확인 (거래 통화 라우팅)

정본: **[[currency-routing-rule]]** (2026-06-18 마스터 "제일 중요")

| 거래 유형 | 통화 | 비고 |
|---|---|---|
| **플랫폼 ↔ 사용자** (요금) | **Bean Token** 기준 | 구독·생성료·입장료 등. 본 PRD가 전환하는 부분 |
| **P2P** (사용자 ↔ 사용자 팁) | Pi Coin | 거래 라우팅 예외 — 본 PRD 범위 밖 |
| **O2O** (매장 결제) | Pi Coin (보상은 Bean) | 거래 라우팅 예외 — 본 PRD 범위 밖 |

→ **이 PRD는 "플랫폼 ↔ 사용자" 요금만 전환**한다. P2P/O2O는 기존대로 유지.

---

## 2. 환산 규칙 & 정책

### 2-1. 기본 환산식

```
1 Pi = 100 Bean (고정)
∴ Pi Coin 요금 = Bean 요금 ÷ 100 (정수 연산)
```

**예시**:
- Bean: 3,000 Bean → Pi: 30 Pi
- Bean: 10 Bean → Pi: 0.1 Pi
- Bean: 15 Bean → Pi: 0.15 Pi ✅ (소수점 가능)

### 2-2. 정수 처리 & 반올림 정책

**Pi Coin은 10,000,000 units = 1 Pi** (Soroban/PiRC2 표준 — docs/CLAUDE.md):

```typescript
// 변환 함수
const toUnits = (pi: number): bigint => BigInt(Math.round(pi * 10_000_000))
const toPi = (units: bigint): number => Number(units) / 10_000_000
```

**금액 표시**:
- Bean 금액(정수): `amt_bean: 3000` (DB/API)
- Pi 금액: `amt_pi = Math.round(3000 / 100 * 10_000_000) / 10_000_000 = 30.0` (계산)
- UI 표시: "30 Pi" 또는 "30.0 Pi" (소수점 1~3자리 표준)

**반올림 정책**:
- Bean → Pi 환산: `Math.round(amt_bean / 100 * 100_000_000) / 100_000_000` (소수점 8자리 유지)
- UI: 초과 소수점 제거 (예: 30.00000000 → "30 Pi")

### 2-3. 정책 제외 (P2P/O2O, Pi 유지)

- **팁**(P2P): Pi Coin 유지, 요금제 전환 **영향 없음**
- **매장 결제**(O2O): Pi Coin 유지, 요금제 전환 **영향 없음**
- **스티커팩**: 현재 Pi Coin (별도 정책)

---

## 3. 전략 A vs B 비교

| 항목 | **전략 A: Bean Token** | **전략 B: Pi Coin** |
|---|---|---|
| **시점** | 현재 (평상시) | 메인넷 등재 중 / Bean 미발행 |
| **플랫폼 거래 통화** | **Bean Token** | **Pi Coin** |
| **요금 정본** | `bean_fee_plan.BEAN_SET` | `bean_fee_plan.PI_SET` (BEAN_SET÷100) |
| **사용자 입장** | "Bean 충전 후 Bean으로 결제" | "Pi 충전 후 Pi로 결제" |
| **코드 경로** | `fn_bean_apply` (Bean) | `fn_bean_apply` (Pi 금액으로 환산 후 차감) |
| **메인넷 A-5 충족** | ❌ (Bean ≠ Pi) | ✅ (모두 Pi) |
| **활성화 경로** | 관리자 `/admin/fee-mode` → "Bean Token" 선택 | 관리자 `/admin/fee-mode` → "Pi Coin" 선택 |
| **즉시 반영 범위** | 모든 신규 거래, 구독 갱신 시 | 모든 신규 거래, 구독 갱신 시 |

**전환 흐름**:
```
[평상시]
관리자 선택: "Bean Token 전략" → ACTIVE_FEE_MODE='BEAN'
↓
모든 신규 거래: fn_bean_apply(user_id, amt_bean=10, ...) ← Bean 차감

[메인넷 등재 중 (2~4주)]
관리자 선택: "Pi Coin 전략" → ACTIVE_FEE_MODE='PI'
↓
모든 신규 거래: fn_bean_apply(user_id, amt_pi=0.1, ...) ← Pi 금액으로 환산·차감
↓
메인넷 심사: ✅ 모든 거래가 Pi로 보임

[Bean 온체인 발행 후 (6주~)]
관리자 선택: "Bean Token 전략" → ACTIVE_FEE_MODE='BEAN'
↓
Bean이 공식 토큰 → 메인넷 재신청 ✅
```

---

## 4. Table Set1 — Bean Token 요금제

**정본 테이블**: `bean_fee_plan` (PRD_15_FEE §3·§4)

**현행 항목 (샘플)** — 실제 값은 sql/089 시드 참조:

| 요금제코드 | 상품 | 유형 | 등급 | 구독/일반 | 요금(Bean) | Pi 환산 | 설명 |
|---|---|---|---|---|---|---|---|
| PICAFE_SUBSCR_M | PyCafé™ | SUBSCR | — | SUBSCR | 50,000 | 500 Pi | 월간 구독 |
| PICAFE_SUBSCR_Y | PyCafé™ | SUBSCR | — | SUBSCR | 500,000 | 5,000 Pi | 연간 구독 |
| PICAFE_CREATE_GEN | PyCafé™ | CREATE | GENERAL | GENERAL | 10 | 0.1 Pi | 카페 생성(일반등급) |
| PICAFE_CREATE_PREM | PyCafé™ | CREATE | PREMIUM | GENERAL | 10 | 0.1 Pi | 카페 생성(프리미엄) |
| PICAFE_ENTER_GEN | PyCafé™ | ENTER | GENERAL | GENERAL | 10 | 0.1 Pi | 카페 입장료(일반) |
| PICAFE_ENTER_PREM | PyCafé™ | ENTER | PREMIUM | SUBSCR | 5 | 0.05 Pi | 카페 입장료(프리미엄·구독할인) |
| ... | ... | ... | ... | ... | ... | ... | ... |

**공존 정책**:
- **Set1 (BEAN_SET)**: 현행 `bean_fee_plan` 그대로
- **Set2 (PI_SET)**: Set1의 파생 뷰 (DB 별도 테이블 ❌, 계산 기반) — 아래 §5 참조

---

## 5. Table Set2 — Pi Coin 요금제

**설계 원칙**:
- **단일 출처 유지**: `bean_fee_plan` 테이블 1개만 존재
- **파생 렌더링**: Pi 금액은 **실시간 계산** (Bean ÷ 100)
- **DB 구조**: `bean_fee_plan` + `active_fee_mode` 플래그 추가 (§6 참조)

**렌더링 로직** (관리자·API):

```typescript
// 활성 요금제 세트 기반 금액 반환
function getActiveFeeAmount(beamAmt: number, activeMode: 'BEAN' | 'PI'): number | bigint {
  if (activeMode === 'BEAN') {
    return beamAmt  // 원래 Bean 금액
  } else if (activeMode === 'PI') {
    const piFloat = beamAmt / 100
    return BigInt(Math.round(piFloat * 10_000_000))  // Soroban units로 변환
  }
}

// 대응표 (UI 표시)
async function getFeeTable(activeMode: 'BEAN' | 'PI'): Promise<FeeRow[]> {
  const beans = await supabase
    .from('bean_fee_plan')
    .select('*')
    .eq('del_yn', 'N')
    .eq('use_yn', 'Y')
  
  return beans.map(row => ({
    ...row,
    amt_display: activeMode === 'BEAN' 
      ? `${row.amt_bean} Bean`
      : `${(row.amt_bean / 100).toFixed(2)} Pi`,
    amt_value: getActiveFeeAmount(row.amt_bean, activeMode),
  }))
}
```

**Table Set2 대응 예시**:

| 요금제코드 | Bean 기준 | **→ Pi 환산** | Soroban Units |
|---|---|---|---|
| PICAFE_SUBSCR_M | 50,000 | 500 | 5,000,000,000,000 |
| PICAFE_CREATE_GEN | 10 | 0.1 | 1,000,000,000 |
| PICAFE_ENTER_GEN | 10 | 0.1 | 1,000,000,000 |

**정책**:
- Set2 **추가 테이블 생성 금지** (단일 출처 원칙 위반)
- Set2 **계산/파생 데이터** (뷰 또는 코드 기반)
- Set1 변경 시 Set2 **자동 동기** (계산식이 변경 자동 반영)

---

## 6. 관리자 런타임 전환 아키텍처

### 6-1. DB 스키마 (신규 추가)

**플래그 테이블** (`fee_mode_config`):

```sql
CREATE TABLE IF NOT EXISTS public.fee_mode_config (
  fee_mode_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  active_mode   VARCHAR(10) NOT NULL DEFAULT 'BEAN'
                  CHECK (active_mode IN ('BEAN', 'PI')),
  activated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason_memo   TEXT,
  regr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.fee_mode_config IS '활성 요금제 세트 관리 (BEAN|PI)';
COMMENT ON COLUMN public.fee_mode_config.active_mode IS 'BEAN=Bean Token 요금제 / PI=Pi Coin 요금제';
COMMENT ON COLUMN public.fee_mode_config.activated_at IS '전환 시각';
COMMENT ON COLUMN public.fee_mode_config.reason_memo IS '전환 사유 (메인넷 신청 준비 등)';

CREATE INDEX idx_fee_mode_config_active 
  ON public.fee_mode_config(active_mode, mod_dtm DESC);
```

**감시 테이블** (`fee_mode_audit`):

```sql
CREATE TABLE IF NOT EXISTS public.fee_mode_audit (
  audit_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  old_mode      VARCHAR(10) NOT NULL,
  new_mode      VARCHAR(10) NOT NULL,
  changed_by    TEXT        NOT NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason_memo   TEXT,
  regr_id       TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.fee_mode_audit IS '요금제 전환 이력 (감시·복구용)';
```

### 6-2. API 엔드포인트 (신규 추가)

**조회**: `GET /api/admin/fee-mode`

```typescript
// 응답
{
  "active_mode": "BEAN",
  "activated_at": "2026-06-20T15:30:00Z",
  "reason_memo": "평상시 운영",
  "history": [
    {
      "old_mode": "BEAN",
      "new_mode": "PI",
      "changed_by": "anakin",
      "changed_at": "2026-06-29T10:00:00Z",
      "reason_memo": "메인넷 등재 준비"
    }
  ],
  "beanStats": {
    "totalUsers": 1234,
    "pendingTransactions": 12,
    "lastBeanSpend": "2026-06-29T09:45:00Z"
  }
}
```

**전환**: `PATCH /api/admin/fee-mode`

```typescript
// 요청
{
  "new_mode": "PI",
  "reason_memo": "메인넷 등재 심사 중"
}

// 응답 (성공)
{
  "ok": true,
  "old_mode": "BEAN",
  "new_mode": "PI",
  "activated_at": "2026-06-29T10:30:00Z",
  "message": "즉시 반영됨"
}

// 응답 (에러)
{
  "ok": false,
  "error": "pending_transactions > 0 — 진행 중인 거래가 있습니다. 30초 후 재시도하세요."
}
```

### 6-3. 코드 경로 (런타임 해석)

**요금 조회 함수** (`src/lib/fee-resolver.ts`):

```typescript
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function getActiveFeeMode(): Promise<'BEAN' | 'PI'> {
  const config = await supabaseAdmin
    .from('fee_mode_config')
    .select('active_mode')
    .order('mod_dtm', { ascending: false })
    .limit(1)
    .single()
  
  return config.data?.active_mode ?? 'BEAN'
}

export async function resolveFee(beamAmt: number): Promise<{
  amt_bean: number
  amt_pi: number | bigint  // Soroban units if Pi mode
  mode: 'BEAN' | 'PI'
}> {
  const mode = await getActiveFeeMode()
  
  return {
    amt_bean: beamAmt,
    amt_pi: mode === 'PI' 
      ? BigInt(Math.round((beamAmt / 100) * 10_000_000))
      : Math.round(beamAmt / 100),
    mode,
  }
}
```

**fn_bean_apply RPC 통합** (기존 유지, 호출 시점에 환산):

```typescript
// 사용자가 구독료 결제 시
const fee = await supabase
  .from('bean_fee_plan')
  .select('amt_bean')
  .eq('fee_plan_cd', 'PICAFE_SUBSCR_M')
  .single()

const resolved = await resolveFee(fee.data.amt_bean)

// Pi 요금제면 원래 fn_bean_apply에 Pi 환산값 전달
const result = await supabase.rpc('fn_bean_apply', {
  p_user_id: userId,
  p_amount: resolved.mode === 'PI' 
    ? (Number(resolved.amt_pi) / 10_000_000)  // Pi로 변환
    : resolved.amt_bean,
  p_txn_type: 'SPEND',
  p_ref: 'SUBSCR',
  p_ref_id: subscriptionId,
  p_memo: `${resolved.mode === 'PI' ? 'Pi' : 'Bean'} 구독료`,
})
```

### 6-4. 캐싱 & 성능

**캐시 전략**:
- `active_mode` 결과는 **60초 TTL 메모리 캐시** (관리자 변경 후 최대 1분 지연 허용)
- 또는 **Redis** (프로덕션 권장)
- 캐시 무효화: fee_mode_config 변경 시 즉시 플러시

**성능 영향**:
- 거래 시점: `fn_bean_apply` 호출 前에 `getActiveFeeMode()` 1회 조회 (60초 TTL로 대부분 캐시 히트)
- API: 요금표 조회 시 `getFeeTable()` 호출 (N + 1 회피, batch select)

---

## 7. PI Browser 분기 & 제약

### 7-1. Pi 직접 결제 (Pi Browser 전용)

**기존 제약** (CLAUDE.md):
- Pi 직접 결제(`window.Pi.createPayment()`)는 **Pi Browser 전용**
- 일반 브라우저는 **Bean 선충전 경로만** 지원

**이중 요금제와의 관계**:

| 요금제 | 브라우저 | 지원 경로 | 예시 |
|---|---|---|---|
| **Bean Token** | 일반 브라우저 | Bean 충전 → Bean 결제 ✅ | 모든 사용자 |
| **Bean Token** | Pi Browser | Bean 충전 → Bean 결제 ✅ | 모든 사용자 |
| **Pi Coin** | 일반 브라우저 | ❌ (Pi 결제 불가) → **Bean 충전 경로 권장 안내** | 대체 경로 필요 |
| **Pi Coin** | Pi Browser | Pi 충전 → Pi 결제 ✅ | Pi Browser 사용자 |

### 7-2. 전환 시나리오

**시나리오 1: Bean 요금제 (현재)**
```
[모든 사용자]
  ↓
  Bean 충전 (Pi Browser 필수)
  ↓
  Bean 요금제 결제 (일반/Pi Browser 모두 가능)
  ✅ 완벽 호환성
```

**시나리오 2: Pi Coin 요금제 (메인넷 심사 중)**
```
[Pi Browser 사용자]
  ↓
  Pi 충전 또는 Bean 충전 (둘 다 가능)
  ↓
  Pi Coin 요금제 결제 (Pi 가능)
  ✅ OK

[일반 브라우저 사용자]
  ↓
  Bean 충전만 가능 (Pi 충전 ❌)
  ↓
  Pi Coin 요금제 요청 (실패)
  ↓
  **에러 처리**: "이 기능은 Pi Browser에서만 사용 가능합니다" 안내
     또는 "Bean 충전 후 이용하세요" 권유
  ⚠️ 사용성 저하
```

### 7-3. 일반 브라우저 대응 전략 (선택)

**옵션 A: 엄격 차단** (권장 — 메인넷 A-5 명확)
- Pi Coin 요금제 활성 중 일반 브라우저 거래 **완전 차단**
- 에러 메시지: "이 기능은 Pi Browser 필수입니다"
- **장점**: 메인넷 A-5 완벽 부합, 보증금 회피 없음
- **단점**: 사용자 체감 불편 (하지만 메인넷 등재는 단기)

**옵션 B: 유연 대체** (향후 검토)
- Pi Coin 요금제 중 일반 브라우저는 Bean 충전 후 이용 권유
- Bean ↔ Pi 실시간 환율 적용 (Bean으로 충전하되 Pi 금액으로 표시)
- **장점**: 모든 사용자 호환
- **단점**: 구현 복잡, 환율 변동성 노출 (레드라인 위험)

→ **본 PRD 권장**: **옵션 A (엄격 차단)** — 메인넷 등재가 단기 목표, 명확한 정책 유지

---

## 8. 마이그레이션 & 롤백 시나리오

### 8-1. 마이그레이션 경로

**Phase 1: 현재 상태**
```
fee_mode_config.active_mode = 'BEAN'
모든 요금 = bean_fee_plan 기준 Bean
사용자 거래 = Bean 차감
메인넷 심사 상태: 등재 준비 중
```

**Phase 2: 메인넷 등재 준비 (T-3일)**
```
관리자 확인사항:
  · 진행 중인 구독/거래 0건 확인
  · 사용자 알림: "2026-06-30 18:00~19:00 Pi Coin 요금제 전환"
  · 고객센터 대비
```

**Phase 3: 전환 (T일)**
```
관리자: PATCH /api/admin/fee-mode
  {
    "new_mode": "PI",
    "reason_memo": "메인넷 등재 심사 (예정: 2026-06-30~2026-07-13)"
  }

즉시 효과:
  · fee_mode_config.active_mode = 'PI'
  · 모든 신규 거래 = Pi Coin 환산값으로 차감
  · 모든 신규 구독 = Pi Coin 요금 적용
  · 기존 활성 구독 = 갱신 시 Pi 요금 자동 적용 (다음 결제일)

메인넷 심사:
  · 모든 거래 거래내역 = Pi Coin ✅
  · A-5 부합 ✅
  · 등재 신청 제출
```

**Phase 4: 롤백 (필요시, T+1주)**
```
만약 심사 실패 또는 일시 연기 필요:
  
관리자: PATCH /api/admin/fee-mode
  {
    "new_mode": "BEAN",
    "reason_memo": "심사 일정 변경 — Bean 요금제 복귀"
  }

즉시 효과:
  · fee_mode_config.active_mode = 'BEAN'
  · 모든 신규 거래 = Bean 요금 복구
  · 메인넷 심사 상태 변경사항 없음 (Pi 거래는 이력으로 유지)
  · 사용자 혼란 최소화
```

### 8-2. 감시 & 보호장치

**전환 전 체크리스트** (API 응답에서 자동 검증):

```typescript
interface PreSwitchValidation {
  pendingTransactions: number  // > 0이면 경고
  activeSubscriptions: number
  lastBeanSpend: Date          // 최근 거래 시각
  systemLoad: {                // 고부하 중이면 경고
    qps: number
    dbConnPoolUtilization: number
  }
  recommendation: 'OK' | 'WARN' | 'BLOCK'
}
```

**감시 이력** (모든 전환 기록):
- 누가: `changed_by` (관리자 ID)
- 언제: `changed_at`
- 왜: `reason_memo`
- 이전값: `old_mode`
- 새값: `new_mode`

**롤백 가능성**:
- 모든 거래는 모드와 무관하게 `bean_ledger` 기록 유지
- Pi 모드 거래도 `amt_bean`(원본) + `amt_pi`(환산) 둘 다 기록
- 복구 후에도 거래 이력 일관성 보장

---

## 9. 구현 체크리스트

### Phase 1: 설계 (완료)
- [x] PRD_24_FEES_STRATAGE.md 작성
- [x] 환산 규칙 정의 (÷100, Soroban units)
- [x] 전략 A/B 비교표
- [x] 단일 출처 원칙 확인 (bean_fee_plan 파생)
- [x] Pi Browser 분기 정책

### Phase 2: DB & API (진행 예정)
- [ ] sql/140_fee_mode_config.sql (fee_mode_config, fee_mode_audit 테이블)
- [ ] sql/141_fee_mode_indexes.sql (인덱스)
- [ ] src/lib/fee-resolver.ts (가격 계산 함수)
- [ ] src/app/api/admin/fee-mode.ts (GET/PATCH 엔드포인트)
- [ ] 기존 fn_bean_apply 호출 지점 수정 (fee resolver 통합)
  - [ ] api/subscriptions/products/subscribe
  - [ ] api/chat/rooms/[id]/join
  - [ ] api/badges/upgrade
  - ...기타 Bean 차감 지점

### Phase 3: 관리자 UI (진행 예정)
- [ ] src/app/[locale]/(admin)/admin/fee-mode/page.tsx
  - [ ] 현재 활성 요금제 표시
  - [ ] 전환 히스토리 보기
  - [ ] 전환 버튼 (Bean ↔ Pi)
  - [ ] 사전 검증 결과 표시 (pending tx, 고부하 경고)
  - [ ] 확인 모달
  - [ ] 감시 이력 테이블 (fee_mode_audit)

### Phase 4: 테스트 (진행 예정)
- [ ] Bean 요금제 거래 검증 (기존 흐름 유지)
- [ ] Pi 요금제 전환 후 거래 검증 (환산값 정확성)
- [ ] 롤백 후 거래 검증 (이력 일관성)
- [ ] Pi Browser vs 일반 브라우저 분기
- [ ] 부하 테스트 (동시 거래 중 전환)

### Phase 5: 배포 (진행 예정)
- [ ] staging에서 1주 운영
- [ ] Bean → Pi → Bean 전환 반복 검증
- [ ] 운영DB 백업 후 프로덕션 반영
- [ ] 메인넷 등재 시점에 관리자 토글

---

## §10. 구현 영향 분석 (사전 정의 — 마스터 요청 2026-06-29)

> 구현 착수 전 **추가/변경 범위를 확정**한다. "추가 테이블 최소화" 원칙 — `bean_txn.pi_amt`(기존)·`reward_pi_amt`(이벤트 기존)를 재사용해 신규 테이블을 줄인다.

### 10-1. 추가될 테이블 + 데이터

| 테이블 | 위치 | 초기 데이터 | 비고 |
|---|---|---|---|
| `fee_mode_config` | sql/140 (작성됨) | 1행 `active_mode='BEAN'` | 활성 모드 단일 플래그 |
| `fee_mode_audit` | sql/140 (작성됨) | 없음(전환 시 누적) | 전환 이력·롤백 추적 |

→ **신규 테이블은 위 2개뿐.** REWARD Pi화는 기존 경로(`bean_txn`·`triggerPiReward`·`reward_pi_amt`) 재사용 → **보상용 신규 테이블 0**.

### 10-2. 변경될 테이블 + 데이터

| 테이블 | 변경 내용 | 데이터 영향 |
|---|---|---|
| `fee_mode_config` | **del_yn/del_dtm 추가**, 인덱스 중복(`idx_..._mode_mode`) 제거, FK 관례 검토 | 기존 1행 유지(무손실) |
| `fee_mode_audit` | **del_yn/del_dtm 추가** | - |
| `bean_txn` | `pi_amt` **의미 확장**(CHARGE 전용 → PI 모드 SPEND/REWARD도 Pi 금액 병기). 컬럼·타입 변경 없음, COMMENT만 갱신 | 신규 거래만, **기존 행 무영향** |
| `bean_fee_plan` | **변경 없음**(`amt_bean÷100`로 충분). 1:100 무결성은 뷰·검증으로 | - |

→ DDL은 sql/140 보강 1건 + `bean_txn` COMMENT 갱신뿐. **데이터 마이그레이션 없음**(기존 행 보존).

### 10-3. 추가될 뷰·함수

| 객체 | 역할 |
|---|---|
| `v_fee_plan_dual` (뷰) | `bean_fee_plan`에 Pi 환산(`amt_bean/100`) 컬럼 병기 — Bean·Pi 1:100 양쪽 동시 표시(관리 화면용) |
| `fn_rollback_fee_mode()` | `fee_mode_audit` 최신 역추적 → 직전 모드 원자 복원(롤백 보장) |
| (검증) 1:100 무결성 함수 | 모든 활성 요금 `amt_bean`의 ÷100 정합 확인(Bean 정수 → 항상 통과, 회귀 가드) |

### 10-4. 추가될 화면

| 화면 | 경로 | 내용 |
|---|---|---|
| **요금제 모드 관리** | `/admin/fee-mode` | ① 현재 모드(BEAN/PI) ② 전환 버튼(양방향)+사전검증(pending tx 0) ③ **1:100 매핑 요금표**(`v_fee_plan_dual`) ④ **롤백 버튼**(직전 모드) ⑤ 전환 이력(`fee_mode_audit`) |

### 10-5. 변경될 화면

| 화면 | 변경 내용 |
|---|---|
| 요금 표시(구독 `/subscribe`·카페 입장·배지·번역·부스팅) | 활성 모드에 따라 **Bean/Pi 표시 전환**(`resolveFee`). PI 모드 마이크로는 "무료"/구독은 Pi 결제 버튼 |
| 후기 작성·보상 안내(PRD_20) | 보상 금액을 모드별 **Bean/Pi 표시**(60 Bean ↔ 0.6 Pi) |
| Bean 지갑·충전 | PI 모드 시 안내(충전은 Pi, 마이크로 무료 고지) |
| 관리자 요금 관리 `/admin/token/fee-plan` | Bean/Pi **이중 표시**(1:100 검증 가시화) |

### 10-6. 코드 경로 변경(요약 — 화면 외)

| 경로 | 변경 |
|---|---|
| `src/lib/fee-resolver.ts` (신규) | 모드 조회 + Bean/Pi 환산. **DB(`bean_fee_plan`)+코드상수(`bean-fee.ts`) 양쪽 커버** |
| 구독 결제(`api/subscriptions/...`) | PI 모드 분기 → `window.Pi.createPayment`/`pi_pymnt` 경로 신설 |
| 보상 지급(후기·캠페인 `fn_bean_apply('REWARD')` 호출부) | PI 모드 분기 → `triggerPiReward` A2U(÷100) |
| 마이크로 과금(입장·번역·AI·배지·부스팅) | PI 모드 시 면제(무료) 분기 |

> ⚠️ 관리자 화면 신규 i18n 키는 **옆 세션 `ko.json` 작업과 조율**(직접 수정 금지, 추가 키 목록만 명시).

---

## 핵심 설계 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| **정본 테이블** | `bean_fee_plan` 1개만 유지 | 단일 출처 원칙(PRD_15_FEE) |
| **Pi 세트** | 파생 계산 (별도 테이블 ❌) | DB 정규화 + 수동 sync 버그 방지 |
| **런타임 전환** | DB 플래그 + 메모리 캐시(60s TTL) | db-switch/ui-theme 패턴 참고 |
| **Pi Browser** | 옵션 A (엄격 차단) | 메인넷 A-5 명확성 우선 |
| **거래 기록** | amt_bean + amt_pi 둘 다 기록 | 나중 감사/회계 추적용 |
| **감시** | fee_mode_audit 테이블 + 이력 조회 API | 관리자 투명성 + 문제 추적 |

---

## 연계 문서 & 정본

- **[[PRD_15_FEE]]**: Bean 경제 표준 요금 마스터
- **[[currency-routing-rule]]**: 거래 통화 라우팅 규칙
- **[[bean-fee-plan-standard]]**: bean_fee_plan 구조 메모리
- **docs/CLAUDE.md §7**: Pi Browser 핵심가치 + 제약
- **docs/MAINNET_READINESS_CHECKLIST.md C-1-F**: Pi 메인넷 A-5 요건

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|---|---|---|
| **v0.3** | 2026-06-29 | **롤백·1:100·REWARD Pi화 + 영향분석 사전정의(§10)** — ①양방향 롤백 보장(fn_rollback_fee_mode·bean_txn.pi_amt 병기) ②1:100 완벽매핑(단일출처+v_fee_plan_dual 뷰, 별도Pi테이블 금지) ③REWARD Pi화(후기·캠페인=triggerPiReward A2U ÷100, 이벤트는 기존 reward_pi_amt). §10에 추가/변경 테이블·데이터·화면 사전 정의. 신규테이블=fee_mode 2개뿐(bean_txn.pi_amt 재사용). |
| **v0.2** | 2026-06-29 | **설계 검토 반영(§0 신설)** — 핵심 모순(Pi 모드 실거래 미정의) 해소. 마스터 결정: ①Pi 모드=진짜 Pi 직결제(`createPayment`/`pi_pymnt`) ②마이크로 무료화 ③구독만 Pi화. "코드 변경 0" 철회·`fn_bean_apply(Pi)` 모델 삭제·단일출처(코드상수)·캐시 일관성·del_yn 보강 정정. §0이 본문보다 우선. |
| v0.1 | 2026-06-29 | 초안 — 전체 전략, 환산 규칙, 아키텍처, DB/API/UI 설계안 |

