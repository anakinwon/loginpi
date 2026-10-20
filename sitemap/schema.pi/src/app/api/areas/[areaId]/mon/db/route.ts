// 데이터베이스 모니터링(2026-10-21) — GET ?conn=&min= : 등록 접속(PostgreSQL 서버 직접)의 지금 지표·활성 세션(읽기 전용 5초 제한) + 이력, 모니터링 보기 권한
// 접속 열기는 SQL 편집기와 같은 openConn(같은 분류체계·서버 직접·DA 아니면 조회 전용 계정·공인 주소·비밀번호 복호) — 화면이 열린 동안 1분 1행 기록
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, requireAreaRole } from '@/lib/api'
import { maskErr } from '@/lib/db-exec'
import { dbHist, dbSnapshot } from '@/lib/mon-srv'
import { openConn } from '@/lib/sql-run'

type Ctx = { params: Promise<{ areaId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'MON_VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const connId = sp.get('conn')
  if (!z.string().uuid().safeParse(connId).success) return apiError('INVALID_INPUT', 400)
  const min = Math.min(1440, Math.max(5, Number(sp.get('min')) || 60))
  const o = await openConn(areaId, connId!, auth.perms)
  if (o instanceof NextResponse) return o
  if (o.d !== 'PG') return apiError('MON_DB_PG_ONLY', 400)
  try {
    const now = await dbSnapshot(areaId, connId!, o.t, o.pwd).catch((e: unknown) => ({ err: maskErr(e instanceof Error ? e.message : e, [o.t.host, o.t.usr, o.t.db, o.pwd]) }))
    return NextResponse.json({ ok: true, now, hist: await dbHist(areaId, connId!, min) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
