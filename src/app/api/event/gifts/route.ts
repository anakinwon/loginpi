import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// PATCH /api/event/gifts — 선물 발송 상태 업데이트 (관리자 전용)
export async function PATCH(request: NextRequest) {
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

  const { user_id, sent_yn, gift_nm } = body as {
    user_id?: string
    sent_yn?: string
    gift_nm?: string
  }

  if (!user_id) {
    return NextResponse.json(
      { error: 'user_id가 필요합니다' },
      { status: 400 },
    )
  }

  if (!['Y', 'N'].includes(sent_yn ?? '')) {
    return NextResponse.json(
      { error: '발송 여부는 Y 또는 N이어야 합니다' },
      { status: 400 },
    )
  }

  try {
    const db = getSupabaseAdmin()
    const now = new Date().toISOString()
    const slug = user.display_name.slice(0, 20)

    // UPSERT: (event_id, user_id) 복합 unique constraint 기준
    const { data, error } = await db
      .from('evt_gift_log')
      .upsert(
        {
          event_id: 'evt-20260614-001',
          user_id,
          gift_nm: gift_nm ?? 'π 선물',
          sent_yn,
          sent_dtm: sent_yn === 'Y' ? now : null,
          regr_id: slug,
          modr_id: slug,
          mod_dtm: now,
        },
        { onConflict: 'event_id,user_id' },
      )
      .select()
      .maybeSingle()

    if (error) {
      throw error
    }

    return NextResponse.json({ gift: data })
  } catch (err) {
    console.error('[event/gifts] 업데이트 실패:', err)
    return NextResponse.json({ error: '선물 업데이트 실패' }, { status: 500 })
  }
}
