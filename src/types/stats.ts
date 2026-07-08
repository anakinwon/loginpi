// Phase 11 — 어드민 통계 대시보드 타입 (TASK-084)

export interface ActivityDataPoint {
  stat_dt: string // YYYY-MM-DD
  dau_cnt: number
  wau_cnt: number
  mau_cnt: number
}

// 가중치 종합 점수제: score = 활동일수×0.2 + 콘텐츠활동×0.3 + 결제건수×0.5
export interface TopUser {
  usr_id: string
  display_nm: string
  activity_days: number
  content_cnt: number
  action_cnt: number
  score: number
}

export interface ActivityStatsResponse {
  period: number
  from_dt: string
  series: ActivityDataPoint[]
  topUsers: TopUser[]
}

export interface RevenueDataPoint {
  stat_dt: string
  theme_cd: string
  rev_pi: number
  txn_cnt: number
}

export interface TopTheme {
  theme_cd: string
  theme_nm: string | null
  theme_emoji: string | null
  total_pi: number
  total_txn: number
}

export interface TopSpender {
  usr_id: string
  display_nm: string
  total_pi: number
  txn_cnt: number
}

// ── Bean 매출 (fn_bean_revenue_summary 기반 — 매출 KPI 단일 소스) ──
// 매출 2층위: ① Pi 현금매출(충전) ② Bean 회수매출(소비·구독 순액, ref_tp_cd 항목별)
export interface BeanRevenueItem {
  ref_tp_cd: string // SUBSCR / ROOM_CREATE / ROOM_ENTER / EVENT_ENTER / STICKER_PACK / BADGE_UPGRADE / ETC
  txn_cnt: number
  net_bean: number // 순매출 Bean (소비 양수)
}

export interface BeanRevenueResponse {
  pi_revenue: { total_pi: number; total_bean: number; charge_cnt: number }
  bean_by_item: BeanRevenueItem[]
  bean_total: number // Bean 회수매출 총액 (전체 누적)
  last_updated?: string
}

export interface RevenueStatsResponse {
  period: number
  from_dt: string
  series: RevenueDataPoint[]
  topThemes: TopTheme[]
  topSpenders: TopSpender[]
  // 직전 동일 길이 기간 합계 — KPI 델타배지용 (구 캐시 응답엔 부재 → optional)
  prev?: { total_pi: number; total_txn: number }
  // 오늘 실시간 매출 — pi_pymnt 직접 집계 (stat_revenue_dly는 일배치라 당일 미포함)
  today?: { total_pi: number; txn_cnt: number }
}
