// 진단 이력(PRD 12 §9) — GET /api/ops/runs?link=&conn=&page= (판정 건수만, 10건 단위) / ?latest=1 또는 ?id= (판정 JSON 포함 1건)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { db, dbFail, dbRoute } from '@/lib/api'
import { opsParams } from '@/lib/ops/server'

const PAGE = 10
type RunRow = { run_id: string; run_dtm: string; ok_cnt: number; warn_cnt: number; risk_cnt: number; rslt_json?: unknown }
const toItem = (r: RunRow) => ({ runId: r.run_id, runDtm: r.run_dtm, ok: r.ok_cnt, warn: r.warn_cnt, risk: r.risk_cnt })

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const p = await opsParams(req, sp.get('link'), sp.get('conn'))
    if (p instanceof NextResponse) return p

    const id = sp.get('id')
    if (id || sp.get('latest')) {
      let q = db()
        .from('dbm_ops_run')
        .select('run_id, run_dtm, ok_cnt, warn_cnt, risk_cnt, rslt_json')
        .eq('lnk_id', p.linkId)
        .eq('conn_id', p.connId)
        .eq('del_yn', 'N')
      if (id) {
        if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'INVALID_INPUT', code: 'INVALID_INPUT' }, { status: 400 })
        q = q.eq('run_id', id)
      }
      const { data, error } = await q.order('run_dtm', { ascending: false }).limit(1).maybeSingle()
      if (error) return dbFail(error)
      const r = data as RunRow | null
      return NextResponse.json({ run: r ? { ...toItem(r), rslt: r.rslt_json } : null })
    }

    const page = Math.max(1, Math.min(1000, Number(sp.get('page')) || 1))
    const { data, error } = await db()
      .from('dbm_ops_run')
      .select('run_id, run_dtm, ok_cnt, warn_cnt, risk_cnt')
      .eq('lnk_id', p.linkId)
      .eq('conn_id', p.connId)
      .eq('del_yn', 'N')
      .order('run_dtm', { ascending: false })
      .range((page - 1) * PAGE, page * PAGE) // PAGE+1 건 — 다음 페이지 여부
    if (error) return dbFail(error)
    const rows = data as RunRow[]
    return NextResponse.json({ items: rows.slice(0, PAGE).map(toItem), page, hasMore: rows.length > PAGE })
  }),
)
