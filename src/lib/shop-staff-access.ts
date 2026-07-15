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
