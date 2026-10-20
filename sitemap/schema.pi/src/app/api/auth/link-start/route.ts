// 연동 코드 발급 — POST /api/auth/link-start. Pi 세션(쿠키 OR X-Pi-Token) 필수(Google 세션 불가).
//  숫자 6자리·10분. 사용자당 미사용 코드 1개(이전 코드는 논리 폐기). 일반 브라우저 Google 세션이 /api/auth/link-complete 로 입력
import { randomInt } from 'node:crypto'
import { NextResponse } from 'next/server'
import { withAuthGuard } from '@pi/guard'
import { apiError, dbError } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

const CODE_TTL_MS = 10 * 60 * 1000
const sixDigits = () => randomInt(0, 1_000_000).toString().padStart(6, '0')

export const POST = withAuthGuard(async (req) => {
  const user = await getSessionUser(req)
  if (!user) return apiError('AUTH_PI_REQUIRED', 401)

  const now = new Date().toISOString()
  // 이전 미사용 코드 폐기 — 한 번에 하나만 유효
  const { error: voidErr } = await db()
    .from('sys_auth_lnk_cd')
    .update({ del_yn: 'Y', del_dtm: now, modr_id: user.usr_id })
    .eq('usr_id', user.usr_id)
    .eq('del_yn', 'N')
    .is('use_dtm', null)
  if (voidErr) return dbError(voidErr)

  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()
  // 활성 UNIQUE(x_sys_auth_lnk_cd_01, 구 ux_sys_auth_lnk_cd_lnk_cd_actv) 충돌 시 재시도 3회
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = sixDigits()
    const { error } = await db()
      .from('sys_auth_lnk_cd')
      .insert({ lnk_cd: code, usr_id: user.usr_id, exp_dtm: expiresAt, regr_id: user.usr_id, modr_id: user.usr_id })
    if (!error) return NextResponse.json({ ok: true, code, expiresAt })
    if (error.code !== '23505') return dbError(error)
  }
  return apiError('LINK_CODE_GEN_FAILED', 500)
})
