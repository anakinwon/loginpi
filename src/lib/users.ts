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
  created_at: string
  updated_at: string
}

// Pi 로그인 시 upsert — pi_uid 기준
export async function upsertPiUser(piUser: {
  uid: string
  username: string | null
  walletAddress: string | null
}): Promise<UserRow> {
  const { data, error } = await getSupabaseAdmin()
    .from('users')
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

  if (error) throw error
  return data as UserRow
}

// Google 로그인 시 upsert — google_id 기준
export async function upsertGoogleUser(googleUser: {
  id: string
  email: string
  name: string | null
  image: string | null
}): Promise<UserRow> {
  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .upsert(
      {
        google_id: googleUser.id,
        google_email: googleUser.email,
        google_name: googleUser.name,
        google_image: googleUser.image,
        display_name: googleUser.name ?? googleUser.email,
      },
      { onConflict: 'google_id' }
    )
    .select()
    .single()

  if (error) throw error
  return data as UserRow
}

// 계정 연동: Pi users row에 Google 필드 병합, 독립 Google row 삭제
export async function linkGoogleToPiUser(
  piUserId: string,
  googleUserId: string
): Promise<void> {
  if (piUserId === googleUserId) return // 이미 연동됨

  // Google row 데이터 조회
  const { data: googleUser, error: fetchErr } = await getSupabaseAdmin()
    .from('users')
    .select('google_id, google_email, google_name, google_image')
    .eq('id', googleUserId)
    .single()

  if (fetchErr || !googleUser?.google_id) {
    throw new Error('Google 사용자를 찾을 수 없습니다')
  }

  // Pi row에 Google 필드 추가
  const { error: updateErr } = await getSupabaseAdmin()
    .from('users')
    .update({
      google_id: googleUser.google_id,
      google_email: googleUser.google_email,
      google_name: googleUser.google_name,
      google_image: googleUser.google_image,
    })
    .eq('id', piUserId)

  if (updateErr) throw updateErr

  // 독립 Google row 삭제
  await getSupabaseAdmin().from('users').delete().eq('id', googleUserId)
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const { data } = await getSupabaseAdmin()
    .from('users')
    .select()
    .eq('id', id)
    .single()
  return (data as UserRow) ?? null
}
