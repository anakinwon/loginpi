import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const CAMPAIGN_CD = 'SHOP_ONBOARD'

// GET /api/admin/campaign — 승인 대기(PENDING) 신청 목록 + 승인 현황
export async function GET() {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = getSupabaseAdmin()
  const [pendingRes, campRes, approvedRes] = await Promise.all([
    db
      .from('bean_campaign_grant')
      .select('grant_id, usr_id, bean_amt, reg_dtm')
      .eq('campaign_cd', CAMPAIGN_CD)
      .eq('grant_st_cd', 'PENDING')
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: true }),
    db
      .from('bean_campaign')
      .select('reward_bean, max_grant_cnt')
      .eq('campaign_cd', CAMPAIGN_CD)
      .maybeSingle(),
    db
      .from('bean_campaign_grant')
      .select('grant_id', { count: 'exact', head: true })
      .eq('campaign_cd', CAMPAIGN_CD)
      .eq('grant_st_cd', 'APPROVED')
      .eq('del_yn', 'N'),
  ])

  const rows = pendingRes.data ?? []
  // 사용자 정보 병합 (FK 없음 → 별도 조회)
  const userIds = [...new Set(rows.map((r) => r.usr_id))]
  const userMap = new Map<string, Record<string, unknown>>()
  if (userIds.length > 0) {
    const { data: users } = await db
      .from('sys_user')
      .select('id, pi_username, nick_nm, real_nm, display_name')
      .in('id', userIds)
    for (const u of users ?? [])
      userMap.set((u as { id: string }).id, u as Record<string, unknown>)
  }

  const camp = campRes.data as {
    reward_bean: number
    max_grant_cnt: number
  } | null
  return NextResponse.json({
    pending: rows.map((r) => ({
      ...r,
      sys_user: userMap.get(r.usr_id) ?? null,
    })),
    approved_cnt: approvedRes.count ?? 0,
    max_cnt: camp?.max_grant_cnt ?? 0,
    reward_bean: camp?.reward_bean ?? 0,
  })
}

// POST /api/admin/campaign — { usr_id, action: 'approve' | 'reject' }
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { usr_id, action } = (await req.json().catch(() => ({}))) as {
    usr_id?: string
    action?: string
  }
  if (!usr_id || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json(
      { error: 'usr_id와 action(approve|reject)이 필요합니다' },
      { status: 400 },
    )
  }

  const fn =
    action === 'approve'
      ? 'fn_bean_campaign_approve'
      : 'fn_bean_campaign_reject'
  const { data, error } = await getSupabaseAdmin().rpc(fn, {
    p_usr_id: usr_id,
    p_campaign_cd: CAMPAIGN_CD,
    p_admin_id: user!.id,
  })
  if (error) {
    console.error(`[admin/campaign] ${action} 실패:`, error.message)
    return NextResponse.json({ error: '처리 실패' }, { status: 500 })
  }
  return NextResponse.json(data)
}
