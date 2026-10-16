// 연동 완료 — POST /api/auth/link-complete { code }. Google(NextAuth) 세션 필수, 아직 연동되지 않은 Google 만.
//  유효 코드(미사용·미만료) → sys_usr_auth_lnk(usr_id ↔ Google sub) 생성 → 코드 사용 처리.
//  성공 후 클라이언트는 useSession().update() 로 JWT 의 userId 를 재조회한다(src/auth.ts jwt 콜백).
// ponytail: INSERT/UPDATE 가 한 트랜잭션이 아니다 — 동시 입력은 UNIQUE(23505)로 한쪽만 성립. 분쟁 생기면 RPC 로 묶는다
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { auth, googleEnabled } from '@/auth'
import { apiError, dbError, parseBody } from '@/lib/api'
import { db } from '@/lib/db'

const bodySchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) })

// 코드 추측 방어 — Google 계정(sub)당 실패 5회면 10분 잠금. IP 기준 rate limit(@pi/guard AUTH 분 8회·5분 차단)에 더해
// 공격자가 Google 계정 1개로 시도할 수 있는 횟수를 5회로 고정한다(6자리 10분 코드 무차별 대입 지적, 보안 리뷰 2026-10-16)
// ponytail: 인스턴스 로컬 Map — @pi/guard rate limit 과 같은 한계. 분산 잠금이 필요하면 sys_auth_lnk_cd 에 시도 횟수 컬럼 추가
const FAIL_LIMIT = 5
const LOCK_MS = 10 * 60 * 1000
const fails = new Map<string, { n: number; until: number }>()
function locked(sub: string): boolean {
  const f = fails.get(sub)
  if (!f) return false
  if (Date.now() > f.until) {
    fails.delete(sub)
    return false
  }
  return f.n >= FAIL_LIMIT
}
function recordFail(sub: string) {
  const f = fails.get(sub)
  const now = Date.now()
  if (!f || now > f.until) fails.set(sub, { n: 1, until: now + LOCK_MS })
  else f.n += 1
}

export const POST = withAuthGuard(async (req) => {
  if (!googleEnabled()) return apiError('NOT_FOUND', 404)
  const session = await auth()
  const sub = session?.user?.sub
  if (!sub) return apiError('AUTH_GOOGLE_REQUIRED', 401)
  if (session.user.id) return apiError('LINK_ALREADY_LINKED', 409)
  if (locked(sub)) return apiError('LINK_CODE_LOCKED', 429)
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body

  const { data: cd, error: cdErr } = await db()
    .from('sys_auth_lnk_cd')
    .select('lnk_cd_id, usr_id, exp_dtm')
    .eq('lnk_cd', body.code)
    .eq('del_yn', 'N')
    .is('use_dtm', null)
    .maybeSingle<{ lnk_cd_id: string; usr_id: string; exp_dtm: string }>()
  if (cdErr) return dbError(cdErr)
  if (!cd || new Date(cd.exp_dtm).getTime() < Date.now()) {
    recordFail(sub)
    return apiError('LINK_CODE_INVALID', 400)
  }
  fails.delete(sub)

  // 연동 생성 — 같은 Google 이 타인 계정에 이미 붙었거나(prvd UNIQUE) 이 사용자가 이미 Google 을 연동했으면(usr UNIQUE) 409
  const { error: lnkErr } = await db().from('sys_usr_auth_lnk').insert({
    usr_id: cd.usr_id,
    prvd_cd: 'GOOGLE',
    prvd_sub_txt: sub,
    prvd_eml_txt: session.user.email ?? null,
    regr_id: cd.usr_id,
    modr_id: cd.usr_id,
  })
  if (lnkErr) {
    if (lnkErr.code === '23505') return apiError('LINK_ALREADY_LINKED', 409)
    return dbError(lnkErr)
  }

  const { error: useErr } = await db()
    .from('sys_auth_lnk_cd')
    .update({ use_dtm: new Date().toISOString(), use_prvd_cd: 'GOOGLE', use_prvd_sub_txt: sub, modr_id: cd.usr_id })
    .eq('lnk_cd_id', cd.lnk_cd_id)
    .is('use_dtm', null)
  if (useErr) console.error('[auth/link-complete] 코드 사용 처리 실패', cd.lnk_cd_id, useErr.message)

  return NextResponse.json({ ok: true, userId: cd.usr_id })
})
