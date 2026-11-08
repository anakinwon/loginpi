import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// PATCH /api/event/gifts — 선물 발송 상태 업데이트 (관리자 전용)
export async function PATCH(request: NextRequest) {
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

  const { user_id, sent_yn, gift_nm } = body as {
    user_id?: string
    sent_yn?: string
    gift_nm?: string
  }

  if (!user_id) {
    return apiError('EVENT_USER_ID_REQUIRED', 400)
  }

  if (!['Y', 'N'].includes(sent_yn ?? '')) {
    return apiError('EVENT_SENT_YN_INVALID', 400)
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
    return apiError('EVENT_GIFT_UPDATE_FAILED', 500)
  }
}
