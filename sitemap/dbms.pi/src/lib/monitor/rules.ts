// 모니터링 센터 순수 로직(클라이언트·서버 공용) — schema.pi 요약(/mon/summary) 정규화 + 임계치 규칙(dbm_mon_rule) 평가
// 외부 import 없음(node --test 로 직접 실행 : node --test src/lib/monitor/rules.test.mjs)

export const PERIODS = [30, 60, 360, 1440] as const
export type PeriodMin = (typeof PERIODS)[number]
export const isPeriod = (v: number): v is PeriodMin =>
  (PERIODS as readonly number[]).includes(v)

export const METRICS = [
  'APP_TPS',
  'APP_ERR_PCT',
  'APP_SLOW_CNT',
  'APP_AVG_MS',
  'DB_SESS_CNT',
  'DB_LOCK_WAIT_CNT',
  'DB_CACHE_HIT_PCT',
  'DB_SIZE_MB',
  'URL_RSP_MS',
  'URL_FAIL_CNT',
] as const
export type MetricCd = (typeof METRICS)[number]
export const OPS = ['GT', 'GE', 'LT', 'LE'] as const
export type OpCd = (typeof OPS)[number]
export const RULE_MAX = 50 // 연결당 규칙 상한

export type Rule = {
  ruleId: string
  metricCd: MetricCd
  connId: string | null
  opCd: OpCd
  thrVal: number
  useYn: 'Y' | 'N'
}

export type AppMetrics = {
  reqCnt: number
  errCnt: number
  slowCnt: number
  tps: number
  errPct: number
  avgMs: number | null
}
export type DbCard = {
  connId: string
  sessCnt: number | null
  lockWaitCnt: number | null
  cacheHitPct: number | null
  dbSzMb: number | null
}
// chkCnt·errCnt = 요약 구간(min) 점검 횟수·오류 수, lstDtm = 마지막 점검 구간. stsNo null = 구간 안 점검 없음(실패 아님)
export type UrlCheck = {
  url: string
  stsNo: number | null
  rspMs: number | null
  ok: boolean
  chkCnt: number
  errCnt: number
  useYn: 'Y' | 'N'
  lstDtm: string | null
}
export type MonSummary = { app: AppMetrics; db: DbCard[]; url: UrlCheck[] }

const n = (v: unknown): number | null => {
  const x = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof x === 'number' && Number.isFinite(x) ? x : null
}
const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]
  return undefined
}
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(obj) : []
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d

// schema.pi 요약 정규화 — 실응답(schema.pi api/link/v1/mon/summary : app.avgRspMs, url[].urlNm·lstSts·lstRspMs·chkCnt·errCnt·useYn·lstDtm) 기준,
//  예전 키 이름도 받아들이고 TPS·오류율은 없으면 계산
export function normalizeSummary(raw: unknown, min: number): MonSummary {
  const r = obj(raw)
  const a = obj(r.app)
  const reqCnt = n(pick(a, 'reqCnt', 'req_cnt')) ?? 0
  const errCnt = n(pick(a, 'errCnt', 'err_cnt')) ?? 0
  const slowCnt = n(pick(a, 'slowCnt', 'slow_cnt')) ?? 0
  const rspSum = n(pick(a, 'rspSum', 'rsp_sum_val'))
  const app: AppMetrics = {
    reqCnt,
    errCnt,
    slowCnt,
    tps: round(n(a.tps) ?? (min > 0 ? reqCnt / (min * 60) : 0), 3),
    errPct: round(
      n(pick(a, 'errPct', 'err_pct')) ??
        (reqCnt > 0 ? (errCnt / reqCnt) * 100 : 0),
    ),
    avgMs:
      n(pick(a, 'avgRspMs', 'avgMs', 'avg_ms')) ??
      (rspSum !== null && reqCnt > 0 ? round(rspSum / reqCnt, 1) : null),
  }
  const db: DbCard[] = arr(r.db)
    .filter((d) => typeof d.connId === 'string')
    .map((d) => {
      const sz = n(pick(d, 'dbSz', 'db_sz'))
      return {
        connId: d.connId as string,
        sessCnt: n(d.sessCnt),
        lockWaitCnt: n(d.lockWaitCnt),
        cacheHitPct: n(d.cacheHitPct),
        dbSzMb: sz === null ? null : round(sz / 1048576, 1),
      }
    })
  const url: UrlCheck[] = arr(r.url).map((u) => {
    const stsNo = n(pick(u, 'lstSts', 'stsNo', 'sts_no', 'status'))
    const okRaw = pick(u, 'ok', 'okYn', 'ok_yn')
    const lstDtm = pick(u, 'lstDtm', 'bktDtm')
    return {
      url: String(pick(u, 'urlNm', 'url', 'urlTxt', 'url_txt') ?? ''),
      stsNo,
      rspMs: n(pick(u, 'lstRspMs', 'rspMs', 'rsp_val', 'ms')),
      ok:
        okRaw === undefined
          ? stsNo !== null && stsNo >= 200 && stsNo < 400
          : okRaw === true || okRaw === 'Y',
      chkCnt: n(u.chkCnt) ?? (stsNo === null ? 0 : 1),
      errCnt: n(u.errCnt) ?? 0,
      useYn: u.useYn === 'N' ? 'N' : 'Y',
      lstDtm: typeof lstDtm === 'string' ? lstDtm : null,
    }
  })
  return { app, db, url }
}

export function compare(v: number, op: OpCd, thr: number) {
  return op === 'GT'
    ? v > thr
    : op === 'GE'
      ? v >= thr
      : op === 'LT'
        ? v < thr
        : v <= thr
}

// 대상 키 : 'app' | 'db:<connId>' | 'url' — 화면이 카드 강조에 쓴다
export type Breach = {
  ruleId: string
  metricCd: MetricCd
  target: string
  value: number
  opCd: OpCd
  thrVal: number
}

export function evaluate(rules: Rule[], s: MonSummary): Breach[] {
  const out: Breach[] = []
  for (const r of rules) {
    if (r.useYn !== 'Y') continue
    const hit = (target: string, value: number | null) => {
      if (value !== null && compare(value, r.opCd, r.thrVal))
        out.push({
          ruleId: r.ruleId,
          metricCd: r.metricCd,
          target,
          value,
          opCd: r.opCd,
          thrVal: r.thrVal,
        })
    }
    switch (r.metricCd) {
      case 'APP_TPS':
        hit('app', s.app.tps)
        break
      case 'APP_ERR_PCT':
        hit('app', s.app.errPct)
        break
      case 'APP_SLOW_CNT':
        hit('app', s.app.slowCnt)
        break
      case 'APP_AVG_MS':
        hit('app', s.app.avgMs)
        break
      // 사용 안 함·구간 안 점검 없음(stsNo null)은 실패로 세지 않는다
      case 'URL_FAIL_CNT':
        hit(
          'url',
          s.url.filter((u) => u.useYn === 'Y' && u.stsNo !== null && !u.ok)
            .length,
        )
        break
      case 'URL_RSP_MS':
        for (const u of s.url) if (u.useYn === 'Y') hit(`url:${u.url}`, u.rspMs)
        break
      default: {
        const key = (
          {
            DB_SESS_CNT: 'sessCnt',
            DB_LOCK_WAIT_CNT: 'lockWaitCnt',
            DB_CACHE_HIT_PCT: 'cacheHitPct',
            DB_SIZE_MB: 'dbSzMb',
          } as const
        )[r.metricCd]
        for (const d of s.db)
          if (!r.connId || r.connId === d.connId) hit(`db:${d.connId}`, d[key])
      }
    }
  }
  return out
}
