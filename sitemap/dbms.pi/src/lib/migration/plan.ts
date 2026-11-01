// PiMig 이행 계획 순수 로직(PRD 12 §6-1·6-3, MIG-R02·R04) — 서버·클라이언트 공용, 외부 의존 없음.
//  · toSnapshot : schema.pi /model 응답 → 설계 스냅샷(A4, 테이블·칼럼·관계 이름만 — 행 데이터 없음)
//  · buildPlan  : 관계 위상 정렬(부모 먼저, Tarjan SCC 로 순환 묶음 보고) → 단계(level)별 묶음(병렬도)
//  · verifySql  : 테이블별 건수·합계·키 중복·해시 대조 SQL 문장 생성(실행하지 않음 — 사용자가 원천·대상에서 직접 실행)
//  시험 : node --test src/lib/migration/plan.test.mjs (sitemap/dbms.pi 에서)

export type ModelRes = {
  entities?: { entId: string; entNm?: string; tblNm: string | null }[]
  relations?: { relId?: string; parentEntId: string; childEntId: string; idnYn?: string; cardCd?: string }[]
  tables?: { tblId: string; tblNm: string; phyStsCd?: string }[]
  columns?: { tblId: string; colNm: string; phyTpNm: string | null; pkYn?: string; colSeq?: number }[]
}

export type SnapCol = { nm: string; tp: string; pk: boolean }
export type SnapTbl = { nm: string; cols: SnapCol[] }
export type Snapshot = { tables: SnapTbl[]; rels: { p: string; c: string }[]; dropped: number }

export type PlanOpts = { chunkSize: number; parallel: number }
export type Level = { level: number; batches: string[][] }
export type Plan = {
  levels: Level[]
  cycles: string[][] // 2개 이상이 서로 참조하는 묶음 — 같은 단계에 두고 수동 순서·제약 지연 필요
  selfRefs: string[] // 자기 참조(계층) — 같은 테이블 안 부모 행 먼저 적재 필요
  order: string[]
}

export type Dialect = 'PG' | 'ORACLE'

// 컷오버 체크리스트(정적) — PRD 11.1 MIG-R08~R14
export const CHECKLIST = ['cdcHandoff', 'valueConv', 'charset', 'lob', 'seqResync', 'timezone', 'backpressure'] as const
export type CheckKey = (typeof CHECKLIST)[number]

export const LIMITS = { chunkMin: 100, chunkMax: 1_000_000, parallelMin: 1, parallelMax: 64, tables: 3000 }

export const clampOpts = (o: Partial<PlanOpts>): PlanOpts => ({
  chunkSize: Math.min(LIMITS.chunkMax, Math.max(LIMITS.chunkMin, Math.round(Number(o.chunkSize) || 10_000))),
  parallel: Math.min(LIMITS.parallelMax, Math.max(LIMITS.parallelMin, Math.round(Number(o.parallel) || 4))),
})

export function toSnapshot(m: ModelRes): Snapshot {
  const tables = (m.tables ?? []).filter((t) => t.tblNm).slice(0, LIMITS.tables)
  const byId = new Map(tables.map((t) => [t.tblId, { nm: t.tblNm, cols: [] as (SnapCol & { seq: number })[] }]))
  for (const c of m.columns ?? []) {
    byId.get(c.tblId)?.cols.push({ nm: c.colNm, tp: c.phyTpNm ?? '', pk: c.pkYn === 'Y', seq: c.colSeq ?? 0 })
  }
  const names = new Set(tables.map((t) => t.tblNm))
  const entTbl = new Map((m.entities ?? []).map((e) => [e.entId, e.tblNm]))
  const rels: Snapshot['rels'] = []
  let dropped = 0
  const seen = new Set<string>()
  for (const r of m.relations ?? []) {
    const p = entTbl.get(r.parentEntId)
    const c = entTbl.get(r.childEntId)
    // 물리 테이블이 아직 없는 엔터티 관계는 순서 계산에서 뺀다(건수만 알림)
    if (!p || !c || !names.has(p) || !names.has(c)) {
      dropped++
      continue
    }
    const k = `${p}\u0000${c}`
    if (!seen.has(k)) rels.push({ p, c })
    seen.add(k)
  }
  return {
    tables: [...byId.values()].map((t) => ({
      nm: t.nm,
      cols: t.cols.sort((a, b) => a.seq - b.seq).map(({ nm, tp, pk }) => ({ nm, tp, pk })),
    })),
    rels,
    dropped,
  }
}

// Tarjan SCC(반복형 — 깊은 관계 사슬에서 호출 스택 넘침 방지)
function scc(nodes: string[], out: Map<string, string[]>): string[][] {
  const idx = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const comps: string[][] = []
  let n = 0
  for (const root of nodes) {
    if (idx.has(root)) continue
    const work: [string, number][] = [[root, 0]]
    while (work.length) {
      const top = work[work.length - 1]
      const [v, i] = top
      if (i === 0) {
        idx.set(v, n)
        low.set(v, n++)
        stack.push(v)
        onStack.add(v)
      }
      const nb = out.get(v) ?? []
      if (i < nb.length) {
        top[1]++
        const w = nb[i]
        if (!idx.has(w)) work.push([w, 0])
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!))
        continue
      }
      work.pop()
      if (work.length) {
        const u = work[work.length - 1][0]
        low.set(u, Math.min(low.get(u)!, low.get(v)!))
      }
      if (low.get(v) === idx.get(v)) {
        const comp: string[] = []
        let w: string
        do {
          w = stack.pop()!
          onStack.delete(w)
          comp.push(w)
        } while (w !== v)
        comps.push(comp.sort())
      }
    }
  }
  return comps
}

export function buildPlan(snap: Snapshot, opts: PlanOpts): Plan {
  const nodes = snap.tables.map((t) => t.nm)
  const out = new Map<string, string[]>()
  const selfRefs: string[] = []
  for (const { p, c } of snap.rels) {
    if (p === c) {
      selfRefs.push(p)
      continue
    }
    out.set(p, [...(out.get(p) ?? []), c])
  }
  const comps = scc(nodes, out)
  const compOf = new Map<string, number>()
  comps.forEach((cs, i) => cs.forEach((t) => compOf.set(t, i)))
  // 묶음(SCC) 단위 DAG 의 최장 경로 = 단계. Tarjan 은 역위상 순으로 묶음을 내므로 뒤에서부터 훑으면 부모가 먼저
  const lvl = new Array<number>(comps.length).fill(0)
  for (let i = comps.length - 1; i >= 0; i--) {
    for (const t of comps[i])
      for (const c of out.get(t) ?? []) {
        const j = compOf.get(c)!
        if (j !== i) lvl[j] = Math.max(lvl[j], lvl[i] + 1)
      }
  }
  const byLevel = new Map<number, string[]>()
  comps.forEach((cs, i) => byLevel.set(lvl[i], [...(byLevel.get(lvl[i]) ?? []), ...cs]))
  const levels: Level[] = [...byLevel.keys()]
    .sort((a, b) => a - b)
    .map((level) => {
      const ts = byLevel.get(level)!.sort()
      const batches: string[][] = []
      for (let i = 0; i < ts.length; i += opts.parallel) batches.push(ts.slice(i, i + opts.parallel))
      return { level, batches }
    })
  return {
    levels,
    cycles: comps.filter((c) => c.length > 1),
    selfRefs: [...new Set(selfRefs)].sort(),
    order: levels.flatMap((l) => l.batches.flat()),
  }
}

const SAFE_ID = /^[A-Za-z_][A-Za-z0-9_$]*$/
// 이름이 안전하면 그대로(대소문자 접기는 DB 규칙대로), 아니면 큰따옴표 인용
export const qid = (s: string) => (SAFE_ID.test(s) ? s : `"${s.replace(/"/g, '""')}"`)
const NUMERIC = /^(NUMBER|NUMERIC|DECIMAL|DEC|INT|INTEGER|BIGINT|SMALLINT|INT[248]|FLOAT|FLOAT[48]|DOUBLE|REAL|MONEY|BINARY_(FLOAT|DOUBLE))\b/i
// ponytail: 합계는 숫자 칼럼 앞 10개만 — 넓은 테이블에서 문장 비대 방지, 더 필요하면 상한을 옵션으로
const SUM_CAP = 10

export type VerifySql = { tbl: string; count: string; sum: string | null; dupKey: string | null; hash: string | null }

export function verifySql(t: SnapTbl, d: Dialect): VerifySql {
  const tbl = qid(t.nm)
  const pk = t.cols.filter((c) => c.pk).map((c) => qid(c.nm))
  const nums = t.cols.filter((c) => !c.pk && NUMERIC.test(c.tp.trim())).slice(0, SUM_CAP)
  const sum = nums.length
    ? `SELECT COUNT(*) AS cnt, ${nums.map((c, i) => `SUM(${qid(c.nm)}) AS s${i + 1}`).join(', ')} FROM ${tbl};`
    : null
  const dupKey = pk.length
    ? `SELECT ${pk.join(', ')}, COUNT(*) AS cnt FROM ${tbl} GROUP BY ${pk.join(', ')} HAVING COUNT(*) > 1;`
    : null
  // 해시 = 키 집합 해시(원천·대상이 같은 PostgreSQL 일 때만 비교 가능). Oracle·Tibero 는 함수·문자 표현이 달라 생략(건수·합계·키 중복으로 대조)
  const hash =
    d === 'PG' && pk.length
      ? `SELECT md5(string_agg(concat_ws('|', ${pk.map((c) => `${c}::text`).join(', ')}), ',' ORDER BY ${pk.join(', ')})) AS key_hash FROM ${tbl};`
      : null
  return { tbl: t.nm, count: `SELECT COUNT(*) AS cnt FROM ${tbl};`, sum, dupKey, hash }
}

// 전체 스크립트(복사용) — 계획 순서대로
export function verifyScript(snap: Snapshot, order: string[], d: Dialect): string {
  const byNm = new Map(snap.tables.map((t) => [t.nm, t]))
  return order
    .map((nm) => {
      const v = verifySql(byNm.get(nm)!, d)
      return [`-- ${nm}`, v.count, v.sum, v.dupKey, v.hash].filter(Boolean).join('\n')
    })
    .join('\n\n')
}
