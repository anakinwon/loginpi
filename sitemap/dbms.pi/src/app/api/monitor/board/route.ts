// GET /api/monitor/board?link=&conn=&tier=fast|slow&force=1 — 모니터링 관문 보드(감시 신호 14개). fast = db_stats·activity·version(50초 캐시),
//  slow = top_sql·tbl·idx·sizes·archiver·replication + schema.pi 요약(270초 캐시, conn 없으면 URL·연계 상태만). 캐시는 소유 확인 뒤에만 읽는다
//  fast 캐시 미스 + 세 조회 성공일 때만 after() 로 dbm_mon_snap 1행 upsert(분 절삭, 같은 분 중복 무시)
import { after, NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { dbRoute } from '@/lib/api'
import {
  buildFast,
  buildSlow,
  cacheGet,
  cacheKey,
  cacheSet,
  TTL,
  writeSnap,
  type FastHit,
} from '@/lib/monitor/board-server'
import { linkFail, linkGate } from '@/lib/monitor/server'
import { hasTransient, type BoardSlow } from '@/lib/monitor/signals'
import { LinkError } from '@/lib/link/client'

const bad = () =>
  NextResponse.json(
    { error: 'INVALID_INPUT', code: 'INVALID_INPUT' },
    { status: 400 },
  )
const NO_STORE = { headers: { 'Cache-Control': 'no-store' } }

export const GET = withGuard(
  dbRoute(async (req) => {
    const sp = req.nextUrl.searchParams
    const tier = sp.get('tier') ?? 'fast'
    const connId = sp.get('conn') || null
    const force = sp.get('force') === '1'
    if (
      (tier !== 'fast' && tier !== 'slow') ||
      (connId && connId.length > 100) ||
      (tier === 'fast' && !connId)
    )
      return bad()
    const g = await linkGate(req, sp.get('link'))
    if (g instanceof NextResponse) return g
    const fastKey = cacheKey(g.linkId, connId, 'fast')

    if (tier === 'fast') {
      const c = cacheGet<FastHit>(fastKey, force)
      if (c) return NextResponse.json(c.res, NO_STORE)
      const r = await buildFast(g.linkId, connId!)
      if (r instanceof LinkError) return linkFail(r)
      cacheSet(fastKey, TTL.fast, r.hit)
      const snap = r.snap
      if (snap) after(() => writeSnap(g.linkId, connId!, g.usrId, snap))
      return NextResponse.json(r.hit.res, NO_STORE)
    }

    const slowKey = cacheKey(g.linkId, connId, 'slow')
    const c = cacheGet<BoardSlow>(slowKey, force)
    if (c) return NextResponse.json(c, NO_STORE)
    const r = await buildSlow(
      g.linkId,
      connId,
      connId ? cacheGet<FastHit>(fastKey) : null,
    )
    if (r instanceof LinkError) return linkFail(r)
    // 일부 조회 실패(일시 오류)면 짧게만 캐시 — 5분간 '확인 불가' 고정 방지
    cacheSet(slowKey, hasTransient(r.errors) ? TTL.slowPartial : TTL.slow, r)
    return NextResponse.json(r, NO_STORE)
  }),
)
