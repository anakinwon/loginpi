import 'server-only'
import { after } from 'next/server'
import { getSupabaseAdmin } from './supabase-admin'
import { isReadOnlyDb } from './db-env'

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
  // Phase 12 — 마이그레이션 020 추가 컬럼 (PyTranslate™ 표시 언어)
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
  // 마이그레이션 127 — 논리삭제 (1인 1계정 원칙)
  del_yn: string
  del_dtm: string | null
  // 마이그레이션 163 — 재가입 이력 (동일인 재가입 시 행 부활 + 삭제 이전 기록 숨김 컷오프)
  rejoin_dtm: string | null
  // 삭제사유코드: WDRW(자진탈퇴)·ADMIN_BLCK(관리자차단)·SYS_DUP(uid 재발급 중복정리)
  // NULL(기존 행) = 사유 미상 → 부활 금지(안전 기본값)
  del_rsn_cd: string | null
  reg_dtm: string
  mod_dtm: string
}

// Pi 로그인 시 upsert — ① pi_uid 일치 ② 불변 키(pi_username) 폴백 재바인딩 ③ 신규 INSERT
//
// ⭐관문 보호(2026-07-02 uid 재발급 사고 근본수정): Pi uid는 사람의 고유값이 아니라
// (포털 앱 등록 × 테스트넷/메인넷) scoped 값이다. sandbox 플립·메인넷 전환·포털 앱
// 변경 시 전 사용자 uid가 재발급되며, uid만 기준으로 upsert하면 전원이 신규 계정으로
// 튄다(중복 행 생성·약관 재동의·Bean/결제이력 단절). pi_username은 Pi 네트워크 전역
// 유일 + /v2/me 검증값이므로, 처음 보는 uid라도 같은 username의 활성 계정이 있으면
// 그 행에 uid를 재바인딩해 원 계정으로 잇는다. (google_email 폴백 45d02aa와 동형)
export async function upsertPiUser(piUser: {
  uid: string
  username: string | null
  walletAddress: string | null
}): Promise<UserRow> {
  // 읽기전용(운영DB 프리뷰) 모드: 쓰기 불가 → 기존 사용자 read 반환(세션 정상 유지).
  // 신규 가입만 불가(프리뷰 모드의 의도된 제약).
  if (isReadOnlyDb()) {
    const existing = await getUserByPiUid(piUser.uid)
    if (existing) return existing
    // uid 재발급 상황 대비 — 재바인딩(쓰기)은 못 하지만 원 계정 세션은 유지한다
    if (piUser.username) {
      const { data } = await getSupabaseAdmin()
        .from('sys_user')
        .select()
        .eq('pi_username', piUser.username)
        .eq('del_yn', 'N')
        .order('reg_dtm', { ascending: true })
        .limit(1)
      if (data?.[0]) return data[0] as UserRow
    }
    throw new Error('읽기전용 모드: 신규 Pi 사용자 생성 불가')
  }

  const db = getSupabaseAdmin()
  const nowIso = new Date().toISOString()

  // ② 불변 키 폴백 — 이 uid를 가진 행이 전무한데(비활성 포함 — 비활성 계정 차단 동작은
  // 아래 upsert가 그대로 보존) 같은 username의 활성 계정이 있으면 uid 재바인딩.
  const { data: uidHolder } = await db
    .from('sys_user')
    .select('id')
    .eq('pi_uid', piUser.uid)
    .maybeSingle()
  if (!uidHolder && piUser.username) {
    const { data: candidates } = await db
      .from('sys_user')
      .select()
      .eq('pi_username', piUser.username)
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: true }) // 중복 존재 시 최고참 행 = 정본
      .limit(1)
    const original = candidates?.[0] as UserRow | undefined
    if (original) {
      const { data: rebound, error: rebindError } = await db
        .from('sys_user')
        .update({
          pi_uid: piUser.uid,
          pi_wallet_address: piUser.walletAddress,
          last_login_dtm: nowIso,
          modr_id: 'SYSTEM',
          mod_dtm: nowIso,
        })
        .eq('id', original.id)
        .select()
        .single()
      if (!rebindError && rebound) {
        console.warn(
          `[auth] pi_uid 재바인딩: @${piUser.username} ${original.pi_uid} → ${piUser.uid}`,
        )
        return rebound as UserRow
      }
      // 재바인딩 실패는 기록만 하고 기존 경로로 폴스루 — 로그인 관문 자체는 살린다
      console.error('[auth] pi_uid 재바인딩 실패:', rebindError?.message)
    } else {
      // ②-b 재가입 부활(마스터 정책 2026-07-02): 같은 username의 논리삭제 행이 있으면
      // 새 행을 만들지 않고 그 행을 살린다(pi_username 유일성 절대 원칙 — 중복 행 금지).
      // rejoin_dtm = 이력 컷오프: 이 시각 이전 기록은 사용자에게 보이지 않게 한다.
      // 부활 허용 사유는 WDRW(자진탈퇴)·SYS_DUP(시스템 정리)만 — 그 외(관리자 차단·미상)는
      // 부활 금지이며, 신규 INSERT로 이어지면 차단 우회가 되므로 로그인 자체를 거부한다.
      const { data: delCands } = await db
        .from('sys_user')
        .select()
        .eq('pi_username', piUser.username)
        .eq('del_yn', 'Y')
        .order('reg_dtm', { ascending: true })
        .limit(1)
      const delRow = delCands?.[0] as UserRow | undefined
      if (delRow) {
        if (delRow.del_rsn_cd !== 'WDRW' && delRow.del_rsn_cd !== 'SYS_DUP') {
          throw new Error('비활성 계정입니다. 관리자에게 문의하세요.')
        }
        const { data: revived, error: reviveError } = await db
          .from('sys_user')
          .update({
            del_yn: 'N',
            del_dtm: null,
            rejoin_dtm: nowIso, // 삭제 이전 기록 숨김 컷오프 (del_rsn_cd는 이력으로 보존)
            pi_uid: piUser.uid,
            pi_wallet_address: piUser.walletAddress,
            last_login_dtm: nowIso,
            // 동의 캐시 초기화 — 재가입자는 약관·LBS 재동의
            lbs_consent_yn: null,
            lbs_consent_dtm: null,
            lbs_consent_ver: null,
            modr_id: 'SYSTEM',
            mod_dtm: nowIso,
          })
          .eq('id', delRow.id)
          .select()
          .single()
        if (!reviveError && revived) {
          // 삭제 이전 동의 이력 숨김(논리삭제) — getUserConsents가 del_yn='N'만 보므로
          // 재가입자에게 약관 동의가 새로 뜬다 (기록 자체는 보존).
          await db
            .from('sys_user_consent')
            .update({
              del_yn: 'Y',
              del_dtm: nowIso,
              modr_id: 'SYSTEM',
              mod_dtm: nowIso,
            })
            .eq('user_str_id', delRow.id)
            .eq('del_yn', 'N')
          console.warn(
            `[auth] 재가입 부활: @${piUser.username} (${delRow.id}) rejoin_dtm=${nowIso}`,
          )
          return revived as UserRow
        }
        // 부활 실패는 기록 후 폴스루 — 단, UNIQUE 인덱스(162)가 중복 INSERT를 막아준다
        console.error('[auth] 재가입 부활 실패:', reviveError?.message)
      }
    }
  }

  // ①·③ 기존 경로 — uid 일치 행 갱신 또는 진짜 신규 가입
  const { data, error } = await db
    .from('sys_user')
    .upsert(
      {
        pi_uid: piUser.uid,
        pi_username: piUser.username,
        pi_wallet_address: piUser.walletAddress,
        display_name: piUser.username ?? `pi_${piUser.uid.slice(0, 8)}`,
        last_login_dtm: nowIso,
      },
      { onConflict: 'pi_uid' },
    )
    .select()
    .single()

  if (error) throw new Error(error.message ?? 'Pi 사용자 저장 실패')
  return data as UserRow
}

// 연동 코드 입력 완료 시: Pi row에 Google 필드 UPDATE
// 1) Google-only 고아 행(pi_uid=NULL)을 먼저 비활성화(google_id NULL 초기화 → UNIQUE 충돌 방지)
// 2) 이후 Pi row에 Google 필드 덮어쓰기
export async function updatePiUserWithGoogle(
  piUserId: string,
  googleUser: {
    id: string // Google OAuth sub
    email: string
    name: string | null
    image: string | null
  },
): Promise<void> {
  const db = getSupabaseAdmin()
  const now = new Date().toISOString()
  const softDelete = {
    google_id: null as string | null, // UNIQUE 제약 선해제 (del_yn='Y'만으론 충돌 잔존)
    del_yn: 'Y',
    del_dtm: now,
    modr_id: 'SYSTEM',
    mod_dtm: now,
  }

  // google_id(sub) 기준 고아 행 비활성화
  await db
    .from('sys_user')
    .update(softDelete)
    .eq('del_yn', 'N')
    .is('pi_uid', null)
    .eq('google_id', googleUser.id)
    .neq('id', piUserId)

  // google_email 기준 고아 행 비활성화 (google_id 미설정 중복 행 포함)
  await db
    .from('sys_user')
    .update(softDelete)
    .eq('del_yn', 'N')
    .is('pi_uid', null)
    .eq('google_email', googleUser.email)
    .neq('id', piUserId)

  const { error } = await db
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
  // .single()은 0행일 때 에러를 던진다(CLAUDE.md 규칙) → orphan id 대비 .maybeSingle()
  // del_yn='N' 필수 — 세션 검증 경로(getSessionUser)의 계정 차단 단일지점 (KISA IE)
  const { data } = await getSupabaseAdmin()
    .from('sys_user')
    .select()
    .eq('id', id)
    .eq('del_yn', 'N')
    .maybeSingle()
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
  if (isReadOnlyDb()) return // 읽기전용 모드: 접속기록 쓰기 스킵(세션 검증 read는 정상)
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
// del_yn='N' 필수 — 비활성 계정이 유효 토큰으로 인증을 통과하지 못하게 차단 (KISA IE)
// 재가입 부활은 upsertPiUser가 del_yn='Y' 행을 별도 쿼리로 직접 찾으므로 영향 없음
export async function getUserByPiUid(uid: string): Promise<UserRow | null> {
  const { data } = await getSupabaseAdmin()
    .from('sys_user')
    .select()
    .eq('pi_uid', uid)
    .eq('del_yn', 'N')
    .maybeSingle()
  return (data as UserRow) ?? null
}

export async function getUserByGoogleId(
  googleId: string,
): Promise<UserRow | null> {
  const { data } = await getSupabaseAdmin()
    .from('sys_user')
    .select()
    .eq('google_id', googleId)
    .eq('del_yn', 'N')
    .maybeSingle()
  return (data as UserRow) ?? null
}

// google_email로 조회 — stale JWT(orphan userId)·google_id 불일치 시 최종 폴백.
// 이메일은 불변 키라 DB 재적재로 sys_user.id가 재생성돼도 본인을 찾는다.
// Pi 연동(pi_uid 보유) 활성 행만, 최古 1건. (getSessionUser가 pi_uid 없으면 차단하므로 보유 행 우선)
export async function getUserByGoogleEmail(
  email: string,
): Promise<UserRow | null> {
  const { data } = await getSupabaseAdmin()
    .from('sys_user')
    .select()
    .eq('google_email', email)
    .eq('del_yn', 'N')
    .not('pi_uid', 'is', null)
    .order('reg_dtm', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as UserRow) ?? null
}

// Google 전용 사용자 신규 생성 — Pi 계정 없이 Google만으로 로그인하는 PC 사용자용
export async function upsertGoogleUser(googleUser: {
  id: string
  email: string | null
  name: string | null
  image: string | null
}): Promise<UserRow> {
  // 읽기전용 모드: 쓰기 불가 → 기존 사용자 read 반환. 신규는 생성 불가.
  if (isReadOnlyDb()) {
    const byId = await getUserByGoogleId(googleUser.id)
    if (byId) return byId
    throw new Error('읽기전용 모드: 신규 Google 사용자 생성 불가')
  }
  const { data, error } = await getSupabaseAdmin()
    .from('sys_user')
    .upsert(
      {
        google_id: googleUser.id,
        google_email: googleUser.email,
        google_name: googleUser.name,
        google_image: googleUser.image,
        display_name:
          googleUser.name ??
          googleUser.email ??
          `google_${googleUser.id.slice(0, 8)}`,
        last_login_dtm: new Date().toISOString(),
      },
      { onConflict: 'google_id' },
    )
    .select()
    .single()

  if (error) throw new Error(error.message ?? 'Google 사용자 저장 실패')
  return data as UserRow
}
