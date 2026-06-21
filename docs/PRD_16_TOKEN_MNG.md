# PRD_16_TOKEN_MNG.md — Bean Token 경제 관리 시스템

> **작성일**: 2026-06-19
> **버전**: v1.0 (초안)
> **상태**: 설계 — 구현 검토 후 DB 마이그레이션 진행
> **작성자**: asoká (bean-token-manager 에이전트)
> **정본 위상**: Bean Token(☕) 경제학 기반 어드민 관리 시스템의 완전한 요구사항 명세
> **연계**: [[PRD_15_FEE.md]](Bean 경제 표준 요금) · [[PRD_14_SUBSC.md]](구독 요금제) · [[currency-routing-rule]](거래 통화 라우팅)

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| v1.4 | 2026-06-20 | **이벤트방 입장료 Bean 전환 반영**: §2-3-1 결제(OUT) 표에 "이벤트방 입장료(`entry_fee_pi`×100, `ref=EVENT_ENTER`, GUEST 한시입장)" 추가, 잔여 Pi 결제 표에서 제거. [[PRD_15_FEE]] #6 완료와 동기화. | asoká |
| v1.3 | 2026-06-20 | **플랫폼 Bean 결제 정책·실적용 현황 반영**: §2-3-1 신설 — "Pi 직결제 폐기 → Bean 선충전 후 Bean 결제 일원화" 정책 + 라이브 DB 검증(충전 1·SPEND 4·REFUND 2, ref_tp=ROOM_CREATE/ROOM_ENTER)으로 결제 종류별 적용·테스트 여부 전수. 요금 정본 위치([[PRD_15_FEE]] §1-5) 링크. 충전(IN)=유일 Pi 접점, 결제(OUT)=Bean SPEND 명문화. | asoká |
| v1.2 | 2026-06-19 | **소각(Burn) 개념 전면 제거**: Bean은 소각 없음 — USER↔PLATFORM 지갑 간 순환만 존재. §2-5-1 "소각 없음 원칙" 신설. `Total Burned`→`Total Collected`, `burn_rate_percent`→`collection_rate_percent`, `burned_bean_daily`→`collected_bean_daily` 전환. KPI "Platform Revenue Ratio"→"Platform Collection Rate" 재정의. | asoká |
| v1.1 | 2026-06-19 | **핵심 개념 확정 — 빈토큰지갑(bean_token_wallet) 통일**: §2-7(핵심 개념), §2-8(명명 규칙) 신설. `bean_wlt` 전체 → `bean_token_wallet` 교체. `wallet_type`(PLATFORM/USER) 도입으로 발행 관리와 사용자 보유를 단일 엔티티로 통합. PLATFORM 지갑 DDL·일관성 검증식 추가. §13-0 명명 규칙 비즈니스 규칙 6항 추가. | asoká |
| v1.0 | 2026-06-19 | 최초 초안 — Bean Token 경제 시스템 완전 명세. ① 토큰 대시보드(발행·유통·소각 KPI) ② 매출 관리(Pi→Bean 충전 매출·구독 소비·수수료) ③ 순환 관리(입금·출금·소각·감사) ④ 보상 경제 설계(O2O 보상 Bean 지급 정책) ⑤ 어드민 조치(수동 조정·이상거래 감지·동결) ⑥ KPI 지표(유통속도·충전소비비율·잔고분포). DB 스키마·API·화면·비즈니스 규칙 전수. | asoká |

---

## 목차

1. [개요](#1-개요)
2. [Bean Token 기본 원칙](#2-bean-token-기본-원칙)
3. [토큰 경제 아키텍처](#3-토큰-경제-아키텍처)
4. [토큰 현황 관리 화면](#4-토큰-현황-관리-화면)
5. [매출 관리 시스템](#5-매출-관리-시스템)
6. [순환·감사 관리](#6-순환감사-관리)
7. [보상 경제(O2O Reward)](#7-보상-경제o2o-reward)
8. [어드민 조치 기능](#8-어드민-조치-기능)
9. [KPI 및 경제 지표](#9-kpi-및-경제-지표)
10. [DB 스키마](#10-db-스키마)
11. [API 명세](#11-api-명세)
12. [화면 목록 및 UI 명세](#12-화면-목록-및-ui-명세)
13. [비즈니스 규칙](#13-비즈니스-규칙)
14. [보안 요구사항](#14-보안-요구사항)
15. [구현 우선순위](#15-구현-우선순위)

---

## 1. 개요

### 1-1. 목적

Cafe.pi의 Bean Token(☕ 카페빈 토큰) 경제를 통합 관리하는 어드민 시스템을 구축한다.

**목표**:
- **발행·유통·회수 전체 흐름 가시화** — 총 발행량, 유통량, 플랫폼 회수량, 수익 추이
- **매출 및 수익 추적** — Pi 충전 매출, 구독 소비, 플랫폼 수수료 수익
- **경제 순환성 모니터링** — 입금(충전), 출금(소비), 회수(PLATFORM 귀환), 보상 흐름
- **이상거래 감지 및 개입** — 대량 충전/소비, 음수 잔액, 이상 행위 알림
- **O2O 보상 정책 운영** — Bean Token 보상 지급, 한도 관리, 재원 추적
- **경제 지표 분석** — 토큰 유통속도, 충전/소비 비율, 사용자 잔고 분포

### 1-2. 스코프

**포함 사항**:
- 토큰 현황 대시보드 (KPI 집계)
- 발행·회수 이력 조회
- 사용자 지갑 조회 및 수동 조정
- 거래 내역 필터링·엑스포트
- 이상거래 감지 및 알림
- O2O 보상 재원 및 지급 정책 관리
- 경제 지표(KPI) 시계열 분석

**범위 밖**:
- Pi Network Mainnet 토큰 발행 (Phase 17+ 별도)
- 구독료 및 수수료 정책 결정 (PRD_15_FEE 관리)
- 사용자 결제 게이트웨이 (별도 PiRC/Pi SDK)

### 1-3. 정의

| 용어 | 정의 |
|---|---|
| **Bean Token** | Cafe.pi의 카페빈(☕) 오프체인 토큰. **1 Pi = 100 Bean 고정 불변**. 플랫폼↔사용자 거래의 정본 통화. 소각 없음. |
| **발행(Issued)** | Pi 결제 시 PLATFORM 지갑에서 USER 지갑으로 이전된 총 Bean 누적. |
| **유통(Circulating)** | 현재 모든 USER 지갑에 보유 중인 Bean 합계. 활성도의 핵심 지표. |
| **회수(Collected)** | 구독료, 팁, 수수료 등으로 USER → PLATFORM 지갑으로 되돌아온 Bean. **소각 아님 — Bean은 사라지지 않는다.** |
| **충전(Charge)** | 사용자가 Pi로 Bean을 구매하는 행위. PLATFORM→USER Bean 이전. |
| **소비(Spend)** | 사용자가 Bean으로 구독·팁·수수료 등을 결제하는 행위. USER→PLATFORM Bean 이전. |
| **보상(Reward)** | O2O 매장 거래·이벤트 완료 등으로 플랫폼이 사용자에게 지급하는 Bean. PLATFORM→USER 이전. |
| **감사(Audit)** | 어드민의 수동 Bean 조정 행위. 모든 조정은 감시(감사 로그) 대상. |

---

## 2. Bean Token 기본 원칙

### 2-1. 정의

- **Bean = 카페빈(Cafe Bean·원두)** — 일반 콩(legume) 절대 아님
- 모든 표기·비유·이모지·문맥이 커피 맥락(☕)으로 통일
- 금액 정본: **Bean 단위** (Pi 환산값은 보조)

### 2-2. 발행 조건

**오프체인 (Phase 16 현재)**:
- 사용자가 "Pi로 Bean 충전" 구매 → Pi 결제 완료 → Bean 지갑에 오프체인 입금
- 거래 기록: `pi_pymnt`(결제) → `bean_txn`(Bean 이동) 원자적 연결

**온체인 (Phase 17+ 예정)**:
- Pi Network Mainnet에서 PiBean 토큰 발행
- Wrap/Unwrap을 통한 온오프체인 호환

### 2-3. 거래 통화 라우팅 (최상위 규칙)

```
┌─────────────────────────────────────────┐
│ 플랫폼 ↔ 사용자 (구독/요금)            │
│ → Bean Token (정본)                   │
│ → Pi는 충전 수단일 뿐                 │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ P2P (사용자 ↔ 사용자)                  │
│ → Pi 직거래 (중고 장터)                │
│ → Bean 보상 없음                       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ O2O (사용자 ↔ 매장)                    │
│ → Pi 결제 (상품비)                     │
│ → Bean 보상 (플랫폼 인센티브)          │
└─────────────────────────────────────────┘
```

### 2-3-1. ⭐ 플랫폼 Bean 결제 종류 — 정책 + 실적용 현황 (2026-06-20)

> **정책**: 플랫폼(↔사용자) 요금은 **Pi 직접 결제를 폐기**하고 **① Pi로 Bean 선충전(IN) → ② Bean으로 결제(OUT)** 2단계로 일원화한다.
> **사용자의 유일한 Pi 접점 = "Bean 충전" 1곳.** 요금 금액 정본은 [[PRD_15_FEE]] §1-5(코드 미러 `bean-fee.ts`·`bean-subscr-plan.ts`).
> **정책 제외**: **P2P**(팁, Pi) · **O2O/매장 결제**(상품 에스크로·판매자 보증금, Pi) — §2-3 라우팅 유지.

**충전(IN) — 유일한 Pi 접점**

| 종류 | 통화 | txn | 코드 | 적용 | 테스트 |
|---|---|---|---|---|---|
| Bean 충전 | Pi→Bean | `CHARGE` | `payments/complete` `BEAN_CHARGE` · `api/bean/charge` | ✅ 라이브(충전 1건) | ✅ Pi Browser 필수 |

**결제(OUT) — Bean SPEND (`fn_bean_apply`)**

| 종류 | 금액(Bean) | ref/meta | 코드 | 적용 | 테스트 |
|---|---|---|---|---|---|
| 카페 생성료(프리미엄) | 10 | `ref=ROOM_CREATE` | `api/chat/rooms/group` | ✅ 라이브(1건) | ✅ 일반 브라우저 |
| 카페 입장료(프리미엄) | 10 | `ref=ROOM_ENTER` | `api/chat/rooms/[id]/join` | ✅ 라이브(5건+환불2) | ✅ 일반 브라우저 |
| 이벤트방 입장료 | `entry_fee_pi`×100 (호스트 지정) | `ref=EVENT_ENTER` | `api/chat/rooms/[id]/join`(GUEST 한시입장) | ✅ 라이브 | ✅ 일반 브라우저 |
| 상품 구독료(PiCafe·PiStore S/M/L·자동번역) | 1,000~50,000 | `bean_subscr` | `api/subscriptions/products/subscribe`→`fn_bean_subscribe_product` | ✅ 배포(실사용 0) | ✅ 잔액만 있으면 |

**잔여 Pi 결제(⏳ Bean 전환 대기) / 미구현(🚧)** — 상세·로드맵은 [[PRD_15_FEE]] §1-5-2, §1-6

| 종류 | 현재 통화 | 상태 |
|---|---|---|
| 레거시 구독(msg_subscr_plan 5종) | Pi (`CHAT_SUBSCR`) | ⏳ Bean 구독으로 흡수 예정 |
| 스토어 노출·연장·프리미엄 생성료 / 자동번역 건당 | — | 🚧 미구현(요금표만) |

> **라이브 검증(bean_txn)**: `CHARGE` 1 · `SPEND` 4(-40 Bean) · `REFUND` 2(+20 Bean), `wallet_type` PLATFORM 1 + USER 보유. 정책 골격(충전 1 + Bean 결제 3)은 **이미 운영 중**이다.

### 2-4. 환율

```
1 Pi = 100 Bean (절대 불변 고정, 시세 연동·변동 없음)
```

### 2-5. 단위 규칙

- **Bean**: 정수(INT) — 소수점 금지
- **Pi**: 소수 가능 (0.1π 등)
- DB 저장: Bean(INT) 정본 / Pi는 환산값(계산값)으로만 표시

### 2-5-1. ⭐ 소각 없음 원칙 (절대 규칙)

> **Bean은 소각(Burn)되지 않는다. Bean은 사용자 ↔ 플랫폼 사이에서 순환할 뿐이다.**

```
[Bean 순환 — 소각 없는 이중 부기]

        충전(CHARGE)
Pi ──────────────────→ PLATFORM 지갑 ──→ USER 지갑
                             ↑                 │
                             │ 소비(SPEND)      │
                             └──────────────────┘
                        (구독/팁/수수료)

항등식: PLATFORM 잔액 + SUM(USER 잔액) = 총 발행 예산
```

**금지 개념**:
- `소각(Burn)` — Bean 파괴 없음
- `소각량(Burned Amount)` — 지표로 사용 금지
- `소각률(Burn Rate)` — 사용 금지, 대신 "회수율(Collection Rate)" 사용

### 2-6. 표기 규약 (사용자 노출)

**금지 표현**:
- "구매", "투자", "presale", "코인", "스테이킹"

**허용 표현**:
- "이용권", "Bean 적립", "플랫폼 전용 토큰"
- "환금 불가(플랫폼 사용 전용)"
- "충전", "소비", "보상"

---

### 2-7. ⭐ 핵심 개념 확정 — 빈토큰지갑 (bean_token_wallet)

> **이 PRD에서 가장 중요한 개념. 모든 Bean 잔액은 예외 없이 `bean_token_wallet`으로 통일한다.**

#### 2-7-1. 개념 정의

**빈토큰지갑(bean_token_wallet)** 은 Bean Token 경제의 **유일한 잔액 저장소** 이다.

다음 두 가지 개념이 **동일한 엔티티**로 통일된다:

| 구분 | 설명 | wallet_type |
|---|---|---|
| **플랫폼 발행 지갑** | 플랫폼이 발행·관리하는 Bean 총량 추적용 마스터 지갑 (1개) | `PLATFORM` |
| **사용자 보유 지갑** | 사용자가 Pi로 구매해서 저장하는 개별 Bean 잔액 (1인 1개) | `USER` |

두 종류 모두 `bean_token_wallet` 테이블의 행(row)이며, `wallet_type` 컬럼으로 구분한다.

#### 2-7-2. 경제학적 의미

```
[ 플랫폼 PLATFORM 지갑 ]
  총 발행 Bean (Issued Supply)
  - 사용자에게 충전될 때마다 감소
  - Pi 결제 수령 시 재원 충당

[ 사용자 USER 지갑 (N개) ]
  개인 보유 Bean (Circulating Supply)
  + 충전(CHARGE) 시 증가
  - 구독/팁/수수료 결제 시 감소
  + 보상(REWARD) 수령 시 증가

검증 공식:
  유통량   = SUM(bean_amt) WHERE wallet_type = 'USER'
  회수량   = 총충전 - 유통량 (PLATFORM으로 회귀한 Bean)
  일관성식: PLATFORM 잔액 + 유통량 = 총 충전 발행량 (항상 성립)
```

#### 2-7-3. 통일 원칙

1. **발행 관리** = 빈토큰지갑의 PLATFORM 행을 통해 관리
2. **사용자 보유** = 빈토큰지갑의 USER 행으로 저장
3. 별도 테이블(treasury, pool_wallet 등) **절대 신설 금지** — 모두 `bean_token_wallet`으로 통합
4. 코드·문서·UI 어디서든 Bean 잔액을 지칭할 때 **"빈토큰지갑"** 용어 사용

---

### 2-8. 명명 규칙 (Naming Convention)

| 항목 | 규칙 | 예시 |
|---|---|---|
| **DB 테이블명** | `bean_token_wallet` (전체 이름 사용, 약어 금지) | `bean_token_wallet` ✅ / `bean_wlt` ❌ |
| **wallet_type 값** | `PLATFORM` (대문자, 1개) / `USER` (대문자, 다수) | `wallet_type = 'USER'` |
| **코드 변수명** | `beanTokenWallet`, `BeanTokenWallet` (camelCase/PascalCase) | `beanTokenWallet.balance` |
| **UI 표시명** | `빈토큰지갑` (한글) / `Bean Token Wallet` (영문) | 지갑 탭 레이블 |
| **API 필드명** | `wallet_type`, `balance_bean` (snake_case) | `{ wallet_type: 'USER', balance_bean: 500 }` |
| **컬럼명** | DA 표준 약어 유지 | `bean_amt`, `usr_id`, `del_yn` |

> **핵심 규칙**: 테이블명은 `bean_token_wallet`(전체 이름), 컬럼명은 DA 표준 약어(단음절). 두 층위를 혼동하지 않는다.

---

## 3. 토큰 경제 아키텍처

### 3-1. 시스템 구조

```
┌─────────────────────────────────────────────────────────┐
│ 플랫폼 경제 통화 통합 관리                               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Pi 결제 (Pi Browser)                                   │
│    ↓                                                     │
│  [Pi 충전 결제 결과] (pi_pymnt)                          │
│    ↓                                                     │
│  [빈토큰지갑 입금] (bean_token_wallet / bean_txn)       │
│    ↓                                                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Bean Token 순환 경제                              │  │
│  │                                                  │  │
│  │ ① 발행 (Pi 결제 → PLATFORM→USER Bean 이전)       │  │
│  │ ② 유통 (사용자 USER 지갑 보유)                   │  │
│  │ ③ 소비 (구독·팁·요금 — USER→PLATFORM 회수)      │  │
│  │ ④ 회수 (플랫폼 PLATFORM 지갑 수익 누적)          │  │
│  │ ⑤ 보상 (O2O·이벤트 — PLATFORM→USER 재배분)      │  │
│  └──────────────────────────────────────────────────┘  │
│    ↓                                                     │
│  [감사 추적] (bean_audit_log)                           │
│    ↓                                                     │
│  [경제 분석] (KPI·차트·리포팅)                          │
└─────────────────────────────────────────────────────────┘
```

### 3-2. 핵심 테이블 관계도

```
pi_pymnt (결제)
  │
  ├─ user_id (사용자)
  ├─ pi_amt (Pi 금액)
  └─ status (완료·취소)
       │
       ↓
   bean_txn (Bean 거래)
       │
       ├─ usr_id (사용자)
       ├─ txn_tp_cd (CHARGE·SUBSCRIBE·TIP·REFUND 등)
       ├─ bean_amt (Bean 금액)
       └─ ref_id (참조 ID: pi_pymnt.id, msg_msg.id 등)
            │
            ↓
       bean_token_wallet (빈토큰지갑) ← ⭐ 핵심 개념
            │
            ├─ wallet_type = 'PLATFORM' (발행 관리 지갑, 1개)
            │    └─ bean_amt (총 발행 - 유통 = 플랫폼 잔량)
            │
            └─ wallet_type = 'USER' (사용자 보유 지갑, N개)
                 └─ usr_id + bean_amt (개인 잔액)

bean_audit_log (감사 로그)
  │
  ├─ user_id (대상 사용자)
  ├─ adj_bean (조정 금액)
  ├─ reason (사유)
  ├─ adj_by_admin_id (조정자 관리자)
  └─ adj_dtm (조정 일시)

bean_reward_pool (보상 재원)
  │
  ├─ reward_pool_cd (코드: O2O_BUY, EVENT_M1 등)
  ├─ balance_bean (재원 잔액)
  └─ policy (지급 규칙)
```

### 3-3. Bean 흐름 (Stock-Flow 다이어그램)

```
┌──────────────────────────────────────────────────────────────────┐
│ Bean Token 원장 (Bean Ledger)                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ [발행 흐름]                                                      │
│ Pi 충전 → bean_txn(CHARGE, +) → bean_wlt(balance +)            │
│  ├─ 발행량 누적 (Total Issued)                                   │
│  └─ 실제 발행액 (실제 사용자가 받은 Bean)                       │
│                                                                  │
│ [소비 흐름]                                                      │
│ 구독료 → fn_bean_apply(SUBSCRIBE, -)                            │
│ 팁 / 수수료 → fn_bean_apply(TIP, -) / fn_bean_apply(FEE, -)    │
│  └─ 회수량 (Total Collected) = USER→PLATFORM 귀환 Bean           │
│                                                                  │
│ [보상 흐름]                                                      │
│ O2O 매장 구매 → bean_reward_pool(- SPEND) → bean_txn(REWARD, +) │
│  ├─ 보상 재원 관리                                               │
│  └─ 사용자 지갑 입금                                             │
│                                                                  │
│ [이상 흐름]                                                      │
│ 환불·에러 복구 → fn_bean_apply(REFUND, ±)                       │
│  └─ 감사 로그 필수 기록                                          │
│                                                                  │
│ [감시]                                                           │
│ 대량 충전 / 대량 소비 → 이상거래 알림                            │
│ 음수 잔액 시도 → 자동 차단                                       │
│ 수동 조정 → bean_audit_log 기록                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 토큰 현황 관리 화면

### 4-1. 토큰 대시보드 (Token Dashboard)

**목적**: Bean 경제의 가장 핵심 4가지 KPI를 한눈에 파악

**위치**: `/[locale]/(admin)/admin/token/` (기본 진입점)

**주요 컴포넌트**:

#### 4-1-1. KPI 카드 (4개 열)

```
┌─────────────────────────────────────────────────────────────┐
│ Bean Token 현황                                              │
├─────────────┬─────────────┬─────────────┬─────────────┐     │
│ 총 발행량   │ 총 판매량   │ 현재 유통   │ 플랫폼 회수 │     │
│ (Pi 환산)   │ (확정값)    │ (사용자 보유)│(PLATFORM잔) │     │
├─────────────┼─────────────┼─────────────┼─────────────┤     │
│ 15,234 Pi   │ 14,890 Pi   │ 8,430 Bean  │ 6,460 Bean  │     │
│ 1,523,400 B │ 1,489,000 B │ (84.3 Pi)   │ (64.6 Pi)   │     │
│             │             │             │             │     │
│ ↑ 155 Pi    │ ↑ 140 Pi    │ ↓ 25 Bean   │ ↑ 30 Bean   │     │
│ (+ 1.03%)   │ (+ 0.95%)   │ (- 0.3%)    │ (+ 0.47%)   │     │
└─────────────┴─────────────┴─────────────┴─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

| 지표 | 산출식 | 설명 |
|---|---|---|
| **Total Issued** | SUM(bean_txn.bean_amt WHERE txn_tp_cd='CHARGE') | Pi 충전으로 발행된 누적 Bean(처음부터 지금까지) |
| **Total Sold** | Total Issued - PLATFORM 지갑 잔액 | 실제 사용자 손에 넘어간 Bean(발행 - 플랫폼 잔량) |
| **Circulating** | SUM(bean_amt) FROM bean_token_wallet WHERE wallet_type='USER' | 현재 사용자 지갑에 보유 중인 Bean |
| **Total Collected** | Total Issued - Circulating | PLATFORM 지갑으로 회수된 Bean (소각 아님, 재사용 가능) |

#### 4-1-2. 추이 차트 (최근 30일)

```
[발행·소비·유통 추이 - 선형 차트]

 1600 ├────────────────────────────────────
 1400 ├────────────────────────────────────
 1200 ├────────────────────────────────────   발행량 (----)
 1000 ├────────────────────────────────────   유통량 (----)
  800 ├────────────────────────────────────   회수량 (----)
  600 ├────────────────────────────────────
  400 ├────────────────────────────────────
  200 ├────────────────────────────────────
    0 └────────────────────────────────────
      Day 1      Day 10     Day 20     Day 30

(Y축: Bean / 100 = Pi, X축: 일자)
```

**요청 사항**:
- 일간·주간·월간·연간 단위 선택
- 최대 1년 데이터 노출
- 움직임 방향 화살표(↑↓) + 변화율(%)

#### 4-1-3. 수익 현황 (Platform Revenue)

```
┌─────────────────────────────────────┐
│ 플랫폼 누적 수익 (Pi 기준)           │
├─────────────────────────────────────┤
│ 총 회수액 (PLATFORM 귀환 Bean)  646 Pi│
│  └─ 전체 소비 기준              100%  │
│                                       │
│ 구성:                                 │
│  · 구독료              450 Pi (70%)   │
│  · 팁                   100 Pi (15%)  │
│  · 수수료                96 Pi (15%)  │
│                                       │
│ 누적 손익                +646 Pi      │
│ (발행 대비 회수 비율)      4.2%       │
└───────────────────────────────────────┘
```

**계산**:
- 수익 = Total Collected (PLATFORM 지갑 회수 기준)
- 회수율 = (Total Collected / Total Issued) × 100

### 4-2. 발행 이력 (Issuance History)

**목적**: Pi 충전 → Bean 발행 프로세스 추적

**위치**: `/[locale]/(admin)/admin/token/issuance`

**테이블 컬럼**:

| 컬럼 | 타입 | 설명 |
|---|---|---|
| 발급 일시 (Issued At) | TIMESTAMPTZ | bean_txn 생성 일시 |
| 사용자 ID / 별명 | TEXT | 수령자 사용자 |
| Pi 금액 | NUMERIC | 충전한 Pi 금액 |
| Bean 금액 | INT | 발행된 Bean (Pi × 100) |
| 결제 상태 | ENUM | 완료/취소/대기 (pi_pymnt.status) |
| 참고 | TEXT | 결제 참조 ID (pi_pymnt.id) |
| 상태 | BADGE | 정상/환불/에러 |

**필터**:
- 기간 (FROM ~ TO)
- 사용자 (검색, 자동완성)
- Pi 금액 범위 (MIN ~ MAX)
- 상태 (완료·취소·대기)

**액션**:
- 상세보기 (거래 기록, 지갑 변경)
- 환불 처리 (상태 CANCEL 전환 + 역조정)

### 4-3. 회수 현황 (Collection Overview)

**목적**: Bean 소진(회수) 프로세스의 전체상 파악

**위치**: `/[locale]/(admin)/admin/token/burn`

**섹션**:

#### 4-3-1. 회수량 집계 (Collection Summary)

```
┌─────────────────────────────────────────────┐
│ 회수량 분류별 (txn_type)                     │
├─────────────────────────────────────────────┤
│ SUBSCRIBE       450 Bean  (69.7%)            │
│  ├─ PiCafe      200 Bean                     │
│  └─ PiStore      250 Bean                    │
│                                              │
│ TIP              100 Bean  (15.5%)            │
│                                              │
│ FEE              96 Bean   (14.8%)            │
│  ├─ 플랫폼 수수료  60 Bean                     │
│  └─ 판매자 정산   36 Bean                     │
│                                              │
│ REFUND          -10 Bean  (-1.5%) [역조정]  │
└─────────────────────────────────────────────┘
```

#### 4-3-2. 회수 기간별 트렌드

- 일일 회수량 바 차트 (최근 30일)
- 상위 10대 회수 행위 타입

---

## 5. 매출 관리 시스템

### 5-1. 매출 대시보드 (Revenue Dashboard)

**위치**: `/[locale]/(admin)/admin/token/revenue`

**목적**: Pi 충전 → Bean 변환 → 플랫폼 수익의 전체 경로 이해

#### 5-1-1. 수익 항목별 집계

| 항목 | Pi | Bean | 누적 | 증감(7일) |
|---|---|---|---|---|
| **구독료** | 450 | 45,000 | 450 Pi | ↑ 50 Pi (+12.5%) |
| · PiCafe Basic | 200 | 20,000 | 200 Pi | ↑ 25 Pi |
| · PiCafe Premium | 150 | 15,000 | 150 Pi | ↑ 20 Pi |
| · PiStore Pro | 100 | 10,000 | 100 Pi | ↑ 5 Pi |
| **팁** | 100 | 10,000 | 100 Pi | ↑ 15 Pi (+17.7%) |
| **수수료** | 96 | 9,600 | 96 Pi | ↓ 5 Pi (-4.9%) |
| · 플랫폼 수수료 | 60 | 6,000 | 60 Pi | ↓ 3 Pi |
| · 판매자 지급 | 36 | 3,600 | 36 Pi | ↓ 2 Pi |
| **총 수익** | **646** | **64,600** | **646 Pi** | **↑ 60 Pi (+10.2%)** |

#### 5-1-2. 수익률 분석

```
발행 대비 수익률 = (총 회수 Bean / 총 발행 Bean) × 100
                = (64,600 / 1,523,400) × 100
                = 4.24%
```

**해석**:
- 발행 100 Bean 중 약 4.24 Bean이 플랫폼 수익으로 변환
- 95.76 Bean은 여전히 사용자 지갑에 존재(유통 중)
- 건강한 토큰 이코노미의 지표: 4~6% 범위 권장

### 5-2. 구독 관리 (Subscription Management)

**위치**: `/[locale]/(admin)/admin/token/subscriptions`

**목적**: 활성 구독 모니터링 및 만료·해지 예측

**테이블**:

| 컬럼 | 설명 |
|---|---|
| 구독자 | 사용자 ID / 별명 |
| 상품 | PiCafe Basic / Premium / PiStore Pro / ... |
| 구독 상태 | ACTIVE / EXPIRING_SOON / EXPIRED / CANCELLED |
| 시작일 | TIMESTAMPTZ |
| 만료일 | TIMESTAMPTZ (남은 기간 배지) |
| 월 기여도 | Bean (평균 월 소비) |
| 마지막 갱신 | bean_txn의 최근 SUBSCRIBE 거래 |

**필터**:
- 상품별 (PiCafe/PiStore/Translate)
- 상태별
- 만료 예정 (7일/14일/30일 내)

**액션**:
- 구독 강제 갱신 (수동 부여)
- 구독 취소 (상태 전환)
- 환불 (특정 기간 수수료 역조정)

### 5-3. 판매자 정산 (Seller Settlement)

**위치**: `/[locale]/(admin)/admin/token/settlements`

**목적**: O2O/P2P 거래에서 판매자에게 지급할 수익 추적

**테이블**:

| 컬럼 | 설명 |
|---|---|
| 판매자 | 사용자 ID / 별명 |
| 미정산액 (Pi) | mps_order에서 아직 지급되지 않은 수익 |
| 누적 정산액 (Pi) | 지금까지 받은 총 수익 |
| 정산 주기 | WEEKLY / MONTHLY / ON_DEMAND |
| 마지막 정산 | TIMESTAMPTZ |
| 다음 정산 예정 | TIMESTAMPTZ |
| 상태 | PENDING / PROCESSING / COMPLETED / FAILED |

**액션**:
- 정산 트리거 (on-demand)
- 정산 이력 상세보기
- 에러 발생 시 재시도

---

## 6. 순환·감사 관리

### 6-1. 거래 내역 (Transaction History)

**위치**: `/[locale]/(admin)/admin/token/transactions`

**목적**: 모든 Bean 입출금 거래의 상세 기록 조회·감시

**테이블 컬럼**:

| 컬럼 | 타입 | 설명 |
|---|---|---|
| 거래 ID | UUID | bean_txn.id |
| 일시 | TIMESTAMPTZ | bean_txn.reg_dtm |
| 사용자 ID | TEXT | bean_txn.user_id |
| 거래 유형 | VARCHAR | CHARGE/SUBSCRIBE/TIP/FEE/REFUND/REWARD |
| 금액 | INT | bean_txn.amt_bean (양수) |
| 방향 | ENUM | IN(입금) / OUT(출금) |
| 잔액 | INT | 거래 후 bean_wlt.balance |
| 참고 | TEXT | bean_txn.memo / ref_id |
| 상태 | ENUM | CONFIRMED / PENDING / FAILED / REVERSED |

**필터**:
- 사용자 (이름/ID 검색)
- 거래 유형 (다중선택)
- 기간 (FROM ~ TO)
- 금액 범위 (MIN ~ MAX)
- 잔액 범위
- 상태

**정렬**: 일시 내림차순(최신) / 금액 내림차순 / 사용자명

**액션**:
- 행 클릭 → 거래 상세보기 (참조 ID 추적 등)
- CSV/Excel 엑스포트
- 이상거래 플래그

### 6-2. 지갑 관리 (Wallet Management)

**위치**: `/[locale]/(admin)/admin/token/wallets`

**목적**: 사용자별 Bean 잔액 조회 및 수동 조정

**테이블**:

| 컬럼 | 설명 |
|---|---|
| 사용자 | ID / 별명 / 이메일 |
| 현재 잔액 | INT Bean |
| 누적 충전 | INT Bean |
| 누적 소비 | INT Bean |
| 누적 보상 | INT Bean |
| 계산 검증 | (충전 - 소비 + 보상 = 잔액) 체크 |
| 마지막 거래 | TIMESTAMPTZ |
| 상태 | ACTIVE / INACTIVE / FROZEN(동결) |

**필터**:
- 사용자 검색
- 잔액 범위
- 상태별

**액션**:

#### 6-2-1. 수동 Bean 조정 (Adjustment)

```
[수동 조정 다이얼로그]

대상 사용자: [선택]
현재 잔액: 1,234 Bean

조정 유형:
  ○ 충전 (사용자 잔액 +)
  ○ 회수 (사용자 잔액 -)
  ○ 정정 (잔액 직접 설정)

조정 금액: [_____] Bean

사유 (필수):
  [________________________________________]
  예: "과다청구 환불", "사기 적발 및 회수", "이벤트 보상"

첨부 증빙:
  [파일 선택 또는 메모]

[확인]  [취소]
```

**제약**:
- 조정 후 음수 잔액 방지 (사전 검증)
- 모든 조정은 bean_audit_log에 기록 (who/when/what/why)
- 조정자 ID 자동 기록 (`isAdmin(user)` 검증 필수)

#### 6-2-2. 감사 로그 (Audit Log)

```
┌─────────────────────────────────────────────────┐
│ 지갑 조정 이력 (user_id 기준)                    │
├─────────────────────────────────────────────────┤
│ 일시        조정자           조정액      사유    │
├─────────────────────────────────────────────────┤
│ 2026-06-19  anakin(ADMIN)   +100 Bean  이벤트상 │
│ 2026-06-18  anakin(ADMIN)   -500 Bean  과다청구 │
│ 2026-06-17  asoká(ADMIN)    +50 Bean   보상 지급│
└─────────────────────────────────────────────────┘
```

**DB**: bean_audit_log 테이블 필수

### 6-3. 이상거래 감지 (Anomaly Detection)

**위치**: `/[locale]/(admin)/admin/token/anomalies`

**목적**: 플랫폼 리스크 사전 감지

**감지 규칙**:

| 규칙 | 조건 | 심각도 | 액션 |
|---|---|---|---|
| **대량 충전** | 1일 > 1,000 Bean | 🟡 경고 | 알림 + 수동 검토 |
| **대량 소비** | 1일 > 500 Bean | 🟡 경고 | 알림 + 수동 검토 |
| **음수 시도** | bean_txn 시도 중 음수 | 🔴 심각 | 자동 차단 + 로그 |
| **비정상 회수** | 시간당 비정상 패턴 | 🟡 경고 | 알림 |
| **좀비 계정** | 30일 이상 비활동 후 대량 소비 | 🟡 경고 | 알림 + 동결 옵션 |

**알림 채널**:
- 대시보드 배지
- 이메일 (관리자)
- 슬랙 (운영 채널)

**수동 개입**:
- 계정 일시 동결 (FROZEN)
- Bean 차감 (규칙 위반 회수)
- 게시글/메시지 삭제 (부정 행위 연계)

### 6-4. 일관성 검증 (Consistency Check)

**주기**: 매일 자정(UTC), 수동 트리거 가능

**검증 항목**:

```
-- USER 지갑 일관성 검증
FOR EACH wallet WHERE wallet_type = 'USER':
  computed = SUM(bean_txn WHERE usr_id = wallet.usr_id AND del_yn='N')
  actual   = bean_token_wallet.bean_amt

  IF computed ≠ actual:
    → bean_consistency_error 로그
    → 대시보드에 "⚠️ 일관성 오류 (USER 지갑)" 표시
    → 자동 복구 또는 수동 승인 필요

-- PLATFORM 지갑 일관성 검증
  platform_balance = bean_token_wallet.bean_amt WHERE wallet_type = 'PLATFORM'
  circulating      = SUM(bean_amt) WHERE wallet_type = 'USER'
  issued           = SUM(bean_txn WHERE txn_tp_cd = 'CHARGE')
  IF platform_balance + circulating ≠ issued:
    → "⚠️ 발행 총량 불일치" 알림
```

**에러 복구**:
1. 원인 파악 (bean_txn 누락, 중복 등)
2. 보정 거래 생성 (bean_txn.txn_type='CORRECTION')
3. bean_audit_log 기록
4. 관리자 승인

---

## 7. 보상 경제(O2O Reward)

### 7-1. 보상 재원 관리 (Reward Pool)

**목적**: O2O 매장 거래 및 이벤트에서 사용자에게 지급할 Bean 재원 추적

**위치**: `/[locale]/(admin)/admin/token/reward-pools`

**테이블: `bean_reward_pool`**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| reward_pool_id | UUID | PK |
| reward_pool_cd | VARCHAR(32) | O2O_BUY / EVENT_M1 / EVENT_M2 / REFERRAL 등 |
| pool_nm | VARCHAR(100) | 풀 이름 |
| pool_desc | TEXT | 정책 설명 |
| balance_bean | INT | 현재 잔액 (재원) |
| capacity_bean | INT | 총 용량 (월 한도 등) |
| used_bean | INT | 지금까지 사용한 누적 |
| use_yn | CHAR(1) | Y/N (활성화 여부) |
| policy_json | JSONB | 지급 규칙 (아래 §7-2) |
| regr_id / reg_dtm / modr_id / mod_dtm | 시스템 컬럼 | - |

**주요 풀 예시**:

| 풀 코드 | 설명 | 월 한도 | 지급 조건 |
|---|---|---|---|
| O2O_BUY | O2O 매장 구매 보상 | 5,000 Bean | 상품 1개 구매 당 Bean 일정% |
| EVENT_M1 | 미션1(로그인) 보상 | 10,000 Bean | 일일 로그인 첫 1회 |
| EVENT_M2 | 미션2(메시지) 보상 | 5,000 Bean | 카페 메시지 전송 |
| REFERRAL | 추천 보상 | 2,000 Bean | 친구 가입 성공 |

### 7-2. 보상 정책 (Reward Policy)

**구조**: JSON 스키마

```json
{
  "pool_cd": "O2O_BUY",
  "reward_rules": [
    {
      "rule_id": "O2O_BUY_BASE",
      "condition": "purchase_amount_pi > 0",
      "formula": "purchase_amount_pi * 10",
      "example": "1 Pi 구매 → 10 Bean 보상",
      "cap_per_tx": 100,
      "cap_per_user_month": 500
    }
  ],
  "quota": {
    "total_monthly_bean": 5000,
    "reset_on": "1st of month",
    "excess_handling": "REJECT (지급 거절)"
  },
  "timing": {
    "grant_after_event": "purchase_completed",
    "delay_seconds": 3600
  }
}
```

### 7-3. 보상 지급 이력 (Grant History)

**위치**: `/[locale]/(admin)/admin/token/reward-grants`

**테이블**:

| 컬럼 | 설명 |
|---|---|
| 지급 ID | UUID |
| 풀 | bean_reward_pool.reward_pool_cd |
| 수령자 | 사용자 ID / 별명 |
| Bean | 지급 금액 |
| 조건 | 지급 근거 (구매 이벤트, 미션 완료 등) |
| 지급 일시 | TIMESTAMPTZ |
| 상태 | GRANTED / FAILED / REVOKED(회수) |

**필터**:
- 풀별
- 기간
- 상태

**액션**:
- 보상 회수 (status → REVOKED, bean_txn 역거래 생성)
- 재지급 (에러 발생 시)

### 7-4. 보상 정책 설정 (Configuration)

**위치**: `/[locale]/(admin)/admin/token/reward-config`

**UI 형태**:

```
[풀 선택 드롭다운]

┌─────────────────────────────────────┐
│ O2O 구매 보상 정책                   │
├─────────────────────────────────────┤
│ 풀 상태: [활성화 ✓]                 │
│                                     │
│ 기본 지급 규칙:                      │
│  구매액(Pi) × [___] = 보상(Bean)   │
│  예: Pi × 10 = Bean                │
│                                     │
│ 거래당 최대 보상:                    │
│  [___] Bean (상한선)                │
│                                     │
│ 사용자 월 한도:                      │
│  [___] Bean (누계 한도)              │
│                                     │
│ 월 총 재원:                          │
│  [___] Bean (풀 용량)               │
│                                     │
│ 한도 초과 시 처리:                   │
│  ○ 거절 (REJECT)                    │
│  ○ 대기열 (QUEUE - 다음달)          │
│  ○ 축소 (SCALE - 비율 감소)         │
│                                     │
│ [저장]  [취소]                      │
└─────────────────────────────────────┘
```

---

## 8. 어드민 조치 기능

### 8-1. Bean 조정 (Adjustment)

**이미 §6-2-1에서 기술함. 여기서 추가 규칙 명시**

**허용 사유 (Whitelist)**:
- "이벤트 보상"
- "과다청구 환불"
- "시스템 오류 복구"
- "사기 행위 적발 및 회수"
- "KYC 미완료 계정 정리"
- "계약 위반 회수"

**금지 사유** (제출 차단):
- "기분 좋음"
- "임의 지급"
- (관리자 명의의 자의적 행위 방지)

### 8-2. 계정 동결 (Account Freeze)

**목적**: 의심 행위 사용자의 Bean 거래 일시 정지

**동작**:
1. `bean_token_wallet` (wallet_type='USER') `status = 'FROZEN'` 으로 설정
2. 이후 모든 Bean 출금(SUBSCRIBE, TIP, FEE) 시도 → 자동 거절
3. Bean 입금(CHARGE, REWARD)은 가능 (재범 방지의도 아님)
4. 사용자 계정 기능은 정상 작동 (채팅 등)

**해제**: 관리자가 수동으로 `status = 'ACTIVE'`로 복구

**감시 로그**:
```
[동결 이력]
동결 일시: 2026-06-19
동결 사유: "대량 스팸 메시지 + 부정 보상 지급"
동결자: anakin (ADMIN)
해제 예정: 2026-07-19 (30일 자동 해제)
해제 기록: 2026-06-25 anakin (조기 해제)
```

### 8-3. 거래 취소 (Transaction Reversal)

**대상**: bean_txn 거래 중 특정 행(row) 취소

**프로세스**:
1. bean_txn.status = 'REVERSED'로 변경
2. 반대 거래 생성 (예: SUBSCRIBE +500 → 반대거래 REVERSAL -500)
3. bean_wlt.balance 자동 복구
4. bean_audit_log에 기록

**제약**:
- 생성 후 30일 이내만 취소 가능 (감시 규칙)
- 이미 REVERSED 상태 거래는 재취소 불가

### 8-4. 보상 회수 (Reward Revocation)

**대상**: bean_reward_grant 거래 취소

**사유** (화이트리스트):
- "부정 보상 지급 적발"
- "이벤트 부정행위 감지"

**프로세스**: 거래 취소와 동일

---

## 9. KPI 및 경제 지표

### 9-1. 주요 KPI

| KPI | 산출식 | 목표값 | 빈도 |
|---|---|---|---|
| **Daily Active Token Users (DATU)** | 1일 내 bean_txn 기록 있는 unique user | 1,000+ | 일일 |
| **Token Velocity (유통속도)** | (월 총 소비 Bean) / (현재 유통 Bean) | 0.5~1.0 | 월간 |
| **Average Holding Period** | 충전 후 소비까지 평균 일수 | 15~30일 | 월간 |
| **Token Multiplier (증식률)** | (누적 보상 Bean) / (누적 소비 Bean) | 0.05~0.1 | 월간 |
| **User Bean Balance Distribution** | P50, P90, P99 백분위 | [분석용] | 주간 |
| **Platform Collection Rate (회수율)** | (PLATFORM 회수 Bean) / (누적 발행 Bean) | 3~5% | 일일 |

### 9-2. 경제 건강도 지표

**균형 공식**:

```
경제 건강도 = (유통 Bean / 발행 Bean) × (유통속도) × (일일 활성 사용자 / 전체 사용자)
          = (현재 유통 / 누적 발행) × (월 회수 / 현재 유통) × (DATU / 총 사용자)
```

**해석**:
- 1.0 이상: 활발한 경제 (토큰 잘 도는 중)
- 0.5~1.0: 정상
- 0.1~0.5: 불황 (유통율 낮음, 보상 필요)
- < 0.1: 경제 위기 (대량 환금 또는 사용 중단)

### 9-3. 차트 및 리포팅

**위치**: `/[locale]/(admin)/admin/token/analytics`

#### 9-3-1. 시계열 차트 (Time Series)

- 일일 발행·소비·유통 추이
- 월별 수익 추이
- 사용자 잔고 분포 (히스토그램)

#### 9-3-2. 코호트 분석 (Cohort Analysis)

- 가입 주차별 Bean 소비 패턴
- 구독자 vs 비구독자 소비 비교
- 일일 리텐션 (토큰 보유 유지)

#### 9-3-3. 자동 리포팅

- 주간 요약: 요일별 발행/소비/유통
- 월간 보고서: PDF 생성 (원화 환산 포함)

---

## 10. DB 스키마

### 10-1. 핵심 테이블 — `bean_token_wallet` (빈토큰지갑)

> **§2-7 핵심 개념 확정에 따라**: 발행 관리(PLATFORM)와 사용자 보유(USER) 두 개념이 이 단일 테이블로 통일된다.
> 현재 구현명: `bean_wlt` → 목표 정식명: **`bean_token_wallet`** (마이그레이션 시 rename 필요)

```sql
-- DA-APPROVED: Bean Token 경제 유일한 잔액 저장소
-- wallet_type='PLATFORM': 발행 총량 관리 마스터 지갑 (1개)
-- wallet_type='USER': 사용자 개별 보유 지갑 (1인 1개)
CREATE TABLE public.bean_token_wallet (
  wallet_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_type   VARCHAR(16) NOT NULL CHECK (wallet_type IN ('PLATFORM', 'USER')),
  usr_id        TEXT REFERENCES sys_user(user_id),  -- USER 타입만 필수, PLATFORM은 NULL
  bean_amt      INT NOT NULL DEFAULT 0,             -- 현재 잔액 (정수, 음수 불가)
  status        VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','FROZEN','CLOSED')),
  last_txn_dtm  TIMESTAMPTZ,                        -- 마지막 거래 일시
  del_yn        CHAR(1) NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_wallet UNIQUE (usr_id, wallet_type),   -- 사용자당 1개 보장
  CONSTRAINT chk_platform_no_user
    CHECK (wallet_type != 'PLATFORM' OR usr_id IS NULL),    -- PLATFORM은 usr_id 없음
  CONSTRAINT chk_user_has_id
    CHECK (wallet_type != 'USER' OR usr_id IS NOT NULL),    -- USER는 usr_id 필수
  CONSTRAINT chk_nonneg_balance
    CHECK (bean_amt >= 0)                                   -- 음수 잔액 절대 금지
);

-- PLATFORM 마스터 지갑 초기 데이터 (1행 고정)
INSERT INTO public.bean_token_wallet (wallet_type, bean_amt, regr_id)
  VALUES ('PLATFORM', 0, 'SYSTEM')
  ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX idx_btw_platform ON public.bean_token_wallet(wallet_type)
  WHERE wallet_type = 'PLATFORM';                           -- PLATFORM 행 단 1개 강제
CREATE INDEX idx_btw_user    ON public.bean_token_wallet(usr_id) WHERE wallet_type = 'USER';
CREATE INDEX idx_btw_status  ON public.bean_token_wallet(status);
```

**일관성 검증식** (매일 자정 cron):
```sql
-- 유통량 = USER 지갑 합계
SELECT SUM(bean_amt) AS circulating FROM bean_token_wallet WHERE wallet_type='USER';
-- 발행량 = CHARGE 거래 합계
SELECT SUM(bean_amt) AS issued FROM bean_txn WHERE txn_tp_cd='CHARGE' AND del_yn='N';
-- PLATFORM 잔액 = 발행량 - 유통량 (항상 성립해야 함)
```

#### `bean_txn` (Bean 거래 내역)

```sql
CREATE TABLE public.bean_txn (
  txn_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL REFERENCES sys_user(user_id),
  txn_type      VARCHAR(16) NOT NULL CHECK (txn_type IN ('CHARGE','SUBSCRIBE','TIP','FEE','REWARD','REFUND','CORRECTION')),
  amt_bean      INT NOT NULL,                  -- 금액(양수), 방향은 txn_type으로 구분
  status        VARCHAR(16) DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','PENDING','FAILED','REVERSED')),
  ref_id        TEXT,                          -- 참조 ID (pi_pymnt.id, msg_msg.id 등)
  memo          TEXT,                          -- 거래 메모
  regr_id       TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_bean_txn_user ON public.bean_txn(user_id);
CREATE INDEX idx_bean_txn_type ON public.bean_txn(txn_type);
CREATE INDEX idx_bean_txn_dtm  ON public.bean_txn(reg_dtm DESC);
```

### 10-2. 신규 테이블

#### `bean_audit_log` (Bean 조정 감사 로그)

```sql
-- DA-APPROVED: Bean 어드민 조정 추적 (감시 필수, 물리삭제 금지)
CREATE TABLE public.bean_audit_log (
  audit_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL REFERENCES sys_user(user_id),      -- 조정 대상 사용자
  adj_before    INT NOT NULL,                  -- 조정 전 잔액
  adj_bean      INT NOT NULL,                  -- 조정액 (양수=충전, 음수=회수)
  adj_after     INT NOT NULL,                  -- 조정 후 잔액
  reason        VARCHAR(200) NOT NULL,        -- 사유 (화이트리스트)
  adj_by_admin_id TEXT NOT NULL REFERENCES sys_user(user_id), -- 조정자(관리자)
  evidence_url  TEXT,                          -- 증빙 문서
  del_yn        CHAR(1) NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm       TIMESTAMPTZ,
  regr_id       TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_bean_audit_user ON public.bean_audit_log(user_id);
CREATE INDEX idx_bean_audit_admin ON public.bean_audit_log(adj_by_admin_id);
CREATE INDEX idx_bean_audit_dtm  ON public.bean_audit_log(reg_dtm DESC);
```

#### `bean_reward_pool` (보상 재원 풀)

```sql
-- DA-APPROVED: O2O/이벤트 보상 Bean 재원 관리 (월별 한도제)
CREATE TABLE public.bean_reward_pool (
  reward_pool_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_pool_cd  VARCHAR(32) NOT NULL UNIQUE,     -- O2O_BUY, EVENT_M1 등
  pool_nm         VARCHAR(100) NOT NULL,
  pool_desc       TEXT,
  balance_bean    INT NOT NULL DEFAULT 0,          -- 현재 잔액
  capacity_bean   INT NOT NULL DEFAULT 0,          -- 월 용량
  used_bean       INT NOT NULL DEFAULT 0,          -- 누적 사용
  use_yn          CHAR(1) NOT NULL DEFAULT 'Y' CHECK (use_yn IN ('Y','N')),
  policy_json     JSONB,                           -- 지급 규칙
  del_yn          CHAR(1) NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,
  regr_id         TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_bean_reward_cd ON public.bean_reward_pool(reward_pool_cd);
CREATE INDEX idx_bean_reward_use ON public.bean_reward_pool(use_yn);
```

#### `bean_reward_grant` (보상 지급 이력)

```sql
-- DA-APPROVED: 보상 지급 추적 (회수 감시)
CREATE TABLE public.bean_reward_grant (
  grant_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_pool_id UUID NOT NULL REFERENCES public.bean_reward_pool(reward_pool_id),
  user_id        TEXT NOT NULL REFERENCES sys_user(user_id),
  bean_amount    INT NOT NULL,                  -- 지급 금액
  condition      VARCHAR(100),                  -- 지급 조건 (구매 이벤트 등)
  ref_id         TEXT,                          -- 참조 ID (mps_order.id 등)
  status         VARCHAR(16) NOT NULL DEFAULT 'GRANTED' CHECK (status IN ('GRANTED','FAILED','REVOKED')),
  del_yn         CHAR(1) NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_bean_grant_user ON public.bean_reward_grant(user_id);
CREATE INDEX idx_bean_grant_pool ON public.bean_reward_grant(reward_pool_id);
CREATE INDEX idx_bean_grant_dtm  ON public.bean_reward_grant(reg_dtm DESC);
```

---

## 11. API 명세

### 11-1. 토큰 대시보드 API

**엔드포인트**: `GET /api/admin/token/stats`

**인증**: `isAdmin(user)` 필수

**응답 스키마**:

```json
{
  "data": {
    "kpi": {
      "total_issued_bean": 1523400,
      "total_issued_pi": 15234,
      "total_sold_bean": 1489000,
      "total_sold_pi": 14890,
      "circulating_bean": 843000,
      "circulating_pi": 8430,
      "total_collected_bean": 646000,
      "total_collected_pi": 6460,
      "platform_revenue_pi": 6.46,
      "collection_rate_percent": 42.3
    },
    "trends": [
      {
        "date": "2026-06-19",
        "issued_bean_daily": 50000,
        "collected_bean_daily": 8000,
        "circulating_bean_daily": 843000
      }
    ],
    "last_updated": "2026-06-19T10:00:00Z"
  },
  "meta": {
    "period": "1m"
  }
}
```

### 11-2. 거래 내역 조회 API

**엔드포인트**: `GET /api/admin/token/transactions`

**쿼리 파라미터**:
- `user_id`: 사용자 필터
- `txn_type`: 거래유형 (CHARGE,SUBSCRIBE,... 쉼표 구분)
- `from_date`, `to_date`: 기간
- `min_amount`, `max_amount`: 금액 범위
- `page`, `limit`: 페이지네이션

**응답**:

```json
{
  "data": [
    {
      "txn_id": "uuid-1",
      "user_id": "user-123",
      "txn_type": "SUBSCRIBE",
      "amt_bean": 10000,
      "direction": "OUT",
      "balance_after": 843000,
      "memo": "PiCafe Premium 월간",
      "status": "CONFIRMED",
      "reg_dtm": "2026-06-19T09:30:00Z"
    }
  ],
  "meta": {
    "total": 1234,
    "page": 1,
    "limit": 50
  }
}
```

### 11-3. 지갑 조정 API

**엔드포인트**: `POST /api/admin/token/adjust`

**요청 본문**:

```json
{
  "user_id": "user-123",
  "adj_bean": 100,
  "reason": "이벤트 보상",
  "evidence_url": "https://..."
}
```

**응답**:

```json
{
  "data": {
    "audit_id": "audit-uuid",
    "user_id": "user-123",
    "adj_before": 843000,
    "adj_bean": 100,
    "adj_after": 843100,
    "adj_by_admin_id": "admin-1",
    "reg_dtm": "2026-06-19T10:00:00Z"
  },
  "error": null
}
```

**에러**:
- 400: 유효하지 않은 사유
- 400: 음수 잔액 발생
- 401: 비인가 사용자

### 11-4. 보상 풀 조회 API

**엔드포인트**: `GET /api/admin/token/reward-pools`

**응답**:

```json
{
  "data": [
    {
      "reward_pool_id": "pool-uuid",
      "reward_pool_cd": "O2O_BUY",
      "pool_nm": "O2O 구매 보상",
      "balance_bean": 3000,
      "capacity_bean": 5000,
      "used_bean": 2000,
      "use_yn": "Y",
      "policy_json": {
        "formula": "purchase_amount_pi * 10",
        "cap_per_tx": 100,
        "cap_per_user_month": 500
      }
    }
  ]
}
```

### 11-5. 거래 내역 엑스포트 API

**엔드포인트**: `GET /api/admin/token/export`

**쿼리 파라미터**:
- `format`: csv / xlsx
- (다른 필터는 transactions API와 동일)

**응답**: 파일 다운로드 (Content-Disposition: attachment)

---

## 12. 화면 목록 및 UI 명세

### 12-1. 라우트 구조

```
/[locale]/(admin)/admin/token/
├── page.tsx                    # 토큰 대시보드 (진입점)
├── issuance/page.tsx           # 발행 이력
├── burn/page.tsx               # 회수 현황
├── revenue/page.tsx            # 매출 관리
├── transactions/page.tsx       # 거래 내역
├── wallets/page.tsx            # 지갑 관리
├── wallets/[user_id]/adjust    # 지갑 조정 모달
├── anomalies/page.tsx          # 이상거래 감지
├── reward-pools/page.tsx       # 보상 재원 관리
├── reward-grants/page.tsx      # 보상 지급 이력
├── reward-config/page.tsx      # 보상 정책 설정
├── analytics/page.tsx          # KPI 분석
└── exports/page.tsx            # 데이터 엑스포트
```

### 12-2. 토큰 대시보드 (Token Dashboard)

**경로**: `/[locale]/(admin)/admin/token/page.tsx`

**컴포넌트 구조**:

```
<AdminTokenLayout>
  <TokenDashboard>
    <KPICardSection>
      <KPICard type="issued" />
      <KPICard type="sold" />
      <KPICard type="circulating" />
      <KPICard type="collected" />
    </KPICardSection>
    
    <TrendChartSection>
      <LineChart data={trends} period={period} />
      <PeriodSelector />
    </TrendChartSection>
    
    <RevenueSection>
      <RevenueTable data={revenue_items} />
    </RevenueSection>
    
    <QuickActionsSection>
      <Button href="/admin/token/wallets">지갑 관리</Button>
      <Button href="/admin/token/reward-pools">보상 재원</Button>
      <Button href="/admin/token/anomalies">이상거래</Button>
    </QuickActionsSection>
  </TokenDashboard>
</AdminTokenLayout>
```

**컴포넌트 파일**:
- `src/components/admin/token/KPICard.tsx`
- `src/components/admin/token/TokenDashboard.tsx`
- `src/components/admin/token/TrendChart.tsx`

### 12-3. 지갑 관리 (Wallet Management)

**경로**: `/[locale]/(admin)/admin/token/wallets/page.tsx`

**기능**:
- 사용자별 Bean 잔액 테이블 (정렬·필터 가능)
- 수동 조정 버튼 (행 클릭 시 모달)
- 감사 로그 팝업 (계정 클릭 시)

**모달**: `WalletAdjustmentDialog`

```tsx
// src/components/admin/token/WalletAdjustmentDialog.tsx
export interface WalletAdjustmentDialogProps {
  user_id: string
  current_balance: number
  onConfirm: (adjustmentData: AdjustmentPayload) => Promise<void>
  onCancel: () => void
}
```

### 12-4. 거래 내역 (Transaction History)

**경로**: `/[locale]/(admin)/admin/token/transactions/page.tsx`

**필터 바**:
- 사용자 검색 (자동완성)
- 거래유형 (다중선택 체크박스)
- 기간 (DateRangePicker)
- 금액 범위 (슬라이더)

**테이블**:
- 컬럼: 거래ID, 일시, 사용자, 유형, 금액, 방향, 잔액, 참고, 상태
- 행 클릭 시 상세보기
- CSV/Excel 엑스포트

### 12-5. 보상 재원 관리 (Reward Pool Management)

**경로**: `/[locale]/(admin)/admin/token/reward-pools/page.tsx`

**카드 리스트**:

```
각 풀마다:
┌──────────────────────────────────────┐
│ O2O 구매 보상                        │
│ 상태: [활성화 ✓]                    │
├──────────────────────────────────────┤
│ 잔액:  3,000 Bean  / 5,000 Bean    │ (진행률 표시)
│ 사용:  2,000 Bean (40%)             │
│                                     │
│ 지급 규칙: Pi × 10 = Bean           │
│ 거래당 한도: 100 Bean               │
│ 월 사용자 한도: 500 Bean            │
│                                     │
│ [정책 수정] [지급 이력]  [한도 리셋]│
└──────────────────────────────────────┘
```

---

## 13. 비즈니스 규칙

### 13-0. ⭐ 빈토큰지갑 명명 규칙 (최우선 적용)

> **§2-7~2-8의 확정 개념을 구현 규칙으로 번역한 항목들. 코드 작성 전 반드시 숙지.**

| 규칙 번호 | 내용 |
|---|---|
| N-1 | Bean 잔액을 저장하는 테이블은 **`bean_token_wallet`** 단 하나. 약어(`bean_wlt`) 신규 사용 금지 |
| N-2 | `wallet_type = 'PLATFORM'` 행은 단 1개. 발행 총량 관리용. 코드로 절대 삽입/삭제 금지 |
| N-3 | 사용자 Bean 입금 시: USER 지갑 `bean_amt` 증가 + PLATFORM 지갑 `bean_amt` 감소 (동시 원자적) |
| N-4 | 코드 변수명: `beanTokenWallet` (camelCase), 절대 `beanWlt`, `walletBean` 등 다른 약어 혼용 금지 |
| N-5 | UI 표시: 사용자에게는 **"빈토큰지갑"**, 영문 환경은 **"Bean Wallet"** (Token 생략 가능) |
| N-6 | 현재 DB 구현명이 `bean_wlt`인 경우, 마이그레이션 전까지 코드 주석에 `// TODO: rename to bean_token_wallet` 명시 |

### 13-1. Bean 발행 규칙

1. Pi 결제 완료 → `bean_txn(CHARGE)` 자동 생성
2. Bean = Pi × 100 (정수, 소수점 제거)
3. 발행 즉시 `bean_token_wallet`(USER 지갑) 입금 + PLATFORM 지갑 감소 (원자적 처리)
4. 환불 시 `bean_txn(REFUND)` 역거래 생성

### 13-2. Bean 소비 규칙

1. `fn_bean_apply()` 를 통해서만 차감 (원자성 보장)
2. 차감 전 음수 잔액 검증 (사전 차단) — `bean_token_wallet.bean_amt >= 0` 제약
3. 모든 소비는 `bean_txn` 기록 + `bean_token_wallet` 업데이트 트랜잭션
4. 소비 유형: SUBSCRIBE, TIP, FEE, (후기 추가 가능)

### 13-3. 보상 지급 규칙

1. O2O 매장 구매 완료 후 3600초(1시간) 딜레이 후 지급
2. 보상액 = bean_reward_pool.policy_json의 formula 계산
3. 풀 잔액 부족 시 (balance < 지급액):
   - REJECT: 거절 (사용자 불만 증가)
   - QUEUE: 대기열 (다음달 처리 가능)
   - SCALE: 비율 축소 (예: 50% 지급)
4. 월 리셋: 매월 1일 자정, used_bean = 0 초기화

### 13-4. 동결(Freeze) 규칙

1. `bean_token_wallet` (wallet_type='USER') `status = 'FROZEN'` 으로 설정
2. FROZEN 상태에서는 모든 출금(SUBSCRIBE, TIP 등) 거절
3. 입금(CHARGE, REWARD)은 가능
4. 30일 자동 해제 (또는 관리자 수동 해제)

### 13-5. 일관성 검증 규칙

**매일 자정(UTC) 자동 실행**:

```
-- USER 지갑 개별 일관성
FOR EACH wallet IN bean_token_wallet WHERE wallet_type='USER':
  calculated = SUM(bean_txn WHERE usr_id = wallet.usr_id AND del_yn='N')
  actual     = wallet.bean_amt
  IF calculated ≠ actual:
    CREATE bean_consistency_error
    ALERT admin (Slack, Email)

-- PLATFORM 전체 일관성
platform_balance = bean_token_wallet.bean_amt WHERE wallet_type='PLATFORM'
circulating      = SUM(bean_amt) FROM bean_token_wallet WHERE wallet_type='USER'
total_issued     = SUM(bean_amt) FROM bean_txn WHERE txn_tp_cd='CHARGE' AND del_yn='N'
IF platform_balance + circulating ≠ total_issued:
  ALERT "⚠️ 발행 총량 불일치"
```

**에러 복구**:
1. bean_txn 누락 또는 중복 확인
2. 보정 거래 생성 (CORRECTION 타입)
3. 관리자 승인 필요

---

## 14. 보안 요구사항

### 14-1. 인증 및 권한

1. **관리자 전용**: 모든 API 엔드포인트에 `isAdmin(user)` 검증 필수
2. **실패 시 응답**:
   ```json
   {
     "error": "Unauthorized",
     "code": "ADMIN_REQUIRED",
     "status": 401
   }
   ```

### 14-2. 수동 조정 감시

1. **모든 조정은 bean_audit_log 기록**:
   - who: `adj_by_admin_id` (관리자)
   - when: `reg_dtm` (일시)
   - what: `adj_bean`, `adj_before`, `adj_after` (금액)
   - why: `reason` (사유)

2. **사유 화이트리스트 검증**: 사전 정의된 항목만 허용

3. **증빙 문서**: 선택사항이나 권장 (대액 조정 시 필수)

### 14-3. 음수 잔액 방어

1. **차감 전 검증**:
   ```typescript
   if (current_balance < deduct_amount) {
     return { error: 'Insufficient balance' }
   }
   ```

2. **fn_bean_apply() 원자성**: 트랜잭션 내 동시 실행 방지

### 14-4. 서비스 키 보호

1. `SUPABASE_SERVICE_ROLE_KEY` lazy init (빌드 시 미설정 방지)
2. API 응답에 민감 정보 노출 금지
3. 오류 메시지는 사용자에게 일반화 (실 원인 숨김)

### 14-5. 감사 추적

1. **감시 대상 행위**:
   - 대량 충전 (1일 > 1,000 Bean)
   - 대량 소비 (1일 > 500 Bean)
   - 수동 조정 (모두)
   - 동결/해제 (모두)
   - 거래 취소 (모두)

2. **알림**: Slack + Email (관리자 채널)

### 14-6. 테스트 데이터

- 스테이징: 실제 데이터와 격리
- 프로덕션: Bean 조정 전 2인 승인 권장 (optional)

---

## 15. 구현 우선순위

### Phase 1: MVP (P0 — Core Features)

**목표**: Bean 경제의 가시성 확보

| 순위 | 기능 | 예상 공수 |
|---|---|---|
| **P0-1** | 토큰 대시보드 (KPI 카드 4개) | 3일 |
| **P0-2** | 거래 내역 조회 (bean_txn 조회 API + 테이블) | 3일 |
| **P0-3** | 지갑 관리 (조회 + 수동 조정) | 2일 |
| **P0-4** | bean_audit_log 테이블 + API | 1일 |
| **P0-5** | 발행·회수 이력 페이지 | 2일 |

**소계**: 11일

### Phase 2: 모니터링 강화 (P1)

| 순위 | 기능 | 예상 공수 |
|---|---|---|
| **P1-1** | 이상거래 감지 (규칙 5가지) | 3일 |
| **P1-2** | 매출 관리 대시보드 | 2일 |
| **P1-3** | 일관성 검증 (자동 + 수동 복구) | 2일 |
| **P1-4** | CSV/Excel 엑스포트 | 1일 |

**소계**: 8일

### Phase 3: 보상 경제 (P2)

| 순위 | 기능 | 예상 공수 |
|---|---|---|
| **P2-1** | bean_reward_pool + bean_reward_grant 테이블 | 1일 |
| **P2-2** | 보상 재원 관리 UI | 3일 |
| **P2-3** | 보상 정책 설정 화면 | 2일 |
| **P2-4** | 보상 지급 자동화 (cron) | 2일 |

**소계**: 8일

### Phase 4: 분석 및 고도화 (P3)

| 순위 | 기능 | 예상 공수 |
|---|---|---|
| **P3-1** | KPI 분석 대시보드 (시계열 차트) | 3일 |
| **P3-2** | 코호트 분석 | 2일 |
| **P3-3** | 자동 리포팅 (주간·월간) | 2일 |

**소계**: 7일

**전체 공수**: ~34일 (8주)

### 우선순위 논리

1. **P0 완료 후 운영 시작**: 발행·소비·유통의 기본 추적
2. **P1 추가**: 리스크 감지 및 수익 확인
3. **P2 추가**: O2O 생태계 구성 (별도 로드맵)
4. **P3 선택**: 경제 분석 (초기엔 BI 도구로 대체 가능)

---

## 부록

### A. 용어 정의

- **Bean Token**: cafe.pi의 오프체인 토큰 (☕ 카페빈)
- **Pi**: Pi Network의 암호화폐 (1 Pi = 100 Bean 고정)
- **발행 (Issued)**: Pi 충전으로 탄생한 Bean (누적)
- **판매 (Sold)**: 사용자 손에 넘어간 Bean (확정)
- **유통 (Circulating)**: 현재 사용자 지갑 보유액
- **회수 (Collected)**: 소비되어 PLATFORM 지갑으로 귀환한 Bean (사라지지 않음)
- **보상 (Reward)**: 플랫폼이 사용자에게 지급하는 Bean

### B. FAQ

**Q: Bean과 Pi의 관계는?**
A: 1 Pi = 100 Bean. Pi는 외부 결제, Bean은 내부 통화.

**Q: 구독료를 Pi로 직접 결제하나?**
A: 아니오. 사용자는 Pi로 Bean을 충전한 뒤, Bean으로 구독료 결제.

**Q: 음수 Bean이 가능한가?**
A: 아니오. 모든 차감 전 음수 검증으로 차단.

**Q: 보상 풀이 부족하면?**
A: 정책에 따라 REJECT(거절) / QUEUE(대기) / SCALE(축소) 선택.

**Q: 동결 계정의 Bean은?**
A: 입금은 가능, 출금은 불가. 해제 후 정상 사용.

### C. 변경 이력 (이 PRD 자체의)

이 섹션은 PRD 버전 관리 용도. 위의 "변경 이력" 테이블 참고.

---

## 참고 문헌

- [[PRD_15_FEE.md]]: Bean 경제 표준 요금 (정본)
- [[PRD_14_SUBSC.md]]: 구독 요금제
- [[currency-routing-rule]]: 거래 통화 라우팅 규칙
- [[CLAUDE.md]]: 프로젝트 기술 스택
- `docs/da/데이터표준규칙.md`: DA 명명 표준

---

**최종 승인자**: (구현 시작 전 아나킨 마스터님 최종 검토 필요)
