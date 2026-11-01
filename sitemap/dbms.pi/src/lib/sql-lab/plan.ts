// SQL 튜닝 랩 실행계획 순수 로직(PRD 12 §2-1·2-2) — EXPLAIN (FORMAT JSON) 결과 파싱·경고 산출·두 계획 비교·상수 마스킹.
//  서버·클라이언트 공용(의존 없음). 시험 : node --test src/lib/sql-lab/plan.test.mjs

export type PlanNode = {
  'Node Type': string
  'Relation Name'?: string
  'Index Name'?: string
  'Join Type'?: string
  'Startup Cost'?: number
  'Total Cost'?: number
  'Plan Rows'?: number
  'Plan Width'?: number
  Plans?: PlanNode[]
  [key: string]: unknown
}

export type PlanWarning = {
  code: 'SEQ_SCAN_LARGE' | 'NESTED_LOOP_HIGH' | 'SORT_SPILL'
  path: string // 노드 위치(0 = 최상위, 0.1 = 최상위의 둘째 자식)
  nodeType: string
  relation?: string
  rows: number
  kb?: number
}

export type PlanDiff = {
  costA: number
  costB: number
  delta: number
  pct: number | null
  // 같은 테이블의 접근 방식 변화(Seq Scan → Index Scan 등)
  scanChanges: { relation: string; a: string; b: string }[]
  // 노드 종류별 개수 변화
  typeChanges: { nodeType: string; a: number; b: number }[]
}

// 경고 기준 — 조정 손잡이(운영 실측 후 변경)
export const PLAN_LIMITS = {
  seqScanRows: 10_000, // 이 행 수 이상 전체 스캔이면 경고
  nestedLoopRows: 10_000, // 중첩 루프 결과 행 수 상한
  sortKb: 4 * 1024, // PostgreSQL work_mem 기본 4MB — 넘으면 디스크 정렬 가능
}

// 대량 계획 방어 — 노드 수 상한(그 이상은 잘라서 처리)
const MAX_NODES = 2000

// EXPLAIN 결과(rows[0][0]) → 최상위 노드. 문자열·배열·{Plan} 모두 받는다. 해석 불가면 null
export function parsePlan(raw: unknown): PlanNode | null {
  let v = raw
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      return null
    }
  }
  if (Array.isArray(v)) v = v[0]
  if (v && typeof v === 'object' && 'Plan' in v) v = (v as { Plan: unknown }).Plan
  if (!v || typeof v !== 'object' || typeof (v as PlanNode)['Node Type'] !== 'string') return null
  return v as PlanNode
}

// 깊이 우선 순회 — [노드, 경로]
export function walk(root: PlanNode): [PlanNode, string][] {
  const out: [PlanNode, string][] = []
  const stack: [PlanNode, string][] = [[root, '0']]
  while (stack.length && out.length < MAX_NODES) {
    const [node, path] = stack.pop()!
    out.push([node, path])
    const kids = Array.isArray(node.Plans) ? node.Plans : []
    for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i], `${path}.${i}`])
  }
  return out
}

export function analyzePlan(root: PlanNode): PlanWarning[] {
  const warns: PlanWarning[] = []
  for (const [n, path] of walk(root)) {
    const nodeType = n['Node Type']
    const rows = Number(n['Plan Rows'] ?? 0)
    const relation = n['Relation Name']
    if (nodeType === 'Seq Scan' && rows >= PLAN_LIMITS.seqScanRows)
      warns.push({ code: 'SEQ_SCAN_LARGE', path, nodeType, relation, rows })
    else if (nodeType === 'Nested Loop' && rows >= PLAN_LIMITS.nestedLoopRows)
      warns.push({ code: 'NESTED_LOOP_HIGH', path, nodeType, rows })
    else if (nodeType === 'Sort' || nodeType === 'Incremental Sort') {
      const kb = Math.round((rows * Number(n['Plan Width'] ?? 0)) / 1024)
      if (kb > PLAN_LIMITS.sortKb) warns.push({ code: 'SORT_SPILL', path, nodeType, rows, kb })
    }
  }
  return warns
}

export const totalCost = (root: PlanNode) => Number(root['Total Cost'] ?? 0)

export function diffPlans(a: PlanNode, b: PlanNode): PlanDiff {
  const costA = totalCost(a)
  const costB = totalCost(b)
  const scans = (root: PlanNode) => {
    const m = new Map<string, string>()
    for (const [n] of walk(root)) {
      const rel = n['Relation Name']
      if (rel && !m.has(rel)) m.set(rel, n['Node Type'])
    }
    return m
  }
  const types = (root: PlanNode) => {
    const m = new Map<string, number>()
    for (const [n] of walk(root)) m.set(n['Node Type'], (m.get(n['Node Type']) ?? 0) + 1)
    return m
  }
  const [sa, sb, ta, tb] = [scans(a), scans(b), types(a), types(b)]
  const scanChanges = [...new Set([...sa.keys(), ...sb.keys()])]
    .map((relation) => ({ relation, a: sa.get(relation) ?? '-', b: sb.get(relation) ?? '-' }))
    .filter((c) => c.a !== c.b)
  const typeChanges = [...new Set([...ta.keys(), ...tb.keys()])]
    .map((nodeType) => ({ nodeType, a: ta.get(nodeType) ?? 0, b: tb.get(nodeType) ?? 0 }))
    .filter((c) => c.a !== c.b)
  return {
    costA,
    costB,
    delta: costB - costA,
    pct: costA ? Math.round(((costB - costA) / costA) * 1000) / 10 : null,
    scanChanges,
    typeChanges,
  }
}

// 상수 마스킹 — 문자열 '...' → '?', 독립 숫자 → ? (계약 A3 : 고객 값 저장 금지 — 저장 전 SQL·계획 조건식에 적용)
export function maskLiterals(s: string): string {
  return s
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "'?'") // 달러 인용 $tag$…$tag$ (DA 검토 m2)
    .replace(/'(?:[^']|'')*'/g, "'?'").replace(/(?<![\w.$])-?\d+(?:\.\d+)?(?![\w.])/g, '?')
}

// 계획 JSON 의 문자열 값 전체 마스킹(조건식 Filter·Index Cond 등에 상수가 들어 있음). 노드 종류·이름엔 상수가 없다
export function maskPlan(node: PlanNode): PlanNode {
  const visit = (v: unknown): unknown => {
    if (typeof v === 'string') return maskLiterals(v)
    if (Array.isArray(v)) return v.map(visit)
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'Node Type' ? x : visit(x)]))
    return v
  }
  return visit(node) as PlanNode
}

// 같은 SQL 판정용 정규화(공백·대소문자·끝 세미콜론) — 해시 입력
export const normalizeSql = (sql: string) =>
  maskLiterals(sql).replace(/\s+/g, ' ').replace(/;\s*$/, '').trim().toLowerCase()

// 1문장 SELECT/WITH 인지 사전 확인(정본 검사는 schema.pi). 문자열·주석 속 ';' 는 무시
export function isSingleSelect(sql: string): boolean {
  const s = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .trim()
    .replace(/;\s*$/, '')
  return /^(select|with)\b/i.test(s) && !s.includes(';')
}
