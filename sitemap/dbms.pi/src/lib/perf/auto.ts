// 성능 상시 자동 수집 순수 규칙(sql/021) — 하루 기준 시각·결과 코드 분류. 서버·크론·화면 공용(node 모듈 없음)
//  시험 : node --test src/lib/perf/auto.test.mjs

export const AUTO_ACTOR = 'SYSTEM' // 자동 수집 행의 dbm_prf_clct.regr_id — 무료 하루 수동 수집 횟수에서 뺀다(plan.ts clctUsedToday)
export const AUTO_HOUR_UTC = 18 // 기준 시각 KST 03:00 — vercel.json crons '*/10 18-19 * * *'(KST 03:00~04:50) 와 맞춘다
const DAY_MS = 86_400_000

// 지금 이전 가장 최근 기준 시각(ms) — 마지막 실행이 이보다 앞이면 오늘 수집 대상
export function lastAutoSlot(now: number): number {
  const d = new Date(now)
  const s = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), AUTO_HOUR_UTC)
  return s <= now ? s : s - DAY_MS
}

// 결과 코드 → 다음 처리. off = 다시 해도 안 됨(자동 끔), retry = 일시 오류(같은 시간대 다음 회차), done = 오늘은 끝(성공·요금제 부족 등)
const OFF = new Set(['LINK_AUTH', 'LINK_NOT_FOUND', 'LINK_SCOPE', 'CONN_UNSUPPORTED'])
const RETRY = new Set(['TIMEOUT', 'LINK_DOWN', 'RATE', 'DB_FAIL', 'DB_UNAVAILABLE'])
export type AutoNext = 'done' | 'retry' | 'off'
export const autoNext = (code: string): AutoNext => (OFF.has(code) ? 'off' : RETRY.has(code) ? 'retry' : 'done')
