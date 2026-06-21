import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getChatPlan, canCreateRoom, getAiQuota } from '@/lib/chat-auth'

// GET /api/subscriptions/check — 현재 사용자의 기능별 권한 매트릭스.
// 클라이언트 게이트(SubscriptionGate)가 piFetch(X-Pi-Token)로 호출한다.
export async function GET() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // 플랜을 한 번만 조회해 하위 판정에 재사용(중복 쿼리 방지)
  const plan = await getChatPlan(user.id)
  const [room, ai] = await Promise.all([
    canCreateRoom(user.id, plan),
    getAiQuota(user.id, plan),
  ])

  return NextResponse.json({
    tier: plan.tier,
    plan_cd: plan.plan_cd,
    plan_nm: plan.plan_nm,
    expire_dtm: plan.expire_dtm,
    auto_renew_yn: plan.auto_renew_yn,
    canTip: plan.caps.canTip,
    canAutoTranslate: plan.caps.canAutoTranslate,
    canUsePremiumTheme: plan.caps.canUsePremiumTheme,
    canCreateEventRoom: plan.caps.canCreateEventRoom,
    canCreateRoomFree: room.allowed,
    roomQuota: room.quota,
    roomUsed: room.used,
    aiQuota: ai,
  })
}
