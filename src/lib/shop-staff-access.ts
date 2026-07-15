import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// 판매 관리 매니저 권한 — 등록 매니저 일원화 (2026-07-15 마스터 결정, sql/181)
//   mps_shop_staff 등록 매니저: 판매 관리 열람 + 주문 상태 변경(접수·준비완료·거래완료).
//   소유자가 앱(매장 보기 → 판매 관리 매니저)에서 Pi username으로 등록/해제(논리삭제 del_yn).
//   Telegram 그룹은 순수 알림 채널 — 그룹 멤버 자동 열람은 폐지(통제 불가·차단 불가 문제).
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
