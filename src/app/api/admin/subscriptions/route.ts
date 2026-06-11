import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('msg_subscr')
    .select(
      `
      subscr_id,
      plan_cd,
      pymnt_id,
      start_dtm,
      expire_dtm,
      auto_renew_yn,
      del_yn,
      reg_dtm,
      mod_dtm,
      sys_user ( id, display_name, pi_username, google_email ),
      msg_subscr_plan ( plan_nm, plan_tp_cd, price_pi, mth_cnt )
    `,
    )
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })

  if (error) {
    return NextResponse.json({ error: '구독 목록 조회 실패' }, { status: 500 })
  }

  return NextResponse.json({ subscriptions: data })
}

export async function POST(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const body = (await req.json()) as {
    usr_id: string
    plan_cd: string
    months: number
  }

  const { usr_id, plan_cd, months } = body
  if (!usr_id || !plan_cd || !months || months < 1) {
    return NextResponse.json({ error: '필수 값 누락' }, { status: 400 })
  }

  const now = new Date()
  const expire = new Date(now)
  expire.setMonth(expire.getMonth() + months)

  // UPSERT: usr_id UNIQUE 제약으로 기존 구독이 있으면 갱신
  const { error } = await getSupabaseAdmin()
    .from('msg_subscr')
    .upsert(
      {
        usr_id,
        plan_cd,
        pymnt_id: null,
        start_dtm: now.toISOString(),
        expire_dtm: expire.toISOString(),
        auto_renew_yn: 'N',
        del_yn: 'N',
        regr_id: requester?.display_name ?? 'ADMIN',
        modr_id: requester?.display_name ?? 'ADMIN',
        mod_dtm: now.toISOString(),
      },
      { onConflict: 'usr_id' },
    )

  if (error) {
    return NextResponse.json(
      { error: '구독 부여 실패: ' + error.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
