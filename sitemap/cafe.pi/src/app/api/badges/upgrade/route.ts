import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { applyBean } from '@/lib/bean'
import { BADGE_UPGRADE_BEAN } from '@/lib/bean-fee'
import { microFeeBean, applyPromoGate } from '@/lib/fee-resolver'
import { apiError, API_ERRORS } from '@/lib/api-errors'

// POST /api/badges/upgrade — 배지 강화 Bean 결제 (PRD_15_FEE §1-6 #7)
// Pi 직접결제(FEATURE_ADDON) 폐기 → Bean SPEND 전환
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const body = await request.json().catch(() => ({}))
  const { badge_id, theme_cd } = body as {
    badge_id?: string
    theme_cd?: string
  }
  if (!badge_id || !theme_cd) return apiError('BADGE_INFO_REQUIRED', 400)

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

  if (!badge) return apiError('BADGE_NOT_FOUND', 404)

  const b = badge as { badge_id: string; upgr_yn: string }
  if (b.upgr_yn === 'Y') return apiError('BADGE_ALREADY_UPGRADED', 409)

  // Bean 차감 — PI 모드(메인넷 등재 기간)는 마이크로 무료화로 차감 스킵 (PRD_24 §0)
  // 오픈기념행사 무료화 게이트 — PRD_26
  const normalFeeBean = BADGE_UPGRADE_BEAN
  const feeModeAdjusted = await microFeeBean(normalFeeBean)
  const feeBean = await applyPromoGate(feeModeAdjusted)
  let balance: number | undefined
  if (feeBean > 0) {
    const charge = await applyBean({
      usrId: user.id,
      txnTp: 'SPEND',
      beanAmt: -feeBean,
      refTp: 'BADGE_UPGRADE',
      refId: badge_id,
      memo: '배지 강화',
      regrId: user.display_name.slice(0, 20),
    })

    if (!charge.ok) {
      if (charge.error === 'INSUFFICIENT_BEAN') {
        // 부가 필드(requiresBean·feeBean) 동반 → apiError 대신 수동 구성 + code 첨부
        return NextResponse.json(
          {
            error: API_ERRORS.BEAN_INSUFFICIENT,
            code: 'BEAN_INSUFFICIENT',
            requiresBean: true,
            feeBean,
          },
          { status: 402 },
        )
      }
      return apiError('BEAN_PAYMENT_FAILED', 500)
    }
    balance = charge.balance
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
    // 배지 업데이트 실패 시 Bean 환불 (원자성 보정) — 무료(PI 모드)였으면 환불 불필요
    if (feeBean > 0) {
      await applyBean({
        usrId: user.id,
        txnTp: 'REFUND',
        beanAmt: feeBean,
        refTp: 'BADGE_UPGRADE',
        refId: badge_id,
        memo: '배지 강화 실패 환불',
        regrId: user.display_name.slice(0, 20),
      })
    }
    return apiError('BADGE_UPGRADE_FAILED', 500)
  }

  return NextResponse.json({ success: true, balance })
}
