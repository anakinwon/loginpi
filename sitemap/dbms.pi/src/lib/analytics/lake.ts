// 분석·레이크 순수 로직(PRD 12 §8, ANL-R01·A8·ANL-R08) — 서버·클라이언트 공용, 외부 의존 없음
//  · buildLake   : schema.pi /model 응답 → 레이크 3층(raw → standardized → curated) 테이블 매핑 미리보기(이름·칼럼 정의만, 행 데이터 없음)
//  · isStdColName: 표준 칼럼명 형식 점검(snake_case, 대소문자 한쪽, 30자 이하)
//  · dailyCounts·barPcts : KPI 추이 막대(일별 건수 → 폭 %)
//  시험 : node --test src/lib/analytics/lake.test.mjs (sitemap/dbms.pi 에서)

export const LAKE = { rawPrefix: 'raw_', stdPrefix: 'std_', curPrefix: 'cur_', maxNmLen: 30, maxCols: 300 } as const

export type ModelRes = {
  entities?: { entId: string; entNm?: string | null; tblNm: string | null }[]
  tables?: { tblId: string; tblNm: string; phyStsCd?: string | null }[]
  columns?: { tblId: string; colNm: string; phyTpNm?: string | null; pkYn?: string | null; colSeq?: number | null }[]
}

export type LakeCol = { colNm: string; stdNm: string; phyTpNm: string | null; pk: boolean; conform: boolean }
export type LakeTbl = { tblNm: string; entNm: string | null; rawNm: string; stdNm: string; curNm: string; cols: LakeCol[]; cnfmPct: number }

const STD_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
export const isStdColName = (v: string) =>
  v.length > 0 && v.length <= LAKE.maxNmLen && (STD_RE.test(v) || (STD_RE.test(v.toLowerCase()) && v === v.toUpperCase()))

const lower = (v: string) => v.trim().toLowerCase()
const pct = (n: number, d: number) => (d === 0 ? 100 : Math.round((n / d) * 1000) / 10)

// 표준층 칼럼명 = 모델 물리 칼럼명(schema.pi 승인 표준용어 기반, A8) 소문자. raw 층은 원천 이름 그대로, curated 는 엔터티 단위 분석용
export function buildLake(m: ModelRes): LakeTbl[] {
  const entByTbl = new Map<string, string | null>()
  for (const e of m.entities ?? []) if (e.tblNm) entByTbl.set(lower(e.tblNm), e.entNm ?? null)
  const colsByTbl = new Map<string, NonNullable<ModelRes['columns']>>()
  for (const c of m.columns ?? []) {
    const arr = colsByTbl.get(c.tblId) ?? []
    arr.push(c)
    colsByTbl.set(c.tblId, arr)
  }
  return (m.tables ?? [])
    .filter((t) => typeof t.tblNm === 'string' && t.tblNm.trim())
    .map((t) => {
      const base = lower(t.tblNm)
      const cols = (colsByTbl.get(t.tblId) ?? [])
        .slice()
        .sort((a, b) => (a.colSeq ?? 0) - (b.colSeq ?? 0))
        .slice(0, LAKE.maxCols)
        .map((c) => ({
          colNm: c.colNm,
          stdNm: lower(c.colNm),
          phyTpNm: c.phyTpNm ?? null,
          pk: c.pkYn === 'Y',
          conform: isStdColName(c.colNm.trim()),
        }))
      return {
        tblNm: t.tblNm,
        entNm: entByTbl.get(base) ?? null,
        rawNm: LAKE.rawPrefix + base,
        stdNm: LAKE.stdPrefix + base,
        curNm: LAKE.curPrefix + base,
        cols,
        cnfmPct: pct(cols.filter((c) => c.conform).length, cols.length),
      }
    })
    .sort((a, b) => a.tblNm.localeCompare(b.tblNm))
}

// 전체 표준 적합률(칼럼 수 가중)
export function overallConform(tbls: LakeTbl[]): number {
  const all = tbls.flatMap((t) => t.cols)
  return pct(all.filter((c) => c.conform).length, all.length)
}

// 일시 목록 → 최근 days 일 일별 건수(UTC 날짜, 오래된 날 → 오늘)
export function dailyCounts(dtms: string[], days: number, now = new Date()): { day: string; cnt: number }[] {
  const out: { day: string; cnt: number }[] = []
  const idx = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    idx.set(day, out.length)
    out.push({ day, cnt: 0 })
  }
  for (const d of dtms) {
    const i = idx.get(String(d).slice(0, 10))
    if (i !== undefined) out[i].cnt++
  }
  return out
}

// 값 → 막대 폭 %(최댓값 = 100, 0 이 아닌 값은 최소 2%로 보이게). null = 미구축 → 0
export function barPcts(vals: (number | null)[]): number[] {
  const max = Math.max(0, ...vals.map((v) => v ?? 0))
  return vals.map((v) => (!v || max === 0 ? 0 : Math.max(2, Math.round((v / max) * 100))))
}

// PostgREST·Postgres "테이블 없음"(다른 담당이 아직 SQL 미적용) 판정 — KPI 는 0 이 아니라 '미구축'(null)으로 표시
export const isMissingTable = (e: { code?: string } | null | undefined) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST200')

// schema.pi 프로젝트ID 형식(쿼리 문자열에 넣기 전 검증)
export const PRJ_ID_RE = /^[\w-]{1,64}$/

export type Project = { prjId: string; prjNm: string; trgtDbmsCd: string | null }
export type LoadStsCd = 'DSGN' | 'LOADED' | 'FAIL'
export type Dataset = {
  dsId: string
  prjId: string
  prjNm: string | null
  tblNm: string
  rawNm: string
  stdNm: string
  curNm: string
  colCnt: number
  cnfmPct: number
  loadStsCd: LoadStsCd
  lstLoadDtm: string | null
  modDtm: string
}
export const KPI_KEYS = ['links', 'perf', 'drift', 'mig', 'pipe', 'lake'] as const
export type KpiKey = (typeof KPI_KEYS)[number]
