import 'server-only'
import { after } from 'next/server'
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
  // Phase 10 — 마이그레이션 014 추가 컬럼
  real_nm: string | null
  nick_nm: string | null
  phone_no: string | null
  addr: string | null
  addr_dtl: string | null
  // Phase 12 — 마이그레이션 020 추가 컬럼 (PiTranslate™ 표시 언어)
  display_locale_cd: string | null
  // 마이그레이션 027 — 카카오톡 연동 ID + 자기소개
  kakao_id: string | null
  self_intro: string | null
  // 마이그레이션 025 — 최근 로그인 일시 (도입 이전 사용자는 null)
  last_login_dtm: string | null
  // 마이그레이션 033 — LBS 위치기반서비스 동의 (Phase 15)
  lbs_consent_yn: string | null
  lbs_consent_dtm: string | null
  lbs_consent_ver: string | null
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
        last_login_dtm: new Date().toISOString(),
      },
      { onConflict: 'pi_uid' },
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
    id: string // Google OAuth sub
    email: string
    name: string | null
    image: string | null
  },
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

export async function updateUserProfile(
  userId: string,
  data: Partial<
    Pick<
      UserRow,
      | 'display_name'
      | 'real_nm'
      | 'nick_nm'
      | 'phone_no'
      | 'addr'
      | 'addr_dtl'
      | 'display_locale_cd'
      | 'kakao_id'
      | 'self_intro'
    >
  >,
): Promise<UserRow | null> {
  const { data: row } = await getSupabaseAdmin()
    .from('sys_user')
    .update({ ...data, modr_id: userId, mod_dtm: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .maybeSingle()
  return (row as UserRow) ?? null
}

// ─── 접속 기록 (last_login_dtm) ──────────────────────────────
// Pi Browser는 최초 로그인 후 localStorage 토큰을 재사용해 /api/auth/pi를 다시 타지 않으므로
// 로그인 시점 기록만으로는 이후 접속이 남지 않는다. getSessionUser() 인증 성공 시마다 호출해
// "접속"도 기록하되, 쓰기 폭증을 막기 위해 5분 단위로 스로틀한다.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000
const lastTouchAt = new Map<string, number>() // 인스턴스 메모리 스로틀 (서버리스 재기동 시 초기화 — DB 조건이 2차 방어)

export function touchLastLogin(userId: string): void {
  const now = Date.now()
  const prev = lastTouchAt.get(userId)
  if (prev && now - prev < TOUCH_INTERVAL_MS) return
  lastTouchAt.set(userId, now)

  const run = async () => {
    const threshold = new Date(now - TOUCH_INTERVAL_MS).toISOString()
    const { error } = await getSupabaseAdmin()
      .from('sys_user')
      .update({ last_login_dtm: new Date(now).toISOString() })
      .eq('id', userId)
      .or(`last_login_dtm.is.null,last_login_dtm.lt.${threshold}`)
    if (error) console.error('[users] last_login_dtm 갱신 실패:', error.message)
  }
  try {
    // 응답 이후 실행 보장 (recordActivity와 동일 패턴 — supabase 쿼리는 lazy thenable이라 await 필수)
    after(run)
  } catch {
    // 요청 스코프 밖 호출 시 즉시 실행
    void run()
  }
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
