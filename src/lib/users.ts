import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

export interface UserRow {
  id: string
  pi_uid: string | null
  pi_username: string | null
  pi_wallet_address: string | null
  google_id: string | null
  google_email: string | null
  google_name: string | null
  google_image: string | null
  display_name: string
  role: string
  reg_dtm: string
  mod_dtm: string
}

// Pi 로그인 시 upsert — pi_uid 기준 (항상 1건만 유지)
export async function upsertPiUser(piUser: {
  uid: string
  username: string | null
  walletAddress: string | null
}): Promise<UserRow> {
  const { data, error } = await getSupabaseAdmin()
    .from('sys_user')
    .upsert(
      {
        pi_uid: piUser.uid,
        pi_username: piUser.username,
        pi_wallet_address: piUser.walletAddress,
        display_name: piUser.username ?? `pi_${piUser.uid.slice(0, 8)}`,
      },
      { onConflict: 'pi_uid' }
    )
    .select()
    .single()

  if (error) throw new Error(error.message ?? 'Pi 사용자 저장 실패')
  return data as UserRow
}

// 연동 코드 입력 완료 시: Pi row에 Google 필드 UPDATE
// Google 전용 row를 별도 생성하지 않고 기존 Pi row에 직접 업데이트
export async function updatePiUserWithGoogle(
  piUserId: string,
  googleUser: {
    id: string    // Google OAuth sub
    email: string
    name: string | null
    image: string | null
  }
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('sys_user')
    .update({
      google_id: googleUser.id,
      google_email: googleUser.email,
      google_name: googleUser.name,
      google_image: googleUser.image,
    })
    .eq('id', piUserId)

  if (error) throw new Error(error.message ?? '계정 연동 실패')
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const { data } = await getSupabaseAdmin()
    .from('sys_user')
    .select()
    .eq('id', id)
    .single()
  return (data as UserRow) ?? null
}

// pi_uid로 조회 — 구버전 쿠키(userId='')나 DB 오류 시 폴백용
export async function getUserByPiUid(uid: string): Promise<UserRow | null> {
  const { data } = await getSupabaseAdmin()
    .from('sys_user')
    .select()
    .eq('pi_uid', uid)
    .single()
  return (data as UserRow) ?? null
}
