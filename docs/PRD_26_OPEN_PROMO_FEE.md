# PRD_26: 오픈기념행사 기간한정 무료요금 정책

**정책 정본**: 2026-06-30 v0.1  
**작성자**: 아소카 (요금전문 매니저)  
**상태**: 설계 완료, 구현 진행중

---

## 1. 정책 개요

### 목표
cafe.pi 플랫폼이 공개(오픈) 기간 동안 모든 상품·기능의 요금을 **한시적으로 무료화**한 뒤, 행사 종료 시점에 **자동으로 정상 요금으로 복귀**하도록 관리하는 정책입니다. 이를 **단 하나의 스위치(OneKey)**로 제어합니다.

### 핵심 원칙
1. **원자적 복귀**: 프로모션 무료는 "런타임 게이트(프로모 활성 플래그)"로만 표현. 실제 정상요금은 `bean_fee_plan`에 그대로 보존하고, 프로모 ON이면 게이트가 요금을 **0으로 오버라이드**합니다. 종료 시 게이트만 해제하면 즉시 정상요금이 복귀되므로 데이터 손실·재설정 불필요.

2. **단일 출처 준수**: 정상요금의 정본은 `bean_fee_plan` 테이블 + `src/lib/bean-fee.ts` 코드 상수이며, 프로모션 무료 여부와 무관하게 **변경 금지**.

3. **OneKey = 프로모션 단일 토글**: 모든 9개 품목의 무료화는 `promo_fee_config` 테이블의 단일 레코드 `promo_active_yn='Y'` 하나로 제어합니다. 관리자가 이 플래그를 켜고 끄는 것만으로 전체 무료/정상요금 전환이 완료됩니다.

4. **종료 시점 기반 자동 복귀**: 프로모 ON + 현재시각이 `promo_end_dtm` 도달 → 자동 OFF(또는 판정 함수에서 FALSE 반환). 캐시 사용 시 짧은 TTL(60s) + 원자적 무효화로 즉시성 보장.

5. **dual-fee(BEAN|PI) 정합성**: 프로모 무료 게이트는 BEAN·PI 두 모드 모두에서 동작하여 모드 전환과 무관하게 행사 중 무료, 종료 후 정상요금을 보장합니다.

---

## 2. 무료화 대상 (9개 품목, 전수)

| # | 품목 | 정상요금(비구독) | 정상요금(구독) | 프로모 중 | 비고 |
|---|---|---|---|---|---|
| 1 | PyCafé™ 프리미엄 **생성** | 10 Bean | 0 Bean | **0** | getRoomFeeBean('CREATE','PREMIUM',false) |
| 2 | PyCafé™ 이벤트 **생성** | 20 Bean | - | **0** | getRoomFeeBean('CREATE','EVENT',false) |
| 3 | PyCafé™ 프리미엠 **입장** | 10 Bean | 0 Bean | **0** | getRoomFeeBean('ENTER','PREMIUM',false) |
| 4 | PyCafé™ 이벤트 **입장** | 호스트설정 | - | **0** | eventEntryFeeBean (호스트 설정값) |
| 5 | PyCafé™ 기간연장 | TBD | 무료 | **0** | 미정의·향후 추가 |
| 6 | PyShop™ 상품 생성 프리미엄 | TBD | 무료 | **0** | 미정의·향후 추가 |
| 7 | 노출 1주 (일반/프리미엄) | TBD | 무료 | **0** | 미정의·향후 추가 |
| 8 | **PyTranslate™** 건당 | 1 Bean | 무료 | **0** | TRANSLATE_ONCE_BEAN, 비구독자만 과금 |
| 9 | **AI(@ai)** 초과 건당 | 5 Bean | 무료 | **0** | AI_EXTRA_BEAN, PREMIUM 월 10회 초과 시만 과금 |
| 10 | **카페 부스팅** (7일 우선) | 50 Bean | 무료 | **0** | ROOM_BOOST_BEAN, 방장 광고성 구매 |

**주**: 
- PyCafé™ 일반 생성/입장 = 원래 무료(정상요금 0) → 프로모와 무관
- 구독자 = 정상시간에도 패키지 할인으로 무료 → 프로모 무료와 중복 무관
- 품목 5~7은 미정의 기능·향후 추가 시 이 정책 준용

---

## 3. 데이터 모델 & OneKey 토글

### 테이블: `promo_fee_config`

프로모션 활성 상태를 관리하는 단일 테이블입니다. **최신 mod_dtm 행이 권위**(fee_mode_config 패턴 동일).

```sql
CREATE TABLE public.promo_fee_config (
  promo_fee_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_active_yn  CHAR(1)     NOT NULL DEFAULT 'N' CHECK (promo_active_yn IN ('Y','N')),
  promo_start_dtm  TIMESTAMPTZ,           -- 프로모 시작 시각 (NULL = 지정 안 됨)
  promo_end_dtm    TIMESTAMPTZ,           -- 프로모 종료 시각 (NULL = 무제한, 수동 OFF까지)
  reason_memo      TEXT,                  -- 활성화 사유 (예: "오픈기념행사")
  del_yn           CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm          TIMESTAMPTZ,
  regr_id          TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id          TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE  public.promo_fee_config            IS '오픈기념행사 무료요금 정책 (OneKey 토글) — PRD_26';
COMMENT ON COLUMN public.promo_fee_config.promo_active_yn  IS 'Y=무료화 활성 / N=정상요금 복귀';
COMMENT ON COLUMN public.promo_fee_config.promo_start_dtm  IS '프로모 시작 시각 (TIMESTAMPTZ, 현지시간 기준)';
COMMENT ON COLUMN public.promo_fee_config.promo_end_dtm    IS '프로모 종료 시각 (종료 후 자동 OFF)';
```

### RPC: `fn_is_open_promo_active()`

프로모션 활성 여부를 판정합니다. 활성 플래그 + 시간 범위로 원자적으로 평가합니다.

```sql
CREATE OR REPLACE FUNCTION public.fn_is_open_promo_active()
RETURNS BOOLEAN AS $$
  SELECT promo_active_yn = 'Y' 
    AND (promo_start_dtm IS NULL OR CURRENT_TIMESTAMP >= promo_start_dtm)
    AND (promo_end_dtm IS NULL OR CURRENT_TIMESTAMP < promo_end_dtm)
  FROM public.promo_fee_config
  WHERE del_yn = 'N'
  ORDER BY mod_dtm DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION public.fn_is_open_promo_active() 
  IS '오픈기념행사 프로모션 활성 여부 (활성플래그 + 시간범위) — PRD_26';
```

### 서버 함수: `isOpenPromoActive()` (src/lib/fee-resolver.ts)

```typescript
/** 오픈기념행사 프로모션 활성 여부. 모든 요금 게이트의 단일 출처. */
export async function isOpenPromoActive(): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc(
      'fn_is_open_promo_active',
    )
    if (error) return false
    return data === true
  } catch {
    return false
  }
}
```

---

## 4. 요금 청구 경로 & 게이트 적용

### 원칙
모든 9개 품목의 요금 청구 경로는 **반드시 `isOpenPromoActive()` 게이트를 통과**해야 합니다. 프로모 ON이면 정상 요금 대신 **0을 반환**.

### 적용 지점 (서버 오버라이드)

각 청구 API route에서 요금 계산 후, 프로모 활성 시 0으로 오버라이드합니다:

```typescript
// 예: 카페 생성료 (src/app/api/chat/rooms/group/route.ts)
import { isOpenPromoActive } from '@/lib/fee-resolver'

let createFeeBean = getRoomFeeBean('CREATE', 'PREMIUM', false)  // 정상요금(10 Bean)

// 프로모션 무료화 게이트
if (await isOpenPromoActive()) {
  createFeeBean = 0  // 무료로 오버라이드
}

// 이후 잔액 검증·차감 로직 그대로
if (feeMode === 'BEAN') {
  const bal = await getBalance(user.id)
  if (bal < createFeeBean) {  // 프로모 중 0 < 0 = false → 통과
    return NextResponse.json({ error: '잔액부족', ... }, { status: 402 })
  }
  await applyBean(user.id, -createFeeBean)  // 프로모 중 -0 = no-op
}
```

### 9개 품목별 적용 파일 (예상 위치)

| # | 품목 | 파일 경로 | 함수/변수 |
|---|---|---|---|
| 1-2 | PyCafé™ 생성(프리미엄/이벤트) | `src/app/api/chat/rooms/group/route.ts` | `createFeeBean` |
| 3-4 | PyCafé™ 입장(프리미엄/이벤트) | `src/app/api/chat/rooms/[roomId]/join/route.ts` | `enterFeeBean` |
| 5 | 기간연장 | TBD | TBD |
| 6 | PyShop™ 상품생성프리미엄 | TBD | TBD |
| 7 | 노출(1주) | TBD | TBD |
| 8 | PyTranslate™ 건당 | `src/app/api/chat/rooms/[roomId]/messages/[msgId]/translate/route.ts` | `TRANSLATE_ONCE_BEAN` |
| 9 | AI(@ai) 초과 호출 | TBD | `AI_EXTRA_BEAN` |
| 10 | 카페 부스팅 | `src/app/api/chat/rooms/[roomId]/boost/route.ts` | `ROOM_BOOST_BEAN` |

---

## 5. 관리자 OneKey 토글 UI

### 엔드포인트: `POST /api/admin/open-promo`

```typescript
// 요청 본문
{
  "action": "activate" | "deactivate" | "set-times",
  "start_dtm"?: "2026-07-01T00:00:00Z",  // ISO 8601, TIMESTAMPTZ로 저장
  "end_dtm"?: "2026-07-31T23:59:59Z",    // ISO 8601
  "reason"?: "오픈기념행사"
}

// 응답
{
  "ok": true,
  "active_yn": "Y" | "N",
  "start_dtm": "2026-07-01T00:00:00+00:00",
  "end_dtm": "2026-07-31T23:59:59+00:00",
  "changed_by": "admin_username",
  "mod_dtm": "2026-06-30T12:34:56+00:00"
}
```

### 관리자 UI 화면 (`/admin/open-promo`)

- **현재 상태 표시**: 활성/비활성 + 시작·종료 시각 (현지시간 + 시·분·초)
- **OneKey 토글**: 활성화 / 비활성화 버튼
- **시간 설정**: 시작·종료 시각 picker (TIMESTAMPTZ, 현지시간)
- **확인 다이얼로그**: "프로모션을 활성화하면 모든 9개 품목이 무료화됩니다" 경고
- **이력 표시**: 최근 전환 5건 (변경자·변경시각·사유)

---

## 6. 종료 방식 & 자동 복귀 보장

### 수동 OFF (즉시)
관리자가 `/api/admin/open-promo`에서 "비활성화" 버튼 → `promo_active_yn='N'` 업데이트 → 다음 요금 청구 시점부터 정상요금 적용.

### 자동 OFF (예정시각 도달)
- 종료 시각(`promo_end_dtm`) 설정 후 도래 → `fn_is_open_promo_active()` 판정이 자동 FALSE 반환
- 캐시 사용 시: TTL 60초 + 종료 1분 전 원자적 무효화(또는 종료시각 진입 즉시 요청 시점에 다시 조회)
- **캐시 정책**: 클라이언트 표시(프로모 라벨)는 60초 캐시 허용(TTL), 서버 요금 청구는 결제 시점에 항상 DB 직접 조회(전환 직후 혼재 방지)

### 종료 시나리오 검증

**시나리오 1: 수동 OFF**
```
1. 관리자가 비활성화 버튼 클릭
2. POST /api/admin/open-promo { action: "deactivate" }
3. promo_active_yn = 'N' 업데이트
4. 다음 요청부터 isOpenPromoActive() = false
5. 요금 청구 시 정상요금 적용 ✓
```

**시나리오 2: 자동 OFF (시간 도달)**
```
1. 프로모 활성화: promo_active_yn='Y', promo_end_dtm='2026-07-31T23:59:59Z'
2. 2026-08-01 00:00:00 도달
3. fn_is_open_promo_active() → CURRENT_TIMESTAMP < promo_end_dtm = false
4. 요금 청구 시점에 isOpenPromoActive() = false
5. 정상요금 자동 복귀 ✓
```

---

## 7. Pi 등재 레드라인 & 핵심가치 보호

### A-5 준수
프로모션 무료화는 **요금 게이트(조건부 무시)**이므로 Pi 가치평가 노출(통화·환율)과는 무관합니다. 단, 프로모 중 고객에게 "무료(오픈기념)" 라벨 표시 시 마스터의 허가 필요.

### Pi Browser 로그인·결제 핵심가치 무손상
- 프로모션은 **요금 청구 후처리(차감 금액 0)**일뿐, 결제 진입 경로(`window.Pi.createPayment`) 변경 없음
- Pi 직결제 모드(PI)에서도 프로모 게이트 동작하여 결제 호출 자체를 0원으로 처리

---

## 8. 정합성 체크리스트

### 요금 출처 (단일성)
- [ ] `bean_fee_plan` 테이블: 정상요금 정본 (변경 금지)
- [ ] `src/lib/bean-fee.ts` 코드 상수: TRANSLATE_ONCE_BEAN, AI_EXTRA_BEAN, ROOM_BOOST_BEAN (변경 금지)
- [ ] 프로모션 무료 = 게이트 오버라이드만 (정본 수정 금지)

### OneKey 토글 (단일성)
- [ ] `promo_fee_config.promo_active_yn` 단일 플래그로 모든 9개 품목 제어
- [ ] `/api/admin/open-promo`에서만 상태 수정 (타 경로 수정 금지)

### 9개 품목 전수 게이트 적용
- [ ] PyCafé™ 프리미엄 생성
- [ ] PyCafé™ 이벤트 생성
- [ ] PyCafé™ 프리미엄 입장
- [ ] PyCafé™ 이벤트 입장
- [ ] PyCafé™ 기간연장 (미구현·향후 추가)
- [ ] PyShop™ 상품생성프리미엄 (미구현·향후 추가)
- [ ] 노출 1주 (미구현·향후 추가)
- [ ] PyTranslate™ 건당
- [ ] AI(@ai) 초과 건당
- [ ] 카페 부스팅

### 종료 복귀 (원자성)
- [ ] 수동 OFF: 즉시 정상요금 적용
- [ ] 자동 OFF: 종료시각 도달 시 isOpenPromoActive() FALSE 반환 → 정상요금 자동 복귀
- [ ] 정상요금 정의 비파괴 (bean_fee_plan 변경 없음)

### dual-fee(BEAN|PI) 정합성
- [ ] BEAN 모드: 프로모 무료 → Bean 차감 0
- [ ] PI 모드: 프로모 무료 → Pi 결제 0원 (또는 결제 진입 자체 스킵)

### 클라이언트 표시
- [ ] 프로모 활성 시 "무료(오픈기념)" 라벨 표시 (UI 게이트)
- [ ] FeatureFlagProvider Context에 `isOpenPromoActive` 주입
- [ ] 라벨 표시는 60초 TTL 캐시 허용

### 캐시 정책
- [ ] 서버 요금 청구: 결제 시점에 항상 DB 직접 조회 (캐시 금지)
- [ ] 클라이언트 표시: 60초 TTL + 종료 1분 전 원자적 무효화

---

## 9. 롤백 & 긴급복구

### 긴급 비활성화 (프로모 중 오류 발생)
```bash
# Admin POST /api/admin/open-promo
{ "action": "deactivate", "reason": "긴급복구: 요금청구 오류" }
```

### 상태 조회
```bash
# Admin GET /api/admin/open-promo
# 응답: { active_yn: "Y", start_dtm, end_dtm, history: [...] }
```

### 데이터 검증
```sql
-- 프로모션 활성 상태 확인
SELECT fn_is_open_promo_active();

-- 최신 설정 조회
SELECT promo_active_yn, promo_start_dtm, promo_end_dtm, mod_dtm
FROM promo_fee_config
WHERE del_yn='N'
ORDER BY mod_dtm DESC LIMIT 1;
```

---

## 10. 향후 확장

- **품목 5~7 추가**: 기간연장료, PyShop 생성 프리미엄, 노출 요금이 정의되면 동일 게이트 적용
- **프로모 다중화**: 현재는 단일 오픈기념행사이나, 향후 복수 프로모(시즌세일·할인이벤트 등)로 확장 시 `promo_type_cd` 컬럼 추가 검토
- **부분 할인**: 현재는 0% (전액무료)이나, 향후 50% 할인 등 율을 지원하려면 `promo_discount_rate` 컬럼 추가 검토

---

## 참고 문서

- **PRD_24_FEES_STRATAGE.md**: dual-fee(BEAN|PI) 요금제 전환 정책
- **PRD_15_FEE.md**: 정상요금 정본 (bean_fee_plan)
- **docs/CLAUDE.md**: 코드 스타일·커밋 규칙

---

**End of PRD_26**
