# PRD_14_SUBSC_REDESIGN.md — 신규 구독 시스템 (상품별 구독 · 현행 대체)

> **작성일**: 2026-06-18
> **버전**: v0.1 (설계 확정용 초안 · 코드/DB 미적용)
> **상태**: 설계 — 화면·데이터모델 확정. `bean_fee_plan` 시드(엑셀 §7 교정) 후 구축 착수.
> **위상**: ⭐ **현행 구독 시스템(`msg_subscr_plan` 3-tier) 파기, 본 설계로 전면 대체** (2026-06-18 마스터 지시)
> **정본 연계**: [[PRD_15_FEE.md]](요금 단일 정본 `bean_fee_plan`) · [[PRD_12_TOKEN.md]](`bean_ledger`) · [[currency-routing-rule]]
> **선행 구현(유지)**: Bean 충전 — `bean_wlt`/`bean_txn`/`fn_bean_apply`/`/bean` (sql/067, 운영 검증 완료)

---

## 1. 왜 현행을 파기하는가

| 축 | 현행(파기) | 신규(본 설계) |
|---|---|---|
| 단위 | 사용자 등급 1개 (Explorer/Creator/Host) | **상품군별 독립 구독** (PyCafé™·PyShop™·자동번역), 동시 다중 |
| 가치 제안 | "프리미엄 기능 잠금해제" | **"건당 요금을 면제·할인하는 패키지"** (PRD_15 §1-4) |
| 요금 출처 | `msg_subscr_plan.price_pi` | **`bean_fee_plan.amt_bean`** (단일 정본, 하드코딩 금지) |
| 결제 통화 | Pi 직접결제(CHAT_SUBSCR) | **Bean 차감(SPEND)** — Pi 접점은 충전 한 곳 |
| 데이터 | `msg_subscr` (usr 1행 1 plan_cd) | **`bean_subscr` (usr × 상품군 다중행)** |

**핵심 사상 (PRD_15 §1-4):** 구독료는 "기능 해제권"이 아니라 **반복 행위 비용의 선납 할인권**. 많이 쓰는 사용자일수록 이득이 커진다.
- 비구독 = 행위마다 정가(`*_GENERAL`). 구독 = 그 상품군 건당 요금이 0/할인(`*_SUBSCR`).

---

## 2. 신규 구독 상품 (PRD_15 §4-1, 금액=Bean / Pi환산)

| 상품군 | 등급 | 월 | 년(2개월 무료) | 비고 |
|---|---|---|---|---|
| ☕ PyCafé™ 구독 | 단일 | 2,000 / 20π | 20,000 / 200π | 카페 생성·입장 건당요금 면제 |
| 🏪 PyShop™ 구독 | S (상품 10개↓) | 3,000 / 30π | 30,000 | 노출·생성 건당요금 면제 |
| 🏪 PyShop™ 구독 | M (상품 30개↓) | 4,000 / 40π | 40,000 | |
| 🏪 PyShop™ 구독 | L (상품 30개↑) | 5,000 / 50π | 50,000 | |
| 🌐 자동번역 구독 | 단일 | 1,000 / 10π | 10,000 / 100π | 비구독 1회 1 Bean → 무제한 |

> ⚠️ 위 금액은 PRD_15 §4 잠정값. **엑셀 §7 교정(프리미엄<일반 역전·"년월단위" 오타) 확정 전 시드 금지.**

---

## 3. 데이터 모델 — `bean_subscr` (DDL 초안 · 미적용)

> 발행 전 레드라인: 실제 `sql/*.sql`·DB 적용은 시드 확정 + DA 승인 후. 아래는 문서 초안.

```sql
-- 상품군별 다중 구독 (현행 msg_subscr 대체)
CREATE TABLE public.bean_subscr (
  subscr_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id        TEXT NOT NULL,                         -- sys_user.id
  prod_ctgr_cd  VARCHAR(16) NOT NULL,                  -- PICAFE / PISHOP / TRANSLATE (구독 대상 상품군)
  grade_cd      VARCHAR(10) NOT NULL DEFAULT 'GENERAL',-- PyShop™: S/M/L, 그 외 단일
  bill_cycle_cd VARCHAR(8)  NOT NULL,                  -- M / Y
  fee_plan_cd   VARCHAR(20) NOT NULL,                  -- 구독 시점 적용 bean_fee_plan 코드 스냅샷 (SM100 등)
  amt_bean      INT NOT NULL,                          -- 결제한 구독료 Bean 스냅샷
  start_dtm     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expire_dtm    TIMESTAMPTZ NOT NULL,
  auto_renew_yn CHAR(1) NOT NULL DEFAULT 'Y',
  del_yn        CHAR(1) NOT NULL DEFAULT 'N',
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- 상품군당 1활성 (등급·주기 변경은 덮어쓰기). 부분 UNIQUE.
CREATE UNIQUE INDEX uq_bean_subscr_active ON public.bean_subscr(usr_id, prod_ctgr_cd) WHERE del_yn = 'N';
```

**구독 활성 판정:** `prod_ctgr_cd`별 `del_yn='N' AND expire_dtm > now()` 행 존재 여부.

---

## 4. 빌링 분기 사상 (구현 핵심)

모든 과금 행위는 **`bean_fee_plan` 1행 조회 → SPEND**. 하드코딩 금지.

```
요금부과(usr, prod, fee_knd, grade, cycle):
  구독중? = bean_subscr 활성(usr, prod)
  div = 구독중 ? 'SUBSCR' : 'GENERAL'
  row = bean_fee_plan WHERE prod_ctgr_cd = prod||'_'||div
                        AND fee_knd_cd = fee_knd AND grade_cd = grade
                        AND bill_cycle_cd = cycle AND use_yn='Y' AND del_yn='N'
  amt = row.amt_bean
  amt > 0 → applyBean(usr, 'SPEND', -amt, ref_tp=fee_knd, ref_id=...)   -- 0이면 무과금(면제)
```

- 구독 자체 결제도 동일 경로: `fee_knd='SUBSCR'` 행(SM100 등) 금액으로 `applyBean SPEND` + `bean_subscr` upsert를 **원자 함수**(`fn_bean_subscribe_product`)로 처리.
- 잔액 부족 → `INSUFFICIENT_BEAN` → 화면이 `/bean` 충전 유도.

---

## 5. 화면 스펙

| 항목 | 값 |
|---|---|
| 라우트 | `GET /[locale]/subscribe` (게이트 패턴, redirect 금지) |
| 결제 | Bean 차감(내부) → **window.Pi 불필요**, 일반 브라우저 가능 |
| 진입경로 | 프로필 구독현황 / PyShop™ 매장관리 / 카페·번역 기능 게이트 / 만료알림 |

**와이어프레임 (상품별 카드 + 면제 증거):**
```
┌─────────────────────────────────────────────┐
│ Cafe.pi 구독        내 Bean 9,900 ☕ [+충전]  │
│ 💡 구독 = '건당 요금 면제 패키지'. 많이 쓸수록 이득 │
│                              [ 월간 ⇄ 연간 ]  │
├─────────────────────────────────────────────┤
│ ☕ PyCafé™ 구독                 월 2,000 ☕      │
│   구독하면 면제: 프리미엄 생성 10→0 · 입장 10→0 │
│                  이벤트 입장 20→5   [ 구독하기 ]│
├─────────────────────────────────────────────┤
│ 🏪 PyShop™ 구독   (내 상품 23개 → M 추천)      │
│   ●S 3,000  ○M 4,000  ○L 5,000               │
│   면제: 노출 1주 5→0 · 프리미엄 생성 10→0       │
│                                  [ 구독하기 ] │
├─────────────────────────────────────────────┤
│ 🌐 자동번역 구독              월 1,000 ☕        │
│   비구독 1회 1 ☕ → 구독 무제한 무료 [ 구독하기 ]│
└─────────────────────────────────────────────┘
```

**상태:** ①미인증=클라이언트 게이트 ②상품군별 [미구독→구독하기 / 구독중→갱신·등급변경·해지] ③잔액부족=충전 유도 ④처리중 ⑤완료=토스트+잔액·구독상태 갱신.

**차별 UX:** (a) 등급카드 아닌 **상품카드**, (b) 각 카드에 **before→after 면제 증거**, (c) PyShop™ **상품 수 기반 등급 자동추천**(`mps_item` 카운트), (d) 확장: "이번 달 낸 건당요금 X→구독 시 Y" **ROI 배너**.

---

## 6. 마이그레이션 (현행 → 신규)

| 대상 | 처리 |
|---|---|
| `msg_subscr` (구독 레코드) | 폐기 → `bean_subscr`로 대체. 기존 활성 구독 이관 정책 필요(보상/잔여기간). |
| `msg_subscr_plan` (5종 tier) | 폐기 또는 `use_yn='N'` 비활성. `bean_fee_plan` SUBSCR 행으로 대체. |
| `chat-auth.ts PLAN_CAPS` | 기능한도 게이팅을 "구독여부 기반"으로 재해석. 자동번역 게이트(canAutoTranslate)는 `TRANSLATE` 구독 기준으로 전환. |
| `/api/subscriptions/*`, `useSubscribePlan`, `CHAT_SUBSCR` 분기 | 신규 빌링 경로로 교체. |

> 기존 활성 구독자(`msg_subscr` 5행)의 잔여기간 이관·환산은 마스터 결정 필요(§7).

---

## 7. 선결·미결 (구축 착수 전 블로킹)

1. **엑셀 요금 교정** (PRD_15 §7) — 프리미엄<일반 역전·"년월단위" 오타. 마스터 교정 → `bean_fee_plan` 시드 확정.
2. **DA 표준단어 등록** — FEE/PLAN/GRADE/CYCLE/EXPOSE/EXTEND + 신규 `subscr` 도메인 검토.
3. **발행 전 레드라인** — `bean_fee_plan`·`bean_subscr` 모두 시드/DDL 확정 후 적용. 오프체인 Bean 잔액 기준(발행 후 온체인 전환).
4. **기존 구독자 이관 정책** — 5종 tier 활성 구독의 잔여기간 처리.
5. **PLAN_CAPS 재해석** — 기능 한도 ↔ 상품별 구독 매핑 확정.

→ 위 1·4·5 확정 시 `bean_subscr` DDL·`fn_bean_subscribe_product`·신규 화면 구축 착수.
