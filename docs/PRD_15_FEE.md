# PRD_15_FEE.md — Cafe.pi 종합 요금 표준 (Bean 경제 표준 마스터)

> **작성일**: 2026-06-18
> **버전**: v0.1 (초안 · DB 미적용)
> **상태**: 설계 — 엑셀 교정본 확정 후 시드 확정
> **정본 위상**: ⭐ **BEAN 토큰 경제학의 표준 요금** — 플랫폼의 모든 과금(SPEND)·보상(REWARD) 금액의 단일 출처
> **입력 원본**: `docs/Fees/Cafe.pi요금제_20260618_v0.1.xlsx` ("요금제종합" 43행)
> **연계**: [[PRD_12_TOKEN.md]](Bean 원장 금액 출처) · [[PRD_14_SUBSC.md]](구독 요금)

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| v0.1 | 2026-06-18 | 최초 초안 — 엑셀 "요금제종합" 43행을 `bean_fee_plan` 표준 스키마로 매핑. 코드 정규화·공존 전략·통화/표기 규약·데이터 품질 교정 대기 목록. DB 미적용(문서 내 DDL 초안). | asoká |

---

## 1. 개요

### 1-1. 위상 — 왜 "표준"인가
`bean_fee_plan`은 단순 요금표가 아니라 **Cafe.pi Bean 경제의 단일 가격 정본**이다. 플랫폼이 당사자인 모든 거래(거래 통화 라우팅 §0 규칙 1)의 금액이 이 표에서 나온다:
- **구독료**(카페·스토어·자동번역) → `bean_ledger` SPEND
- **건당 요금**(카페 생성·입장, 스토어 노출·연장) → `bean_ledger` SPEND
- **보상**(O2O 등) → 별도 정책이나 금액 기준은 이 표와 정합

→ PRD_12의 `bean_ledger` SPEND/REWARD 금액은 **반드시 `bean_fee_plan`을 참조**한다(하드코딩 금지).

### 1-2. 기존 요금제와의 관계 (공존)
- 기존 **`msg_subscr_plan`(5종: Pi Explorer/Creator/Host 월·연)** 및 `chat-auth.ts` `PLAN_CAPS`는 **변경 없이 유지**(기존 구독 동작 보존).
- `bean_fee_plan`은 **신규 플랫폼 종합 요금 마스터**로 추가된다. 장기적으로 구독을 이쪽으로 통합할 수 있으나 본 PRD 범위 밖(보류).

### 1-3. 통화
- 금액 정본 = **Bean(커피빈 토큰)**. Pi 환산 = `amt_bean ÷ 100` (1 Pi = 100 Bean 고정).
- **표기 규약**(PRD_14 §2-3): 사용자 노출은 "이용권 / Bean 적립", "환금 불가·플랫폼 사용 전용". **"구매·투자·presale·코인" 금지**. 발행 전 IOU는 내부 용어만. 원화 비노출(레드라인 #2).
- 발행 전 과도기: Pi 결제 + Bean 병기 / 발행 후: Bean 직결제.

### 1-4. ⭐ 핵심 설계 의도 — 구독 = 패키지 할인

본 요금표의 중심 철학: **구독은 "건당 요금을 무료/할인으로 묶는 패키지"** 다.
- **일반요금제**(비구독, `*_GENERAL`) = 행위마다 **정가** 과금.
- **구독요금제**(구독자, `*_SUBSCR`) = 월/년 구독료를 내면 **그 상품군의 건당 요금이 무료/할인**.
- 대조 예 (같은 행위 · 비구독 → 구독):

  | 행위 | 비구독(GENERAL) | 구독(SUBSCR) |
  |---|---|---|
  | 카페 생성 프리미엄 | 10 Bean | **0** |
  | 카페 입장 이벤트 | 20 Bean | 5 Bean |
  | 스토어 노출 1주 일반 | 5 Bean | **0** |

- **과금 선택 규칙 (구현 핵심 분기)**: 어떤 행위에 과금할 때 → **사용자가 해당 상품 구독자면 `*_SUBSCR` 행 요금**, 아니면 **`*_GENERAL` 행 요금** 을 적용한다. (billing 함수가 `구독여부 × prod_ctgr × fee_knd × grade × cycle`로 1행을 선택)
- 즉 구독료는 "기능 잠금해제"가 아니라 **"반복 행위 비용의 선납 할인권"** — 활성 사용자(많이 쓰는 사람)일수록 구독 이득이 커지는 구조.

---

## 2. 코드 정규화 매핑 (엑셀 한글 → 표준코드)

| 차원 | 엑셀 값 | 표준코드 |
|---|---|---|
| 구독구분(`subscr_div_cd`) | 구독요금제 / 일반요금제 | `SUBSCR` / `GENERAL` |
| 상품구분(`prod_ctgr_cd`) | 카페구독 / 카페일반 / 스토어구독 / 스토어일반 / 자동번역구독 | `PICAFE_SUBSCR` / `PICAFE_GENERAL` / `PISTORE_SUBSCR` / `PISTORE_GENERAL` / `TRANSLATE_SUBSCR` |
| 요금종류(`fee_knd_cd`) | 구독 / 생성 / 입장 / 노출 / 연장 | `SUBSCR` / `CREATE` / `ENTER` / `EXPOSE` / `EXTEND` |
| 등급(`grade_cd`) | 일반 / 프리미엄 / 이벤트 | `GENERAL` / `PREMIUM` / `EVENT` |
| 결제주기(`bill_cycle_cd`) | Month / Year / W / M / 1 | `M` / `Y` / `W` / `M` / `ONCE` |

> 등급은 엑셀 `fee_plan_cd` 2~3째 글자(G/P/E)에서 도출. 요금종류는 "요금종류" 텍스트 기준(코드 letter 스킴이 카페·스토어 상이하여 텍스트를 정본으로).

---

## 3. `bean_fee_plan` 스키마 (DDL 초안 · 미적용)

> ⚠️ 발행 전 레드라인: 실제 `sql/*.sql` 파일·DB 적용 금지. 아래는 문서 내 초안. DA 표준단어(FEE·PLAN·GRADE·CYCLE·EXPOSE·EXTEND) 등록 + `da-ddl-guard` 승인 후 적용.

```sql
-- DA-APPROVED 대기: Bean 경제 표준 요금 마스터
CREATE TABLE public.bean_fee_plan (
  fee_plan_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_plan_cd    VARCHAR(20) NOT NULL UNIQUE,           -- 요금제코드 원본 (SM100, CGPC2 ...)
  subscr_div_cd  VARCHAR(10) NOT NULL CHECK (subscr_div_cd IN ('SUBSCR','GENERAL')),
  prod_ctgr_cd   VARCHAR(24) NOT NULL,                  -- PICAFE_SUBSCR / PISTORE_GENERAL ...
  fee_knd_cd     VARCHAR(16) NOT NULL,                  -- SUBSCR/CREATE/ENTER/EXPOSE/EXTEND
  grade_cd       VARCHAR(10) NOT NULL DEFAULT 'GENERAL' CHECK (grade_cd IN ('GENERAL','PREMIUM','EVENT')),
  bill_cycle_cd  VARCHAR(8)  NOT NULL CHECK (bill_cycle_cd IN ('M','Y','W','ONCE')),
  amt_bean       INT  NOT NULL DEFAULT 0,               -- 금액(Bean), 0=무료
  qty_limit      INT  NOT NULL DEFAULT 0,               -- 수량제한, 0=무제한
  fee_plan_desc  TEXT,
  use_yn         CHAR(1) NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y','N')),
  sort_ord       INT NOT NULL DEFAULT 0,
  del_yn         CHAR(1) NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_bean_fee_plan_cd   ON public.bean_fee_plan(fee_plan_cd);
CREATE INDEX idx_bean_fee_plan_ctgr ON public.bean_fee_plan(prod_ctgr_cd, fee_knd_cd, grade_cd);
CREATE INDEX idx_bean_fee_plan_use  ON public.bean_fee_plan(use_yn, del_yn);
```

> Pi 환산은 컬럼 추가 없이 표시 시 `amt_bean/100`으로 계산(정본 = Bean 단일). 스토어 구독 S/M/L의 상품 수 한도(30/50/무제한)는 `fee_plan_desc`에 보존(또는 향후 별도 컬럼).

---

## 4. 종합 요금표 (엑셀 43행 매핑)

> 금액 = Bean / (Pi 환산). **⚠️ 표식 행은 데이터 품질 교정 대기(§7)** — 시드 확정 전 엑셀 교정 필요.

### 4-1. 구독요금제 (`subscr_div_cd = SUBSCR`, `fee_knd_cd = SUBSCR`)

| 코드 | 상품구분 | 주기 | Bean | Pi | 설명 |
|---|---|---|---|---|---|
| SM100 | PICAFE_SUBSCR | M | 3000 | 30 | 카페 구독 — 단일 품목 |
| SY100 | PICAFE_SUBSCR | Y | 30000 | 300 | 카페 구독 — 년 |
| SM200 | PISTORE_SUBSCR (S) | M | 3000 | 30 | 스토어 구독 S — 상품 30개 이하 |
| SM300 | PISTORE_SUBSCR (M) | M | 4000 | 40 | 스토어 구독 M — 상품 50개 이하 |
| SM400 | PISTORE_SUBSCR (L) | M | 5000 | 50 | 스토어 구독 L — 상품 50개 초과 |
| SY200 | PISTORE_SUBSCR (S) | Y | 30000 | 300 | 스토어 구독 S — 년 |
| SY300 | PISTORE_SUBSCR (M) | Y | 40000 | 400 | 스토어 구독 M — 년 ⚠️("년월단위" 오타) |
| SY400 | PISTORE_SUBSCR (L) | Y | 50000 | 500 | 스토어 구독 L — 년 |
| SM500 | TRANSLATE_SUBSCR | M | 1000 | 10 | 자동번역 구독 — 월 |
| SY500 | TRANSLATE_SUBSCR | Y | 10000 | 100 | 자동번역 구독 — 년 |

### 4-2. 일반요금제 — 카페 (`PICAFE_GENERAL` = 카페일반, `PICAFE_SUBSCR` = 카페구독자 대상)

| 코드 | 상품구분 | 요금종류 | 등급 | 주기 | Bean | 수량 | 설명 |
|---|---|---|---|---|---|---|---|
| CGGC1 | PICAFE_GENERAL | CREATE | GENERAL | ONCE | 0 | 1 | 카페 생성 일반 |
| CGPC2 | PICAFE_GENERAL | CREATE | PREMIUM | ONCE | 10 | 1 | 카페 생성 프리미엄 |
| CGEC3 | PICAFE_GENERAL | CREATE | EVENT | ONCE | 20 | 1 | 카페 생성 이벤트 |
| CGGE1 | PICAFE_GENERAL | ENTER | GENERAL | ONCE | 0 | 1 | 카페 입장 일반 |
| CGPE2 | PICAFE_GENERAL | ENTER | PREMIUM | ONCE | 10 | 1 | 카페 입장 프리미엄 |
| CGEE3 | PICAFE_GENERAL | ENTER | EVENT | ONCE | 20 | 1 | 카페 입장 이벤트 |
| CSGC1 | PICAFE_SUBSCR | CREATE | GENERAL | ONCE | 0 | 1 | (구독자) 카페 생성 일반 |
| CSPC2 | PICAFE_SUBSCR | CREATE | PREMIUM | ONCE | 0 | 1 | (구독자) 카페 생성 프리미엄 |
| CSEC3 | PICAFE_SUBSCR | CREATE | EVENT | ONCE | 10 | 1 | (구독자) 카페 생성 이벤트 |
| CSGE1 | PICAFE_SUBSCR | ENTER | GENERAL | ONCE | 0 | 1 | (구독자) 카페 입장 일반 |
| CSPE2 | PICAFE_SUBSCR | ENTER | PREMIUM | ONCE | 0 | 1 | (구독자) 카페 입장 프리미엄 |
| CSEE3 | PICAFE_SUBSCR | ENTER | EVENT | ONCE | 5 | 1 | (구독자) 카페 입장 이벤트 |

> 별도 시트: 자동번역 1회 = 1 Bean, 음성채팅 10분 = 무료. (요금종류 `TRANSLATE`/`VOICE`로 추후 행 추가 검토)

### 4-3. 일반요금제 — 스토어 (`PISTORE_GENERAL` = 스토어일반, `PISTORE_SUBSCR` = 스토어구독자 대상)

| 코드 | 상품구분 | 요금종류 | 등급 | 주기 | Bean | 수량 | 설명 |
|---|---|---|---|---|---|---|---|
| SGGC1 | PISTORE_GENERAL | CREATE | GENERAL | ONCE | 0 | 0 | 스토어 상품 생성 일반 (무제한) |
| SGPC2 | PISTORE_GENERAL | CREATE | PREMIUM | ONCE | 10 | 0 | 스토어 상품 생성 프리미엄 |
| SGGDW | PISTORE_GENERAL | EXPOSE | GENERAL | W | 5 | 1 | 노출 1주 일반 |
| SGPDW | PISTORE_GENERAL | EXPOSE | PREMIUM | W | 10 | 1 | 노출 1주 프리미엄 |
| SGGDM | PISTORE_GENERAL | EXPOSE | GENERAL | M | 10 | 1 | 노출 1개월 일반 |
| SGPDM | PISTORE_GENERAL | EXPOSE | PREMIUM | M | 20 | 1 | 노출 1개월 프리미엄 |
| SGGEW | PISTORE_GENERAL | EXTEND | GENERAL | W | 5 | 1 | 연장 1주 일반 |
| SGPEW | PISTORE_GENERAL | EXTEND | PREMIUM | W | 10 | 1 | 연장 1주 프리미엄 |
| SGGEM | PISTORE_GENERAL | EXTEND | GENERAL | M | 10 | 1 | 연장 1개월 일반 |
| SGPEM | PISTORE_GENERAL | EXTEND | PREMIUM | M | 20 | 1 | 연장 1개월 프리미엄 |
| SSGC1 | PISTORE_SUBSCR | CREATE | GENERAL | ONCE | 0 | 0 | (구독자) 상품 생성 일반 |
| SSPC2 | PISTORE_SUBSCR | CREATE | PREMIUM | ONCE | 0 | 0 | (구독자) 상품 생성 프리미엄 |
| SSGDW | PISTORE_SUBSCR | EXPOSE | GENERAL | W | 0 | 1 | (구독자) 노출 1주 일반 |
| SSPDW | PISTORE_SUBSCR | EXPOSE | PREMIUM | W | 0 | 1 | (구독자) 노출 1주 프리미엄 |
| SSGDM | PISTORE_SUBSCR | EXPOSE | GENERAL | M | 10 | 1 | (구독자) 노출 1개월 일반 |
| SSPDM | PISTORE_SUBSCR | EXPOSE | PREMIUM | M | 5 | 1 | (구독자) 노출 1개월 프리미엄 ⚠️(프리미엄<일반 역전) |
| SSGEW | PISTORE_SUBSCR | EXTEND | GENERAL | W | 5 | 1 | (구독자) 연장 1주 일반 |
| SSPEW | PISTORE_SUBSCR | EXTEND | PREMIUM | W | 5 | 1 | (구독자) 연장 1주 프리미엄 |
| SSGEM | PISTORE_SUBSCR | EXTEND | GENERAL | M | 10 | 1 | (구독자) 연장 1개월 일반 |
| SSPEM | PISTORE_SUBSCR | EXTEND | PREMIUM | M | 10 | 1 | (구독자) 연장 1개월 프리미엄 |

---

## 5. 공존 전략 + Bean 원장 연결

| 테이블 | 역할 | 변경 |
|---|---|---|
| `msg_subscr_plan` (기존 5종) | PiCafe 구독 3-tier(Explorer/Creator/Host), PLAN_CAPS 기능 한도 | **유지·무변경** |
| `bean_fee_plan` (신규) | 플랫폼 종합 요금 + **Bean 경제 표준** | 신규 추가 |

- **PRD_12 연결**: `bean_ledger` SPEND/REWARD insert 시 금액은 `bean_fee_plan.amt_bean` 조회로 결정(하드코딩 금지). PRD_12 §11에 이 출처를 명시.
- 기존 5종 plan_cd는 `bean_fee_plan`에 중복 적재하지 않음(별도 체계). 장기 통합은 보류.

---

## 6. 레드라인·표기 적합성 체크

| 항목 | 상태 | 근거 |
|---|---|---|
| 원화 비노출 | ✅ | 금액 Bean/Pi만, 원화 없음 |
| 금지어(구매·투자·presale·코인) | ✅ | 미사용 |
| Bean 정본 표기 | ✅ | amt_bean 정본, Pi 환산 병기 |
| 발행 전 코드 0 | ✅ | sql 미적용·문서 내 DDL 초안만 |
| IOU 내부 한정 | ✅ | 사용자 노출은 "이용권/Bean 적립" |

---

## 7. 데이터 품질 — 교정 대기 (시드 확정 전 블로킹)

엑셀 `docs/Fees/Cafe.pi요금제_20260618_v0.1.xlsx` 교정 필요. **임의 보정하지 않음.**

| # | 코드 | 의심 | 확인 필요 |
|---|---|---|---|
| 1 | SSPDM vs SSGDM | 프리미엄(5) < 일반(10) — 역전 | 의도? 아니면 값 교정 |
| 2 | SY300 | "년월단위" 오타 | "년단위"로 교정 |
| 3 | (전반) | "월구독료(Bean)" 컬럼이 일반요금제선 "건당/노출 요금" 의미 — 컬럼 의미 이중성 | 컬럼명/해석 확정 |
| 4 | SSGDM(10) vs SGGDM(10) / SSPDM(5) vs SGPDM(20) | 구독자 노출가가 일반보다 낮거나 역전 혼재 | 구독 할인 정책 일관성 확인 |

→ 교정본 주시면 §4 표·시드를 확정한다.

---

## 8. 검증 방법
- **무손실 라운드트립**: 엑셀 43행 ↔ `bean_fee_plan` 매핑·역매핑 시 행·컬럼 일치(코드 정규화 역변환 포함).
- **환산 검증**: 전 행 `Pi = amt_bean / 100`.
- **기존 불변**: `msg_subscr_plan` 5종·`PLAN_CAPS` 무변경 확인.
- **표준 참조**: `bean_ledger` 금액이 `bean_fee_plan`을 참조(하드코딩 0건).

---

## 9. 다음 단계
1. 마스터님: 엑셀 의심 데이터(§7) 교정.
2. 교정본 반영해 §4 표·시드 확정.
3. DA: 신규 표준단어 등록(FEE/PLAN/GRADE/CYCLE/EXPOSE/EXTEND) + DDL 승인.
4. (Bean 발행 후) `sql/0xx_bean_fee_plan.sql` 적용 + `bean_ledger` 연동.
