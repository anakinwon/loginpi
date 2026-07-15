import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { getChatMemberStatus } from './telegram'

// 판매 관리 매니저 권한 (sql/181, 2026-07-15 마스터 결정 — 자동 동기화 + 명시 통제)
//   권한 원장은 mps_shop_staff 단일: 매니저 = 판매 관리 열람 + 상태 변경(접수·준비완료·거래완료).
//   등록 경로 2가지, 해제는 하나:
//     ① 자동: 매장 Telegram 그룹방 멤버(앱 가입+개인 연동자)를 syncGroupManagers가 자동 등록.
//     ② 수동: 소유자가 매장 보기 → 판매 관리 매니저에서 Pi username 콤마 입력.
//     해제(×): 논리삭제(del_yn='Y') — 그룹에 남아 있어도 재동기화로 부활하지 않음(제외 표식).
//   취소·환불은 소유자 전용 유지. 매니저 행위는 modr_id로 감사 추적.

// 내가 매니저(mps_shop_staff)로 소속된 매장 shop_id 목록 — 열람·상태 변경 권한의 기준.
//   테이블 미생성(마이그레이션 전) 등 조회 실패는 빈 배열로 강등 — 기능만 비활성.
export async function getRegisteredStaffShopIds(
  userId: string,
): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('mps_shop_staff')
    .select('shop_id')
    .eq('usr_id', userId)
    .eq('del_yn', 'N')
  if (error) return []
  return (data ?? []).map((r) => (r as { shop_id: string }).shop_id)
}

// 매니저 여부 단건 판정 — 주문 상태 변경 API 인가에 사용
export async function isRegisteredStaff(
  userId: string,
  shopId: string,
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('mps_shop_staff')
    .select('staff_id')
    .eq('usr_id', userId)
    .eq('shop_id', shopId)
    .eq('del_yn', 'N')
    .maybeSingle()
  return !error && !!data
}

// 주문 상태 변경 인가 — 소유자(seller) 또는 그 매장 매니저면 실제 seller_id 반환.
//   mark* 함수는 무결성을 위해 .eq('seller_id', ...)를 유지하므로, 매니저 대행 시에도
//   주문의 실제 seller_id로 호출하고 modr_id에는 행위자(actor)를 기록한다.
export async function resolveOrderSeller(
  orderId: string,
  userId: string,
): Promise<string | null> {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('mps_order')
    .select('seller_id, shop_id, mps_item(shop_id)')
    .eq('order_id', orderId)
    .eq('del_yn', 'N')
    .maybeSingle()
  if (!data) return null
  const row = data as {
    seller_id: string
    shop_id: string | null
    mps_item?: unknown
  }
  if (row.seller_id === userId) return row.seller_id

  // 매장 판정: 카트 주문=헤더 shop_id, 단건 주문=대표 item의 shop_id
  const rawItem = row.mps_item
  const itemObj = Array.isArray(rawItem) ? rawItem[0] : rawItem
  const shopId =
    row.shop_id ?? (itemObj as { shop_id?: string | null } | null)?.shop_id
  if (!shopId) return null

  return (await isRegisteredStaff(userId, shopId)) ? row.seller_id : null
}

// ── 그룹 멤버 자동 동기화 ────────────────────────────────────────────

// left/kicked 제외 전원 — restricted(제한 멤버)도 그룹 알림은 받으므로 매니저 대상
const MEMBER_OK = new Set(['creator', 'administrator', 'member', 'restricted'])
// 역방향 대조 규모 상한(개인 Telegram 연동 사용자 수 기준) + Telegram API 절약 캐시
const SCAN_LIMIT = 200
const SYNC_TTL_MS = 10 * 60 * 1000
const syncCache = new Map<string, { ownerInGroup: boolean; exp: number }>()

// 매장 그룹방 멤버를 mps_shop_staff에 자동 등록(실체화).
//   Bot API는 그룹 멤버 열거 불가 → 역방향 대조(앱 가입+개인 연동자 전수 × getChatMember).
//   행이 이미 있으면 불변: del_yn='N'=이미 매니저 / del_yn='Y'=×로 제외됨(부활 금지).
//   소유자는 등록 대상 아님(전권 보유) — 그룹 참여 여부만 반환(목록 칩 표시용).
export async function syncGroupManagers(shopId: string): Promise<boolean> {
  const hit = syncCache.get(shopId)
  if (hit && hit.exp > Date.now()) return hit.ownerInGroup

  const db = getSupabaseAdmin()
  const { data: shop } = await db
    .from('mps_shop')
    .select('tlgm_chat_id, tlgm_conn_yn, seller_id')
    .eq('shop_id', shopId)
    .eq('del_yn', 'N')
    .maybeSingle()
  const s = shop as {
    tlgm_chat_id: number | null
    tlgm_conn_yn: string
    seller_id: string
  } | null
  // 그룹(음수 chat_id) 바인딩 매장만 동기화 대상
  if (!s || s.tlgm_conn_yn !== 'Y' || !s.tlgm_chat_id || s.tlgm_chat_id >= 0) {
    return false
  }

  const { data: users } = await db
    .from('sys_user')
    .select('id, tlgm_chat_id')
    .eq('tlgm_conn_yn', 'Y')
    .gt('tlgm_chat_id', 0)
    .eq('del_yn', 'N')
    .limit(SCAN_LIMIT)
  const candidates = (users ?? []) as Array<{
    id: string
    tlgm_chat_id: number
  }>

  const memberChecks = await Promise.all(
    candidates.map(async (u) => {
      const st = await getChatMemberStatus(s.tlgm_chat_id!, u.tlgm_chat_id)
      return st && MEMBER_OK.has(st) ? u.id : null
    }),
  )
  const memberIds = memberChecks.filter(Boolean) as string[]
  const ownerInGroup = memberIds.includes(s.seller_id)
  const staffIds = memberIds.filter((id) => id !== s.seller_id)

  if (staffIds.length > 0) {
    // 행이 하나라도 있는(등록됐거나 ×로 제외된) 사용자는 건드리지 않는다
    const { data: existing } = await db
      .from('mps_shop_staff')
      .select('usr_id')
      .eq('shop_id', shopId)
      .in('usr_id', staffIds)
    const known = new Set(
      (existing ?? []).map((r) => (r as { usr_id: string }).usr_id),
    )
    const fresh = staffIds.filter((id) => !known.has(id))
    if (fresh.length > 0) {
      await db.from('mps_shop_staff').insert(
        fresh.map((usr_id) => ({
          shop_id: shopId,
          usr_id,
          regr_id: 'TLGM_SYNC', // 그룹 자동 동기화 등록 표식
          modr_id: 'TLGM_SYNC',
        })),
      )
    }
  }

  syncCache.set(shopId, { ownerInGroup, exp: Date.now() + SYNC_TTL_MS })
  return ownerInGroup
}
