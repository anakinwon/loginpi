// PC 도구 현황(/admin/tools) 공용 타입·상수·순수 함수 — API /api/admin/tools(view=summary·charts·rows)와 화면이 함께 쓴다(서버·클라이언트 겸용, 'use client' 아님)
//  원천 = mon_tool_snap(sql/022) · 업로더 scripts/tool-snap-push.mjs 페이로드
export const TOOL_KINDS = ['skill', 'agent', 'plugin', 'hook', 'mcp'] as const
export type ToolKind = (typeof TOOL_KINDS)[number]
export type ToolTab = 'all' | ToolKind

// 종류별 고정 색(차트·타일 공용) — dbms.pi 범주색 4종(다크 표면 검증) + 1
export const KIND_COLOR: Record<ToolKind, string> = {
  skill: '#3987e5',
  agent: '#d95926',
  plugin: '#199e70',
  hook: '#c98500',
  mcp: '#b4507a',
}

export const POLL_MS = 60_000
export const PAGE_SIZE = 20
export const TOP_N = 15
export const PC_MAX = 100 // = DB pc_nm VARCHAR(100)
export const Q_MAX = 100

export interface InstItem {
  type: ToolKind
  name: string
  src: string // user | project | plugin (플러그인 행은 설치 scope)
  plugin: string | null
  on?: boolean
  ver?: string | null
  inst?: string | null
  upd?: string | null
  event?: string
  matcher?: string | null
  kind?: string // MCP 연결 종류(stdio·http …)
}
export interface UseItem {
  type: ToolKind
  name: string
  turns: number
  calls: number
  errors: number
  avg_ms: number | null
}
export interface HookUse {
  event: string
  turns: number
  runs: number
}
export type Daily = { date: string; turns: number } & Record<ToolKind, number>

// 화면이 실제로 쓰는 건수 칼럼만(R-P3) — 설치 5종(KPI·증감), 사용 5종(KPI). actv_plugin_cnt·use_call_cnt 는 DB 에만 둔다
export const INST_CNT: Record<ToolKind, 'instl_skill_cnt' | 'instl_agent_cnt' | 'instl_plugin_cnt' | 'instl_hook_cnt' | 'instl_mcp_cnt'> = {
  skill: 'instl_skill_cnt',
  agent: 'instl_agent_cnt',
  plugin: 'instl_plugin_cnt',
  hook: 'instl_hook_cnt',
  mcp: 'instl_mcp_cnt',
}
export const USE_CNT: Record<ToolKind, 'use_skill_cnt' | 'use_agent_cnt' | 'use_plugin_cnt' | 'use_hook_cnt' | 'use_mcp_cnt'> = {
  skill: 'use_skill_cnt',
  agent: 'use_agent_cnt',
  plugin: 'use_plugin_cnt',
  hook: 'use_hook_cnt',
  mcp: 'use_mcp_cnt',
}
export const INST_COLS = Object.values(INST_CNT).join(', ')
export const USE_COLS = Object.values(USE_CNT).join(', ')

// 추이 1점 = 측정일시 + 설치 건수(증감 계산용)
export type TrendRow = { msrmt_dtm: string } & Record<(typeof INST_CNT)[ToolKind], number>
// 최신 1행 = PC명 + 측정일시 + 설치·사용 건수
export type LatestRow = TrendRow & { pc_nm: string } & Record<(typeof USE_CNT)[ToolKind], number>
export interface InstMeta {
  every_sec?: number
  usage_days?: number
  active?: Partial<Record<ToolKind, number>>
}
export interface InstDetail {
  meta?: InstMeta
  items?: InstItem[]
}
export interface UseDetail {
  from?: string
  to?: string
  turns?: number
  items?: UseItem[]
  hooks?: HookUse[]
  daily?: Daily[]
}

// view=summary — KPI·상태·추이(건수 칼럼만, 상세 jsonb 는 meta 경로만)
// 측정 고정값 — 하단 구획(그래프·표)은 이 값(pc·at·설치/사용 hash)으로만 조회해 같은 측정의 상세만 받는다
export interface SnapKey {
  pc: string
  at: string
  ih: string | null
  uh: string | null
}
export interface SummaryResp {
  latest: LatestRow | null
  snap: SnapKey | null
  trend: TrendRow[]
  meta: InstMeta | null
  now: string
}
// view=charts — 그래프용 요약(사용 상세에서 서버가 계산)
// missing = 최신 측정과 같은 내용(hash)의 상세 행이 없음 → 화면은 '상세 없음' 표시
export interface ChartsResp {
  at: string // 요청한 측정일시(되돌림)
  missing: boolean
  top: UseItem[]
  daily: Daily[]
  hooks: HookUse[]
  from: string | null
  to: string | null
  turns: number
}
// view=rows — 표 1페이지(서버에서 거르고 정렬·자름)
export interface RowsResp {
  items: ToolRow[]
  total: number
  page: number
  pageSize: number
  counts: Record<ToolTab, number>
  at?: string // 요청한 측정일시(되돌림)
  missing?: boolean
}

// 표 1행 = 설치 항목 + 사용 집계(없으면 null). 설치 목록에 없는 사용 기록은 src 'none'
export interface ToolRow {
  key: string
  type: ToolKind
  name: string
  src: string
  ver: string | null
  on: boolean | null
  detail: string | null // 훅 = 이벤트·matcher, MCP = 연결 종류, 그 밖 = 플러그인 소속
  turns: number | null
  calls: number | null
  errors: number | null
  avg_ms: number | null
}

// 설치 × 사용 연결 — 키 = 종류:이름 완전 일치. 플러그인은 name@marketplace 전체 키 우선,
//  사용 기록이 짧은 이름(@ 없음)이면 그 짧은 이름의 설치 플러그인이 하나뿐일 때만 연결(마켓플레이스가 다른 동명 플러그인 오연결 방지)
export function joinRows(inst: InstItem[], used: UseItem[]): ToolRow[] {
  const useMap = new Map(used.map((u) => [`${u.type}:${u.name}`, u]))
  const shortCnt = new Map<string, number>()
  for (const i of inst)
    if (i.type === 'plugin') {
      const s = i.name.split('@')[0]
      shortCnt.set(s, (shortCnt.get(s) ?? 0) + 1)
    }
  const hit = new Set<UseItem>()
  const rows: ToolRow[] = inst.map((i, n) => {
    let u: UseItem | undefined
    if (i.type !== 'hook') u = useMap.get(`${i.type}:${i.name}`)
    if (!u && i.type === 'plugin') {
      const s = i.name.split('@')[0]
      if (shortCnt.get(s) === 1) u = useMap.get(`plugin:${s}`)
    }
    if (u) hit.add(u)
    const detail =
      i.type === 'hook'
        ? [i.event, i.matcher].filter(Boolean).join(' · ')
        : i.type === 'mcp'
          ? (i.kind ?? null)
          : i.plugin
    return {
      key: `${i.type}:${i.src}:${i.name}:${n}`,
      type: i.type,
      name: i.name,
      src: i.src,
      ver: i.ver ?? null,
      on: i.on ?? null,
      detail: detail || null,
      turns: u?.turns ?? null,
      calls: u?.calls ?? null,
      errors: u?.errors ?? null,
      avg_ms: u?.avg_ms ?? null,
    }
  })
  for (const u of used)
    if (!hit.has(u))
      rows.push({
        key: `${u.type}:none:${u.name}`,
        type: u.type,
        name: u.name,
        src: 'none',
        ver: null,
        on: null,
        detail: null,
        turns: u.turns,
        calls: u.calls,
        errors: u.errors,
        avg_ms: u.avg_ms,
      })
  return rows
}

export const SORT_KEYS = ['name', 'type', 'src', 'turns', 'calls', 'errors', 'avg_ms'] as const
export type SortKey = (typeof SORT_KEYS)[number]
export const NUM_SORT: readonly SortKey[] = ['turns', 'calls', 'errors', 'avg_ms']

export interface RowQuery {
  tab: ToolTab
  q: string
  sort: SortKey
  desc: boolean
  page: number
  size: number
}

// 표 조회(서버) — 탭·이름/상세 부분일치 → 정렬(숫자 칼럼 null 은 방향 무관 맨 뒤) → 페이지 자르기. 탭 건수는 검색어 적용 후 종류별
export function queryRows(rows: ToolRow[], o: RowQuery): RowsResp {
  const needle = o.q.trim().toLowerCase()
  const matched = needle
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          (r.detail ?? '').toLowerCase().includes(needle),
      )
    : rows
  const counts: Record<ToolTab, number> = { all: matched.length, skill: 0, agent: 0, plugin: 0, hook: 0, mcp: 0 }
  for (const r of matched) counts[r.type]++
  const list = matched.filter((r) => o.tab === 'all' || r.type === o.tab)
  const num = NUM_SORT.includes(o.sort)
  list.sort((a, b) => {
    if (num) {
      const x = a[o.sort] as number | null
      const y = b[o.sort] as number | null
      if (x == null || y == null)
        return x == null ? (y == null ? a.name.localeCompare(b.name) : 1) : -1
      return (o.desc ? y - x : x - y) || a.name.localeCompare(b.name)
    }
    const c = String(a[o.sort]).localeCompare(String(b[o.sort]))
    return o.desc ? -c : c
  })
  const last = Math.max(1, Math.ceil(list.length / o.size))
  const page = Math.min(o.page, last)
  return {
    items: list.slice((page - 1) * o.size, page * o.size),
    total: list.length,
    page,
    pageSize: o.size,
    counts,
  }
}
