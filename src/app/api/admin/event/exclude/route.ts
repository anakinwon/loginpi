import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/admin/event/exclude — 제외 대상자 목록 조회
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  if (!isAdmin(user)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  try {
    const db = getSupabaseAdmin()

    // 제외 대상자 목록 (미논리삭제만)
    const { data, error } = await db
      .from('evt_exclude')
      .select(
        `
        exclude_id,
        user_id,
        sys_user (id, nick_nm, display_name),
        reason,
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
    return NextResponse.json(
      { error: '제외 대상자 조회 실패' },
      { status: 500 },
    )
  }
}

// POST /api/admin/event/exclude — 제외 대상자 추가
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  if (!isAdmin(user)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { user_id, reason } = body as {
    user_id?: string
    reason?: string
  }

  if (!user_id?.trim()) {
    return NextResponse.json(
      { error: '사용자 ID가 필요합니다' },
      { status: 400 },
    )
  }

  try {
    const db = getSupabaseAdmin()
    const slug = user.display_name.slice(0, 20)
    const now = new Date().toISOString()

    // 이미 제외 대상자인지 확인
    const { data: existing, error: checkErr } = await db
      .from('evt_exclude')
      .select('exclude_id')
      .eq('event_id', 'evt-20260614-001')
      .eq('user_id', user_id.trim())
      .eq('del_yn', 'N')
      .maybeSingle()

    if (checkErr) {
      throw checkErr
    }

    if (existing) {
      return NextResponse.json(
        { error: '이미 제외된 사용자입니다' },
        { status: 409 },
      )
    }

    // 제외 대상자 추가
    const { data, error } = await db
      .from('evt_exclude')
      .insert({
        event_id: 'evt-20260614-001',
        user_id: user_id.trim(),
        reason: reason?.trim() || '관리자 판단',
        regr_id: slug,
        modr_id: slug,
      })
      .select()
      .maybeSingle()

    if (error) {
      throw error
    }

    return NextResponse.json({ excluded: data }, { status: 201 })
  } catch (err) {
    console.error('[admin/event/exclude] POST 실패:', err)
    return NextResponse.json({ error: '제외 추가 실패' }, { status: 500 })
  }
}

// DELETE /api/admin/event/exclude — 제외 해제 (논리삭제)
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  if (!isAdmin(user)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const user_id = searchParams.get('user_id')

  if (!user_id?.trim()) {
    return NextResponse.json(
      { error: '사용자 ID가 필요합니다' },
      { status: 400 },
    )
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
    return NextResponse.json({ error: '제외 해제 실패' }, { status: 500 })
  }
}
