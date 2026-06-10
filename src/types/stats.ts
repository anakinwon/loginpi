// Phase 11 — 어드민 통계 대시보드 타입 (TASK-084)

export interface ActivityDataPoint {
  stat_dt: string   // YYYY-MM-DD
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

export interface RevenueStatsResponse {
  period: number
  from_dt: string
  series: RevenueDataPoint[]
  topThemes: TopTheme[]
  topSpenders: TopSpender[]
}
