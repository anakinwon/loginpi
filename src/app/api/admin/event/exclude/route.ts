import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// GET /api/admin/event/exclude — 제외 대상자 목록 조회
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return apiError('AUTH_REQUIRED', 401)
  }

  if (!isAdmin(user)) {
    return apiError('FORBIDDEN', 403)
  }

  try {
    const db = getSupabaseAdmin()

    // 제외 대상자 목록 (미논리삭제만)
    const { data, error } = await db
      .from('evt_exclude')
      .select(
        `
        exclude_id:evt_exclude_id,
        user_id,
        sys_user (id, nick_nm, display_name, pi_username),
        reason:exclude_reason_tx,
        reg_dtm
      `,
      )
      .eq('event_id', 'evt-20260614-001')
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false })

    if (error) {
      throw error
    }

    return NextResponse.json({ excluded: data })
  } catch (err) {
    console.error('[admin/event/exclude] 조회 실패:', err)
    return apiError('ADM_EVT_EXCLUDE_LIST_FAILED', 500)
  }
}

// POST /api/admin/event/exclude — 제외 대상자 추가
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return apiError('AUTH_REQUIRED', 401)
  }

  if (!isAdmin(user)) {
    return apiError('FORBIDDEN', 403)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const { pi_username, reason } = body as {
    pi_username?: string
    reason?: string
  }

  // 콤마로 구분된 다중 입력 지원 (단일 입력도 동일 경로) — 공백 제거 + 중복 제거
  const names = [
    ...new Set(
      (pi_username ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ]

  if (names.length === 0) {
    return apiError('ADM_EVT_PI_USERNAME_REQUIRED', 400)
  }

  try {
    const db = getSupabaseAdmin()
    const slug = user.display_name.slice(0, 20)

    const added: string[] = [] // 신규 제외 완료
    const already: string[] = [] // 이미 제외됨
    const notFound: string[] = [] // 요원 미발견

    for (const name of names) {
      // pi_username으로 요원(sys_user) 조회
      const { data: target, error: targetErr } = await db
        .from('sys_user')
        .select('id, pi_username')
        .eq('pi_username', name)
        .maybeSingle()
      if (targetErr) throw targetErr
      if (!target) {
        notFound.push(name)
        continue
      }

      // 이미 제외 대상자인지 확인
      const { data: existing, error: checkErr } = await db
        .from('evt_exclude')
        .select('evt_exclude_id')
        .eq('event_id', 'evt-20260614-001')
        .eq('user_id', target.id)
        .eq('del_yn', 'N')
        .maybeSingle()
      if (checkErr) throw checkErr
      if (existing) {
        already.push(name)
        continue
      }

      // 제외 대상자 추가
      const { error } = await db.from('evt_exclude').insert({
        event_id: 'evt-20260614-001',
        user_id: target.id,
        exclude_reason_tx: reason?.trim() || '관리자 판단',
        regr_id: slug,
        modr_id: slug,
      })
      if (error) throw error
      added.push(name)
    }

    return NextResponse.json({ added, already, notFound }, { status: 201 })
  } catch (err) {
    console.error('[admin/event/exclude] POST 실패:', err)
    return apiError('ADM_EVT_EXCLUDE_ADD_FAILED', 500)
  }
}

// DELETE /api/admin/event/exclude — 제외 해제 (논리삭제)
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return apiError('AUTH_REQUIRED', 401)
  }

  if (!isAdmin(user)) {
    return apiError('FORBIDDEN', 403)
  }

  const { searchParams } = new URL(request.url)
  const user_id = searchParams.get('user_id')

  if (!user_id?.trim()) {
    return apiError('ADM_EVT_USER_ID_REQUIRED', 400)
  }

  try {
    const db = getSupabaseAdmin()
    const slug = user.display_name.slice(0, 20)
    const now = new Date().toISOString()

    // 논리삭제
    const { error } = await db
      .from('evt_exclude')
      .update({
        del_yn: 'Y',
        del_dtm: now,
        modr_id: slug,
        mod_dtm: now,
      })
      .eq('event_id', 'evt-20260614-001')
      .eq('user_id', user_id.trim())
      .eq('del_yn', 'N')

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/event/exclude] DELETE 실패:', err)
    return apiError('ADM_EVT_EXCLUDE_REMOVE_FAILED', 500)
  }
}
