# PRD_21_DATA_ANAL — 데이터 분석 및 시각화 시스템

**마지막 수정:** 2026-06-25  
**상태:** 기획 (as-is 정본화 + to-be 설계)  
**작성자:** Claude Code (data-analytics-visualizer)  
**북극성 정합:** ✅ 활성 사용자 수 최상단 강조, 매출은 보조 지표

---

## 1. 개요

### 1-1. 목적
- **cafe.pi 플랫폼의 핵심 지표를 통합 수집·집계·시각화**
  - 북극성: **활성 사용자 수** (DAU/WAU/MAU, 고착도)
  - 부수: 매출(Pi/Bean), 구독, 보상, 주문, 웹 사용 행동
- **데이터 기반 의사결정 지원** — 대시보드, 트렌드 추이, 드릴다운
- **비즈니스 성과 추적** — KPI, 목표 대비 진행도, 예측 불가능 인사이트

### 1-2. 핵심 가치 명제
**"활성 사용자를 최우선에 두고, 매출과 행동 지표로 사용자 건강도를 종합 진단한다. 데이터 기반 운영으로 cafe.pi 생태계의 성공을 측정한다."**

### 1-3. 프로젝트 제약 (위반 금지)
1. **북극성 우선**: 활성 사용자 수를 모든 대시보드 최상단에 강조
2. **2층위 통화 구분**: Pi(현금) vs Bean(토큰) 분리 저장 및 분석
3. **논리삭제 원칙**: 모든 분석은 `del_yn = 'N'` 활성행만 집계
4. **username 마스킹**: 비관리자 뷰 노출 시 maskUsername 적용
5. **DA 표준 준수**: 신규 테이블은 시스템컬럼 4개, _cd/_dt/_dtm/_amt 도메인, 접두사 필수
6. **Supabase 서버 전용**: service-role key만 사용, FK 없는 설계 → PostgREST 임베디드 조인 금지
7. **브랜드 표기**: PiCafé™ / PiShop™ / PiTranslate™ (표시 텍스트만, 코드값은 원형)
8. **날짜·시간 표시**: 현지 시간대 toLocaleString (KST 기준)

---

## 2. 현황 분석 (As-Is Inventory)

### 2-1. 기존 집계 테이블 (운영 중)

#### stat_actvty_dly — 일별 사용자 활동 통계
```
테이블명: stat_actvty_dly
PK: stat_dt (DATE)
행 수: 약 365행/년 (1행/일)
갱신: fn_build_daily_stats() cron 매일 자정

컬럼:
  stat_dt   DATE         PK
  dau_cnt   INTEGER      -- 당일 활성 사용자
  wau_cnt   INTEGER      -- 최근 7일 활성 사용자 고유
  mau_cnt   INTEGER      -- 최근 30일 활성 사용자 고유
  regr_id, reg_dtm, modr_id, mod_dtm  -- 시스템 컬럼 4개
```

**인덱스**: idx_actvty_log_dt (sys_user_actvty_log 활동 로그 기반)

#### stat_revenue_dly — 일별 × 테마별 Pi 매출
```
테이블명: stat_revenue_dly
PK: (stat_dt, theme_cd) 복합
행 수: ~7,000행/년 (365일 × 20테마)
갱신: fn_build_daily_stats() cron 일배치

컬럼:
  stat_dt   DATE
  theme_cd  VARCHAR(20)  -- msg_theme.theme_cd 또는 SUBSCRIPTION/UNKNOWN
  rev_pi    DECIMAL      -- 매출 (Pi 단위)
  txn_cnt   INTEGER      -- 거래 건수

4경로 UNION:
  1. 방 생성 (pi_pymnt, type='CHAT_ROOM_CREATE')
  2. 팁 (msg_tip.tip_amt_pi)
  3. 스티커팩 (msg_usr_stkr + msg_stkr_pack)
  4. 구독 (pi_pymnt, type='CHAT_SUBSCR')
```

### 2-2. RPC (집계 함수) — 6개

#### fn_build_daily_stats(p_dt DATE)
- **역할**: 멱등 일별 롤업 (stat_actvty_dly, stat_revenue_dly 동시 갱신)
- **호출**: cron + 온디맨드 백필
- **특징**: 원자적, 수정 결과 0행 ↔ ∞행 상관없음

#### fn_bean_revenue_summary()
- **역할**: Bean 매출 KPI 단일 소스 (정본)
- **반환**: JSONB { pi_revenue: { total_pi, total_bean, charge_cnt }, bean_by_item: [ { ref_tp_cd, txn_cnt, net_bean } ], bean_total }
- **정의**:
  - **Pi 현금매출** = CHARGE 합
  - **Bean 회수매출** = -SUM(bean_amt) over (SPEND, SUBSCRIBE, REFUND), ref_tp_cd 항목별
  - 부호 정합성: SPEND/SUBSCRIBE음수 → 양수화로 회수매출, REFUND양수 → 환불차감
  - 제외: TRANSFER(P2P), REWARD(보상지급), CHARGE(충전은 pi_revenue 별도)

#### fn_bean_daily_stats()
- **역할**: Bean 일별 시계열 최근 30일 (KST, 0-채우기)
- **반환**: TABLE(stat_dt, charge_bean, spend_bean, reward_bean, refund_bean, txn_cnt)
- **특징**: generate_series로 거래 없는 날도 0행 생성 (x축 연속성 보장)

#### fn_top_active_users()
- **역할**: 가중점수 Top N 활성 사용자
- **계산**: score = 활동일수×0.2 + 콘텐츠활동×0.3 + 결제건수×0.5

#### fn_top_revenue_themes()
- **역할**: 매출 기여도 순 테마 Top N

#### fn_translate_stats(), fn_room_analytics() 등
- 위치: sql/017_stats_ranking_rpcs.sql, sql/034_translate_stats_feedback.sql 등

### 2-3. Stats API 엔드포인트 (7개)

```
GET /api/admin/stats/activity
  입력: ?period=7&from_dt=2026-06-01
  출력: { period, from_dt, series: ActivityDataPoint[], topUsers: TopUser[] }
  원천: stat_actvty_dly, fn_top_active_users()

GET /api/admin/stats/revenue
  출력: { period, from_dt, series: RevenueDataPoint[], topThemes, topSpenders }
  원천: stat_revenue_dly

GET /api/admin/stats/aggregate
  종합 집계 (기간 합계, 평균 등)

GET /api/admin/stats/bean-revenue
  출력: BeanRevenueResponse (fn_bean_revenue_summary 기반)
  원천: bean_txn (직접 계산)

GET /api/admin/stats/bean-spenders
  출력: TopSpender[] (Bean 고지출 사용자 Top N)
  원천: bean_txn GROUP BY usr_id

GET /api/admin/token/stats
  출력: 30일 일별 Bean 시계열 (fn_bean_daily_stats)

GET /api/admin/stats/translate
  자동번역 통계
```

### 2-4. 차트 컴포넌트 (Plotly.js 기반)

#### 실시간 차트 (SSR:false dynamic)
```
plotly-plot.tsx
  ├─ dau-wau-mau-chart.tsx (3선 면적, spline)
  ├─ revenue-timeline-chart.tsx (매출 시계열)
  ├─ revenue-donut-chart.tsx (테마별 구성비)
  ├─ revenue-treemap-chart.tsx (계층 트리맵)
  ├─ bean-daily-chart.tsx (4계열 스택: 충전/소비/보상/환불)
  ├─ log-usage-chart.tsx (로그 사용량 시계열)
  ├─ subscr-stats-charts.tsx (구독 통계 복수 차트)
  └─ bean-top-spenders.tsx (상위 지출자 수평 바)

use-theme-chart-colors.ts
  ↳ CSS 변수 --chart-1~5 읽기 (다크모드 자동 반영)
```

#### 레이아웃 컴포넌트
```
src/components/admin/stats/
  ├─ stats-dashboard.tsx (통합 대시보드)
  ├─ stats-card.tsx (KPI 카드: 제목·값·추세)
  ├─ stats-date-filter.tsx (기간 선택)
  └─ [각 차트 페이지]
```

### 2-5. 타입 정의 (src/types/stats.ts)

```typescript
// 활동
ActivityDataPoint { stat_dt, dau_cnt, wau_cnt, mau_cnt }
TopUser { usr_id, display_nm, activity_days, content_cnt, action_cnt, score }
ActivityStatsResponse { period, from_dt, series, topUsers }

// 매출
RevenueDataPoint { stat_dt, theme_cd, rev_pi, txn_cnt }
TopTheme { theme_cd, theme_nm, theme_emoji, total_pi, total_txn }
TopSpender { usr_id, display_nm, total_pi, txn_cnt }
RevenueStatsResponse { period, from_dt, series, topThemes, topSpenders }

// Bean (2층위)
BeanRevenueItem { ref_tp_cd, txn_cnt, net_bean }
BeanRevenueResponse { pi_revenue, bean_by_item, bean_total, last_updated }
```

### 2-6. 원시 데이터 테이블 (분석 대상)

| 테이블 | 용도 | 주요 컬럼 |
|--------|------|---------|
| sys_user | 사용자 마스터 | usr_id, pi_username, display_name, reg_dtm |
| sys_user_actvty_log | 활동 로그 (원천) | usr_id, actvty_dt, actvty_tp_cd, del_yn |
| pi_pymnt | Pi 결제 (원천) | payment_id, amount, status, metadata(type/theme_cd), reg_dtm |
| msg_room | 채팅방 | room_id, theme_cd, shop_id, owner_id |
| msg_tip | 팁 거래 | room_id, tip_amt_pi, reg_dtm, del_yn |
| msg_usr_stkr | 스티커팩 구매 | pack_id, pymnt_id, reg_dtm, del_yn |
| msg_stkr_pack | 스티커팩 마스터 | pack_id, theme_cd |
| bean_txn | Bean 거래 원장 | bean_amt, txn_tp_cd, ref_tp_cd, reg_dtm, del_yn |
| bean_wlt | Bean 지갑 | usr_id, balance_bean |
| mps_order | PiShop™ 주문 | order_id, usr_id, order_status, reg_dtm |
| mps_order_item | 주문 항목 | item_id, quantity, price_ccy, price_amt |
| mps_txn_hist | 매장 거래 | order_id, amount, ccy, txn_tp_cd, reg_dtm |
| mps_shop | 오프라인 매장 | shop_id, shop_owner_id, latd_crd, lngt_crd |
| usr_loc_hist | 사용자 위치 이력 | usr_id, latd_crd, lngt_crd, reg_dtm |

---

## 3. 분석 도메인별 지표 명세

### 3-1. 웹 사용 분석 (Web Usage Analytics)

#### 목표
활성 사용자의 크기·추이·유지율·채널 기여도를 추적하여 북극성 달성도 측정

#### 지표 정의 및 계산식

| # | 지표명 | 정의 | SQL/함수 원천 | 계산식 | 권장 차트 |
|---|--------|------|--------------|-------|---------|
| 1 | **DAU** (Daily Active Users) | 특정 날짜에 활동한 고유 사용자 수 | stat_actvty_dly | `COUNT(DISTINCT usr_id) WHERE actvty_dt = p_dt` | 선 차트 |
| 2 | **WAU** (Weekly Active Users) | 기준일 포함 최근 7일 활동 사용자 고유 수 | stat_actvty_dly | `COUNT(DISTINCT usr_id) WHERE actvty_dt BETWEEN p_dt-6 AND p_dt` | 선 차트 |
| 3 | **MAU** (Monthly Active Users) | 기준일 포함 최근 30일 활동 사용자 고유 수 | stat_actvty_dly | `COUNT(DISTINCT usr_id) WHERE actvty_dt BETWEEN p_dt-29 AND p_dt` | 선 차트 |
| 4 | **고착도 (Stickiness)** | DAU / MAU 비율 (%) | stat_actvty_dly | `(DAU / MAU) × 100` | 백분율 게이지 |
| 5 | **신규 vs 재방문** | 신규 가입자 vs 기존 활성 사용자 비율 | sys_user (reg_dtm) + sys_user_actvty_log | `신규 = WHERE reg_dtm::date = p_dt AND 활동 있음` | 누적 막대 |
| 6 | **일일 리텐션 (Day-1)** | 가입 다음날 활동 사용자 / 가입 사용자 | sys_user + sys_user_actvty_log | `COUNT(DISTINCT a.usr_id) / COUNT(DISTINCT u.usr_id)` 코호트 | 코호트 히트맵 |
| 7 | **주간 리텐션 (D7/D14/D30)** | 가입 후 7/14/30일 후 활동 비율 | sys_user (reg_dtm) + sys_user_actvty_log | 코호트 구간별 | 코호트 히트맵 |
| 8 | **활동일수 분포** | 월간 활동일 수 구간별 사용자 분포 | sys_user_actvty_log | `width_bucket(activity_days, 0, 30, 6)` | 히스토그램 |

#### 데이터 원천
- **원시**: sys_user_actvty_log (활동 로그, append-only), sys_user (가입 일시)
- **사전 집계 (권장)**: stat_actvty_dly (일별 DAU/WAU/MAU 롤업)

#### 차트 설계 표준
```
1. DAU/WAU/MAU 3선 + 고착도 지표
   ├─ 좌축: 사용자 수 (선 차트, spline, fill)
   └─ 범례: DAU → WAU → MAU (범례 순서 고정)

2. 신규 vs 재방문 (누적 막대)
   ├─ 색: 신규(차트-1) vs 재방문(차트-2)
   └─ 범례: 수, 비율 표시

3. 코호트 리텐션 히트맵
   ├─ 행: 가입 주간
   ├─ 열: Day 0, Day 7, Day 14, Day 30
   └─ 색: 리텐션율 (0%→100% gradient)

4. 활동일수 분포 (히스토그램 또는 박스플롯)
   └─ 구간: 1~5일, 6~10일, 11~20일, 21~30일
```

### 3-2. 매출 분석 (Revenue Analytics)

#### 목표
일/주/월/분기별 Pi 매출 추이, 상품·테마·채널 분해, YoY 비교, 실시간 현황

#### 지표 정의

| # | 지표명 | 정의 | SQL/함수 원천 | 계산식 | 권장 차트 |
|---|--------|------|--------------|-------|---------|
| 1 | **매출 (일/주/월)** | 기간별 총 Pi 매출액 | stat_revenue_dly | `SUM(rev_pi) GROUP BY DATE_TRUNC` | 막대/선 차트 |
| 2 | **테마별 매출 분해** | 상위 10 테마의 매출 기여도 | stat_revenue_dly | `SUM(rev_pi) GROUP BY theme_cd ORDER BY DESC` | 누적 막대 또는 트리맵 |
| 3 | **누적 매출 (누계)** | 기간 시작일부터 누적합 | stat_revenue_dly | `SUM() OVER (ORDER BY stat_dt)` 윈도우 | 면적 차트 |
| 4 | **이동 평균 (7일, 30일)** | 추이 평활화 | stat_revenue_dly | `AVG(rev_pi) OVER (ORDER BY stat_dt ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)` | 선 차트 (추세선) |
| 5 | **이동 누계 (12개월)** | 최근 12개월 누합 (생존성) | stat_revenue_dly | `SUM(rev_pi) OVER (ORDER BY stat_dt ROWS BETWEEN 11 PRECEDING AND CURRENT ROW)` | 선 차트 (끝 단독) |
| 6 | **Z-차트 (3선)** | 월별 + 누적 + 12개월 이동합계 | stat_revenue_dly | 3개 선 동시 | Z-차트 (3 Y축) |
| 7 | **작년 동기 (YoY) 비율** | 올해 / 작년 동월 매출 비율 | stat_revenue_dly (self-join year) | `LAG(rev_pi, 365) OVER (ORDER BY stat_dt)` | 막대 (초록/빨강 분기점) |
| 8 | **ABC 분석** | 테마 누적 기여도 A(80%), B(15%), C(5%) | stat_revenue_dly | `SUM() OVER (PARTITION BY theme_cd ORDER BY rev_pi DESC)` + 누적 % | 버블 또는 산점도 |
| 9 | **테마별 거래건수** | 테마당 평균 거래액 | stat_revenue_dly | `AVG(rev_pi) / AVG(txn_cnt)` | 산점도 (매출 vs 건수) |
| 10 | **실시간 매출 (Today)** | 금일 누적 매출 (실시간) | pi_pymnt, msg_tip 직접 쿼리 | `SUM() WHERE reg_dtm::date = TODAY()` | KPI 카드 |

#### 데이터 원천
- **원시**: pi_pymnt, msg_tip, msg_usr_stkr, bean_txn (직접 쿼리 시)
- **사전 집계 (권장)**: stat_revenue_dly (일별 테마별 롤업)

#### 차트 설계 표준

```
1. 일별 매출 + 7일 이동평균 (2선 콤보)
   ├─ 좌축 선: 일매출 (막대 → 선 중복)
   ├─ 우축 선: 7일 이동평균 (굵은 선)
   └─ 단위: Pi

2. Z-차트 (월별 + 누적 + 12개월 이동합계)
   ├─ 좌축: 월매출 (막대)
   ├─ 우축: 누적매출 (선1) + 12개월 이동합계 (선2)
   └─ 색: 피보나치 (황금비 매출/누적 구분)

3. 테마별 매출 구성비 (누적 막대 또는 트리맵)
   ├─ 순서: 내림차순 정렬
   ├─ 색: 테마색 또는 차트-1~5
   └─ 상호작용: 테마 클릭 → 테마 상세 드릴다운

4. YoY 비율 (초록/빨강 막대)
   ├─ > 100% = 초록 (성장)
   ├─ < 100% = 빨강 (하락)
   └─ 라벨: % 값

5. ABC 분석 산점도
   ├─ X축: 테마 (정렬)
   ├─ Y축: 누적 기여도 %
   ├─ 색: A(80% 초과)=파랑, B(80~95%)=노랑, C(95% 초과)=빨강
   └─ 영역선: 80%, 95% 가로선
```

### 3-3. Bean 매출 분석 (Bean Revenue Analytics)

#### 목표
Pi 현금매출 vs Bean 회수매출 2층위 분리 추적, 항목별 분해, 지급 vs 소비 균형

#### 지표 정의

| # | 지표명 | 정의 | SQL/함수 원천 | 계산식 | 권장 차트 |
|---|--------|------|--------------|-------|---------|
| 1 | **Pi 현금 매출** | 사용자가 실제 충전한 Pi 총액 | fn_bean_revenue_summary → pi_revenue.total_pi | `SUM(pi_amt) WHERE txn_tp_cd='CHARGE'` | KPI 카드 |
| 2 | **Bean 회수 매출 (합계)** | 사용자 소비분이 회수된 순액 | fn_bean_revenue_summary → bean_total | `-SUM(bean_amt) WHERE txn_tp_cd IN ('SPEND','SUBSCRIBE','REFUND')` | KPI 카드 |
| 3 | **항목별 Bean 회수 매출** | 구독·룸생성·룸진입·스티커팩·배지 등 항목별 | fn_bean_revenue_summary → bean_by_item[] | `ref_tp_cd 별 -SUM(bean_amt)` | 수평 스택 막대 |
| 4 | **일별 Bean 시계열 (4계열)** | 최근 30일 충전·소비·보상·환불 일별 | fn_bean_daily_stats() | CHARGE/SPEND/REWARD/REFUND 4계열 | 4계열 스택 영역 차트 |
| 5 | **Bean 고지출 사용자 Top 10** | Bean 누적 소비액 상위 | bean_txn GROUP BY usr_id | `SUM(-bean_amt) WHERE txn_tp_cd='SPEND'` | 수평 바 (마스킹 이름) |
| 6 | **구독 매출 (월간)** | 구독으로 회수된 Bean 월별 추이 | bean_txn WHERE ref_tp_cd='SUBSCR' | `-SUM(bean_amt)` 월별 | 선 차트 |
| 7 | **환불률 (일일/월간)** | 환불 건수 / 총 거래 건수 % | bean_txn | `COUNT(*) FILTER (...REFUND) / COUNT(*)` | 선 차트 (%) |
| 8 | **지급 vs 소비 비율** | 누적 지급(CHARGE+REWARD) vs 누적 소비(SPEND+SUBSCRIBE+REFUND) | bean_txn | `지급합 / 소비합` | 게이지 또는 KPI |

#### 데이터 원천
- **원시**: bean_txn (Bean 거래 원장)
- **RPC (정본)**: fn_bean_revenue_summary() (KPI), fn_bean_daily_stats() (시계열)

#### 차트 설계 표준

```
1. Pi 매출 + Bean 회수매출 KPI 2카드
   ├─ 카드1: "Pi 현금 매출" (값, 전월 대비 %)
   └─ 카드2: "Bean 회수 매출" (값, 전월 대비 %)

2. Bean 항목별 회수 매출 (수평 누적 막대 또는 도넛)
   ├─ 항목: SUBSCR, ROOM_CREATE, ROOM_ENTER, STICKER_PACK, BADGE_UPGRADE, ETC
   └─ 색: 항목별 고정색

3. Bean 일별 시계열 (4계열 스택 영역)
   ├─ CHARGE (충전, 초록)
   ├─ REWARD (보상, 파랑)
   ├─ SPEND (소비, 빨강)
   └─ REFUND (환불, 노랑)
   └─ 상호작용: 호버 → 세로 합계 표시

4. Bean 고지출 사용자 Top 10 (수평 바)
   ├─ 행: 사용자명 (마스킹)
   ├─ 열: 누적 소비액 (Bean)
   └─ 색: 단색 또는 등급별 그라디언트

5. 환불률 추이 (선 차트, %)
   └─ 상한선: 5% (경고) 표시
```

### 3-4. 주문 분석 (Order Analytics)

#### 목표
주문 규모, 주기, RFM 세그먼테이션, 장바구니 분석, AOV 추적

#### 지표 정의

| # | 지표명 | 정의 | SQL/함수 원천 | 계산식 | 권장 차트 |
|---|--------|------|--------------|-------|---------|
| 1 | **일일 주문 수** | 당일 신규 주문 건수 | mps_order | `COUNT(*) WHERE DATE(reg_dtm)=p_dt` | 선/막대 차트 |
| 2 | **주문 간격 분포 (히스토그램)** | 사용자별 주문 간격 (일) 구간별 분포 | mps_order (LAG) | `width_bucket(next_order_dt - prev_order_dt, 0, 30, 10)` | 히스토그램 |
| 3 | **평균 주문 간격** | 전체 사용자 평균 재주문 간격 (일) | mps_order | `AVG(gap_days)` | KPI 카드 |
| 4 | **월별 사용자당 주문 수** | 월간 평균 주문건수 (활성 사용자당) | mps_order GROUP BY month, usr_id | `COUNT(*) / COUNT(DISTINCT usr_id)` | 선 차트 |
| 5 | **RFM 세그먼테이션** | Recency/Frequency/Monetary 5분위 스코어링 | mps_order | `NTILE(5) OVER (ORDER BY R/F/M)` | 히트맵 또는 산점도 |
| 6 | **AOV (평균 주문액)** | 일일 평균 주문액 (Pi 기준) | mps_order_item + mps_txn_hist | `SUM(amount) / COUNT(order_id)` | 선 차트 |
| 7 | **장바구니 분석 (연관도)** | 함께 구매되는 상품 쌍 | mps_order_item (self-join) | `INNER JOIN 같은 order_id` | 네트워크 그래프 |
| 8 | **결제수단 분포** | DINE_IN / PICKUP / DELIVERY / ONLINE 비율 | mps_order | `COUNT(*) GROUP BY order_method` | 도넛 차트 |
| 9 | **반품률 (월간)** | 주문 취소 / 전체 주문 % | mps_order | `COUNT(*) WHERE status='CANCELLED' / COUNT(*)` | 선 차트 (%) |

#### 데이터 원천
- **원시**: mps_order, mps_order_item, mps_txn_hist (모두 논리삭제 필터)

#### 차트 설계 표준

```
1. 일일 주문 수 + AOV 2축 차트
   ├─ 좌축 막대: 주문 건수
   └─ 우축 선: AOV (Pi)

2. 주문 간격 히스토그램
   ├─ X축: 일 구간 (0~5, 6~10, ..., 25~30)
   └─ Y축: 주문 건수

3. RFM 세그먼테이션 히트맵
   ├─ 행: Recency 분위 (최근 5점 → 이전 1점)
   ├─ 열: Frequency 분위 (1~5)
   └─ 셀 색상: Monetary 합계 (진할수록 고액)
   └─ 상호작용: 셀 클릭 → 세그먼트 사용자 목록 드릴다운

4. 결제수단 분포 (도넛)
   └─ 라벨: 수단명 + 건수 + 비율%

5. 반품률 추이 (선 차트, %)
   └─ 상한선: 10% (목표) 표시
```

### 3-5. 웹 성능/행동 분석 (Web Performance & Behavior Analytics)

#### 목표
페이지뷰, 체류시간, 이탈률, 전환 퍼널, 채널별 기여도 추적

#### 지표 정의

| # | 지표명 | 정의 | SQL/함수 원천 | 계산식 | 권장 차트 | 데이터 준비 상태 |
|---|--------|------|--------------|-------|---------|----------|
| 1 | **페이지뷰 (PV)** | 일일 총 페이지 조회수 | sys_user_actvty_log (actvty_tp_cd='PAGE_VIEW') | `COUNT(*)` | 선/막대 차트 | ⚠️ 현 로그에 페이지 URL 미포함 |
| 2 | **순페이지뷰 (유니크 PV)** | 세션 내 중복 제거한 PV | sys_user_actvty_log + session 구분 | `COUNT(DISTINCT session_id, page_url)` | 선 차트 | ⚠️ 세션 추적 필요 |
| 3 | **평균 체류 시간** | 페이지/세션당 평균 시간 (초) | 페이지뷰 로그 (진입/이탈 시간) | `AVG(exit_dtm - entry_dtm)` | KPI 카드 | ⚠️ 신규 추적 필드 필요 |
| 4 | **진입 페이지 Top 10** | 사용자가 가장 자주 랜딩하는 페이지 | sys_user_actvty_log + session 구분 | `COUNT(DISTINCT session_id) WHERE is_entry=true` | 수평 바 | ⚠️ 신규 session 추적 필요 |
| 5 | **이탈 페이지 Top 10** | 사용자가 가장 자주 나가는 페이지 | sys_user_actvty_log + session 구분 | `COUNT(DISTINCT session_id) WHERE is_exit=true` | 수평 바 | ⚠️ 신규 session 추적 필요 |
| 6 | **반송률 (Bounce Rate)** | 단일 페이지 세션 / 전체 세션 % | sys_user_actvty_log 기반 세션 | `COUNT(*) WHERE page_cnt=1 / COUNT(*)` | KPI 카드 또는 선 차트 | ⚠️ session_id 추가 필요 |
| 7 | **이탈률 (Exit Rate)** | 페이지별 이탈한 세션 / 도달 세션 % | sys_user_actvty_log | `exit_cnt / entry_cnt` | 수평 바 (페이지별) | ⚠️ 신규 추적 필요 |
| 8 | **전환 퍼널 (세션 기반)** | 방문 → 가입 → 첫주문 → 재구매 단계별 감소 | mps_order + sys_user + sys_user_actvty_log | `COUNT(DISTINCT session_id)` 각 단계 | 퍼널 차트 | ⚠️ session 추적 + 이벤트 매핑 필요 |
| 9 | **채널별 전환율** | 유입 채널(organic/paid/direct/social) 별 전환율 | pi_pymnt.metadata + utm 파라미터 | `구매사용자 / 유입사용자` 채널별 | 그룹 막대 또는 선 | ⚠️ 채널 분류 코드 필요 |
| 10 | **채널별 퍼널 (다중)** | 각 채널의 방문→가입→구매 단계 | sys_user_actvty_log(유입) + mps_order | 채널별 4단계 세션 수 | 복수 퍼널 또는 누적 막대 | ⚠️ 신규 설계 필요 |

#### ⚠️ 데이터 준비 상태 및 확인 사항

**현 상황**: sys_user_actvty_log는 활동 이벤트만 기록, 페이지 URL·세션 ID·진입/이탈 타이밍이 없음

**필요한 신규 추적**:
1. **Session 추적 추가** — 신규 테이블 또는 컬럼 필요
   - `session_id` (UUID, 15분 타임아웃)
   - `page_url` (TEXT, 현재 페이지 경로)
   - `entry_dtm`, `exit_dtm` (체류시간 계산용)
   - `is_entry`, `is_exit` (진입/이탈 여부)

2. **Channel 분류** — utm_source/utm_campaign 파라미터 또는 메타데이터 기반
   - organic / paid / direct / social / referral 등

3. **Event 매핑** — 구매 단계 이벤트 기록
   - visit → signup → first_order → repeat_order → subscription

**지표 활성화 시기**: 신규 추적 테이블 이후 집계 가능

---

### 3-6. 지리 분석 (Geo Analytics)

#### 목표
지역별 사용자·매출·활성 분포 시각화, 오프라인 카페 위치 기반 분석

#### 지표 정의

| # | 지표명 | 정의 | SQL/함수 원천 | 계산식 | 권장 차트 |
|---|--------|------|--------------|-------|---------|
| 1 | **지역별 신규 가입자** | 가입 위치별 신규 사용자 수 | usr_loc_hist (reg_dtm) + sys_user | `COUNT(DISTINCT usr_id)` 위치별 | 지도 히트맵 |
| 2 | **지역별 활성 사용자 (DAU)** | 위치별 일일 활성 사용자 수 | usr_loc_hist + sys_user_actvty_log | `COUNT(DISTINCT usr_id)` 위치별 | 지도 히트맵 |
| 3 | **지역별 매출** | 위치별 누적 매출 (Pi) | usr_loc_hist + pi_pymnt/msg_tip | `SUM(amount)` 위치별 | 지도 원형 마커 |
| 4 | **오프라인 카페별 거래** | mps_shop 기반 매장별 주문 수/매출 | mps_order + mps_shop | `COUNT(order_id), SUM(amount)` shop_id별 | 지도 마커 + 테이블 |
| 5 | **GIS 기반 거리 분석** | 사용자 위치 ↔ 카페 위치 평균 거리 | usr_loc_hist + mps_shop (latd_crd/lngt_crd) | `ST_Distance(point1, point2)` (PostGIS) | 지도 + 히스토그램 |

#### 데이터 원천
- **위치**: usr_loc_hist (latd_crd/lngt_crd, NUMERIC(11,8) WGS84)
- **매장**: mps_shop (latd_crd/lngt_crd)
- **거래**: mps_order + pi_pymnt (지역별 귀속은 usr_loc_hist 최신 위치 기준)

#### 차트 설계 표준

```
1. 지역별 신규 가입자 히트맵 (지도)
   ├─ 기반: Google Maps
   ├─ 레이어: Heatmap (강도 표시)
   └─ 단위: 신규 사용자 수 (색 진하기)

2. 오프라인 카페 위치 + 거래 수 마커
   ├─ 기반: Google Maps
   ├─ 마커: 카페 위치 (latd_crd/lngt_crd)
   ├─ 마커 크기: 일일/월간 주문 건수
   └─ 클릭: 카페 상세 (주문 현황, 매출, 리뷰 점수)

3. 사용자 위치 ↔ 카페 거리 분포 (히스토그램)
   ├─ X축: 거리 구간 (km, 0~1, 1~2, ..., 10+)
   └─ Y축: 주문 건수 또는 사용자 수
```

---

## 4. 시각화 디자인 시스템

### 4-1. 차트 라이브러리 표준

#### Plotly.js (기존 표준)
```
라이브러리: plotly.js-basic-dist-min + react-plotly.js/factory
래퍼: PlotlyPlot.tsx (SSR:false dynamic ssr)
설정: displayModeBar: false, responsive: true

장점:
  ✅ 다크모드 자동 반영
  ✅ 반응형 내장
  ✅ 인터랙티브 (호버, 클릭, 드래그)
  ✅ 내보내기 (PNG/SVG)

단점:
  ❌ 번들 크기 약 1.2MB
  ❌ Mapbox 기능 제한 (지도는 Google Maps 별도)
```

#### 신규 차트 추가 조건
1. 기존 Plotly로 구현 가능한지 먼저 검토
2. Plotly 불가능 시 대안 제안 + 성능 영향 분석 필요
3. Google Maps는 지리 분석 전용 (lbs-consulting-architect 에이전트 참조)

### 4-2. 색상 표준

#### CSS 변수 테마색 (다크모드 자동)
```css
--chart-1: #38bdf8  /* 파랑 (DAU, CHARGE) */
--chart-2: #e879f9  /* 자주 (WAU, SPEND) */
--chart-3: #4ade80  /* 초록 (MAU, REWARD) */
--chart-4: #fbbf24  /* 노랑 (REFUND, 경고) */
--chart-5: #f87171  /* 빨강 (음수, 하락) */
```

#### 사용 패턴
```typescript
const chartColors = useThemeChartColors()  // [color0, color1, color2, ...]
// trace.line.color = chartColors[0]
// trace.fillcolor = `rgba(${hex2rgb(chartColors[0])}, 0.1)`
```

### 4-3. 레이아웃 표준

#### 대시보드 페이지 구조
```tsx
<DashboardLayout>
  {/* 헤더: 페이지 제목 + 기간 필터 */}
  <DashboardHeader>
    <Title>매출 현황</Title>
    <DateRangeFilter from_dt={...} to_dt={...} />
  </DashboardHeader>

  {/* 1. KPI 카드 줄 (6개, 각 200px 높이) */}
  <KPICardRow>
    <StatsCard label="DAU" value={12345} trend={+5.2} unit="명" />
    <StatsCard label="매출" value={123.45} trend={+2.8} unit="Pi" />
    {/* ... */}
  </KPICardRow>

  {/* 2. 메인 차트 (3:2 비율, 최소 600px 너비) */}
  <MainChartSection>
    <DauWauMauChart data={...} />
  </MainChartSection>

  {/* 3. 보조 차트 행 (2개, 각 50% 너비) */}
  <SubChartRow>
    <SectionCard title="테마별 매출">
      <RevenueDonutChart data={...} />
    </SectionCard>
    <SectionCard title="고지출 사용자">
      <BeanTopSpendersChart data={...} />
    </SectionCard>
  </SubChartRow>

  {/* 4. 상세 테이블 (드릴다운) */}
  <DetailTableSection>
    <DataTable columns={...} rows={...} />
  </DetailTableSection>
</DashboardLayout>
```

#### 반응형 규칙
```
데스크톱 (1400px+): 3열 또는 2열 그리드
태블릿 (768~1399px): 2열 그리드
모바일 (<768px): 1열 스택
```

### 4-4. 상호작용 표준

#### 차트 클릭 → 드릴다운
```
예시: 테마별 매출 도넛 → 테마 클릭 → 해당 테마의 일별 매출 상세
  1. 클릭 이벤트 감지 (plotly onPlotlyClick)
  2. theme_cd 추출
  3. API 재호출: /api/admin/stats/revenue?theme_cd={...}
  4. 새 차트 렌더링 (슬라이드인 모달 또는 인라인 레이아웃)
```

#### 기간 선택
```
DateRangeFilter.tsx
  ├─ 사전설정: 7일, 30일, 90일, YTD, 커스텀
  └─ 선택 시 API 재호출 (debounce 500ms)
```

#### 내보내기
```
ExportButton.tsx (각 차트 우상단)
  ├─ PNG 다운로드 (plotly config 네이티브)
  ├─ CSV 다운로드 (데이터 소스 직렬화)
  └─ 이메일 발송 (대량 리포트용, 향후)
```

### 4-5. 접근성 & 성능

#### 색맹 대비
```
사용 금지: 빨강만, 초록만 (구분 불가)
권장: 빨강+초록 필요 시 다른 형태(패턴, 선) 병행
```

#### ARIA 라벨
```tsx
<PlotlyPlot
  data={...}
  role="img"
  aria-label="최근 30일 DAU, WAU, MAU 추이 선 차트"
/>
```

#### 로딩 스켈레톤
```tsx
{isLoading ? <ChartSkeleton /> : <Chart data={data} />}
```

#### 빈 상태
```tsx
{data.length === 0 && <EmptyState title="데이터 없음" />}
```

---

## 5. 데이터 아키텍처 의사결정

### 5-1. 원시 쿼리 vs 사전 집계 테이블

| 지표 | 특성 | 추천 방식 | 사유 |
|------|------|---------|------|
| DAU/WAU/MAU | 매일 반복 조회, 연산 무거움 (DISTINCT 주간·월간) | 📊 사전 집계 (stat_actvty_dly) | 일배치 롤업 (fn_build_daily_stats) 적용 |
| 매출 (일별) | 매일 반복 조회, 4경로 복합 | 📊 사전 집계 (stat_revenue_dly) | 일배치 롤업 (fn_build_daily_stats) 적용 |
| Bean 매출 KPI | 한 번에 모든 항목, 무거운 집계 | 🔧 RPC (fn_bean_revenue_summary) | 호출 시마다 계산, 캐싱 추천 |
| Bean 일별 시계열 | 실시간성 중요도 낮음 | 📊 RPC (fn_bean_daily_stats) | 30일 고정 윈도우, 호출 시 계산 |
| 주문 간격 히스토그램 | 일회성/탐색적 분석 | 💾 원시 쿼리 (mps_order LAG) | 무거운 분석이지만 일회용, 뷰 생성 고려 |
| 코호트 리텐션 | 주간 분석, 복합 집계 | 📊 집계 테이블 신설 (stat_cohort_retention) | 매주 계산 권장 (7일 배치) |
| RFM 세그먼테이션 | 월간 분석, 무거운 계산 | 📊 집계 테이블 신설 (stat_rfm_segment) | 월초 배치 (fn_calc_rfm) 권장 |
| 전환 퍼널 (세션) | 실시간성 중요, 복합 | 🔧 신규 추적 (세션 테이블) | 세션 ID 추가 필수 (별도 설계) |
| 지역별 활성 | 월간 분석 | 💾 원시 쿼리 또는 View | usr_loc_hist 조인, PostGIS (향후) |

**범례**:
- 📊 = 사전 집계 테이블 추천 (성능↑, 저장소↓)
- 🔧 = RPC 함수 (유연한 계산)
- 💾 = 원시 쿼리 또는 View (간단함)

### 5-2. 신규 집계 테이블 설계 권장

#### 코호트 리텐션 분석용 — stat_cohort_retention

```sql
-- 신규 테이블 (sql/122_stat_cohort_retention.sql)
CREATE TABLE public.stat_cohort_retention (
  cohort_wk   DATE         NOT NULL,        -- 가입 주간 (시작일)
  cohort_sz   INTEGER      NOT NULL,        -- 가입 사용자 수
  d0_cnt      INTEGER      NOT NULL,        -- Day 0 (가입일) 활성
  d7_cnt      INTEGER      NOT NULL,        -- Day 7 활성
  d14_cnt     INTEGER      NOT NULL,        -- Day 14 활성
  d30_cnt     INTEGER      NOT NULL,        -- Day 30 활성
  d0_pct      NUMERIC(5,2) NOT NULL,        -- Day 0 리텐션율 (%)
  d7_pct      NUMERIC(5,2) NOT NULL,        -- Day 7 리텐션율 (%)
  d14_pct     NUMERIC(5,2) NOT NULL,        -- Day 14 리텐션율 (%)
  d30_pct     NUMERIC(5,2) NOT NULL,        -- Day 30 리텐션율 (%)
  regr_id     TEXT         NOT NULL DEFAULT 'SYSTEM',
  reg_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT         NOT NULL DEFAULT 'SYSTEM',
  mod_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cohort_wk)
);

-- RPC (sql/122_stat_cohort_retention.sql)
CREATE OR REPLACE FUNCTION public.fn_build_cohort_retention(p_cohort_wk DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cohort_sz, v_d0, v_d7, v_d14, v_d30 INTEGER;
BEGIN
  -- 매주 월요일 00:00 KST 기준 가입자만 포함
  SELECT COUNT(DISTINCT usr_id) INTO v_cohort_sz
  FROM sys_user
  WHERE DATE_TRUNC('week', reg_dtm AT TIME ZONE 'Asia/Seoul')::date = p_cohort_wk
    AND del_yn = 'N';

  -- Day 0, 7, 14, 30 활성 계산 (각각 DISTINCT)
  -- ... (상세 로직 생략)

  INSERT INTO stat_cohort_retention (...)
  VALUES (p_cohort_wk, v_cohort_sz, v_d0, v_d7, v_d14, v_d30, ...)
  ON CONFLICT (cohort_wk) DO UPDATE SET ...;
END;
$$;

-- 스케줄: 매주 월요일 09:00 KST (fn_build_cohort_retention)
-- 관리자 조회 API: /api/admin/stats/cohort-retention?from_wk=...&to_wk=...
```

#### RFM 세그먼테이션용 — stat_rfm_segment

```sql
-- 신규 테이블 (sql/123_stat_rfm_segment.sql)
CREATE TABLE public.stat_rfm_segment (
  segment_dt    DATE         NOT NULL,      -- 집계 일자
  usr_id        TEXT         NOT NULL,      -- 사용자 ID
  recency_score SMALLINT     NOT NULL,      -- 1~5 (최근순)
  frequency_scr SMALLINT     NOT NULL,      -- 1~5 (주문건수순)
  monetary_scr  SMALLINT     NOT NULL,      -- 1~5 (지출액순)
  rfm_segment   VARCHAR(10)  NOT NULL,      -- 'VIP', 'LOYAL', 'AT_RISK', 'CHURN'
  segment_desc  TEXT,                       -- 세그먼트 설명
  regr_id       TEXT         NOT NULL DEFAULT 'SYSTEM',
  reg_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT         NOT NULL DEFAULT 'SYSTEM',
  mod_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (segment_dt, usr_id)
);

-- RPC (sql/123_stat_rfm_segment.sql)
CREATE OR REPLACE FUNCTION public.fn_calc_rfm(p_dt DATE DEFAULT CURRENT_DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM stat_rfm_segment WHERE segment_dt = p_dt;

  INSERT INTO stat_rfm_segment (segment_dt, usr_id, recency_score, frequency_scr, monetary_scr, rfm_segment, ...)
  WITH rfm AS (
    SELECT
      usr_id,
      NTILE(5) OVER (ORDER BY MAX(reg_dtm) DESC) AS recency_score,
      NTILE(5) OVER (ORDER BY COUNT(*) DESC) AS frequency_scr,
      NTILE(5) OVER (ORDER BY SUM(amount) DESC) AS monetary_scr
    FROM mps_order
    WHERE del_yn = 'N'
      AND reg_dtm >= p_dt - INTERVAL '1 year'
    GROUP BY usr_id
  )
  SELECT
    p_dt,
    usr_id,
    recency_score,
    frequency_scr,
    monetary_scr,
    CASE
      WHEN recency_score >= 4 AND frequency_scr >= 4 AND monetary_scr >= 4 THEN 'VIP'
      WHEN recency_score >= 3 AND frequency_scr >= 4 THEN 'LOYAL'
      WHEN recency_score <= 2 AND frequency_scr >= 3 THEN 'AT_RISK'
      WHEN recency_score <= 2 THEN 'CHURN'
      ELSE 'NEW'
    END,
    ...
  FROM rfm;
END;
$$;

-- 스케줄: 매월 1일 09:00 KST
-- 관리자 조회 API: /api/admin/stats/rfm-segment?as_of_dt=...
```

---

## 6. 신규 제안 스키마 및 RPC

### 6-1. 신규 테이블 제안 (sql/122~125)

#### sql/122_stat_cohort_retention.sql (리텐션 분석)
- **테이블**: stat_cohort_retention (cohort_wk, d0~d30 리텐션율)
- **RPC**: fn_build_cohort_retention(cohort_wk) → 매주 월요일 배치
- **API**: GET /api/admin/stats/cohort-retention
- **차트**: 코호트 히트맵 (Plotly heatmap)

#### sql/123_stat_rfm_segment.sql (RFM 세그먼테이션)
- **테이블**: stat_rfm_segment (usr_id, R/F/M 스코어, 세그먼트)
- **RPC**: fn_calc_rfm(p_dt) → 매월 배치
- **API**: GET /api/admin/stats/rfm-segment
- **차트**: 히트맵 또는 산점도 (세그먼트 분포)

#### sql/124_stat_session_pageview.sql (웹 성능 — ⚠️ 수집 추가 후)
- **테이블**: stat_session_event (session_id, usr_id, page_url, entry_dtm, exit_dtm, ...)
- **RPC**: fn_record_session_event(...) → 실시간 기록
- **API**: GET /api/admin/stats/pageview-analytics
- **차트**: 페이지별 PV/이탈률, 퍼널

#### sql/125_stat_channel_funnel.sql (전환 퍼널 — ⚠️ 채널 분류 후)
- **테이블**: stat_channel_funnel (channel_cd, visit_cnt, signup_cnt, purchase_cnt, ...)
- **RPC**: fn_build_channel_funnel(p_dt) → 일배치
- **API**: GET /api/admin/stats/channel-funnel
- **차트**: 채널별 퍼널 (다중 깔때기)

### 6-2. ⚠️ 선결 조건 (활성화 전)

| 신규 기능 | 필요 조건 | 담당 | 예상 기간 |
|----------|----------|------|----------|
| 코호트 리텐션 분석 | ✅ 데이터 준비 완료 (sys_user.reg_dtm) | 분석팀 | 1주 |
| RFM 세그먼테이션 | ✅ 데이터 준비 완료 (mps_order) | 분석팀 | 1주 |
| 웹 성능/행동 분석 | ⚠️ 세션 추적 추가 필요 (session_id, page_url, entry_dtm/exit_dtm) | 개발팀 | 2주 |
| 채널별 전환 퍼널 | ⚠️ 채널 분류 코드 신설 (utm_source 매핑 또는 metadata.channel) | 마케팅팀 | 1주 |
| Google Maps 지리 분석 | ⚠️ lbs-consulting-architect 별도 설계 필요 | LBS팀 | 2주 |

---

## 7. 구현 로드맵

### Phase 1: 기획 및 as-is 정본화 (현재, ~2026-06-25)
- [x] PRD_21_DATA_ANAL.md 작성 (기존 인프라 정본화)
- [x] 신규 제안 식별 (코호트·RFM·퍼널·채널·GIS)
- [x] 데이터 준비 상태 매트릭스 확인

### Phase 2: 기존 지표 대시보드 강화 (2026-06-26~07-02, 1주)
- [ ] `/admin/stats` 대시보드 통합 개선
  - [ ] DAU/WAU/MAU 최상단 강조 (북극성)
  - [ ] Pi 매출 + Bean 회수매출 2층위 KPI 카드
  - [ ] 고착도(DAU/MAU %) 추가
  - [ ] 테마별 매출 도넛 → 테마 드릴다운
  - [ ] Bean 일별 4계열 스택 (fn_bean_daily_stats 활용)
- [ ] 빈 상태 & 로딩 스켈레톤 추가
- [ ] 내보내기(PNG/CSV) 버튼 추가

### Phase 3: 주문 분석 모듈 신설 (2026-07-03~07-09, 1주)
- [ ] sql/122 코호트 리텐션 테이블 + RPC 생성
- [ ] sql/123 RFM 세그먼테이션 테이블 + RPC 생성
- [ ] `/api/admin/stats/order-analytics` API 엔드포인트
  - [ ] 주문 간격 히스토그램
  - [ ] RFM 히트맵
  - [ ] AOV 추이
  - [ ] 결제수단 분포
- [ ] 대시보드 페이지 추가: `/admin/analytics/orders`

### Phase 4: 웹 성능 분석 기초 (조건부, 2026-07-10~07-23, 2주)
- [ ] ⚠️ **선결**: sys_user_actvty_log에 세션 추적 필드 추가
  - [ ] `session_id` (UUID)
  - [ ] `page_url` (TEXT)
  - [ ] `entry_dtm`, `exit_dtm`
  - [ ] `is_entry`, `is_exit` (BOOLEAN)
- [ ] sql/124 세션 페이지뷰 테이블 + RPC 생성
- [ ] `/api/admin/stats/pageview-analytics` API
  - [ ] 일별 PV·반송률
  - [ ] 페이지별 이탈률
  - [ ] 진입/이탈 페이지 Top 10
- [ ] 대시보드 페이지 추가: `/admin/analytics/web-performance`

### Phase 5: 채널 분석 (조건부, 2026-07-24~07-30, 1주)
- [ ] ⚠️ **선결**: 채널 분류 코드 확정 (utm_source 또는 metadata.channel)
- [ ] sql/125 채널별 퍼널 테이블 + RPC 생성
- [ ] `/api/admin/stats/channel-funnel` API
  - [ ] 채널별 방문→가입→구매 퍼널
  - [ ] 채널별 전환율
- [ ] 대시보드 페이지 추가: `/admin/analytics/channel-funnel`

### Phase 6: 지리 분석 (조건부, 2026-07-31~08-13, 2주)
- [ ] ⚠️ **선결**: lbs-consulting-architect 별도 설계 (Google Maps, PostGIS)
- [ ] `/api/admin/stats/geo-analytics` API
  - [ ] 지역별 신규 가입
  - [ ] 지역별 DAU 히트맵
  - [ ] 오프라인 카페 위치 마커
- [ ] 대시보드 페이지 추가: `/admin/analytics/geo`

### Phase 7: QA 및 최적화 (2026-08-14~08-20, 1주)
- [ ] 전체 기능 통합 테스트
- [ ] Pi Browser 실기기 검증
- [ ] 성능 측정 (Lighthouse, Core Web Vitals)
- [ ] 접근성 감사 (WCAG 2.1 AA 기준)

**예상 총 기간**: 6주 (병렬 진행 시 4주)

---

## 8. 성공 지표 및 검증

### 8-1. 핵심 성공 지표 (KSI)

| 지표 | 목표 | 측정 방법 | 검증 주기 |
|------|------|---------|---------|
| **활성 사용자 (북극성)** | MAU 월 5% 성장 | stat_actvty_dly.mau_cnt | 매월 |
| **고착도 (DAU/MAU %)** | 12% 이상 유지 | stat_actvty_dly (DAU/MAU) | 매주 |
| **매출 (Pi/Bean 2층위)** | Pi 수익 증대 + Bean 회수율 20% 달성 | fn_bean_revenue_summary | 매월 |
| **구독 전환율** | 월 활성 사용자 대비 3% | bean_txn WHERE ref_tp_cd='SUBSCR' | 매월 |
| **RFM VIP 세그먼트** | 전체 사용자 10% 이상 | stat_rfm_segment WHERE rfm_segment='VIP' | 분기 |
| **대시보드 사용률** | 운영팀 일일 방문 100% | GA4 또는 서버 로그 | 매주 |

### 8-2. 데이터 품질 검증

#### 집계 정합성 검증 (매일)

```sql
-- stat_actvty_dly vs 원시 로그 교차 검증
SELECT
  COALESCE(s.stat_dt, CURRENT_DATE - 1) AS chk_dt,
  s.dau_cnt,
  (SELECT COUNT(DISTINCT usr_id) FROM sys_user_actvty_log
   WHERE actvty_dt = COALESCE(s.stat_dt, CURRENT_DATE - 1) AND del_yn='N') AS raw_dau,
  CASE WHEN s.dau_cnt = (SELECT ...) THEN '✅' ELSE '❌ MISMATCH' END
FROM stat_actvty_dly s
WHERE stat_dt >= CURRENT_DATE - 7
ORDER BY chk_dt DESC;
```

#### Bean 매출 부호 검증 (매일)

```sql
-- fn_bean_revenue_summary 반환값이 bean_txn 원본과 일치
SELECT
  (fn_bean_revenue_summary()->'pi_revenue'->>'total_pi')::numeric AS rpc_pi_revenue,
  (SELECT COALESCE(SUM(pi_amt), 0) FROM bean_txn WHERE txn_tp_cd='CHARGE' AND del_yn='N') AS raw_charge,
  CASE WHEN ... = ... THEN '✅' ELSE '❌ MISMATCH' END AS match_status;
```

#### 무결성 검사 (매주)

```sql
-- 1. 논리삭제 필터 누락 검사
SELECT COUNT(*) FROM stat_actvty_dly WHERE dau_cnt < 0;  -- 음수 불가

-- 2. 금액 정합성 검사
SELECT SUM(rev_pi) FROM stat_revenue_dly WHERE rev_pi < 0;  -- 음수 불가 (매출은)

-- 3. 허상 행 검사
SELECT COUNT(*) FROM stat_revenue_dly WHERE theme_cd IS NULL;  -- COALESCE 확인
```

### 8-3. 성과 리뷰 프레임워크

#### 주간 리뷰 (월요일 09:00 KST)
- 북극성 (MAU) 추이 확인
- 주간 신규 지표 오류 리포트
- 집계 정합성 검증 결과

#### 월간 리뷰 (매월 1일 09:00 KST)
- 월간 매출 분석
- 테마/채널별 기여도 분석
- Bean 거버넌스 균형 평가 (지급 vs 소비)
- RFM 세그먼트 마이그레이션 추적

#### 분기 리뷰 (1월/4월/7월/10월)
- 분기별 북극성 달성도 (목표 vs 실적)
- YoY 비교 분석
- 신규 기능(코호트·퍼널 등) 효과 평가
- 다음 분기 우선순위 조정

---

## 9. 의존성 및 제약

### 9-1. 외부 의존성

| 항목 | 상태 | 영향도 | 대응 |
|------|------|--------|------|
| sys_user_actvty_log (활동 로그) | ✅ 운영 중 | 블로킹 필수 | - |
| pi_pymnt (결제 테이블) | ✅ 운영 중 | 블로킹 필수 | - |
| bean_txn (Bean 거래) | ✅ 운영 중 | 블로킹 필수 | - |
| mps_order (주문) | ✅ 운영 중 | 주문 분석 필수 | - |
| usr_loc_hist (위치) | ✅ 운영 중 (표준화 sql/037) | 지리 분석용 | - |
| Supabase cron (배치 스케줄) | ✅ 활성 | stat_* 갱신 필수 | Vercel cron 병행 가능 |
| Google Maps API | ⚠️ 신청 필요 (지리 분석) | 지도 시각화 | lbs-consulting-architect 담당 |

### 9-2. 팀 간 협력

| 담당팀 | 작업 | 마감일 | 상태 |
|--------|------|--------|------|
| 분석팀 | 코호트 리텐션 테이블 생성 (sql/122) | 2026-07-02 | 예정 |
| 분석팀 | RFM 세그먼테이션 테이블 생성 (sql/123) | 2026-07-02 | 예정 |
| 개발팀 | 세션 추적 필드 추가 (sys_user_actvty_log) | 2026-07-09 | ⚠️ 선결 |
| 마케팅팀 | 채널 분류 코드 확정 | 2026-07-09 | ⚠️ 선결 |
| LBS팀 | Google Maps + PostGIS 설계 (lbs-consulting-architect) | 2026-07-23 | ⚠️ 선결 |

---

## 10. 참고 자료

### 10-1. 기존 분석 인프라 문서

- `sql/016_daily_stats_rollup.sql` — stat_actvty_dly, stat_revenue_dly, fn_build_daily_stats
- `sql/017_stats_ranking_rpcs.sql` — fn_top_active_users, fn_top_revenue_themes 등
- `sql/079_bean_revenue_summary.sql` — fn_bean_revenue_summary (Bean 매출 KPI 정본)
- `sql/090_bean_daily_stats.sql` — fn_bean_daily_stats (Bean 시계열)
- `src/types/stats.ts` — 타입 정의 (ActivityDataPoint, BeanRevenueResponse 등)
- `src/components/charts/` — Plotly 차트 컴포넌트

### 10-2. DA 표준 및 거버넌스

- `docs/da/데이터표준규칙.md` — 명명·컬럼·논리삭제·인덱스 표준
- `docs/da/README.md` — DA 거버넌스 프레임워크 (conceptual → logical → physical)

### 10-3. 기존 PRD

- `PRD_20_FEEDBACK.md` — 이용후기 + Bean 보상 시스템
- `PRD_18_PERFORM.md` — 웹 성능 분석 (있으면)
- `PRD_17_CAFE_THEMA.md` — 카페 테마 v2 (매출 분해용)
- `PRD_15_FEE.md` — Bean 경제 표준 요금

### 10-4. 인증 및 보안

- `docs/PRD_2_SECURITY.md` — username 마스킹, 접근 제어
- `src/lib/auth-check.ts` — getSessionUser() (관리자 검증)

### 10-5. 브랜드 표기

- CLAUDE.md § 공식 브랜드 표기 — PiCafé™, PiShop™, Bean(카페빈)
- 차트 제목·라벨 등 사용자 표시 텍스트에 ™ 표기 적용

---

## 11. FAQ

### Q1. 기존 stat_revenue_dly가 Pi 매출만 추적하는데, Bean 매출은 어디서?
**A.** Pi 매출 (stat_revenue_dly)과 Bean 회수매출 (fn_bean_revenue_summary)은 **2층위 통화 구분**입니다.
- Pi = 사용자의 현금 결제 (외부 유입, 최상위)
- Bean = 플랫폼 내부 소비에서 회수한 순액 (순환 경제, 부수 지표)

두 지표는 섞지 않으며, 대시보드에서 명확히 분리 표시합니다.

### Q2. DAU/WAU/MAU는 언제 갱신되나?
**A.** 매일 자정(KST) cron으로 `fn_build_daily_stats()` 실행.
- stat_actvty_dly: 전일 0시 기준
- 당일 실시간 DAU는 `/api/admin/stats/activity?real_time=true` (원시 쿼리)로 별도 제공

### Q3. 코호트 리텐션과 RFM은 언제 추가되나?
**A.** Phase 3 (2026-07-03~07-09)에 예정. 우선순위 변경 시 조정 가능.

### Q4. 지리 분석(지도)은 어떻게 구현되나?
**A.** 별도 lbs-consulting-architect 에이전트가 Google Maps + PostGIS 설계. 본 PRD는 SQL/API 명세만 담당.

### Q5. username 마스킹은 어디서 적용되나?
**A.** 관리자 대시보드(`/admin/analytics/`) 내부는 원본 허용. 비관리자(일반 사용자)에게 노출되는 순위표·차트에만 적용 (maskUsername 함수 사용).

### Q6. 성능 최적화 목표는?
**A.** 
- 대시보드 페이지 로딩: < 2초 (P95)
- 차트 렌더링: < 500ms (Plotly)
- 월 데이터 조회: < 200ms (사전 집계 테이블)

---

## 12. 통합 분석 페이지 (4-탭) 화면 구상

> 본 PRD의 6개 분석 도메인을 **사용자가 요청한 4개 대분류 탭**으로 재편한 단일 분석 허브 화면 설계.
> 기존 `/admin/stats`를 흡수·승계하는 **신규 라우트 `/admin/analytics`**.

### 12-1. 6 도메인 → 4 탭 매핑 (손실 없는 통합)

| 4-탭 (사용자 요청) | 흡수 도메인 (§3) | 핵심 질문 |
|---|---|---|
| **① 매출 분석** | §3-2 매출 + §3-3 Bean 매출 | "돈이 얼마나, 어디서, 어떤 추세로 들어오나" (Pi 현금 vs Bean 회수 2층위) |
| **② 주문 분석** | §3-4 주문 | "누가 얼마나 자주·크게 사나" (AOV·RFM·주문간격·장바구니) |
| **③ 웹 접속·사용 분석** | §3-1 웹 사용 + §3-6 지리 | "활성 사용자(북극성)는 늘고 머무는가" (DAU/WAU/MAU·고착도·리텐션·지역) |
| **④ 웹 퍼포먼스 분석** | §3-5 웹 성능/행동 | "방문이 가입·구매로 전환되는가" (퍼널·채널·반송/이탈·체류) |

### 12-2. 공통 화면 골격 (Page Shell)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 📊 통합 분석 (Analytics)                          [기간▾] [비교▾] [⟳][⤓] │  ← 글로벌 컨트롤바(sticky)
├──────────────────────────────────────────────────────────────────────┤
│ ⭐ 북극성   활성 사용자(MAU) 1,240 ▲8.2%   ·   고착도 24.5% ▲1.1%p      │  ← 북극성 배너(전 탭 고정)
├──────────────────────────────────────────────────────────────────────┤
│ [ 매출 분석 ] [ 주문 분석 ] [ 접속·사용 ] [ 퍼포먼스 ]                  │  ← 탭 네비(sticky, 모바일=드롭다운)
├──────────────────────────────────────────────────────────────────────┤
│  ┌ KPI 카드 행 (4~5개, 스파크라인 + MoM/YoY 델타 배지) ─────────────┐  │  ← Zone 1
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌ 메인 차트 (큰 타임라인/퍼널, 풀폭) ───────────────────────────────┐ │  ← Zone 2
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌ 보조 차트 2-up (분해/분포) ───────┐┌──────────────────────────────┐│  ← Zone 3
│  └──────────────────────────────────┘└──────────────────────────────┘│
│  ┌ 상세 테이블 (Top-N · 드릴다운 · CSV) ────────────────────────────┐ │  ← Zone 4
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

- **글로벌 컨트롤바**: 기간 선택(7/30/90/365일·분기·커스텀, 기존 `stats-date-filter` 재사용), 비교 토글(전기간/전년동기), 새로고침, 내보내기(PNG/CSV).
- **북극성 배너**: 활성 사용자(MAU)·고착도를 **모든 탭 위에 고정** — "판매는 수단, 활성 사용자가 목표" 원칙의 시각적 강제.
- **4-Zone 레이아웃**을 모든 탭이 공유 → 학습비용 0, 일관된 "멋짐".
- 다크모드·테마색(`useThemeChartColors`), 반응형(모바일: 탭→드롭다운, 차트 세로 스택, 테이블 카드화).
- **관리자 전용 화면 → username 전체 표시**(마스킹 미적용, 메모리 규칙 준수).

### 12-3. 탭별 상세 구상

#### ① 매출 분석 (Revenue)
```
KPI:  총매출(Pi 현금) │ Bean 회수매출 │ 결제건수 │ 객단가(AOV) │ MoM ▲/▼
메인: 일/주/월/분기 매출 타임라인 (Pi·Bean 2계열, 이동평균 7일 오버레이)
보조: [좌] 테마·카테고리별 매출 Treemap   [우] 매출원 도넛(충전/구독/번역/AI/부스팅/기타)
상세: Top 상품/테마/매장 매출 테이블 + Z-차트(당월·누계·이동누계) 토글 + ABC 등급
```
- 데이터: `stat_revenue_dly`, `mps_order`, `mps_order_item`, `bean_txn`, `pi_pymnt`, RPC `fn_bean_revenue_summary`
- 재사용 컴포넌트: `revenue-timeline-chart`·`revenue-donut-chart`·`revenue-treemap-chart` (이미 구현)
- 신규: Z-차트·이동평균·YoY 비교·ABC 분석 (Plotly로 추가)
- ⚠️ **Pi(외부 현금 유입)와 Bean(내부 순환 회수)을 절대 합산 금지** — 2계열 분리 표시.

#### ② 주문 분석 (Order)
```
KPI:  주문수 │ 객단가(AOV) │ 취소율 │ 재구매율 │ 평균 주문간격
메인: 주문 추세(일별 건수 막대 + 취소/완료 누적) · 시간대×요일 히트맵
보조: [좌] 주문방법 분포(DINE_IN/PICKUP/DELIVERY 파이) [우] 주문간격 히스토그램
상세: RFM 세그먼트 버블/히트맵(R×F, 색=M) + 세그먼트별 사용자 Top 테이블
```
- 데이터: `mps_order`, `mps_order_item`, 신규 집계 `stat_rfm_segment`(§6, sql/123)
- 신규 컴포넌트: 히스토그램·히트맵·RFM 버블 (Plotly)
- 신규 API: `/api/admin/analytics/orders/*` (간격·RFM·장바구니 연관)

#### ③ 웹 접속·사용 분석 (Web Usage)
```
KPI:  DAU │ WAU │ MAU │ 고착도(DAU/MAU) │ 신규 vs 재방문
메인: DAU/WAU/MAU 타임라인 (기존 dau-wau-mau-chart 재사용)
보조: [좌] 고착도 게이지 + 추세  [우] 신규/재방문 누적 영역
상세: 리텐션 코호트 히트맵(가입주차 × 경과주차) + 지역별 접속 지도/히트맵
```
- 데이터: `stat_actvty_dly`, `sys_user_actvty_log`, `sys_user`, `usr_loc_hist`, 신규 `stat_cohort_retention`(§6, sql/122)
- 재사용: `dau-wau-mau-chart` (이미 구현)
- 신규: 고착도 게이지·코호트 히트맵·지역 지도(Google Maps/PostGIS, 선결 §6-2)

#### ④ 웹 퍼포먼스 분석 (Web Performance) — ⚠️ 데이터 추적 선결 필요
```
KPI:  페이지뷰 │ 평균 체류시간 │ 반송률(bounce) │ 이탈률(exit) │ 전환율
메인: 전환 퍼널 (방문→가입→첫주문→재구매, 세션수 기반, 단계별 이탈% 라벨)
보조: [좌] 채널 기여 Sankey/막대(utm/referrer) [우] 세션 길이 분포
상세: 랜딩/이탈 페이지 Top-N + 채널별 퍼널 비교 테이블
```
- 데이터: 신규 `stat_session_pageview`(§6, sql/124), `stat_channel_funnel`(§6, sql/125)
- ⚠️ **선결조건**: `sys_user_actvty_log`에 `session_id`·`page_url`·`entry_dtm`·`exit_dtm` 추적 필드 신설 + 채널 분류(utm_source/metadata.channel). 미충족 시 본 탭은 "데이터 수집 중" 플레이스홀더로 노출하고 Phase 4~6에서 활성화.

### 12-4. 구현 매핑 요약 (재사용 vs 신규)

| 탭 | 재사용(있음) | 신규 필요 |
|---|---|---|
| ① 매출 | timeline·donut·treemap 차트, revenue/bean-revenue API | Z-차트·이동평균·YoY·ABC |
| ② 주문 | mps_order/_item 데이터 | 주문 API 일체·히스토그램·히트맵·RFM 집계(sql/123) |
| ③ 접속·사용 | dau-wau-mau 차트, activity API | 고착도 게이지·코호트(sql/122)·지역 지도 |
| ④ 퍼포먼스 | — | 세션 추적층·퍼널·채널·sql/124·122 (**선결조건**) |

### 12-5. 라우트·내비 배치

- 신규: `src/app/[locale]/(admin)/admin/analytics/page.tsx` (탭 컨테이너) + 탭별 클라이언트 컴포넌트 4종 (`analytics/RevenueTab.tsx` 등).
- 기존 `/admin/stats`는 신규 허브로 흡수(리다이렉트) 또는 "구 통계"로 유지 후 단계적 폐기.
- `admin-sidebar.tsx` NAV: `/admin/stats` → `/admin/analytics`로 교체(라벨 `analytics`).
- Pi Browser admin 호환: `piFetch` 사용, 클라이언트 게이트(`ClientAdminGate`) 패턴 — `redirect` 금지.

---

**문서 버전:** 1.1 (2026-06-25 — §12 4-탭 통합 분석 페이지 구상 추가)  
**승인 대상:** da-governance-expert, dashboard-stats-builder, data-analytics-visualizer  
**다음 검토:** 2026-07-31 (Phase 2 완료 후)
