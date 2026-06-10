import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// PiChat 구독 권한 단일 소스.
// 플랜 등급별 기능 한도를 PLAN_CAPS 한 곳에서 정의하고, 모든 게이트·API가 이를 따른다.
// (정책 변경 시 이 파일만 수정 — locale-currency 단일 소스와 동일한 원칙)

export type PlanTier = 'FREE' | 'PREMIUM' | 'BUSINESS'

// 한도 -1 = 무제한. JSON 직렬화 안전을 위해 Infinity 대신 -1 센티넬 사용.
export interface PlanCaps {
  tier: PlanTier
  monthlyRoomQuota: number // 월 무료 그룹방 생성 수 (-1=무제한, 0=건당 결제)
  aiMonthlyQuota: number // 월 AI 호출 한도 (-1=무제한)
  canTip: boolean // Pi Tip 전송 가능
  canUsePremiumTheme: boolean // PREMIUM 테마 무료 사용
  canCreateEventRoom: boolean // 이벤트방(room_tp_cd='E') 개설
}

// 시드된 플랜(msg_subscr_plan)의 plan_tp_cd → 기능 한도 매핑.
// FREE: Pi Explorer / PREMIUM: Pi Creator / BUSINESS: Pi Host
const PLAN_CAPS: Record<PlanTier, PlanCaps> = {
  FREE: {
    tier: 'FREE',
    monthlyRoomQuota: 0,
    aiMonthlyQuota: 0,
    canTip: false,
    canUsePremiumTheme: false,
    canCreateEventRoom: false,
  },
  PREMIUM: {
    tier: 'PREMIUM',
    monthlyRoomQuota: 3,
    aiMonthlyQuota: 10,
    canTip: true,
    canUsePremiumTheme: true,
    canCreateEventRoom: false,
  },
  BUSINESS: {
    tier: 'BUSINESS',
    monthlyRoomQuota: -1,
    aiMonthlyQuota: -1,
    canTip: true,
    canUsePremiumTheme: true,
    canCreateEventRoom: true,
  },
}

export interface ChatPlan {
  plan_cd: string
  plan_nm: string
  tier: PlanTier
  expire_dtm: string | null
  auto_renew_yn: 'Y' | 'N' | null
  caps: PlanCaps
}

const FREE_PLAN: ChatPlan = {
  plan_cd: 'FREE',
  plan_nm: 'Pi Explorer',
  tier: 'FREE',
  expire_dtm: null,
  auto_renew_yn: null,
  caps: PLAN_CAPS.FREE,
}

// 운영자(ADMIN/MASTER) 가상 플랜 — 구독 없이도 BUSINESS 전 기능 사용·검증 가능
const OPERATOR_PLAN: ChatPlan = {
  plan_cd: 'OPERATOR',
  plan_nm: 'Pi Host (운영자)',
  tier: 'BUSINESS',
  expire_dtm: null,
  auto_renew_yn: null,
  caps: PLAN_CAPS.BUSINESS,
}

// 사용자의 현재 활성 구독 플랜.
// 만료(expire_dtm <= now)·논리삭제(del_yn='Y')는 자동 제외 → 없으면 FREE로 강등.
// 운영자(ADMIN/MASTER)는 구독·tier와 무관하게 BUSINESS 캡 보장 (Business 전용 기능 운영·검증)
export async function getChatPlan(userId: string): Promise<ChatPlan> {
  const [{ data }, { data: userRow }] = await Promise.all([
    getSupabaseAdmin()
      .from('msg_subscr')
      .select('plan_cd, expire_dtm, auto_renew_yn, msg_subscr_plan(plan_nm, plan_tp_cd)')
      .eq('usr_id', userId)
      .eq('del_yn', 'N')
      .gt('expire_dtm', new Date().toISOString())
      .order('expire_dtm', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getSupabaseAdmin().from('sys_user').select('role').eq('id', userId).maybeSingle(),
  ])

  const isOperator =
    (userRow as { role?: string } | null)?.role === 'ADMIN' ||
    (userRow as { role?: string } | null)?.role === 'MASTER'

  if (!data) return isOperator ? OPERATOR_PLAN : FREE_PLAN

  const row = data as {
    plan_cd: string
    expire_dtm: string
    auto_renew_yn: 'Y' | 'N' | null
    // PostgREST는 1:1 FK도 배열로 반환할 수 있어 양쪽 모두 방어
    msg_subscr_plan:
      | { plan_nm: string; plan_tp_cd: PlanTier }
      | { plan_nm: string; plan_tp_cd: PlanTier }[]
      | null
  }

  const planRow = Array.isArray(row.msg_subscr_plan) ? row.msg_subscr_plan[0] : row.msg_subscr_plan
  const subscrTier = (planRow?.plan_tp_cd ?? 'FREE') as PlanTier
  // 운영자는 구독 tier가 낮아도 BUSINESS 캡으로 승격 (구독 정보는 그대로 표시)
  const tier = isOperator ? 'BUSINESS' : subscrTier

  return {
    plan_cd: row.plan_cd,
    plan_nm: planRow?.plan_nm ?? row.plan_cd,
    tier,
    expire_dtm: row.expire_dtm,
    auto_renew_yn: row.auto_renew_yn ?? null,
    caps: PLAN_CAPS[tier] ?? PLAN_CAPS.FREE,
  }
}

// 이번 달(UTC 1일 00:00~) 사용자가 OWNER로 개설한 그룹/이벤트방 수.
// regr_id는 표시명 슬러그라 신뢰 불가 → msg_room_mbr(OWNER)로 소유 방을 특정한다.
async function countOwnedRoomsThisMonth(userId: string): Promise<number> {
  const now = new Date()
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString()

  const { data: owned } = await getSupabaseAdmin()
    .from('msg_room_mbr')
    .select('room_id')
    .eq('usr_id', userId)
    .eq('mbr_role_cd', 'OWNER')
    .eq('del_yn', 'N')

  const roomIds = (owned ?? []).map((r: { room_id: string }) => r.room_id)
  if (roomIds.length === 0) return 0

  const { count } = await getSupabaseAdmin()
    .from('msg_room')
    .select('room_id', { count: 'exact', head: true })
    .in('room_id', roomIds)
    .in('room_tp_cd', ['G', 'E'])
    .eq('del_yn', 'N')
    .gte('reg_dtm', monthStart)

  return count ?? 0
}

export interface RoomCreateAllowance {
  allowed: boolean // 무료(추가 결제 없이) 생성 가능 여부 — false라도 건당 결제로는 생성 가능
  quota: number // 월 무료 한도 (-1=무제한)
  used: number // 이번 달 사용량
}

// 무료로 그룹방을 만들 수 있는지 — 방생성 결제 분기 판단용.
// plan을 넘기면 getChatPlan 중복 조회를 생략한다(check 라우트 최적화).
export async function canCreateRoom(
  userId: string,
  plan?: ChatPlan
): Promise<RoomCreateAllowance> {
  const p = plan ?? (await getChatPlan(userId))
  const quota = p.caps.monthlyRoomQuota
  if (quota === -1) return { allowed: true, quota: -1, used: 0 }
  if (quota === 0) return { allowed: false, quota: 0, used: 0 }
  const used = await countOwnedRoomsThisMonth(userId)
  return { allowed: used < quota, quota, used }
}

export async function canSendTip(userId: string, plan?: ChatPlan): Promise<boolean> {
  const p = plan ?? (await getChatPlan(userId))
  return p.caps.canTip
}

export interface AiQuota {
  limit: number // 월 한도 (-1=무제한)
  used: number // 이번 달 사용량
  remaining: number // 남은 횟수 (-1=무제한)
}

// AI 봇 호출 잔여 한도.
// 이번 달 @ai 멘션 TEXT 메시지 수를 msg_msg에서 직접 집계.
export async function getAiQuota(userId: string, plan?: ChatPlan): Promise<AiQuota> {
  const p = plan ?? (await getChatPlan(userId))
  const limit = p.caps.aiMonthlyQuota
  if (limit === -1) return { limit: -1, used: 0, remaining: -1 }

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const { count } = await getSupabaseAdmin()
    .from('msg_msg')
    .select('msg_id', { count: 'exact', head: true })
    .eq('snd_usr_id', userId)
    .eq('msg_tp_cd', 'TEXT')
    .ilike('msg_cont', '%@ai %')
    .gte('reg_dtm', monthStart)
    .eq('del_yn', 'N')

  const used = count ?? 0
  return { limit, used, remaining: Math.max(0, limit - used) }
}
