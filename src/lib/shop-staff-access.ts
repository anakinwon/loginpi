import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { getChatMemberStatus } from './telegram'

// 매장 직원 권한 — 2단계 체계 (2026-07-15 마스터 지시, sql/181)
//   ① 등록 직원(mps_shop_staff): 판매 관리 열람 + 주문 상태 변경(접수·준비완료·거래완료).
//      소유자가 앱(매장 보기 → 직원 관리)에서 Pi username으로 등록/해제.
//   ② 매장 Telegram 그룹방 멤버: 판매 관리 열람만 — 그룹 초대/강퇴가 곧 열람 권한 부여/회수.
//      판정 경로: 내 개인 Telegram 연동(sys_user.tlgm_chat_id=Telegram user id)
//                 ↔ 그룹 바인딩 매장(mps_shop.tlgm_chat_id<0) getChatMember 멤버십 조회.
//   쓰기를 그룹 멤버십에 걸지 않는 이유: Telegram 장애가 주문 처리를 막으면 안 되고,
//   그룹의 임의 멤버가 주문 상태를 조작할 수 없어야 한다. 취소·환불은 소유자 전용 유지.

// left/kicked 제외 전원 허용 — restricted(제한 멤버)도 그룹 알림은 받으므로 열람 포함
const MEMBER_OK = new Set(['creator', 'administrator', 'member', 'restricted'])

// Telegram API 호출 절약 캐시 — 그룹 강퇴(권한 회수) 반영 지연 최대 TTL만큼 허용
const TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { ids: string[]; exp: number }>()

// 내가 등록 직원(mps_shop_staff)으로 소속된 매장 shop_id 목록 — 상태 변경 권한의 기준.
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

// 등록 직원 여부 단건 판정 — 주문 상태 변경 API 인가에 사용
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

// 주문 상태 변경 인가 — 소유자(seller) 또는 그 매장 등록 직원이면 실제 seller_id 반환.
//   mark* 함수는 무결성을 위해 .eq('seller_id', ...)를 유지하므로, 직원 대행 시에도
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

// 내가(소유자 아님) 그룹방 멤버로 참여 중인 매장 shop_id 목록 (열람 전용 경로).
//   그룹 바인딩 매장 수는 플랫폼 전체 기준 소수(매장당 1그룹) — 순차 조회로 충분.
export async function getGroupStaffShopIds(userId: string): Promise<string[]> {
  const hit = cache.get(userId)
  if (hit && hit.exp > Date.now()) return hit.ids

  const db = getSupabaseAdmin()
  const ids: string[] = []

  const { data: me } = await db
    .from('sys_user')
    .select('tlgm_chat_id, tlgm_conn_yn')
    .eq('id', userId)
    .maybeSingle()
  const my = me as { tlgm_chat_id: number | null; tlgm_conn_yn: string } | null
  // 개인 연동 chat_id가 양수일 때만 Telegram user id로 사용 가능 (그룹 바인딩 계정은 제외)
  const myTlgmId =
    my?.tlgm_conn_yn === 'Y' && my.tlgm_chat_id && my.tlgm_chat_id > 0
      ? my.tlgm_chat_id
      : null

  if (myTlgmId) {
    const { data: shops } = await db
      .from('mps_shop')
      .select('shop_id, tlgm_chat_id')
      .eq('tlgm_conn_yn', 'Y')
      .eq('del_yn', 'N')
      .neq('seller_id', userId) // 본인 매장은 소유자 경로로 이미 조회됨
      .lt('tlgm_chat_id', 0) // 그룹 바인딩 매장만 (개인 바인딩은 공유 개념 없음)
    for (const s of shops ?? []) {
      const sr = s as { shop_id: string; tlgm_chat_id: number }
      const st = await getChatMemberStatus(sr.tlgm_chat_id, myTlgmId)
      if (st && MEMBER_OK.has(st)) ids.push(sr.shop_id)
    }
  }

  cache.set(userId, { ids, exp: Date.now() + TTL_MS })
  return ids
}

// 판매 관리 열람 가능 매장 전체 — 등록 직원(쓰기 겸용) ∪ 그룹 멤버(열람만)
export async function getStaffShopIds(userId: string): Promise<string[]> {
  const [registered, group] = await Promise.all([
    getRegisteredStaffShopIds(userId),
    getGroupStaffShopIds(userId),
  ])
  return [...new Set([...registered, ...group])]
}

export interface ShopStaffEntry {
  usr_id: string
  name: string // 별명 > Pi username > display_name
  is_owner: boolean
}

// 역방향 대조 규모 상한 — 개인 Telegram 연동 사용자가 이 수를 넘으면 목록을 자르고 로그
const STAFF_SCAN_LIMIT = 200

const staffListCache = new Map<
  string,
  { list: ShopStaffEntry[]; exp: number }
>()

// "이 매장 그룹에서 판매 관리를 볼 수 있는 직원 목록" — 소유자 확인용 (연동 패널 표시).
//   Bot API는 그룹 전체 멤버 열거가 불가 → 역방향 대조: 앱 가입 + 개인 Telegram 연동 완료
//   사용자 전수 × getChatMember. 그룹 멤버여도 앱 미가입/미연동자는 나타나지 않는다(=열람도 불가).
//   그룹 바인딩 매장이 아니면 null(목록 개념 없음).
export async function listShopStaff(
  shopId: string,
): Promise<ShopStaffEntry[] | null> {
  const hit = staffListCache.get(shopId)
  if (hit && hit.exp > Date.now()) return hit.list

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
  // 그룹(음수 chat_id) 바인딩 매장만 목록 제공
  if (!s || s.tlgm_conn_yn !== 'Y' || !s.tlgm_chat_id || s.tlgm_chat_id >= 0) {
    return null
  }

  const { data: users } = await db
    .from('sys_user')
    .select('id, nick_nm, display_name, pi_username, tlgm_chat_id')
    .eq('tlgm_conn_yn', 'Y')
    .gt('tlgm_chat_id', 0)
    .eq('del_yn', 'N')
    .limit(STAFF_SCAN_LIMIT + 1)
  const candidates = (users ?? []) as Array<{
    id: string
    nick_nm: string | null
    display_name: string | null
    pi_username: string | null
    tlgm_chat_id: number
  }>
  if (candidates.length > STAFF_SCAN_LIMIT) {
    console.warn(
      `[shop-staff] 개인 연동 사용자 ${STAFF_SCAN_LIMIT}명 초과 — 목록이 잘렸을 수 있음 (역방향 대조 상한)`,
    )
  }

  // 멤버십 병렬 조회 — 대상은 개인 연동 완료자뿐이라 규모 제한적
  const checks = await Promise.all(
    candidates.slice(0, STAFF_SCAN_LIMIT).map(async (u) => {
      const st = await getChatMemberStatus(s.tlgm_chat_id!, u.tlgm_chat_id)
      return st && MEMBER_OK.has(st) ? u : null
    }),
  )
  const list: ShopStaffEntry[] = checks
    .filter(Boolean)
    .map((u) => ({
      usr_id: u!.id,
      name:
        u!.nick_nm || u!.pi_username || u!.display_name || u!.id.slice(0, 8),
      is_owner: u!.id === s.seller_id,
    }))
    .sort((a, b) => Number(b.is_owner) - Number(a.is_owner))

  staffListCache.set(shopId, { list, exp: Date.now() + TTL_MS })
  return list
}
