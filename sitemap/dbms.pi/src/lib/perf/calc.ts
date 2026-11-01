// 성능 관측 순수 계산 — 쿼리 증감(누적치 리셋 보정)·테이블/인덱스 건강 판정·용량 선형 예측·상수 마스킹. 의존성 없음(node --test 대상)
//  시험 : node --test src/lib/perf/calc.test.mjs

// 판정 기준값 — 바꾸면 화면 문구(perf.health.*)도 함께 확인
export const HEALTH = {
  minLiveTup: 1000, // 이보다 작은 테이블은 전체 스캔이 정상
  fullScanRatio: 0.5, // 전체 스캔 / (전체 + 인덱스)
  minFullScan: 100,
  deadRatio: 0.2, // 죽은 / (유효 + 죽은)
  minDeadTup: 1000,
}
const DAY_MS = 86_400_000

export type QryStat = { qryId: string; qryTxt: string | null; calls: number; totalMs: number; rows: number }
export type QryDelta = QryStat & { meanMs: number; reset: boolean }

// 상수 마스킹(방어) — pg_stat_statements 는 이미 $1 로 정규화하지만, 문자열·숫자 상수가 남은 경우 대비
export function maskLiterals(sql: string): string {
  return sql
    .replace(/'(?:[^']|'')*'/g, "'?'")
    .replace(/(^|[^\w$."])-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, '$1?')
}

// 이전 수집 대비 증감. 통계 리셋(reset 시각 변경) 또는 호출 수 감소 = 누적 역전 → 현재 누적치를 증감으로 본다
export function qryDelta(cur: QryStat[], prev: QryStat[] | null, resetChanged: boolean): QryDelta[] {
  const prevMap = new Map((prev ?? []).map((p) => [p.qryId, p]))
  return cur.map((c) => {
    const p = prev && !resetChanged ? prevMap.get(c.qryId) : undefined
    const reset = !!p && (c.calls < p.calls || c.totalMs < p.totalMs)
    const base = p && !reset ? p : null
    const calls = c.calls - (base?.calls ?? 0)
    const totalMs = c.totalMs - (base?.totalMs ?? 0)
    const rows = c.rows - (base?.rows ?? 0)
    return { ...c, calls, totalMs, rows, meanMs: calls > 0 ? totalMs / calls : 0, reset: reset || resetChanged }
  })
}

export type TblStat = { tblNm: string; fullScan: number; idxScan: number; liveTup: number; deadTup: number; szByte: number | null }
export type IdxStat = { idxNm: string; tblNm: string; idxScan: number; szByte: number | null }

export function health(tbls: TblStat[], idxs: IdxStat[]) {
  const unusedIdx = idxs.filter((i) => i.idxScan === 0).sort((a, b) => (b.szByte ?? 0) - (a.szByte ?? 0))
  const fullScan = tbls
    .map((t) => ({ ...t, ratio: t.fullScan / Math.max(1, t.fullScan + t.idxScan) }))
    .filter((t) => t.liveTup >= HEALTH.minLiveTup && t.fullScan >= HEALTH.minFullScan && t.ratio >= HEALTH.fullScanRatio)
    .sort((a, b) => b.fullScan - a.fullScan)
  const dead = tbls
    .map((t) => ({ ...t, ratio: t.deadTup / Math.max(1, t.liveTup + t.deadTup) }))
    .filter((t) => t.deadTup >= HEALTH.minDeadTup && t.ratio >= HEALTH.deadRatio)
    .sort((a, b) => b.ratio - a.ratio)
  return { unusedIdx, fullScan, dead }
}

// 최소제곱 직선 → 하루 증가 바이트·임계 도달 예상일(증가 없음·점 2개 미만 = null)
export function forecast(points: { t: number; bytes: number }[], limitByte: number) {
  if (points.length < 2) return { perDay: null, daysLeft: null }
  const n = points.length
  const mx = points.reduce((s, p) => s + p.t, 0) / n
  const my = points.reduce((s, p) => s + p.bytes, 0) / n
  const den = points.reduce((s, p) => s + (p.t - mx) ** 2, 0)
  if (den === 0) return { perDay: null, daysLeft: null }
  const slope = points.reduce((s, p) => s + (p.t - mx) * (p.bytes - my), 0) / den // 바이트/ms
  const perDay = slope * DAY_MS
  const last = points.reduce((a, b) => (b.t > a.t ? b : a))
  if (perDay <= 0) return { perDay, daysLeft: null }
  return { perDay, daysLeft: Math.max(0, (limitByte - last.bytes) / perDay) }
}
