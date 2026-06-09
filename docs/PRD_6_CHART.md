# PRD_CHART.md — 어드민 통계 대시보드 요구사항

> 작성일: 2026-06-09 · 담당 전문가: `dashboard-stats-builder` 에이전트
> 범위: ① 사용자 활동(DAU/WAU/MAU) 시각화 ② 테마(카테고리)별 매출 집계 시각화

---

## 0. 의사결정 요약 (확정)

| 항목 | 결정 | 비고 |
|---|---|---|
| **차트 렌더링** | **react-plotly.js (순수 JS)** | Next.js 단일 배포 유지. Seaborn·Matplotlib 미사용 |
| **DAU/WAU/MAU 활동 집계** | **신규 활동 로그 테이블 + 미들웨어 계측** | `sql/015` 마이그레이션 선행 필요 |
| **집계 방식** | **중간집계(Rollup) 테이블 사전 집계 → 대시보드 직접 조회** | **§11 채택.** 일배치로 일자별 1행 사전 계산, 대시보드는 단순 SELECT |
| 인증 | `getSessionUser()` + `isAdmin()` | 어드민 전용 |
| 매출 단위 | Pi (소수) 표기 | `pi_pymnt.amount`는 Pi 단위(Pi SDK U2A 결제) |

> **기술스택 충돌 기록**: 에이전트 정의 파일(`.claude/agents/chart/dashboard-stats-builder.md`)은
> 1순위로 **Recharts**를 권장하나, 본 PRD는 사용자 지시(Plotly 추천)에 따라 **react-plotly.js**를 채택한다.
> Seaborn·Matplotlib은 Python 전용이라 별도 서비스가 필요하므로 본 단계 범위에서 제외한다(향후 PDF 리포트 단계에서 재검토).

---

## 1. 개요

### 1.1 목적
어드민 운영자가 한 화면에서 **서비스 활성도(DAU/WAU/MAU)**와 **테마별 매출 분포·추이**를 직관적으로 파악한다.

### 1.2 배치 위치
`/admin/stats` 신규 페이지. 기존 어드민 대시보드(`/admin`)에서 "통계" 메뉴로 진입.

### 1.3 핵심 산출물
1. DAU/WAU/MAU 멀티 라인 차트 + 요약 카드(증감율)
2. 테마별 매출 도넛 차트(비중) + 누적 바차트(기간별 추이) + 총매출 카드

---

## 2. 화면 구성

```
/admin/stats
┌───────────────────────────────────────────────┐
│  통계 대시보드                  [7일][30일][90일][1년] │  ← 기간 필터
├───────────────────────────────────────────────┤
│ ┌─DAU─────┐ ┌─WAU─────┐ ┌─MAU─────┐ ┌─총매출──┐ │  ← StatsCard ×4
│ │ 1,240   │ │ 5,830   │ │ 18,200  │ │ 342 π   │ │     (전기간 대비 증감 ↑↓)
│ │ ↑ 12%   │ │ ↑ 4%    │ │ ↓ 2%    │ │ ↑ 21%   │ │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
├───────────────────────────────────────────────┤
│  사용자 활동 추이 (DAU/WAU/MAU)                     │
│  ┌─────────────────────────────────────────┐   │  ← DauWauMauChart
│  │   📈 멀티 라인 (zoom/hover/pan)            │   │     (react-plotly.js)
│  └─────────────────────────────────────────┘   │
├──────────────────────┬────────────────────────┤
│  테마별 매출 비중        │  테마별 매출 추이          │
│  ┌──────────────┐    │  ┌──────────────────┐  │  ← RevenueByThemeChart
│  │  🍩 도넛차트    │    │  │  📊 누적 바차트     │  │     (도넛 + 누적 바)
│  └──────────────┘    │  └──────────────────┘  │
└──────────────────────┴────────────────────────┘
```

- 반응형: 모바일은 1열 세로 스택(`px-4`), 데스크탑은 2열 그리드(`lg:grid-cols-2`).
- 다크모드: Plotly `layout.template`을 테마에 맞춰 동적 전환(섹션 6.4).

---

## 3. DB 스키마 변경

### 3.1 신규 — `sql/015_user_activity_log.sql`

**설계 핵심: "요청마다 INSERT"가 아니라 "사용자·일자별 1행 UPSERT"**
DAU/WAU/MAU는 *일자별 고유 사용자 수*만 필요하므로, `UNIQUE(usr_id, actvty_dt)`로 하루 1행만 유지한다.
→ 쓰기 폭증 방지 + 집계 쿼리 단순화.

```sql
-- DA-APPROVED: 사용자 활동 일별 집계 로그 (Phase 11 통계 대시보드)
-- DAU/WAU/MAU 산출 전용. usr_id+actvty_dt UNIQUE → 하루 1행 UPSERT.
CREATE TABLE IF NOT EXISTS public.sys_user_actvty_log (
  actvty_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id         UUID         NOT NULL,                       -- sys_user.id (app 레벨 FK)
  actvty_dt      DATE         NOT NULL DEFAULT CURRENT_DATE,  -- 활동 일자 (집계 키)
  actvty_tp_cd   VARCHAR(20)  NOT NULL DEFAULT 'ACCESS'       -- ACCESS/LOGIN/MSG/PYMNT
                              CHECK (actvty_tp_cd IN ('ACCESS','LOGIN','MSG','PYMNT')),
  actvty_cnt     INTEGER      NOT NULL DEFAULT 1,             -- 당일 활동 횟수 (UPSERT 시 +1)
  last_actvty_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 당일 마지막 활동 시각
  del_yn         CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm        TIMESTAMPTZ,
  regr_id        TEXT         NOT NULL DEFAULT 'ADMIN',
  reg_dtm        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id        TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usr_id, actvty_dt)
);

COMMENT ON TABLE  public.sys_user_actvty_log IS '사용자 활동 일별 로그 (DAU/WAU/MAU 산출)';
COMMENT ON COLUMN public.sys_user_actvty_log.actvty_dt    IS '활동 일자 (집계 키)';
COMMENT ON COLUMN public.sys_user_actvty_log.actvty_tp_cd IS '활동 유형: ACCESS/LOGIN/MSG/PYMNT';
COMMENT ON COLUMN public.sys_user_actvty_log.actvty_cnt   IS '당일 활동 횟수';

-- 집계 인덱스: 기간 범위 + 고유 사용자 카운트 최적화
CREATE INDEX IF NOT EXISTS idx_actvty_dt      ON public.sys_user_actvty_log (actvty_dt) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_actvty_usr_dt  ON public.sys_user_actvty_log (usr_id, actvty_dt) WHERE del_yn = 'N';
```

> **DA 표준 준수**: 시스템 컬럼 4개 + `del_yn`/`del_dtm` 포함. 로그 테이블은 append/upsert 전용 — 물리 DELETE 금지.
> `da-ddl-guard` Hook 통과를 위해 `-- DA-APPROVED:` 주석 필수.

### 3.2 활동 기록 함수 (UPSERT)

```sql
-- 하루 1행 UPSERT. 같은 날 재활동 시 횟수만 증가
INSERT INTO public.sys_user_actvty_log (usr_id, actvty_dt, actvty_tp_cd, regr_id, modr_id)
VALUES ($1, CURRENT_DATE, $2, $1::text, $1::text)
ON CONFLICT (usr_id, actvty_dt)
DO UPDATE SET
  actvty_cnt      = sys_user_actvty_log.actvty_cnt + 1,
  last_actvty_dtm = CURRENT_TIMESTAMP,
  mod_dtm         = CURRENT_TIMESTAMP;
```

### 3.3 기존 테이블 활용 (매출)

| 매출 유형 | 결제 경로 | 테마 귀속 경로 | `metadata.type` |
|---|---|---|---|
| 채팅방 생성/입장 | `msg_room.pymnt_id` → `pi_pymnt` | `msg_room.theme_cd` | `CHAT_ROOM_CREATE` |
| 팁(Tip) | `msg_tip.pymnt_id` → `pi_pymnt` | `msg_tip.room_id` → `msg_room.theme_cd` | (TIP 계열) |
| 스티커팩 | `msg_usr_stkr.pymnt_id` → `pi_pymnt` | `msg_usr_stkr.pack_id` → `msg_stkr_pack.theme_cd` | (STICKER 계열) |
| 구독 | `msg_subscr.pymnt_id` → `pi_pymnt` | **테마 없음** → `구독` 별도 분류 | `CHAT_SUBSCR` |

> 구독은 테마에 귀속되지 않으므로 도넛 차트에서 `구독`이라는 별도 세그먼트로 표기한다.

---

## 4. API 명세

> 모든 API는 어드민 전용. `getSessionUser()` → `isAdmin()` 체크. (Pi Browser 어드민도 `X-Pi-Token` 헤더로 동작하므로 `getSessionUser()`가 이중 경로 자동 처리)
>
> **데이터 소스 (중요)**: 아래 API는 raw 테이블을 매 요청 집계하지 **않는다**. **중간집계 테이블(§11: `stat_actvty_dly`·`stat_revenue_dly`)을 직접 조회**하고, "오늘"분만 raw에서 실시간 보정한다(하이브리드 §11.5). 아래 §4.1/§4.2의 raw 집계 쿼리는 **배치(`fn_build_daily_stats`) 내부 로직**으로 이전된다.

### 4.1 `GET /api/admin/stats/activity`

```
GET /api/admin/stats/activity?period=30   (period: 7 | 30 | 90 | 365)
```

응답:
```typescript
interface ActivityStatsResponse {
  series: Array<{
    date: string      // 'YYYY-MM-DD'
    dau: number       // 당일 고유 활성 사용자
    wau: number       // 해당 일자 기준 직전 7일 롤링 고유 사용자
    mau: number       // 해당 일자 기준 직전 30일 롤링 고유 사용자
  }>
  summary: {
    dau: { current: number; change: number }  // change: 전기간 대비 % (소수1)
    wau: { current: number; change: number }
    mau: { current: number; change: number }
  }
}
```

집계 쿼리(개념):
```sql
-- DAU: 일자별 고유 사용자
SELECT actvty_dt AS date, COUNT(DISTINCT usr_id) AS dau
FROM sys_user_actvty_log
WHERE del_yn = 'N' AND actvty_dt >= CURRENT_DATE - $period::int
GROUP BY actvty_dt ORDER BY actvty_dt;

-- WAU/MAU: 각 일자 기준 롤링 윈도우 (7일/30일) 고유 사용자
-- → 서버에서 일자별로 윈도우 distinct 계산 (window 함수 또는 일자 루프)
```

> Supabase JS 클라이언트로 윈도우 distinct 집계가 까다로우면, **Postgres `rpc` 함수**(`fn_activity_stats(period int)`)로 한 번에 계산해 반환하는 것을 권장.

### 4.2 `GET /api/admin/stats/revenue`

```
GET /api/admin/stats/revenue?period=30
```

응답:
```typescript
interface RevenueStatsResponse {
  byTheme: Array<{
    theme_cd: string      // 'GOLF' | ... | 'SUBSCR'(구독)
    theme_nm: string      // '골프' | '구독'
    theme_emoji: string   // '⛳'
    totalPi: number       // 테마 합계 (Pi)
    count: number         // 결제 건수
  }>
  timeline: Array<{
    date: string
    [theme_nm: string]: number | string   // 일자별 테마 매출 (누적 바차트용)
  }>
  totalPi: number          // 전체 매출 합계 (Pi)
  totalChange: number      // 전기간 대비 % 증감
}
```

> `status = 'completed'` 결제만 매출로 집계. 4개 경로(방·팁·스티커·구독) UNION 후 `theme_cd`로 그룹핑.
> 상위 N개(예: 6개) 테마만 개별 표기, 나머지는 `기타`로 묶음.

---

## 5. 파일 배치

```
src/
├── app/[locale]/(admin)/admin/stats/
│   └── page.tsx                     # Server Component (isAdmin 게이트) → StatsDashboard 렌더
├── app/api/admin/stats/
│   ├── activity/route.ts            # GET DAU/WAU/MAU
│   └── revenue/route.ts             # GET 테마별 매출
├── components/admin/stats/
│   ├── StatsDashboard.tsx           # 'use client' 컨테이너 (기간 필터 상태 + 데이터 페치)
│   ├── StatsCard.tsx                # 요약 카드 (값 + 증감 ↑↓ + 스켈레톤)
│   ├── StatsDateFilter.tsx          # 기간 선택 (7/30/90/365)
│   ├── DauWauMauChart.tsx           # react-plotly.js 멀티 라인
│   ├── RevenueDonutChart.tsx        # 테마 비중 도넛
│   └── RevenueTimelineChart.tsx     # 테마 추이 누적 바
├── lib/
│   ├── activity-log.ts              # recordActivity(userId, type) — UPSERT 헬퍼
│   └── plotly-theme.ts              # 다크모드 대응 Plotly layout 프리셋
├── types/
│   └── stats.ts                     # ActivityStatsResponse / RevenueStatsResponse
└── middleware.ts                    # (수정) 인증 사용자 활동 계측 훅 추가
```

---

## 6. 핵심 구현 패턴

### 6.1 react-plotly.js 설치 및 SSR 회피 (필수)

```bash
pnpm add react-plotly.js plotly.js-basic-dist-min
pnpm add -D @types/react-plotly.js @types/plotly.js
```

> **번들 크기 주의**: 전체 `plotly.js`는 ~3MB. 라인/바/파이만 쓰므로 **`plotly.js-basic-dist-min`**(경량 번들)로 충분.
> custom bundle 사용 시 `react-plotly.js/factory`의 `createPlotlyComponent(Plotly)` 패턴 적용.

```tsx
// DauWauMauChart.tsx
'use client'

import dynamic from 'next/dynamic'
import Plotly from 'plotly.js-basic-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'

// ⚠️ plotly.js는 window/document 접근 → SSR 비활성화 필수
const Plot = dynamic(() => Promise.resolve(createPlotlyComponent(Plotly)), {
  ssr: false,
  loading: () => <div className='h-[350px] animate-pulse rounded-xl bg-muted' />,
})
```

> **함정**: `react-plotly.js`를 일반 `import`로 가져오면 SSR 단계에서 `document is not defined` 빌드 에러.
> 반드시 `next/dynamic` + `ssr: false`로 감싼다.

### 6.2 페이지 게이트 (`page.tsx`)

```tsx
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { StatsDashboard } from '@/components/admin/stats/StatsDashboard'

export default async function StatsPage() {
  const user = await getSessionUser()        // ⚠️ 인자 없음 (쿠키/헤더 내부 처리)
  if (!isAdmin(user)) {
    // 어드민 레이아웃이 이미 보호 중이면 메시지만, 아니면 ClientAdminGate 패턴 사용
    return <div className='py-16 text-center text-sm text-muted-foreground'>권한이 없습니다</div>
  }
  return <StatsDashboard />
}
```

> Pi Browser 어드민 접근을 고려해 데이터는 클라이언트(`StatsDashboard`)에서 `piFetch`로 로드한다.

### 6.3 데이터 페치 (`StatsDashboard.tsx`)

```tsx
'use client'

import { useEffect, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'   // X-Pi-Token 헤더 자동 첨부 (어드민 Pi Browser 대응)
import type { ActivityStatsResponse, RevenueStatsResponse } from '@/types/stats'

export function StatsDashboard() {
  const [period, setPeriod] = useState(30)
  const [activity, setActivity] = useState<ActivityStatsResponse | null>(null)
  const [revenue, setRevenue] = useState<RevenueStatsResponse | null>(null)

  useEffect(() => {
    Promise.all([
      piFetch(`/api/admin/stats/activity?period=${period}`).then(r => r.json()),
      piFetch(`/api/admin/stats/revenue?period=${period}`).then(r => r.json()),
    ]).then(([a, r]) => { setActivity(a); setRevenue(r) }).catch(() => {})
  }, [period])
  // ... StatsCard ×4, DauWauMauChart, Revenue 차트 렌더
}
```

### 6.4 다크모드 대응 Plotly 테마 (`plotly-theme.ts`)

```typescript
// next-themes의 .dark 클래스를 감지해 Plotly layout 색상 동적 전환
import type { Layout } from 'plotly.js-basic-dist-min'

export function plotlyLayout(isDark: boolean): Partial<Layout> {
  return {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: isDark ? '#e5e7eb' : '#374151' },
    xaxis: { gridcolor: isDark ? '#374151' : '#e5e7eb' },
    yaxis: { gridcolor: isDark ? '#374151' : '#e5e7eb' },
    margin: { t: 16, r: 16, b: 40, l: 48 },
    legend: { orientation: 'h', y: -0.2 },
  }
}
```

> 색상 팔레트(에이전트 권장): DAU `#6366f1`, WAU `#22c55e`, MAU `#f59e0b`.

### 6.5 활동 계측 (`lib/activity-log.ts` + `middleware.ts`)

```typescript
// lib/activity-log.ts
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 하루 1행 UPSERT — fire-and-forget (응답 지연 0)
export async function recordActivity(userId: string, type = 'ACCESS') {
  await getSupabaseAdmin().rpc('fn_record_activity', { p_usr_id: userId, p_type: type })
}
```

> **계측 위치 권장**: 미들웨어보다 **`getSessionUser()` 성공 직후** 또는 **로그인 API(`/api/auth/pi`) 성공 시** 호출이 안전.
> 미들웨어는 Edge/Fluid 환경·정적 자산 요청까지 타므로, 인증된 페이지 진입점에서만 `recordActivity`를 fire-and-forget 호출.
> `await`로 응답을 막지 말 것(`void recordActivity(...)`).

---

## 7. 타입 정의 (`types/stats.ts`)

```typescript
export interface ActivityStatsResponse {
  series: { date: string; dau: number; wau: number; mau: number }[]
  summary: {
    dau: { current: number; change: number }
    wau: { current: number; change: number }
    mau: { current: number; change: number }
  }
}

export interface ThemeRevenue {
  theme_cd: string
  theme_nm: string
  theme_emoji: string
  totalPi: number
  count: number
}

export interface RevenueStatsResponse {
  byTheme: ThemeRevenue[]
  timeline: Array<Record<string, number | string>>
  totalPi: number
  totalChange: number
}
```

---

## 8. Pi 단위 / 매출 계산 규칙

- `pi_pymnt.amount`는 **Pi 단위(소수)** — Pi SDK U2A 결제 금액. (PiRC2 스마트컨트랙트의 i128 units와 혼동 금지)
- 표기 포맷: `` `${pi.toFixed(2)} π` ``
- 집계 대상: `status = 'completed'` AND `del_yn = 'N'`(연결 테이블)만.
- 검증 필요: `pi_pymnt.amount`가 Pi 소수인지 units인지 실제 데이터 1건으로 확인 후 변환 로직 확정.

---

## 9. 작업 순서 (점진 구현)

1. **원천 마이그레이션** `sql/015_user_activity_log.sql` (`sys_user_actvty_log`) + `fn_record_activity` RPC
2. **계측** `lib/activity-log.ts` + 인증 진입점에 `recordActivity` 연결 → 원천 데이터 적재 시작
3. **집계 마이그레이션** `sql/016_stat_rollup_tables.sql` (`stat_actvty_dly`·`stat_revenue_dly`) + `fn_build_daily_stats(date)` 집계 RPC (§11.2~11.3)
4. **배치** `/api/admin/stats/aggregate` (CRON_SECRET 보호) + Cron 등록(pg_cron 또는 Vercel Cron, 매일 00:10) + 과거 **백필** 1회 (§11.3)
5. **타입** `types/stats.ts`
6. **API** `activity/route.ts` → `revenue/route.ts` — **rollup 테이블 SELECT + 당일 실시간 보정**(§11.4~11.5)
7. **차트 라이브러리** 설치 + `plotly-theme.ts`
8. **컴포넌트** `StatsCard` → `DauWauMauChart` → `RevenueDonutChart` → `RevenueTimelineChart` → `StatsDashboard`
9. **페이지** `stats/page.tsx` + 어드민 메뉴 링크 추가
10. **검증** (섹션 10)

> ⚠️ DAU/WAU/MAU는 계측 시작 이후 데이터가 쌓여야 의미가 있다. **1~2단계(원천 마이그레이션·계측)를 가장 먼저** 배포해 원천을 축적한다(과거 소급 불가).
> 3~4단계(집계·배치)는 원천이 쌓인 뒤 적용하며, 백필로 적재 시작일부터 소급 집계한다.

---

## 10. 검증 체크리스트 (완료 전 필수)

### 코드 품질
- [ ] `pnpm tsc --noEmit` 타입 오류 없음
- [ ] `pnpm lint` 통과 / 세미콜론 없음·작은따옴표·2칸 들여쓰기
- [ ] 한국어 주석
- [ ] 모든 API에 `isAdmin()` 체크
- [ ] `del_yn = 'N'` / `status = 'completed'` 조건 반영
- [ ] Plotly 컴포넌트 `next/dynamic` + `ssr: false` (빌드 에러 방지)
- [ ] 다크모드 layout 전환 동작
- [ ] 로딩 스켈레톤 / 빈 상태(데이터 0건) UI

### 기능
- [ ] 기간 필터(7/30/90/365) 전환 시 차트·카드 갱신
- [ ] DAU/WAU/MAU 라인 hover 툴팁·zoom 동작
- [ ] 테마별 도넛 비중 합계 = 100%, `구독`·`기타` 세그먼트 분리
- [ ] 누적 바차트 일자별 테마 스택 정상
- [ ] 증감율(전기간 대비) 부호·색상(↑초록 ↓빨강) 정확
- [ ] Pi 금액 포맷 `0.00 π`

### Pi Browser (어드민)
- [ ] Pi Browser에서 `/admin/stats` 접근 시 `piFetch` 헤더 인증으로 데이터 로드
- [ ] `getSessionUser()` null 시 redirect 금지(메시지/게이트 렌더)

### 데이터 정합성
- [ ] `sys_user_actvty_log` UPSERT 시 하루 1행 유지(중복 INSERT 없음)
- [ ] `recordActivity`가 응답을 블로킹하지 않음(fire-and-forget)
- [ ] 매출 4경로 UNION 합계 = 총매출 카드 값 일치

---

## 11. 중간집계(Rollup) 테이블 아키텍처 (채택)

> 대시보드가 **raw 테이블을 매 요청 집계하지 않고, 사전 계산된 집계 테이블을 직접 조회**한다.
> 일배치로 "일자별 1행"을 미리 접어두는(roll up) 방식.

### 11.1 왜 중간집계 테이블인가

| 구분 | On-the-fly 집계 (raw 직접) | **중간집계 테이블 (채택)** |
|---|---|---|
| 대시보드 응답 | 롤링 `COUNT(DISTINCT)` + 매출 4경로 UNION을 **매 요청** 실행 | 범위 행 **단순 SELECT** (조인·윈도우 없음) |
| 지연 | 데이터 증가에 비례해 악화 | 기간 일수에만 비례 → **일정한 저지연** |
| DB 부하 | 동시 접속·기간 확대 시 급증 | 배치 1회로 분산, 읽기 부하 미미 |
| 최신성 | 실시간 | **D-1 기준** (당일은 §11.5 하이브리드로 보정) |
| 운영 | 없음 | 집계 배치·백필 파이프라인 필요 |

→ 어드민 대시보드는 실시간성보다 **안정적 응답·확장성**이 중요하므로 중간집계 테이블을 채택한다.
원천(`sys_user_actvty_log`, `pi_pymnt` 등)과 집계(`stat_*`)를 분리해 재집계·보정을 안전하게 만든다.

### 11.2 집계 테이블 DDL — `sql/016_stat_rollup_tables.sql`

```sql
-- DA-APPROVED: 통계 중간집계(rollup) 테이블 2종 (Phase 11 통계 대시보드)
-- 일배치 사전 집계 → 대시보드 직접 조회 전용. 멱등 UPSERT.

-- ① 일별 활동 집계 (DAU/WAU/MAU)
CREATE TABLE IF NOT EXISTS public.stat_actvty_dly (
  stat_dt      DATE         PRIMARY KEY,                 -- 집계 일자
  dau          INTEGER      NOT NULL DEFAULT 0,          -- 당일 고유 활성 사용자
  wau          INTEGER      NOT NULL DEFAULT 0,          -- 직전 7일 롤링 고유
  mau          INTEGER      NOT NULL DEFAULT 0,          -- 직전 30일 롤링 고유
  new_usr_cnt  INTEGER      NOT NULL DEFAULT 0,          -- 당일 신규 가입자
  del_yn       CHAR(1)      NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm      TIMESTAMPTZ,
  regr_id      TEXT         NOT NULL DEFAULT 'BATCH',
  reg_dtm      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT         NOT NULL DEFAULT 'BATCH',
  mod_dtm      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE public.stat_actvty_dly IS '일별 활동 집계 (DAU/WAU/MAU) — 대시보드 직접 조회';

-- ② 일별 × 테마별 매출 집계
CREATE TABLE IF NOT EXISTS public.stat_revenue_dly (
  stat_dt      DATE          NOT NULL,                   -- 집계 일자
  theme_cd     VARCHAR(20)   NOT NULL,                   -- 테마코드 ('SUBSCR'=구독)
  total_pi     DECIMAL(18,4) NOT NULL DEFAULT 0,         -- 당일 테마 매출 (Pi)
  pymnt_cnt    INTEGER       NOT NULL DEFAULT 0,         -- 당일 테마 결제 건수
  del_yn       CHAR(1)       NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm      TIMESTAMPTZ,
  regr_id      TEXT          NOT NULL DEFAULT 'BATCH',
  reg_dtm      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT          NOT NULL DEFAULT 'BATCH',
  mod_dtm      TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (stat_dt, theme_cd)
);
COMMENT ON TABLE public.stat_revenue_dly IS '일별×테마별 매출 집계 — 대시보드 직접 조회';

CREATE INDEX IF NOT EXISTS idx_stat_revenue_dt ON public.stat_revenue_dly (stat_dt) WHERE del_yn = 'N';
```

> **DA 표준**: 시스템 컬럼 4개 + `del_yn`/`del_dtm`. `regr_id/modr_id` 기본값을 `'BATCH'`로 두어 집계 주체를 명시.
> `da-ddl-guard` Hook 통과를 위해 `-- DA-APPROVED:` 주석 필수. `stat_`·`dly`(일별) 단어는 표준사전 등록 필요.

### 11.3 집계 배치 — `fn_build_daily_stats(p_dt date)`

특정 일자 1일분을 멱등 UPSERT로 재계산한다. **언제 재실행해도 결과 동일**(보정·백필 안전).

```sql
CREATE OR REPLACE FUNCTION public.fn_build_daily_stats(p_dt DATE)
RETURNS VOID AS $$
BEGIN
  -- ① 활동 집계 (DAU=당일, WAU=직전7일, MAU=직전30일 고유 사용자)
  INSERT INTO public.stat_actvty_dly (stat_dt, dau, wau, mau, new_usr_cnt)
  SELECT
    p_dt,
    (SELECT COUNT(DISTINCT usr_id) FROM sys_user_actvty_log
      WHERE del_yn='N' AND actvty_dt = p_dt),
    (SELECT COUNT(DISTINCT usr_id) FROM sys_user_actvty_log
      WHERE del_yn='N' AND actvty_dt BETWEEN p_dt - 6  AND p_dt),
    (SELECT COUNT(DISTINCT usr_id) FROM sys_user_actvty_log
      WHERE del_yn='N' AND actvty_dt BETWEEN p_dt - 29 AND p_dt),
    (SELECT COUNT(*) FROM sys_user WHERE reg_dtm::date = p_dt)
  ON CONFLICT (stat_dt) DO UPDATE SET
    dau=EXCLUDED.dau, wau=EXCLUDED.wau, mau=EXCLUDED.mau,
    new_usr_cnt=EXCLUDED.new_usr_cnt, modr_id='BATCH', mod_dtm=CURRENT_TIMESTAMP;

  -- ② 매출 집계 (4경로 UNION → 테마별, 부록 B 쿼리를 p_dt 1일로 한정)
  DELETE FROM public.stat_revenue_dly WHERE stat_dt = p_dt;  -- 재집계 시 당일분 교체
  INSERT INTO public.stat_revenue_dly (stat_dt, theme_cd, total_pi, pymnt_cnt)
  SELECT p_dt, theme_cd, SUM(amount), COUNT(*)
  FROM ( /* 부록 B의 4경로 UNION, reg_dtm::date = p_dt 조건 */ ) rev
  GROUP BY theme_cd;
END;
$$ LANGUAGE plpgsql;
```

**스케줄링 — 두 경로 중 택1**

```sql
-- (A) Supabase pg_cron — 매일 00:10 전일분 집계 (권장: DB 내장, 외부 의존 없음)
SELECT cron.schedule('build-daily-stats', '10 0 * * *',
  $$ SELECT public.fn_build_daily_stats(CURRENT_DATE - 1) $$);
```

```typescript
// (B) Vercel Cron — pg_cron 미사용 시. vercel.ts(또는 vercel.json) crons 등록
//     POST /api/admin/stats/aggregate  (헤더 CRON_SECRET 검증 → fn_build_daily_stats 호출)
// vercel.ts: crons: [{ path: '/api/admin/stats/aggregate', schedule: '10 0 * * *' }]
export async function POST(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  await getSupabaseAdmin().rpc('fn_build_daily_stats', { p_dt: y })
  return NextResponse.json({ ok: true, date: y })
}
```

**백필(과거 소급)** — 계측 시작일부터 어제까지 1회 루프 실행:

```sql
-- 적재 시작일(예: 2026-06-09) ~ 어제까지 일자별 집계 생성
DO $$ DECLARE d DATE := '2026-06-09';
BEGIN
  WHILE d < CURRENT_DATE LOOP
    PERFORM public.fn_build_daily_stats(d);
    d := d + 1;
  END LOOP;
END $$;
```

### 11.4 대시보드 조회 쿼리 (단순 SELECT)

API는 더 이상 집계하지 않고 rollup 테이블만 읽는다.

```sql
-- 활동: 기간 내 일자별 DAU/WAU/MAU 그대로 반환
SELECT stat_dt, dau, wau, mau FROM stat_actvty_dly
WHERE del_yn='N' AND stat_dt >= CURRENT_DATE - $period::int
ORDER BY stat_dt;

-- 매출: 기간 내 테마별 합산 (도넛) / 일자별(추이)
SELECT theme_cd, SUM(total_pi) AS total_pi, SUM(pymnt_cnt) AS cnt
FROM stat_revenue_dly
WHERE del_yn='N' AND stat_dt >= CURRENT_DATE - $period::int
GROUP BY theme_cd ORDER BY total_pi DESC;
```

### 11.5 하이브리드 최신성 전략 (당일 보정)

rollup은 D-1 기준이라 **"오늘" 행이 없다.** 대시보드 최신성을 위해:

```
[과거 ~ 어제]  → stat_actvty_dly / stat_revenue_dly 조회 (빠름)
[오늘]         → raw(sys_user_actvty_log, pi_pymnt)에서 1일분만 실시간 집계
                 → 두 결과를 API 응답에서 병합
```

- 오늘 1일분 실시간 집계는 **단일 일자 범위**라 부하가 작다.
- 옵션: 자정 배치 외에 **5~10분 주기로 `fn_build_daily_stats(CURRENT_DATE)` 재실행**해 당일 행도 점진 갱신하면, API는 분기 없이 항상 rollup만 읽어도 된다(구현 단순화). 트래픽·정확도 요구에 따라 택1.

### 11.6 대안 비교 — Materialized View

| | 중간집계 테이블 (채택) | Materialized View |
|---|---|---|
| 증분 갱신 | 일자 단위 부분 재집계 가능 | `REFRESH`는 전체 재계산(증분 MV는 제약 많음) |
| 보정/백필 | 특정 일자만 재실행 용이 | 전체 refresh 필요 → 비용 큼 |
| 제어·확장 | 컬럼·파생지표 자유 추가 | 뷰 정의 변경 시 재생성 |
| 결론 | **일배치·부분보정에 최적** | 단순 조회엔 편하나 본 케이스엔 부적합 |

### 11.7 운영·검증 체크리스트 (섹션 10에 추가)

- [ ] `fn_build_daily_stats` **멱등성**: 같은 일자 2회 실행 시 행 중복·값 변동 없음
- [ ] 백필 결과 = on-the-fly 집계 결과 **샘플 일자 대조 일치**
- [ ] Cron 실패 시 알림/재시도 (다음날 자동 보정 또는 수동 백필 절차 문서화)
- [ ] 당일(오늘) 값이 하이브리드 보정으로 노출되는지(§11.5)
- [ ] rollup `del_yn='N'` 필터 일관 적용
- [ ] 신규 테마 추가 시 자동 반영(테마코드 하드코딩 금지, `msg_theme` 조인)

---

## 부록 A — 테마 마스터(`msg_theme`) 컬럼

`theme_cd`(PK), `theme_nm`, `theme_emoji`, `theme_desc`, `theme_tp_cd`(BASIC/PREMIUM), `sort_ord`, `use_yn`, `del_yn` + 시스템 컬럼 4개.
→ 매출 차트의 테마 라벨·이모지는 `msg_theme`에서 조인해 표기.

## 부록 B — 매출 귀속 UNION 스켈레톤

```sql
-- status='completed' 결제를 테마별로 귀속 (4경로 UNION)
WITH rev AS (
  -- ① 채팅방
  SELECT p.payment_id, p.amount, p.reg_dtm, r.theme_cd
  FROM pi_pymnt p JOIN msg_room r ON r.pymnt_id = p.payment_id
  WHERE p.status='completed' AND r.del_yn='N'
  UNION ALL
  -- ② 팁
  SELECT p.payment_id, p.amount, p.reg_dtm, r.theme_cd
  FROM pi_pymnt p JOIN msg_tip t ON t.pymnt_id = p.payment_id
                  JOIN msg_room r ON r.room_id = t.room_id
  WHERE p.status='completed' AND t.del_yn='N'
  UNION ALL
  -- ③ 스티커팩
  SELECT p.payment_id, p.amount, p.reg_dtm, sp.theme_cd
  FROM pi_pymnt p JOIN msg_usr_stkr us ON us.pymnt_id = p.payment_id
                  JOIN msg_stkr_pack sp ON sp.pack_id = us.pack_id
  WHERE p.status='completed' AND us.del_yn='N'
  UNION ALL
  -- ④ 구독 (테마 없음 → 'SUBSCR')
  SELECT p.payment_id, p.amount, p.reg_dtm, 'SUBSCR' AS theme_cd
  FROM pi_pymnt p JOIN msg_subscr s ON s.pymnt_id = p.payment_id
  WHERE p.status='completed' AND s.del_yn='N'
)
SELECT theme_cd, SUM(amount) AS total_pi, COUNT(*) AS cnt
FROM rev
WHERE reg_dtm >= CURRENT_DATE - $1::int
GROUP BY theme_cd ORDER BY total_pi DESC;
```

---

> **다음 단계**: 본 PRD 승인 후 `dashboard-stats-builder` 에이전트로 섹션 9 순서대로 구현.
> 1단계(마이그레이션·계측)를 우선 배포하여 활동 데이터 적재를 시작할 것.
