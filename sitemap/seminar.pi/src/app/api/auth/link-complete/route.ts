// 연동 완료 — POST /api/auth/link-complete { code }. Google(NextAuth) 세션 필수, 아직 연동되지 않은 Google 만.
//  유효 코드(미사용·미만료) → sys_usr_auth_lnk(usr_id ↔ Google sub) 생성 → 코드 사용 처리.
//  성공 후 클라이언트는 useSession().update() 로 JWT 의 userId 를 재조회한다(src/auth.ts jwt trigger='update').
// ponytail: 두 UPDATE/INSERT 가 한 트랜잭션이 아니다 — 동시 입력은 UNIQUE(23505)로 한쪽만 성립. 분쟁 생기면 RPC 로 묶는다
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { auth, googleEnabled } from '@/auth'
import { apiError, db, dbFail, dbRoute, parseBody } from '@/lib/api'

const bodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
})

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    if (!googleEnabled()) return apiError('NOT_FOUND', 404)
    const session = await auth()
    const sub = session?.user?.sub
    if (!sub) return apiError('AUTH_GOOGLE_REQUIRED', 401)
    if (session.user.id) return apiError('LINK_ALREADY_LINKED', 409)
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body

    const { data: cd, error: cdErr } = await db()
      .from('sys_auth_lnk_cd')
      .select('lnk_cd_id, usr_id, exp_dtm')
      .eq('lnk_cd', body.code)
      .eq('del_yn', 'N')
      .is('use_dtm', null)
      .maybeSingle<{ lnk_cd_id: string; usr_id: string; exp_dtm: string }>()
    if (cdErr) return dbFail(cdErr)
    if (!cd || new Date(cd.exp_dtm).getTime() < Date.now())
      return apiError('LINK_CODE_INVALID', 400)

    // 연동 생성 — 같은 Google 이 타인 계정에 이미 붙었거나(prvd UNIQUE) 이 사용자가 이미 Google 을 연동했으면(usr UNIQUE) 409
    const { error: lnkErr } = await db()
      .from('sys_usr_auth_lnk')
      .insert({
        usr_id: cd.usr_id,
        prvd_cd: 'GOOGLE',
        prvd_sub_txt: sub,
        prvd_eml_txt: session.user.email ?? null,
        regr_id: cd.usr_id,
        modr_id: cd.usr_id,
      })
    if (lnkErr) {
      if (lnkErr.code === '23505') return apiError('LINK_ALREADY_LINKED', 409)
      return dbFail(lnkErr)
    }

    const { error: useErr } = await db()
      .from('sys_auth_lnk_cd')
      .update({
        use_dtm: new Date().toISOString(),
        use_prvd_cd: 'GOOGLE',
        use_prvd_sub_txt: sub,
        modr_id: cd.usr_id,
      })
      .eq('lnk_cd_id', cd.lnk_cd_id)
      .is('use_dtm', null)
    if (useErr)
      console.error(
        '[auth/link-complete] 코드 사용 처리 실패',
        cd.lnk_cd_id,
        useErr.message,
      )

    return NextResponse.json({ ok: true, userId: cd.usr_id })
  }),
)
