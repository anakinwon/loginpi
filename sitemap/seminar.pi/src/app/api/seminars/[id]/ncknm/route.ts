// 세미나 별명 API(sql/014) — PUT {name} : 이 세미나 안에서 내 표시명을 저장·수정(참가 자격 = engage gate : 개최자·ADMIN·참가자, 무료는 누구나).
//  입장권 발급(api/media/ticket)이 별명을 표시명으로 실어 늦게 들어온 사람·재접속에도 같은 이름이 보인다
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody, requireUser } from '@/lib/api'
import { gate } from '@/lib/engage'
import { isUuid, NCKNM_MAX, ONE_LINE_RE } from '@/lib/seminar-rules'

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .regex(ONE_LINE_RE)
    .refine((v) => [...v].length <= NCKNM_MAX),
})

export const PUT = withAuthGuard(
  dbRoute(async (req, ctx) => {
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params
    if (!isUuid(id)) return apiError('NOT_FOUND', 404)
    const [user, body] = await Promise.all([requireUser(req), parseBody(req, schema)])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    const g = await gate(id, user)
    if (g instanceof NextResponse) return g
    const { error } = await db()
      .from('smn_ncknm')
      .upsert(
        { smn_id: id, usr_id: user.id, ncknm: body.name, del_yn: 'N', del_dtm: null, regr_id: user.id, modr_id: user.id, mod_dtm: new Date().toISOString() },
        { onConflict: 'smn_id,usr_id' },
      )
    if (error) return dbFail(error)
    return NextResponse.json({ name: body.name }, { headers: { 'Cache-Control': 'no-store' } })
  }),
)
