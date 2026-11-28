// 관리자 PC 도구 현황 API — mon_tool_snap(sql/022) 조회, isAdmin 게이트(401/403), 실시간 화면이라 no-store. 쓰기는 로컬 업로더 scripts/tool-snap-push.mjs 만(service_role)
//  GET ?view=summary[&pc=] : 최신 1행(PC명·측정일시·설치/사용 건수) + 같은 PC 최근 288행 추이(측정일시·설치 건수만) + 그 측정의 meta(주기·종류별 활성 건수)
//                            + snap = 측정 고정값 (pc, at, ih, uh) — 하단 구획은 이 값으로만 조회한다(c4 D-012)
//  GET ?view=charts&pc=&at=&uh=                       : 넘겨받은 사용 hash 의 상세 → 사용 상위 15·일별 추이·훅 이벤트별 실행
//  GET ?view=rows&pc=&at=&ih=&uh=&type=&q=&sort=&desc=&page=&size= : 넘겨받은 설치·사용 hash 의 상세를 결합해 서버에서 거르고 정렬·잘라 1페이지만
//  상세 jsonb = 내용 주소 방식(업로더가 모든 행에 meta.hash, 바뀐 행만 전체 상세) → hash 가 같은 '상세가 있는 가장 최근 행'만 읽고 최신 재선택은 하지 않는다.
//  그런 행이 없으면 missing(상세 없음). 응답에 요청한 at 을 되돌려 화면이 다른 측정의 응답을 버리게 한다. 조회마다 2초 상한(R-P4), 독립 조회는 병렬(R-P1)
import { NextResponse, type NextRequest } from 'next/server'
import { withGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, pageParam, requireAdmin, sizeParam } from '@/lib/api'
import {
  INST_COLS,
  PAGE_SIZE,
  PC_MAX,
  Q_MAX,
  SORT_KEYS,
  TOOL_KINDS,
  TOP_N,
  USE_COLS,
  joinRows,
  queryRows,
  type ChartsResp,
  type InstDetail,
  type InstMeta,
  type LatestRow,
  type RowsResp,
  type SortKey,
  type SummaryResp,
  type ToolTab,
  type TrendRow,
  type UseDetail,
} from '@/tools/types'

export const dynamic = 'force-dynamic'

const TREND_MAX = 288
const TIMEOUT_MS = 2000
const NO_STORE = { 'Cache-Control': 'no-store' }
// 파라미터 화이트리스트 — 측정일시(ISO 8601, PostgREST timestamptz 형식 포함)·hash(16진 8~64자)
const AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
const HASH_RE = /^[0-9a-f]{8,64}$/
type DbErr = { code?: string; message?: string }

const snap = () => db().from('mon_tool_snap')
const signal = () => AbortSignal.timeout(TIMEOUT_MS)

// hash 가 같은 '상세가 있는(items 있음) 가장 최근 행'의 jsonb(또는 경로). hash 없음 = 조회 없이 null
async function detailByHash<T>(pc: string, col: 'instl_dtl_val' | 'use_dtl_val', hash: string | null, sel: string) {
  if (!hash) return { data: null as T | null, error: null as DbErr | null }
  const { data, error } = await snap()
    .select(sel)
    .eq('pc_nm', pc)
    .eq('del_yn', 'N')
    .eq(`${col}->meta->>hash`, hash)
    .not(`${col}->items`, 'is', null)
    .order('msrmt_dtm', { ascending: false })
    .limit(1)
    .abortSignal(signal())
    .maybeSingle()
  return { data: data as T | null, error: error as DbErr | null }
}

export const GET = withGuard(
  dbRoute(async (req: NextRequest) => {
    const admin = await requireAdmin(req)
    if (admin instanceof NextResponse) return admin
    const sp = req.nextUrl.searchParams
    const view = sp.get('view') ?? 'summary'
    const pcIn = sp.get('pc')?.trim()
    if (pcIn !== undefined && (!pcIn || pcIn.length > PC_MAX)) return apiError('INVALID_INPUT', 400)

    if (view === 'summary') {
      // 1단계 : 최신 1행(PC 지정 시 그 PC, 설치·사용 hash 포함) → 2단계 : 같은 PC 추이·그 설치 hash 의 meta 병렬
      let q = snap()
        .select(`pc_nm, msrmt_dtm, ${INST_COLS}, ${USE_COLS}, ih:instl_dtl_val->meta->>hash, uh:use_dtl_val->meta->>hash`)
        .eq('del_yn', 'N')
      if (pcIn) q = q.eq('pc_nm', pcIn)
      const latest = await q.order('msrmt_dtm', { ascending: false }).limit(1).abortSignal(signal()).maybeSingle()
      if (latest.error) return dbFail(latest.error)
      const got = latest.data as unknown as (LatestRow & { ih: string | null; uh: string | null }) | null
      const body: SummaryResp = { latest: null, snap: null, trend: [], meta: null, now: new Date().toISOString() }
      if (got) {
        const { ih, uh, ...row } = got
        body.latest = row
        body.snap = { pc: row.pc_nm, at: row.msrmt_dtm, ih, uh }
        const [trend, meta] = await Promise.all([
          snap()
            .select(`msrmt_dtm, ${INST_COLS}`)
            .eq('pc_nm', row.pc_nm)
            .eq('del_yn', 'N')
            .lte('msrmt_dtm', row.msrmt_dtm) // 기준 측정 이후 행 제외 — 요약 최신 행과 추이 마지막 행이 같은 측정(c4 D-011)
            .order('msrmt_dtm', { ascending: false })
            .limit(TREND_MAX)
            .abortSignal(signal()),
          detailByHash<{ meta: InstMeta | null }>(row.pc_nm, 'instl_dtl_val', ih, 'meta:instl_dtl_val->meta'),
        ])
        if (trend.error) return dbFail(trend.error)
        if (meta.error) return dbFail(meta.error)
        body.trend = ((trend.data ?? []) as unknown as TrendRow[]).reverse() // 측정일시 오름차순(그래프 축)
        body.meta = meta.data?.meta ?? null
      }
      return NextResponse.json(body, { headers: NO_STORE })
    }

    if (view !== 'charts' && view !== 'rows') return apiError('INVALID_INPUT', 400)
    // 측정 고정값 — pc·at 필수, hash 는 있으면 형식 검사(없으면 그 상세는 missing)
    const at = sp.get('at') ?? ''
    const ih = sp.get('ih') || null
    const uh = sp.get('uh') || null
    if (!pcIn || !AT_RE.test(at) || (ih && !HASH_RE.test(ih)) || (uh && !HASH_RE.test(uh))) return apiError('INVALID_INPUT', 400)

    if (view === 'charts') {
      const use = await detailByHash<{ use_dtl_val: UseDetail }>(pcIn, 'use_dtl_val', uh, 'use_dtl_val')
      if (use.error) return dbFail(use.error)
      const u = use.data?.use_dtl_val
      const body: ChartsResp = {
        at,
        missing: !u,
        top: [...(u?.items ?? [])].sort((a, b) => b.calls - a.calls).slice(0, TOP_N),
        daily: u?.daily ?? [],
        hooks: u?.hooks ?? [],
        from: u?.from ?? null,
        to: u?.to ?? null,
        turns: u?.turns ?? 0,
      }
      return NextResponse.json(body, { headers: NO_STORE })
    }

    // view=rows — 입력 검증(화이트리스트·길이) 후 설치·사용 상세 병렬 조회
    const tab = (sp.get('type') ?? 'all') as ToolTab
    const sort = (sp.get('sort') ?? 'calls') as SortKey
    const q = sp.get('q') ?? ''
    if ((tab !== 'all' && !TOOL_KINDS.includes(tab)) || !SORT_KEYS.includes(sort) || q.length > Q_MAX)
      return apiError('INVALID_INPUT', 400)
    const [inst, use] = await Promise.all([
      detailByHash<{ instl_dtl_val: InstDetail }>(pcIn, 'instl_dtl_val', ih, 'instl_dtl_val'),
      detailByHash<{ use_dtl_val: UseDetail }>(pcIn, 'use_dtl_val', uh, 'use_dtl_val'),
    ])
    if (inst.error) return dbFail(inst.error)
    if (use.error) return dbFail(use.error)
    const instItems = inst.data?.instl_dtl_val.items
    const useItems = use.data?.use_dtl_val.items
    // 이 측정과 같은 내용의 상세가 하나라도 없으면 '상세 없음'(다른 측정의 행을 섞어 보이지 않음)
    const missing = !instItems || !useItems
    const body: RowsResp = {
      ...queryRows(missing ? [] : joinRows(instItems, useItems), {
        tab,
        q,
        sort,
        desc: sp.get('desc') !== '0',
        page: pageParam(req),
        size: sizeParam(req, PAGE_SIZE),
      }),
      at,
      missing,
    }
    return NextResponse.json(body, { headers: NO_STORE })
  }),
)
