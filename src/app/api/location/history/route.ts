import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/location/history — 내 위치 수집 이력 열람 (위치정보법 제16조 정보주체 열람권)
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  if (user.lbs_consent_yn !== 'Y') {
    return NextResponse.json({ error: '위치기반서비스 이용약관에 동의하지 않으셨습니다' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('usr_loc_hist')
    .select('loc_hist_id, loc_tp_cd, sido_nm, sigungu_nm, dong_nm, reg_dtm')
    .eq('user_str_id', user.id)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: data ?? [] })
}
