import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { getChatMemberStatus } from './telegram'

// 매장 직원 열람 권한 — "매장 Telegram 그룹방 멤버 = 그 매장 판매 관리 열람 가능" (2026-07-15 마스터 지시)
//   별도 직원 테이블 없이 그룹 초대/강퇴가 곧 권한 부여/회수 — 알림 수신자와 열람 권한자가 항상 일치.
//   판정 경로: 내 개인 Telegram 연동(sys_user.tlgm_chat_id, 개인 chat_id=Telegram user id)
//              ↔ 그룹 바인딩 매장(mps_shop.tlgm_chat_id<0) getChatMember 멤버십 조회.
//   전제: 직원은 앱 가입 + 프로필 개인정보 탭에서 개인 Telegram 연동을 마쳐야 한다.
//   범위: 열람(read) 전용 — 주문 상태 전이·취소 등 쓰기는 소유자(seller) 전용 유지.

// left/kicked 제외 전원 허용 — restricted(제한 멤버)도 그룹 알림은 받으므로 열람 포함
const MEMBER_OK = new Set(['creator', 'administrator', 'member', 'restricted'])

// Telegram API 호출 절약 캐시 — 그룹 강퇴(권한 회수) 반영 지연 최대 TTL만큼 허용
const TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { ids: string[]; exp: number }>()

// 내가(소유자 아님) 그룹방 멤버로 참여 중인 매장 shop_id 목록.
//   그룹 바인딩 매장 수는 플랫폼 전체 기준 소수(매장당 1그룹) — 순차 조회로 충분.
export async function getStaffShopIds(userId: string): Promise<string[]> {
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
