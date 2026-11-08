import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// LIKE 와일드카드(%, _, \) 이스케이프 — 사용자 입력이 패턴으로 오작동/주입되지 않게.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&')
}

type LinkStatus = 'linked' | 'pi_only' | 'google_only'
type Filterable<Q> = {
  is(column: string, value: null): Q
  not(column: string, operator: string, value: null): Q
}

// 연동상태 필터(서버) — linked = Pi+Google / pi_only = Pi만 / google_only = Pi 없음
function byStatus<Q extends Filterable<Q>>(q: Q, s: LinkStatus): Q {
  if (s === 'google_only') return q.is('pi_uid', null)
  const pi = q.not('pi_uid', 'is', null)
  return s === 'linked'
    ? pi.not('google_id', 'is', null)
    : pi.is('google_id', null)
}

// GET /api/admin/links?page=1&size=20&status=linked&q=abc — 서버 페이지네이션(데이터 패칭 표준 ①, R-P3)
//   counts = 통계카드·필터칩용 전체 상태별 건수(검색 무관), total = 현재 조건 건수(페이지 수 계산)
export async function GET(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') ?? '').trim()
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const size = Math.min(100, Math.max(1, Number(sp.get('size')) || 20))
  const st = sp.get('status')
  const status =
    st === 'linked' || st === 'pi_only' || st === 'google_only' ? st : null

  const db = getSupabaseAdmin()
  let query = db
    .from('sys_user')
    .select(
      'id, pi_uid, pi_username, google_id, google_email, google_name, display_name, role, reg_dtm, del_yn, del_dtm',
      { count: 'exact' },
    )
    .order('reg_dtm', { ascending: false })
    .range((page - 1) * size, page * size - 1)

  // 검색어가 있으면(2글자↑) pi_username 부분일치(trigram GIN, sql/086)로 좁힌다.
  // trigram은 3글자 단위라 2글자 미만은 의미가 적어 검색 자체를 생략(전체 반환).
  if (q.length >= 2) {
    query = query.ilike('pi_username', `%${escapeLike(q)}%`)
  }
  if (status) query = byStatus(query, status)

  const head = () =>
    db.from('sys_user').select('id', { count: 'exact', head: true })
  const [list, all, linked, piOnly, googleOnly] = await Promise.all([
    query,
    head(),
    byStatus(head(), 'linked'),
    byStatus(head(), 'pi_only'),
    byStatus(head(), 'google_only'),
  ])

  if (list.error) {
    return apiError('ADM_LINKS_LIST_FAILED', 500)
  }

  return NextResponse.json({
    users: list.data,
    total: list.count ?? 0,
    counts: {
      all: all.count ?? 0,
      linked: linked.count ?? 0,
      pi_only: piOnly.count ?? 0,
      google_only: googleOnly.count ?? 0,
    },
  })
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
