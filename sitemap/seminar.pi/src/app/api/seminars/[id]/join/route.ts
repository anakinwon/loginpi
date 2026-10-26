// 무료 세미나 입장 등록 — POST. fn_join_smn(smn_id, usr_id, null) 이 세미나 행 잠금 후 상태·중복·정원 판정(R-P5, PRD D-5·D-6).
//  유료 세미나는 PAY_REQUIRED(402) — 결제 흐름(/api/payments/*)이 complete 에서 등록한다. 비로그인 401(redirect 없음)
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, requireUser } from '@/lib/api'
import { isUuid, joinError } from '@/lib/seminar-rules'

type ApiCode = Parameters<typeof apiError>[0]

export const POST = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const [user, { id }] = await Promise.all([
      requireUser(req),
      (ctx as { params: Promise<{ id: string }> }).params,
    ])
    if (user instanceof NextResponse) return user
    if (!isUuid(id)) return apiError('NOT_FOUND', 404)
    const { data, error } = await db()
      .rpc('fn_join_smn', { p_smn_id: id, p_usr_id: user.id, p_pymnt_id: null })
    if (error) return dbFail(error)
    const r = (data as { rslt_cd: string; ptc_id: string | null }[] | null)?.[0]
    const e = joinError(r?.rslt_cd)
    if (e) return apiError(e.code as ApiCode, e.status)
    return NextResponse.json(
      { ok: true, ptcId: r?.ptc_id, already: r?.rslt_cd === 'ALREADY' },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }),
)
