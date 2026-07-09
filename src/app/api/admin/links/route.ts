import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// LIKE 와일드카드(%, _, \) 이스케이프 — 사용자 입력이 패턴으로 오작동/주입되지 않게.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&')
}

export async function GET(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()

  let query = getSupabaseAdmin()
    .from('sys_user')
    .select(
      'id, pi_uid, pi_username, google_id, google_email, google_name, display_name, role, reg_dtm, del_yn, del_dtm',
    )
    .order('reg_dtm', { ascending: false })

  // 검색어가 있으면(2글자↑) pi_username 부분일치(trigram GIN, sql/086)로 좁힌다.
  // trigram은 3글자 단위라 2글자 미만은 의미가 적어 검색 자체를 생략(전체 반환).
  if (q.length >= 2) {
    query = query.ilike('pi_username', `%${escapeLike(q)}%`)
  }

  const { data, error } = await query

  if (error) {
    return apiError('ADM_LINKS_LIST_FAILED', 500)
  }

  return NextResponse.json({ users: data })
}

// PATCH /api/admin/links — 계정 활성/비활성 토글 (del_yn).
//   del_yn='Y'는 "앞으로 절대 사용하지 않는 계정" — 인증·단건 조회 전반에서 차단된다.
//   (논리삭제: 물리 DELETE 금지, del_dtm 기록)
export async function PATCH(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  let body: { userId?: string; del_yn?: string }
  try {
    body = (await req.json()) as { userId?: string; del_yn?: string }
  } catch {
    return apiError('BAD_REQUEST', 400)
  }

  const { userId, del_yn } = body
  if (!userId || (del_yn !== 'Y' && del_yn !== 'N')) {
    return apiError('ADM_LINK_TOGGLE_PARAMS_REQUIRED', 400)
  }

  // 자기 자신은 비활성화 금지 (관리자 자기 계정 잠금 방지)
  if (userId === requester!.id && del_yn === 'Y') {
    return apiError('ADM_CANNOT_DEACTIVATE_SELF', 400)
  }

  const now = new Date().toISOString()
  const { error } = await getSupabaseAdmin()
    .from('sys_user')
    .update({
      del_yn,
      del_dtm: del_yn === 'Y' ? now : null,
      // 관리자 차단은 재가입 부활 불가 사유로 스탬프 — 재활성화 시 사유 해제 (sql/163)
      del_rsn_cd: del_yn === 'Y' ? 'ADMIN_BLCK' : null,
      modr_id: requester!.id,
      mod_dtm: now,
    })
    .eq('id', userId)

  if (error) {
    return apiError('ADM_LINK_STATUS_UPDATE_FAILED', 500)
  }

  return NextResponse.json({ success: true, userId, del_yn })
}
