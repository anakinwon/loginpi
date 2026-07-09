import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ badgeId: string }> }

// PATCH /api/badges/[badgeId] — 수여 축하 팝업 통지 완료 처리 (noti_yn='Y')
export async function PATCH(_request: NextRequest, { params }: Params) {
  const { badgeId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const { error } = await getSupabaseAdmin()
    .from('msg_usr_badge')
    .update({
      noti_yn: 'Y',
      modr_id: user.display_name.slice(0, 20),
      mod_dtm: new Date().toISOString(),
    })
    .eq('badge_id', badgeId)
    .eq('usr_id', user.id) // 본인 배지만
    .eq('del_yn', 'N')

  if (error) return apiError('BADGE_NOTI_FAILED', 500)
  return NextResponse.json({ success: true })
}
