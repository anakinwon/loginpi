// SQL 튜닝 랩 AI 튜닝 권고 순수 로직(PRD 12 §2-4) — 규칙 권고(계획 경고·SQL 점검 → 권고 코드), AI 출력 검증, 상태 전이, 효과 계산.
//  서버·클라이언트 공용(의존 없음). 규칙 권고는 문구 대신 code·params 만 담고 화면이 sqlLab.ai.rule.<code> 로 번역. 시험 : node --test src/lib/sql-lab/tune.test.mjs
import { analyzePlan, walk, type PlanNode } from './plan.ts'
import { lintSql } from './lint.ts'

export const TUN_KINDS = ['INDEX', 'REWRITE', 'STATS', 'CONFIG'] as const
export type TunKind = (typeof TUN_KINDS)[number]
export type TunStatus = 'RCMD' | 'APRV' | 'RJCT' | 'APLD'
export type TunAct = 'approve' | 'reject' | 'measure'

// code 있음 = 규칙 권고(번역), 없음 = AI 권고(title·reason 원문)
export type TunItem = {
  kind: TunKind
  code?: string
  params?: Record<string, string>
  title?: string
  reason?: string
  ddl?: string
  sql?: string
}

export const TUN_LIMITS = {
  items: 8,
  title: 120,
  reason: 600,
  ddl: 1000,
  sql: 4000,
}

// 조건식에서 첫 칼럼명 — "(amt > ?)" · "((status)::text = '?'::text)" → amt · status
export function filterColumn(filter: unknown): string | null {
  if (typeof filter !== 'string') return null
  const m = filter.match(
    /\(*\s*"?([a-z_][a-z0-9_]*)"?\)?(?:::\w+)?\s*(?:=|<>|!=|<=|>=|<|>|~~\*?|IN\b|IS\b)/i,
  )
  return m ? m[1].toLowerCase() : null
}

// 계획 경고 + SQL 점검 → 규칙 권고(중복 제거, 최대 TUN_LIMITS.items)
export function ruleRecommend(sql: string, plan: PlanNode): TunItem[] {
  const out: TunItem[] = []
  const seen = new Set<string>()
  const push = (it: TunItem) => {
    const k = `${it.code}:${JSON.stringify(it.params ?? {})}`
    if (!seen.has(k) && out.length < TUN_LIMITS.items)
      (seen.add(k), out.push(it))
  }
  const nodes = new Map(walk(plan).map(([n, p]) => [p, n]))
  for (const w of analyzePlan(plan)) {
    if (w.code === 'SEQ_SCAN_LARGE' && w.relation) {
      const col = filterColumn(nodes.get(w.path)?.Filter)
      push(
        col
          ? {
              kind: 'INDEX',
              code: 'SEQ_SCAN_INDEX',
              params: { relation: w.relation, column: col },
              ddl: `CREATE INDEX x_${w.relation}_NN ON ${w.relation} (${col});`,
            }
          : {
              kind: 'STATS',
              code: 'SEQ_SCAN_STATS',
              params: { relation: w.relation },
            },
      )
    } else if (w.code === 'NESTED_LOOP_HIGH')
      push({
        kind: 'STATS',
        code: 'NESTED_LOOP',
        params: { rows: String(w.rows) },
      })
    else if (w.code === 'SORT_SPILL')
      push({
        kind: 'CONFIG',
        code: 'SORT_SPILL',
        params: { kb: String(w.kb ?? 0) },
      })
  }
  // LEADING_WILDCARD 는 넣지 않음 — 저장 SQL 은 상수 마스킹('%abc' → '?')이라 앞 % 여부를 알 수 없다
  for (const i of lintSql(sql)) {
    const params: Record<string, string> = i.column ? { column: i.column } : {}
    if (i.code === 'SELECT_STAR') push({ kind: 'REWRITE', code: 'SELECT_STAR' })
    else if (i.code === 'FUNC_ON_COLUMN')
      push({ kind: 'REWRITE', code: 'FUNC_ON_COLUMN', params })
    else if (i.code === 'IMPLICIT_CAST' || i.code === 'DOMAIN_MISMATCH')
      push({ kind: 'REWRITE', code: 'IMPLICIT_CAST', params })
    else if (i.code === 'NOT_IN_SUBQUERY')
      push({ kind: 'REWRITE', code: 'NOT_IN_SUBQUERY' })
    else if (i.code === 'OR_DIFF_COLUMNS')
      push({ kind: 'REWRITE', code: 'OR_DIFF_COLUMNS' })
  }
  return out
}

const str = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined

// AI 출력(신뢰 경계) 검증 — 형식이 틀린 항목은 버린다. ddl 은 CREATE INDEX·ANALYZE 한 문장·한 줄만
//  (끝 ';' 하나만 허용 — 중간 ';'·줄바꿈은 다중 문장 우회로 보고 버림. 화면에서 schema.pi DDL 실행에 붙여넣기 때문)
export function parseAiItems(raw: unknown): TunItem[] {
  const arr =
    raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : []
  const out: TunItem[] = []
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const kind = TUN_KINDS.find((k) => k === o.kind)
    const title = str(o.title, TUN_LIMITS.title)
    const reason = str(o.reason, TUN_LIMITS.reason)
    if (!kind || !title || !reason) continue
    const ddl = str(o.ddl, TUN_LIMITS.ddl)
    const it: TunItem = { kind, title, reason }
    if (
      ddl &&
      /^\s*(CREATE\s+(UNIQUE\s+)?INDEX|ANALYZE)\b[^;\r\n]*;?\s*$/i.test(ddl)
    )
      it.ddl = ddl
    const sql = str(o.sql, TUN_LIMITS.sql)
    if (sql) it.sql = sql
    out.push(it)
    if (out.length >= TUN_LIMITS.items) break
  }
  return out
}

// 상태 전이 — 승인·반려는 권고 상태에서만, 측정(적용 완료)은 승인 뒤에만(P42 : 측정 없이 적용 완료 불가)
export function nextStatus(cur: TunStatus, act: TunAct): TunStatus | null {
  if (cur === 'RCMD' && act === 'approve') return 'APRV'
  if (cur === 'RCMD' && act === 'reject') return 'RJCT'
  if (cur === 'APRV' && act === 'measure') return 'APLD'
  return null
}

// 효과(%) — 음수 = 비용 감소(개선). 전 비용 0 이면 계산 불가
export function effectPct(bfr: number, aft: number): number | null {
  return bfr > 0 ? Math.round(((aft - bfr) / bfr) * 1000) / 10 : null
}

// API 응답 칼럼(목록·생성·상태 변경 공용 — R-P3 쓰는 칼럼만, sql_hash = 화면이 같은 SQL 후 계획 후보를 고를 때)
export const TUN_COLS =
  'tun_id, conn_id, plan_id, sql_hash, engn_cd, rcmd_json, tun_sts_cd, bfr_cost, aprv_dtm, aft_plan_id, aft_cost, msr_dtm, reg_dtm'

// 후 계획 검증(서버 PATCH measure·화면 후보 필터 공용) — 같은 접속(conn_id)·같은 SQL·전 계획 아님·승인 이후 저장
//  sql_hash 는 SQL 정규화본만의 해시라 접속과 무관 → 다른 접속(예 개발 DB)의 계획으로 측정되지 않게 conn_id 도 맞춘다(P42)
type PlanRef = { plan_id: string; conn_id: string; sql_hash: string }
export function aftPlanError(
  tun: PlanRef & { aprv_dtm: string | null },
  aft: PlanRef & { reg_dtm: string },
): 'TUN_PLAN_MISMATCH' | 'TUN_PLAN_STALE' | null {
  if (
    aft.conn_id !== tun.conn_id ||
    aft.sql_hash !== tun.sql_hash ||
    aft.plan_id === tun.plan_id
  )
    return 'TUN_PLAN_MISMATCH'
  // 문자열 비교 금지 — PG(+00:00·마이크로초)와 JS(Z·밀리초) 표기가 달라 시각으로 비교
  if (tun.aprv_dtm && Date.parse(aft.reg_dtm) < Date.parse(tun.aprv_dtm))
    return 'TUN_PLAN_STALE'
  return null
}
