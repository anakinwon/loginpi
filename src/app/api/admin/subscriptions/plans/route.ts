import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('msg_subscr_plan')
    .select('plan_cd, plan_nm, plan_tp_cd, price_pi, mth_cnt')
    .neq('plan_tp_cd', 'FREE')
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .order('plan_tp_cd')
    .order('mth_cnt')

  if (error) {
    return NextResponse.json({ error: '플랜 목록 조회 실패' }, { status: 500 })
  }

  return NextResponse.json({ plans: data })
}
