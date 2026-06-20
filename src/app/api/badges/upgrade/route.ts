import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { applyBean } from '@/lib/bean'
import { BADGE_UPGRADE_BEAN } from '@/lib/bean-fee'

// POST /api/badges/upgrade — 배지 강화 Bean 결제 (PRD_15_FEE §1-6 #7)
// Pi 직접결제(FEATURE_ADDON) 폐기 → Bean SPEND 전환
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { badge_id, theme_cd } = body as { badge_id?: string; theme_cd?: string }
  if (!badge_id || !theme_cd)
    return NextResponse.json({ error: '배지 정보가 필요합니다' }, { status: 400 })

  const db = getSupabaseAdmin()

  // 배지 소유·미강화 확인
  const { data: badge } = await db
    .from('msg_usr_badge')
    .select('badge_id, upgr_yn')
    .eq('badge_id', badge_id)
    .eq('usr_id', user.id)
    .eq('theme_cd', theme_cd)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!badge)
    return NextResponse.json({ error: '배지를 찾을 수 없습니다' }, { status: 404 })

  const b = badge as { badge_id: string; upgr_yn: string }
  if (b.upgr_yn === 'Y')
    return NextResponse.json({ error: '이미 강화된 배지입니다' }, { status: 409 })

  // Bean 차감
  const charge = await applyBean({
    usrId: user.id,
    txnTp: 'SPEND',
    beanAmt: -BADGE_UPGRADE_BEAN,
    refTp: 'BADGE_UPGRADE',
    refId: badge_id,
    memo: '배지 강화',
    regrId: user.display_name.slice(0, 20),
  })

  if (!charge.ok) {
    if (charge.error === 'INSUFFICIENT_BEAN') {
      return NextResponse.json(
        {
          error: 'Bean 잔액이 부족합니다. 충전 후 다시 시도하세요.',
          requiresBean: true,
          feeBean: BADGE_UPGRADE_BEAN,
        },
        { status: 402 },
      )
    }
    return NextResponse.json({ error: '결제 처리에 실패했습니다' }, { status: 500 })
  }

  // 배지 강화 적용
  const { error } = await db
    .from('msg_usr_badge')
    .update({
      upgr_yn: 'Y',
      upgr_dtm: new Date().toISOString(),
      modr_id: user.display_name.slice(0, 20),
      mod_dtm: new Date().toISOString(),
    })
    .eq('badge_id', badge_id)
    .eq('usr_id', user.id)
    .eq('del_yn', 'N')

  if (error) {
    // 배지 업데이트 실패 시 Bean 환불 (원자성 보정)
    await applyBean({
      usrId: user.id,
      txnTp: 'REFUND',
      beanAmt: BADGE_UPGRADE_BEAN,
      refTp: 'BADGE_UPGRADE',
      refId: badge_id,
      memo: '배지 강화 실패 환불',
      regrId: user.display_name.slice(0, 20),
    })
    return NextResponse.json({ error: '배지 강화에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({ success: true, balance: charge.balance })
}
