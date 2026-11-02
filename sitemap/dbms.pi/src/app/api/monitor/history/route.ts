// GET /api/monitor/history?link=&conn=&range=30|60|360|1440 — 보드 추이 이력(dbm_mon_snap, sql/031) : 차트가 쓰는 칼럼만, 오름차순, 최대 1500행(24시간×60 + 여유)
//  PostgREST max-rows(기본 1000) 아래로 1000행씩 나눠 최신부터 읽고(내림차순 range, Promise.all) 뒤집는다 — 잘려도 최근 구간이 남는다
//  Δ(tps·롤백률·캐시 적중률)는 화면이 signals.ts deltas()·levelsByBucket() 으로 계산
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { db, dbFail, dbRoute } from '@/lib/api'
import { SNAP_COLS, toSnapRow } from '@/lib/monitor/board-server'
import { isPeriod } from '@/lib/monitor/rules'
import { linkGate } from '@/lib/monitor/server'
import type { HistoryRes } from '@/lib/monitor/signals'

const LIMIT = 1500
const PAGE = 1000

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const range = Number(sp.get('range') ?? 60)
    const connId = sp.get('conn')
    if (!isPeriod(range) || !connId || connId.length > 100)
      return NextResponse.json(
        { error: 'INVALID_INPUT', code: 'INVALID_INPUT' },
        { status: 400 },
      )
    const g = await linkGate(req, sp.get('link'), 'MON')
    if (g instanceof NextResponse) return g
    const since = new Date(Date.now() - range * 60_000).toISOString()
    const page = (from: number) =>
      db()
        .from('dbm_mon_snap')
        .select(SNAP_COLS)
        .eq('lnk_id', g.linkId)
        .eq('conn_id', connId)
        .eq('del_yn', 'N')
        .gte('bkt_dtm', since)
        .order('bkt_dtm', { ascending: false })
        .range(from, Math.min(from + PAGE, LIMIT) - 1)
    // 1분 1행이라 range 분 수가 곧 최대 행 수 — 1000 이하면 1회만
    const froms = range > PAGE ? [0, PAGE] : [0]
    const pages = await Promise.all(froms.map(page))
    const bad = pages.find((p) => p.error)
    if (bad?.error) return dbFail(bad.error)
    const data = pages.flatMap(
      (p) => (p.data ?? []) as Record<string, unknown>[],
    )
    const res: HistoryRes = {
      range,
      rows: data.reverse().map(toSnapRow),
      at: new Date().toISOString(),
    }
    return NextResponse.json(res, { headers: { 'Cache-Control': 'no-store' } })
  }),
)
