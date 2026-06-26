import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// PyCafé 구독 권한 단일 소스.
// 플랜 등급별 기능 한도를 PLAN_CAPS 한 곳에서 정의하고, 모든 게이트·API가 이를 따른다.
// (정책 변경 시 이 파일만 수정 — locale-currency 단일 소스와 동일한 원칙)

export type PlanTier = 'FREE' | 'PREMIUM' | 'BUSINESS'

// 한도 -1 = 무제한. JSON 직렬화 안전을 위해 Infinity 대신 -1 센티넬 사용.
export interface PlanCaps {
  tier: PlanTier
  monthlyRoomQuota: number // 월 무료 그룹방 생성 수 (-1=무제한, 0=건당 결제)
  aiMonthlyQuota: number // 월 AI 호출 한도 (-1=무제한)
  canTip: boolean // Pi Bean 전송 가능
  canUsePremiumTheme: boolean // PREMIUM 테마 무료 사용
  canCreateEventRoom: boolean // 이벤트방(room_tp_cd='E') 개설
  canAutoTranslate: boolean // 자동번역(PyTranslate™) 사용 — 미구독(FREE)은 불가
}

// 채팅 등급별 기능 한도 매핑.
// FREE: Pi Explorer(미구독) / PREMIUM: PyCafé™ 구독자 / BUSINESS: 운영자(ADMIN/MASTER) 전용.
// ※ canAutoTranslate는 PLAN_CAPS 값과 무관하게 getChatPlan에서 TRANSLATE 구독 유무로 재정의된다
//    (PRD_15_FEE §1-6: 자동번역은 TRANSLATE 별도 구독 전용). 운영자(BUSINESS)만 항상 true.
const PLAN_CAPS: Record<PlanTier, PlanCaps> = {
  FREE: {
    tier: 'FREE',
    monthlyRoomQuota: 0,
    aiMonthlyQuota: 0,
    canTip: false,
    canUsePremiumTheme: false,
    canCreateEventRoom: false,
    canAutoTranslate: false, // 미구독은 자동번역 불가 (구독 후 이용)
  },
  PREMIUM: {
    tier: 'PREMIUM',
    monthlyRoomQuota: -1, // 구독자(PREMIUM)는 모든 채팅방 생성 무제한 무료 (결제 유도 없음)
    aiMonthlyQuota: 10,
    canTip: true,
    canUsePremiumTheme: true,
    canCreateEventRoom: false,
    canAutoTranslate: true,
  },
  BUSINESS: {
    tier: 'BUSINESS',
    monthlyRoomQuota: -1,
    aiMonthlyQuota: -1,
    canTip: true,
    canUsePremiumTheme: true,
    canCreateEventRoom: true,
    canAutoTranslate: true,
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

// 사용자의 현재 채팅 권한 — Bean 상품 구독(bean_subscr) 기반.
//   PICAFE 구독 → PREMIUM 캡(그룹방 무제한·AI 10회·팁·프리미엄 테마),
//   TRANSLATE 구독 → 자동번역(PyTranslate™)만 부여.
//   레거시 Pi 구독(msg_subscr)은 더 이상 참조하지 않는다 (PRD_15_FEE §1-6 — CHAT_SUBSCR Pi 경로 폐기).
// 만료(expire_dtm <= now)·논리삭제(del_yn='Y')는 자동 제외 → 없으면 FREE.
// 운영자(ADMIN/MASTER)는 구독과 무관하게 BUSINESS 캡 보장(전 기능 운영·검증).
export async function getChatPlan(userId: string): Promise<ChatPlan> {
  const [{ data: subs }, { data: userRow }] = await Promise.all([
    getSupabaseAdmin()
      .from('bean_subscr')
      .select('prod_ctgr_cd, expire_dtm, auto_renew_yn')
      .eq('usr_id', userId)
      .eq('del_yn', 'N')
      .in('prod_ctgr_cd', ['PICAFE', 'TRANSLATE'])
      .gt('expire_dtm', new Date().toISOString()),
    getSupabaseAdmin()
      .from('sys_user')
      .select('role')
      .eq('id', userId)
      .maybeSingle(),
  ])

  const isOperator =
    (userRow as { role?: string } | null)?.role === 'ADMIN' ||
    (userRow as { role?: string } | null)?.role === 'MASTER'
  // 운영자는 구독 없이도 BUSINESS 전 기능(자동번역 포함)
  if (isOperator) return OPERATOR_PLAN

  type ActiveRow = {
    prod_ctgr_cd: string
    expire_dtm: string
    auto_renew_yn: string | null
  }
  const rows = (subs as ActiveRow[] | null) ?? []
  const picafe = rows.find((r) => r.prod_ctgr_cd === 'PICAFE')
  const translate = rows.find((r) => r.prod_ctgr_cd === 'TRANSLATE')

  // 미구독(PICAFE·TRANSLATE 둘 다 없음) → FREE
  if (!picafe && !translate) return FREE_PLAN

  // 채팅 등급은 PICAFE 구독 유무로 결정(PREMIUM 캡). 자동번역은 TRANSLATE 구독 전용으로 재정의.
  const tier: PlanTier = picafe ? 'PREMIUM' : 'FREE'
  const caps: PlanCaps = {
    ...PLAN_CAPS[tier],
    canAutoTranslate: !!translate,
  }

  // 만료·자동갱신 표시는 PICAFE 우선, 없으면 TRANSLATE
  const primary = picafe ?? translate!
  return {
    plan_cd: picafe ? 'PICAFE_SUBSCR' : 'TRANSLATE_SUBSCR',
    plan_nm: picafe ? 'PyCafé™ 구독' : 'PyTranslate™ 구독',
    tier,
    expire_dtm: primary.expire_dtm,
    auto_renew_yn: (primary.auto_renew_yn as 'Y' | 'N' | null) ?? null,
    caps,
  }
}

// 이번 달(UTC 1일 00:00~) 사용자가 OWNER로 개설한 그룹/이벤트방 수.
// regr_id는 표시명 슬러그라 신뢰 불가 → msg_room_mbr(OWNER)로 소유 방을 특정한다.
async function countOwnedRoomsThisMonth(userId: string): Promise<number> {
  const now = new Date()
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
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
  plan?: ChatPlan,
): Promise<RoomCreateAllowance> {
  const p = plan ?? (await getChatPlan(userId))
  const quota = p.caps.monthlyRoomQuota
  if (quota === -1) return { allowed: true, quota: -1, used: 0 }
  if (quota === 0) return { allowed: false, quota: 0, used: 0 }
  const used = await countOwnedRoomsThisMonth(userId)
  return { allowed: used < quota, quota, used }
}

export async function canSendTip(
  userId: string,
  plan?: ChatPlan,
): Promise<boolean> {
  const p = plan ?? (await getChatPlan(userId))
  return p.caps.canTip
}

// 자동번역(PyTranslate™) 사용 가능 여부 — 미구독(FREE)은 false.
// (엑셀 요금표: 자동번역은 구독 또는 1회 1 Bean. 현재는 구독 게이트만.)
export async function canAutoTranslate(
  userId: string,
  plan?: ChatPlan,
): Promise<boolean> {
  const p = plan ?? (await getChatPlan(userId))
  return p.caps.canAutoTranslate
}

export interface AiQuota {
  limit: number // 월 한도 (-1=무제한)
  used: number // 이번 달 사용량
  remaining: number // 남은 횟수 (-1=무제한)
}

// AI 봇 호출 잔여 한도.
// 이번 달 @ai 멘션 TEXT 메시지 수를 msg_msg에서 직접 집계.
export async function getAiQuota(
  userId: string,
  plan?: ChatPlan,
): Promise<AiQuota> {
  const p = plan ?? (await getChatPlan(userId))
  const limit = p.caps.aiMonthlyQuota
  if (limit === -1) return { limit: -1, used: 0, remaining: -1 }

  const now = new Date()
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString()
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
