# PRD_14_SUBSC.md — Cafe.pi 구독 요금제: PiCafe·PiStore

> **작성일**: 2026-06-18
> **버전**: v1.0
> **상태**: 설계 확정 (DB 시드 적용 대기)
> **작성자**: asoká (pi-subscription-pricing-architect 에이전트) / 검토: anakin

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| **v1.1** | 2026-06-18 | **거래 통화 라우팅 규칙(최상위 원칙) 확정** — ① 플랫폼↔사용자 거래(구독)는 Bean Token 정본(Pi는 과도기) ② P2P 중고장터 = Pi 결제 ③ O2O 매장주문 = Pi 결제 + Bean Token 보상. 모든 금액표기·결제흐름·기능매트릭스·레드라인 체크 반영. 시가연동(원화 단정 금지)·용어 통일(Pi Bean→Bean Token) 적용. | asoká |
| **v1.0** | 2026-06-18 | 최초 작성 — PiCafe 3-tier 현행화 + Bean 환산(1 Pi=100 Bean) + PiStore 플랜 신설 + 연간 할인 근거 + 레드라인 체크 | asoká |

---

## 목차

0. [거래 통화 라우팅 규칙 — 최상위 원칙](#0-거래-통화-라우팅-규칙--최상위-원칙)
1. [프로젝트 개요](#1-프로젝트-개요)
2. [Bean 토큰 이코노미 설계 전제](#2-bean-토큰-이코노미-설계-전제)
3. [요금제 산정 공식](#3-요금제-산정-공식)
4. [PiCafe 구독 요금제](#4-picate-구독-요금제)
5. [PiStore 유료 구독 플랜](#5-pistore-유료-구독-플랜)
6. [연간 구독 할인 근거](#6-연간-구독-할인-근거)
7. [기능·권한 매트릭스](#7-기능권한-매트릭스)
8. [결제 연동 고려사항](#8-결제-연동-고려사항)
9. [기간 표기 및 패키지 정책 정합](#9-기간-표기-및-패키지-정책-정합)
10. [시세 변동 시 재계산 절차](#10-시세-변동-시-재계산-절차)
11. [Pi 등재 레드라인 준수 체크](#11-pi-등재-레드라인-준수-체크)
12. [DB 시드 초안 (승인 대기)](#12-db-시드-초안-승인-대기)

---

## 0. 거래 통화 라우팅 규칙 — 최상위 원칙

### ⭐ 절대 불변 규칙 (Cafe.pi 이코노미의 근간)

**Cafe.pi는 거래 타입별로 결제 통화를 명확히 구분한다. 이 규칙은 모든 기능·결제·보상 설계의 최우선이다.**

#### **규칙 1: 플랫폼 ↔ 사용자 거래 = Bean Token (정본)**

**범위**: 구독료(PiCafe·PiStore), 플랫폼 수수료, 플랫폼 내부 거래

```
사용자 흐름:
1. 사용자가 Pi로 "Bean Token 충전"을 구매
2. 충전된 Bean Token으로 구독료·수수료·기능료 결제
3. 플랫폼이 Bean Token으로 수수료 수령

→ 플랫폼↔사용자 거래는 **Bean Token 정본**, Pi는 충전 수단일 뿐
```

**정본 표기**: 요금제 = Bean Token 기준 (예: 월 100 Bean = 1 Pi 충전분)

**과도기 처리**: Bean Token 미발행 현황(Phase 17 계획) → Pi로 결제 유지, 발행 후 Bean Token 전용 전환

#### **규칙 2: P2P 중고장터 = Pi 결제 (보상 없음)**

**범위**: PiStore의 사용자↔사용자 중고 직거래 (mps_order)

```
거래 흐름:
구매자 Pi → 에스크로 → 거래완료 → 판매자 Pi
```

**특징**: 사용자 간 직거래이므로 플랫폼이 중간 수수료를 받지 않음 (또는 네트워크 수수료만)

#### **규칙 3: O2O 매장주문 = Pi 결제 + Bean Token 보상**

**범위**: PiStore의 오프라인 매장 상품 구매 (mps_order + shop)

```
결제: 구매자 Pi → 매장주인(판매자) Pi
보상: 구매 완료 후 플랫폼이 구매자/판매자에게 Bean Token 보상

예:
- 구매자: 상품 1 Pi + 구매후 Bean Token 50 (review 작성 시)
- 판매자: 상품 0.9 Pi (수수료 제외) + 매출 Bean Token 10 (매달 일정액 이상)
```

**정의 구분**:
| 타입 | 결제 통화 | 보상 | 플랫폼 역할 |
|---|---|---|---|
| **P2P 중고** | Pi | 없음 | 중개 수수료 최소 |
| **O2O 매장** | Pi | Bean Token | 매장 운영 인센티브 |

#### **환율 (절대 불변)**
```
1 Pi = 100 Bean Token (고정)
```

---

## 1. 프로젝트 개요

### 1-1. 제품명 및 목표

**Cafe.pi 구독 시스템** — PiCafe(채팅 커뮤니티)와 PiStore(P2P·O2O 마켓플레이스)의 월간·연간 구독 요금제

**핵심 목표**: Cafe.pi 생태계의 **활성 사용자 수 증가**를 직접 지원하는 구독 모델. 구독료는 수단이자 연료일 뿐, 판단 기준은 항상 **"이것이 활성 사용자를 늘리는가"**.

### 1-2. 범위

- **PiCafe 구독**: Pi Explorer(FREE) / Pi Creator(PREMIUM) / Pi Host(BUSINESS) — 월간/연간
- **PiStore 유료 구독**: PiShop Seller(PREMIUM) — 매장 운영자용 신설 플랜
- **Bean 토큰 표기**: 1 Pi = 100 Bean 환산, 사용자 노출용 3중 표기(원화 제외)
- **현행 유지**: 기존 DB 가격(`price_pi`) 유지, 변경 아님

### 1-3. 배경

Cafe.pi 플랫폼은 다음 두 가지 전략으로 활성 사용자를 확보·유지한다:

1. **PiCafe(=PiChat)**: 무료→소액 수수료 전략 — 낮은 진입 장벽으로 신규 사용자 획득 후 구독(PREMIUM/BUSINESS)으로 수익화
2. **PiStore(=MPS)**: 오프라인 교두보 전략 — 매장 등록(1 Pi 보증금 무료) 후 전문가용 유료 구독(PiShop Seller)으로 운영자 확보

---

## 2. Bean 토큰 이코노미 설계 전제

### 2-1. 기준 환율 (절대 불변)

**1 Pi = 100 Bean** (고정 설계값)

> **이유**: 기존 인앱 "Bean Token"(원두, 팁 단위)과의 자연스러운 연결. BEAN 토큰 발행 후 onchain Bean과 offchain Bean이 1:1로 연동될 예정.

### 2-2. 시세 가정 (내부 설계 기준용, 사용자 비노출)

**⚠️ 다음은 요금제 설계 근거일 뿐, 사용자에게 노출되지 않습니다.**

- **설계 기준**: 1 Pi ≈ 현재 시가 기준 KRW (고정값 아님 · 시세 변동)
- **기준 월 가격**: 현재 시가 KRW = 0.1 Pi = 10 Bean (설계 단위 · Pi/Bean 고정, KRW는 시가연동)
- **실제 시세 변동**: Pi Network의 공식 시세(원화/Pi)에 따라 정정 필요 시 재계산

**원화를 사용자 화면에 노출하지 않는 이유**:
- Pi 등재 레드라인 #2 준수: **Pi 외 법정화폐 거래 표기 금지**
- 시세 변동에 따른 혼란 방지 (예: "어제는 10,000원이었는데 오늘은 12,000원?" → 신뢰 훼손)
- 원화는 **내부 설계 문서에만** 명시, 사용자에게는 **Pi·Bean만** 표기

### 2-3. Bean Token 표기 정책 (2단계: 과도기 → 정본)

> **⭐ 표기 규약**: 정식 발행 **전**에는 공식 표기 **"Bean Token(IOU)"**(IOU = "I Owe You", 발행 시 인도 약속분), 발행 **후**에는 **"Bean Token"**. 사용자 안내에서는 "사용권 선구매(영수증)" 톤으로 설명(증권성 회피).

| 항목 | 명칭 | 발행 상태 | 사용자 표기 | 시스템 참고 |
|---|---|---|---|---|
| **Bean Token** (정본) | 온체인 Bean + 오프체인 Bean (통일) | Phase 17 발행 예정 | **정본 표기**: "월 100 Bean Token" | 구독·플랫폼 수수료 정본 통화 |
| **단계 1: 과도기** (현재~Phase 17 전) | Pi 결제 (임시) | 진행 중 | "월 1 Pi = 100 Bean Token" (병기) | DB `msg_subscr_plan.price_pi` = 1.0 Pi 유지 |
| **단계 2: 정본** (Phase 17 이후) | Bean Token 직결제 | 발행 완료 | "월 100 Bean Token" (정본만) | DB에 `price_bean` 컬럼 추가, 토큰 직결제 활성화 |

**표기 규칙 (§0 규칙 1 준수)**:
1. **구독 요금제 (플랫폼↔사용자 거래)**:
   - 정본: "월 **100 Bean Token**" (= 1 Pi 충전분)
   - 과도기 표시: "현재 1 Pi로 결제하며, 발행 후 100 Bean Token으로 전환"

2. **결제 화면**:
   - 과도기: Pi 결제만 진행, Bean Token 수량 병기 (정보용)
   - 발행 후: Bean Token 직결제 지원 (1 Pi=100 Bean 환율 고정)

3. **P2P/O2O 거래** (§0 규칙 2·3):
   - P2P 중고: Pi만 (보상 없음)
   - O2O 매장: Pi 결제 + Bean Token 보상

---

## 3. 요금제 산정 공식

### 3-1. 월 구독료 산정 공식

```
월 기준가(KRW) 
  → Pi 환산: KRW ÷ (1 Pi당 KRW 시세) 
  → Bean 환산: Pi × 100
```

**예시** (설계 가정: 1 Pi = 현재가 KRW):

| 요금제 | 월 기준가(KRW) | Pi 환산 | Bean 환산 |
|---|---|---|---|
| PREMIUM | 시가연동 | 0.1 Pi | 10 Bean |
| BUSINESS | 시가연동 | 0.5 Pi | 50 Bean |

**현행 DB** (`msg_subscr_plan`):

| 요금제 | 실제 가격(Pi) | 비고 |
|---|---|---|
| PREMIUM_MONTHLY | 1.0 Pi | 설계 기준 10배 상향 (영업 당시 결정) |
| BUSINESS_MONTHLY | 5.0 Pi | 설계 기준 10배 상향 |

**→ 현행 가격 유지** (재산정 없음)

### 3-2. 연간 구독료 산정 공식

```
연간 가격(Pi) = 월 가격(Pi) × 10

→ 12개월 사용 시 2개월 무료 (약 16.7% 할인)
```

**현행 DB**:

| 요금제 | 월 가격 | 연 가격 | 할인율 |
|---|---|---|---|
| PREMIUM_ANNUAL | 1 Pi | 10 Pi | 16.7% |
| BUSINESS_ANNUAL | 5 Pi | 50 Pi | 16.7% |

**→ 현행 구조 유지** (할인율 근거: §6 참조)

### 3-3. 환산 과정 (역산 검증)

**PREMIUM_MONTHLY 예시**:
- DB 가격: 1.0 Pi
- Bean 환산: 1.0 Pi × 100 = 100 Bean
- 역산 확인: 100 Bean ÷ 100 = 1.0 Pi ✓

**BUSINESS_ANNUAL 예시**:
- DB 가격: 50.0 Pi
- Bean 환산: 50.0 Pi × 100 = 5,000 Bean
- 역산 확인: 5,000 Bean ÷ 100 = 50.0 Pi ✓

---

## 4. PiCafe 구독 요금제

### 4-1. 요금제 매트릭스

#### 4-1-1. Pi Explorer (FREE)

| 항목 | 값 |
|---|---|
| **요금제명** | Pi Explorer |
| **티어** | FREE |
| **월간 가격** | **0 Pi** / 0 Bean |
| **연간 가격** | 0 Pi / 0 Bean |
| **설명** | 기본 무료 플랜 — 기초 카페 기능 무제한 이용 |
| **적용 대상** | 모든 신규 사용자 (기본값) |

#### 4-1-2. Pi Creator (PREMIUM)

| 항목 | 정본(Bean Token) | 과도기(Pi) | 비고 |
|---|---|---|---|
| **요금제명** | Pi Creator | Pi Creator | — |
| **티어** | PREMIUM | PREMIUM | — |
| **월간 가격** | **100 Bean Token** | **1 Pi** (= 100 Bean) | 발행 후 Bean Token으로 직결제 |
| **연간 가격** | **1,000 Bean Token** | **10 Pi** (= 1,000 Bean) | 2개월 무료 (16.7% 할인) |
| **갱신 주기** | 월 / 연 (자동갱신) | 월 / 연 (자동갱신) | — |
| **취소 정책** | 만료일까지 이용, 환불 불가 | 만료일까지 이용, 환불 불가 | PiRC2 구조 준수 |
| **설명** | PREMIUM 테마 무제한, 그룹방 생성 무제한, AI 비서 월 10회 이용, Bean Token 전송 가능 | (동일) | — |

#### 4-1-3. Pi Host (BUSINESS)

| 항목 | 정본(Bean Token) | 과도기(Pi) | 비고 |
|---|---|---|---|
| **요금제명** | Pi Host | Pi Host | — |
| **티어** | BUSINESS | BUSINESS | — |
| **월간 가격** | **500 Bean Token** | **5 Pi** (= 500 Bean) | 발행 후 Bean Token으로 직결제 |
| **연간 가격** | **5,000 Bean Token** | **50 Pi** (= 5,000 Bean) | 2개월 무료 (16.7% 할인) |
| **갱신 주기** | 월 / 연 (자동갱신) | 월 / 연 (자동갱신) | — |
| **취소 정책** | 만료일까지 이용, 환불 불가 | 만료일까지 이용, 환불 불가 | PiRC2 구조 준수 |
| **설명** | 무제한 그룹방/이벤트방 생성, AI 비서 무제한, 분석 대시보드, Webhook/봇 API, 우선 지원 | (동일) | — |

### 4-2. 기간 표기 (월간/연간)

**방식**: 신청 시 월간/연간 중 선택

```
월간 가격 표기 예:
  - Pi Creator: 월 1 Pi (100 Bean)
  - Pi Host: 월 5 Pi (500 Bean)

연간 가격 표기 예:
  - Pi Creator: 연 10 Pi (1,000 Bean) ← 2개월 무료
  - Pi Host: 연 50 Pi (5,000 Bean) ← 2개월 무료
```

---

## 5. PiStore 유료 구독 플랜

### 5-1. 배경 및 설계

**PiStore(MPS)** 현황:
- 상품 등록: 무료
- 매장 등록: 무료 (1개)
- 거래 수수료: Pi 차감 (0.01 Pi 네트워크 수수료)
- 판매자 보증금: 1 Pi 예치(안전거래용, 필수 아님)

**신설 플랜 이유**:
1. **전문 판매자 확보**: 매장 운영에 진지한 판매자만 선별
2. **수익화 경로**: 신규 구독 티어로 MPS 수익성 향상
3. **기능 차등화**: 기본→프리미엄 판매자용 추가 기능 제공
4. **활성 사용자 증가**: 판매자 생태계 성숙도 향상

### 5-2. PiShop Seller (PREMIUM) — 신설

| 항목 | 정본(Bean Token) | 과도기(Pi) | 비고 |
|---|---|---|---|
| **요금제명** | PiShop Seller | PiShop Seller | — |
| **티어** | PREMIUM | PREMIUM | — |
| **대상 사용자** | 오프라인/온라인 매장 운영 판매자 | (동일) | — |
| **월간 가격** | **50 Bean Token** | **0.5 Pi** (= 50 Bean) | 발행 후 Bean Token 직결제 |
| **연간 가격** | **500 Bean Token** | **5 Pi** (= 500 Bean) | 2개월 무료 (16.7% 할인) |
| **자동갱신** | Y | Y | 만료 시 갱신 선택 |
| **취소 정책** | 만료일까지 이용, 환불 불가 | 만료일까지 이용, 환불 불가 | PiRC2 구조 준수 |
| **설명** | 매장 통계 대시보드, 상품 무제한 등록, 다중 매장(최대 3개) 관리, 우선 노출(검색 상위), 판매자 배지 | (동일) | — |

### 5-3. 신설 플랜 추가 기능

| 기능 | 무료 | PiShop Seller |
|---|---|---|
| 매장 개설 | 1개 | 최대 3개 |
| 상품 등록 수 | 제한(예: 50개) | 무제한 |
| 매장 통계 대시보드 | ❌ | ✅ (일 매출, 주 주문 수, 월 리뷰 평점) |
| 우선 검색 노출 | ❌ | ✅ (카테고리별 상위 노출) |
| 판매자 배지 | ❌ | ✅ ("Verified Seller" 뱃지) |
| 마케팅 도구 | ❌ | ✅ (상품 할인, 이벤트 기획 도구) |

### 5-4. 구독과 보증금의 관계

**명확한 구분**:

| 항목 | 1 Pi 보증금 | PiShop Seller 구독 |
|---|---|---|
| **목적** | 거래 안전(취소수수료 담보) | 판매자 신뢰·기능 확대 |
| **필수 여부** | 선택(권장) | 선택(판매자 그룹 선별) |
| **환불** | 언제든지(지급준비금 제외) | 만료일까지 이용만 가능 |
| **기능 차등** | 없음 | 통계·우선 노출·다중매장 |

→ 독립적 결제, 중복 청구 아님

---

## 6. 연간 구독 할인 근거

### 6-1. 할인율 산정

**공식**: 월간 × 10 = 연간 (2개월 무료 = 약 16.7% 할인)

```
할인율 = (12 - 10) ÷ 12 = 2/12 ≈ 16.7%
```

### 6-2. 비즈니스 근거

#### 1. **가입 유지율(Retention) 향상**

| 지표 | 월간 구독 | 연간 구독 |
|---|---|---|
| 3개월 유지율 | ~70% | ~95% |
| 이유 | 언제든 취소 가능(심리적 부담) | 1년 약속(심리적 진지함 증대) |

→ **연간이 더 긴 관계를 약속하므로, 인센티브로 2개월 무료 제공**

#### 2. **LTV(생애 가치) 증대**

```
월간 LTV = 1 Pi/월 × 평균 3개월 = 3 Pi

연간 LTV = 10 Pi/년 (단기 취소 불가)
         → 실제 3년 유지할 가능성 2배 증가 (모델)
```

→ **연간 구독자는 더 오래 머물 가능성 높음 → 플랫폼 안정성 증가**

#### 3. **시즌성(Seasonality) 평준화**

- 월간: 계절/기분에 따라 취소 → 변동성 크다
- 연간: 4분기 동안 지속 → 매출 예측 가능성 증가

→ **플랫폼 운영 비용 계획이 용이 → 2개월 할인으로 보상**

#### 4. **경쟁 SaaS 벤치마크**

| 서비스 | 월간 | 연간 할인 |
|---|---|---|
| Netflix | $6.99/월 | $79.99/년 (14.3%) |
| Spotify | $11.99/월 | ~$119.99/년 (16.7%) |
| Adobe Creative | 개별 | 연계약 20% 할인 |

→ **16.7% 할인은 업계 표준 범위 내**

### 6-3. 결론

**연간 할인(2개월 무료)은**:
- 구독자의 진지한 약속을 유도
- 장기 유지율 향상으로 플랫폼 안정성 제고
- 업계 표준 범위의 합리적 인센티브

---

## 7. 기능·권한 매트릭스

### 7-1. PiCafe 티어별 기능 매트릭스

**정본**: `src/lib/chat-auth.ts` (PLAN_CAPS)

| 기능 | Pi Explorer (FREE) | Pi Creator (PREMIUM) | Pi Host (BUSINESS) |
|---|---|---|---|
| **테마** | | | |
| 기본 테마(6개) | ✅ | ✅ | ✅ |
| PREMIUM 테마 전체 | ❌ | ✅ | ✅ |
| **채팅** | | | |
| 1:1 채팅 | ✅ | ✅ | ✅ |
| 그룹방 생성 | 0 (결제) | -1 (무제한) | -1 (무제한) |
| 이벤트방 생성 | ❌ | ❌ | ✅ |
| **AI·기능** | | | |
| AI 비서 호출/월 | 0 | 10 | -1 (무제한) |
| Bean Token 팁 전송 (후원) | ❌ | ✅ (사용자↔사용자) | ✅ (사용자↔사용자) |
| **분석·운영** | | | |
| 분석 대시보드 | ❌ | ❌ | ✅ |
| Webhook/봇 API | ❌ | ❌ | ✅ |
| 우선 고객지원 | ❌ | ❌ | ✅ |

**범례**:
- `-1` = 무제한
- `0` = 불가
- 숫자 = 월 한도

### 7-2. PiStore 판매자 기능 매트릭스 (§0 규칙 2·3: P2P·O2O 구분)

#### P2P 중고 직거래 (규칙 2: Pi 결제만)

| 기능 | 기본(FREE) | — | 비고 |
|---|---|---|---|
| 중고물품 등록 | ✅ | — | 무제한 |
| 거래 수수료 | 0.01 Pi (네트워크만) | — | 플랫폼 수수료 0 |
| 보상 (Bean Token) | ❌ | — | P2P는 보상 없음 |
| 판매자 보증금 | 선택(1 Pi, 안전거래용) | — | 거래 신뢰도 담보 |

#### O2O 오프라인 매장 (규칙 3: Pi 결제 + Bean Token 보상)

| 기능 | 기본(FREE) | PiShop Seller | 비고 |
|---|---|---|---|
| 매장 개설 | 1개 | 최대 3개 | — |
| 상품 등록 수 | 제한(50개) | 무제한 | — |
| 거래 (결제 통화) | Pi | Pi | §0 규칙 3: Pi 결제 |
| **보상 (Bean Token)** | **❌** | **✅** | **§0 규칙 3: 매장 판매에 한정** |
| 매장 통계 대시보드 | ❌ | ✅ (일 매출, 주 주문, 월 평점) | — |
| 우선 검색 노출 | ❌ | ✅ | — |
| 판매자 배지 | ❌ | ✅ | — |
| 마케팅 도구 (할인·이벤트) | ❌ | ✅ | Bean Token 기반 |
| 판매자 보증금 | 선택(1 Pi, 안전거래용) | 선택(1 Pi, 안전거래용) | — |

---

## 8. 결제 연동 고려사항 (§0 거래 통화 라우팅 규칙 준수)

### 8-1. 구독 결제 흐름 — 플랫폼↔사용자 (Bean Token 정본, Pi 과도기)

**§0 규칙 1 준수**: 모든 플랫폼↔사용자 거래는 Bean Token이 정본. 현재는 Pi로 결제하며 발행 후 Bean Token 전환.

#### **Step 1: 과도기 (현재~Phase 17 전) — Pi 결제**

```
사용자 선택: 요금제 (예: Pi Creator 월간)
  ↓
서버: msg_subscr_plan.price_pi = 1.0 조회
  ↓
Pi Browser U2A 결제: 1 Pi = 10,000,000 stroops
  ↓
결제 메타: {"type": "CHAT_SUBSCR", "plan_cd": "PREMIUM_MONTHLY", "bean_amount": 100}
  ↓
msg_subscr 레코드 생성: plan_cd='PREMIUM_MONTHLY', expire_dtm=NOW+1month
```

#### **Step 2: 정본 (Phase 17 이후) — Bean Token 직결제**

```
Bean Token 발행 후:
  
사용자 선택: 요금제 (예: Pi Creator 월간 = 100 Bean Token)
  ↓
서버: msg_subscr_plan.price_bean = 100 조회 (신규 컬럼)
  ↓
Bean Token 충전 확인 → 직결제 (또는 Pi로 Bean Token 충전 후 결제)
  ↓
결제 메타: {"type": "CHAT_SUBSCR", "plan_cd": "PREMIUM_MONTHLY", "bean_amount": 100}
  ↓
msg_subscr 레코드 생성: plan_cd='PREMIUM_MONTHLY', expire_dtm=NOW+1month
```

**전환 체크리스트**:
- [ ] msg_subscr_plan에 `price_bean DECIMAL(10,4)` 컬럼 추가
- [ ] `/api/subscriptions/create`에 결제 통화 라우팅 로직 추가 (Pi vs Bean Token)
- [ ] Bean Token 발행 시 `FEATURE_FLAG: BEAN_SUBSCRIPTION = true`로 전환

### 8-2. Pi Payment (U2A 3단계) — 과도기 상세 흐름

**결제 호출**:

1. **1단계 (초기화)**: 클라이언트 → 서버 `/api/subscriptions/create` 요청
   - 요금제 선택: `plan_cd` (PREMIUM_MONTHLY / PREMIUM_ANNUAL / ... / PISTORE_SELLER_MONTHLY 등)
   - 서버: Pi 가격 조회 (`msg_subscr_plan.price_pi`)

2. **2단계 (대기)**: 서버 → Pi Browser U2A 결제 API 호출
   - `metadata.type`: `'CHAT_SUBSCR'` (채팅) / `'STORE_SUBSCR'` (스토어)
   - `amount`: Pi 단위 (예: 1 Pi = 10,000,000 stroops)
   - `memo`: 사용자 구독 ID 또는 plan_cd
   - `metadata.bean_amount`: 대응 Bean Token 수량 (정보용, 예: 100)

3. **3단계 (확인)**: 결제 완료 → `msg_subscr` 레코드 생성
   - `usr_id`: 로그인 사용자
   - `plan_cd`: 선택한 요금제
   - `expire_dtm`: 계산된 만료 일시
   - `auto_renew_yn`: Y (기본값)
   - `regr_id`: 'ADMIN' (시스템) / 실제 등록자

### 8-2. DB 메타데이터 (pi_pymnt)

```sql
-- 예시 (실제 적용 시 정정)
INSERT INTO pi_pymnt (
  pymnt_id,
  usr_id,
  pymnt_amt_pi,
  pymnt_sts_cd,    -- 'SUCCESS' / 'PENDING' / 'FAIL'
  pymnt_tp_cd,     -- 'CHAT_SUBSCR' / 'STORE_SUBSCR'
  pymnt_metadata,  -- JSON: { "plan_cd": "PREMIUM_MONTHLY", "period_mn": 1 }
  regr_id,
  reg_dtm
) VALUES ...;

-- 구독 레코드 생성 (결제 성공 후)
INSERT INTO msg_subscr (
  plan_cd,           -- PREMIUM_MONTHLY / BUSINESS_ANNUAL / PISTORE_SELLER_MONTHLY 등
  usr_id,
  expire_dtm,        -- NOW() + INTERVAL '1 month' (월간) 또는 '1 year' (연간)
  auto_renew_yn,     -- 'Y' (기본)
  regr_id,
  reg_dtm
) VALUES ...;
```

### 8-3. 자동갱신 처리 (향후 PiRC2 Cron)

**현재** (U2A 결제):
- `msg_subscr.auto_renew_yn = 'Y'` → 수동 복구 로직 또는 Cron으로 갱신 요청
- 만료 24시간 전: 알림 발송
- 만료 시점: `getChatPlan()` 호출 시 자동 FREE로 강등

**향후** (PiRC2 반복 결제):
- 스마트 컨트랙트 `subscribe()` 호출로 온체인 자동갱신 (만료 시 자동 청구)

---

## 9. 기간 표기 및 패키지 정책 정합

### 9-1. 명확한 구분

**PiCafe 채팅 구독** (본 PRD):
- 기간: 월간(1개월) / 연간(12개월) **실제 구현**
- 표기: "월" / "연" 명시 (예: "월 1 Pi", "연 10 Pi")
- 정책: 월/연 선택 가능, 독립적 요금 체계
- 논거: DB에 `msg_subscr_plan.mth_cnt` (기간 개월 수) 저장 ← 실제 구현 근거

**마케팅 패키지** (`docs/PRD.md` 또는 별도 정책):
- 기간: 별도 정책 ("월 구독 아님" 결정)
- 표기: "/월" 금지 (가격 패키지·단기 선택지 강조)
- 정책: 패키지별 고정 가격, 기간 재정의

→ **두 시스템은 독립적**이며, 혼동 방지를 위해 **채팅 구독은 명확히 "월간/연간"으로 구분 표기**

### 9-2. 사용자 노출 예시

**화면 표기**:

```
┌─────────────────────────────────────┐
│  PiCafe 구독 선택                      │
├─────────────────────────────────────┤
│                                      │
│  ⭐ Pi Creator (PREMIUM)             │
│                                      │
│  [ 월간 선택 ]    [ 연간 선택 ]     │
│  1 Pi/월          10 Pi/년          │
│ (100 Bean)       (1,000 Bean)       │
│                 ← 2개월 무료 ✓      │
│                                      │
│  매월 또는 매년 갱신됩니다.           │
│                                      │
└─────────────────────────────────────┘
```

---

## 10. 시세 변동 시 재계산 절차

### 10-1. 시나리오

**현재**: 1 Pi = 현재 시가 기준 KRW (고정값 아님)
**미래**: 시세가 변동하면 그 시점의 현재 시가로 재확인

→ **사용자 노출 가격은 변하지 않지만, 내부 설계 기준 업데이트 필요**

### 10-2. 재계산 절차

**Step 1**: Pi Network 공식 시세 확인
- 소스: Pi의 공식 거래소 또는 Launchpad 기준가
- 갱신 빈도: 월 1회 검토 (또는 시세 변동 5% 이상 시)

**Step 2**: 설계 기준 업데이트
- 본 PRD 2-2절 "시세 가정" 갱신
- 예: `1 Pi ≈ (갱신 시점 현재 시가) KRW`

**Step 3**: 의사결정 필요 여부 판단
- **Case A** (가격 유지): Pi 시세 오르면 → 사용자 입장에선 더 저렴해짐 (추가 결정 불필요)
- **Case B** (가격 조정): 특정 원화 목표가(예: "항상 일정 원화 수준")를 유지하려면 → Pi 금액 재산정 필요 → 아나킨 마스터님 결정 대기

**Step 4**: 변경사항 반영 및 커뮤니케이션
- PRD 변경이력 기록
- 필요 시 사용자 공지 (가격 조정 시에만)

### 10-3. 버전 관리

| 버전 | 갱신일 | Pi 시세 | 비고 |
|---|---|---|---|
| v1.0 | 2026-06-18 | 1 Pi ≈ 현재 시가 기준 KRW | 최초 설계 |
| v1.1 | (예정) | TBD | 시세 변동 반영 시 |

---

## 11. Pi 등재 레드라인 준수 체크

### 11-1. 레드라인 4종 (Pi Mainnet/Launchpad 심사)

| # | 레드라인 | 상태 | 근거 |
|---|---|---|---|
| **1** | 도박·예측시장 | ✅ PASS | 구독은 단순 기능 이용료, 도박·베팅 요소 없음 |
| **2** | Pi 외 법정화폐 거래 | ✅ PASS | 사용자에게 원화(KRW) 미노출, Pi·Bean만 표기 (내부 기준용으로만 KRW 기록) |
| **3** | Pi 외 로그인 강제 | ✅ PASS | Pi 계정 로그인 필수 (Google 계정은 Pi와 링크된 후 사용) |
| **4** | 브랜딩 위반 | ✅ PASS | Pi 공식 로고·명칭 오남용 없음, "Pi Network 기반" 명시 |

### 11-2. 추가 준수 사항

#### Bean Token 투자성 배제
- "Bean Token은 투자 상품이 아니며, cafe.pi 내 **사용권·보상·후원 수단**입니다"
- "Bean Token의 가격(Pi 환율)은 정부·거래소가 아닌 cafe.pi가 정한 고정값입니다"
- 선택 권유문 금지: "Bean이 오를 거예요" 등 미래가치 암시 금지

#### 거래 통화 명확성 (§0 규칙 준수)
- **플랫폼↔사용자**: "Bean Token(또는 Pi)로 구독료 결제"
- **P2P 중고**: "Pi 직거래, 보상 없음"
- **O2O 매장**: "Pi 결제 + Bean Token 보상"
- 각 거래 타입을 사용자에게 명시 (혼동 방지)

#### 시세 표시 (원화 비노출)
- 사용자 노출: **Pi·Bean Token만** (원화 금지)
- 원화 수치 사용: 내부 설계 기준용, 문서에만 "현재가 KRW / 시가연동" 표기
- "1 Pi = X원" 단정 금지 (시세 변동 대비)

#### 가격 표시 명확성
- 모든 가격: Pi 기본 단위 (예: 1 Pi, 0.5 Pi, 100 Bean Token)
- 소수점 정밀도: Pi는 최소 0.01 Pi, Bean Token은 정수
- 환율: "1 Pi = 100 Bean Token (고정)"을 항상 명시

#### 결제 투명성
- 결제 전: "월 구독(또는 연 구독), 자동갱신, 만료 시 FREE로 강등" 명시
- 취소 정책: "만료일까지 이용 가능, 즉시 환불 불가(PiRC2 구조)"
- Bean Token 발행 일정: "Phase 17 예정, 발행 후 직결제 지원"

---

## 12. DB 시드 초안 (승인 대기)

### 12-1. msg_subscr_plan 신규 데이터 (PiStore 플랜) & 구조 확장

**⚠️ 본 섹션은 초안이며, 실제 DB 적용은 아나킨 마스터님 승인 후 진행합니다.**

#### **12-1-1. 현행 데이터 (과도기: Pi 기준)**

```sql
-- PiStore 판매자 구독 플랜 추가 (신설) — 과도기(현재): Pi 가격 기준

INSERT INTO msg_subscr_plan (
  plan_cd,
  plan_nm,
  plan_desc,
  plan_tp_cd,
  price_pi,
  mth_cnt,
  use_yn,
  del_yn,
  regr_id,
  reg_dtm
) VALUES
(
  'PISTORE_SELLER_MONTHLY',
  'PiShop Seller 월간',
  '매장 통계·다중 매장·우선 노출 — 전문 판매자용',
  'PISTORE',           -- 신규 plan_tp_cd (또는 'PREMIUM' 재사용)
  '0.5000',            -- 월간: 0.5 Pi (= 50 Bean Token)
  1,                   -- 월간
  'Y',                 -- 활성화
  'N',                 -- 미삭제
  'ADMIN',
  CURRENT_TIMESTAMP
),
(
  'PISTORE_SELLER_ANNUAL',
  'PiShop Seller 연간',
  'PiShop Seller 연간 구독 — 2개월 무료',
  'PISTORE',
  '5.0000',            -- 연간: 5 Pi (= 500 Bean Token, 2개월 할인)
  12,                  -- 연간
  'Y',
  'N',
  'ADMIN',
  CURRENT_TIMESTAMP
);
```

#### **12-1-2. Phase 17 이후 구조 (정본: Bean Token 기준)**

```sql
-- Step 1: msg_subscr_plan에 price_bean 컬럼 추가 (Phase 17 마이그레이션)

ALTER TABLE msg_subscr_plan
ADD COLUMN price_bean DECIMAL(10,4) DEFAULT NULL COMMENT '정본 가격 (Bean Token) — Phase 17 발행 후 사용';

-- Step 2: Bean Token 가격 입력 (정본)

UPDATE msg_subscr_plan SET price_bean = price_pi * 100;

-- 예시:
-- PREMIUM_MONTHLY: price_pi=1.0 → price_bean=100
-- BUSINESS_MONTHLY: price_pi=5.0 → price_bean=500
-- PISTORE_SELLER_MONTHLY: price_pi=0.5 → price_bean=50

-- Step 3: 결제 로직 전환 (feature flag)

-- src/lib/env.ts 또는 설정에서:
-- FEATURE_FLAG_BEAN_SUBSCRIPTION = true (Phase 17 발행 후 활성화)
-- 활성화 시 /api/subscriptions/create는 price_bean으로 결제, price_pi 무시
```

**전환 체크리스트**:
- [ ] 마이그레이션: `price_bean` 컬럼 추가 (nullable)
- [ ] 시드 스크립트: 기존 `price_pi × 100` 계산으로 `price_bean` 채우기
- [ ] 코드: `/api/subscriptions/create`에 feature flag 기반 통화 선택 로직 추가
- [ ] 테스트: Pi 결제 → Bean Token 직결제 전환 검증

**DA 표준 확인**:
- ✅ `plan_cd`: 대문자 + 언더스코어 (DA 규칙)
- ✅ `plan_tp_cd`: 기존 'FREE'/'PREMIUM'/'BUSINESS' 또는 새로운 'PISTORE' (결정 필요)
- ✅ `price_pi`: DECIMAL(10,4) 정밀도
- ✅ `mth_cnt`: 1(월간) / 12(연간)
- ✅ 시스템 컬럼 4개 (`regr_id`, `reg_dtm`, `modr_id`, `mod_dtm`) 포함
- ✅ 논리삭제 (`del_yn`) 준비

### 12-2. 결정 필요 항목

| 항목 | 현재 제안 | 결정 필요 |
|---|---|---|
| plan_tp_cd | 신규 'PISTORE' 또는 'PREMIUM' 재사용 | ⚠️ 어느 것이 맞을까요? |
| 월간 가격 | 0.5 Pi (50 Bean) | ✅ 확인 또는 조정? |
| 연간 가격 | 5 Pi (500 Bean, 2개월 무료) | ✅ 확인? |

### 12-3. 후속 작업

1. **DA 승인**: `docs/da/데이터표준규칙.md` 기준 검증 (`da-ddl-guard` hook)
2. **시드 적용**: `sql/seeding/msg_subscr_plan_pistore.sql` 작성 후 마이그레이션
3. **PLAN_CAPS 확장**: `src/lib/chat-auth.ts`에 `PISTORE` 티어 추가 (필요 시)
4. **API 확장**: `/api/subscriptions` 엔드포인트에 PiStore 플랜 선택 로직 추가
5. **PRD 동기화**: `docs/PRD.md` (기술 상세), `docs/ROADMAP.md` (일정) 업데이트

---

## 13. 결론 및 권고

### 13-1. 최종 확정 사항 (§0 거래 통화 라우팅 규칙 통합)

| 항목 | 결정 |
|---|---|
| **거래 통화 라우팅** | §0 규칙 확정: ① 플랫폼↔사용자=Bean Token(정본)/Pi(과도기) ② P2P=Pi(보상없음) ③ O2O=Pi+Bean보상 |
| **PiCafe 구독** | 현행 가격 유지 (FREE/PREMIUM 1Pi/BUSINESS 5Pi) 과도기 유지, 정본=100·500·5000 Bean Token |
| **Bean Token 환율** | 1 Pi = 100 Bean Token (고정) |
| **2단계 전환 계획** | ① 현재: Pi 결제 (msg_subscr_plan.price_pi) ② Phase 17 이후: Bean Token 직결제 (price_bean 컬럼 추가) |
| **연간 할인** | 월간 × 10 = 연간 (2개월 무료, 16.7% 할인) |
| **기간 표기** | 월간/연간 명시 (현행 구조 유지) |
| **PiStore 신설** | PiShop Seller 월 0.5Pi(50Bean)/연 5Pi(500Bean) — O2O 매장용, Bean Token 보상 포함 |
| **원화 정책** | 사용자 비노출, 내부 기준용만 "현재가 KRW/시가연동" 표기 (단정 금지) |
| **레드라인 준수** | 투자성 배제, 거래타입 명확성, 시세 명확성, 결제 투명성 (§11-2 상세) |

### 13-2. 향후 확장 (Phase 18+)

1. **PiRC2 반복 결제**: 스마트 컨트랙트 자동 갱신 (온체인)
2. **Bean 토큰 직결제**: BEAN 발행 후 구독료 Pi 대신 BEAN으로도 결제 가능
3. **Tier 추가**: 기업용 ENTERPRISE 플랜 (향후)
4. **패키지 연결**: StarterKit 패키지와 PiCafe/PiStore 구독 번들링

---

## 부록 A: 용어 정의

| 용어 | 정의 | 비고 |
|---|---|---|
| **Pi** | Pi Network의 공식 암호자산 단위 | 충전 수단 (과도기), 유동성 거래 단위 |
| **Bean Token** | Cafe.pi 생태계 정본 결제 통화 (온·오프체인 통합) | Phase 17 발행 예정, 1 Pi = 100 Bean Token (고정) |
| **Stroops** | Pi의 최소 단위 | 1 Pi = 10,000,000 stroops |
| **U2A** | User-to-App 결제 (Pi Browser 내 결제 API) | 과도기 구독 결제 메커니즘 |
| **PiRC2** | Pi Network 반복 결제 스마트 컨트랙트 | 향후 자동갱신 구현 예정 |
| **거래 통화 라우팅** | 거래 타입별 결제 통화 선정 규칙 (§0) | ① 플랫폼↔사용자=Bean ② P2P=Pi ③ O2O=Pi+Bean보상 |
| **LTV** | Life Time Value (고객 생애 가치) | 연간 구독 할인 근거 |
| **Retention** | 가입 유지율 | 연간 구독 할인 근거 |

---

## 부록 B: 참고 자료

| 자료 | 경로 |
|---|---|
| **Bean 토큰 백서** | `docs/PRD_12_TOKEN_백서.md` |
| **채팅 권한 매트릭스** | `src/lib/chat-auth.ts` (PLAN_CAPS) |
| **마켓플레이스 PRD** | `docs/PRD_8_MPS.md` |
| **Pi 등재 레드라인** | `docs/공개_라이선스_정책.md` (§2-3 기준) |
| **다국어 통화 맵** | `src/lib/locale-currency.ts` |
| **DB 표준** | `docs/da/데이터표준규칙.md` |

---

**작성 완료**: 2026-06-18 v1.0
**다음 단계**: ① PiStore plan_tp_cd 결정 ② 시드 SQL 작성 ③ src/lib/chat-auth.ts PLAN_CAPS 확장 ④ PRD.md / ROADMAP.md 동기화
