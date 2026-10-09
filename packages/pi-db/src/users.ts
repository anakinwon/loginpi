// @pi/db — Pi 사용자(sys_user) 함수: upsertPiUser(uid→username 재바인딩·재가입 부활)·조회·접속 기록.
// 출처: cafe.pi src/lib/users.ts Pi 함수 복사 추출(Google 경로·프로필 수정 제외). 컬럼은 baseline sys_user(000_baseline.sql) 기준.
// ⭐사용자 매칭 철칙: pi_uid는 (포털 앱 × Testnet/Mainnet) scoped 값 — 사람의 불변 키는 pi_username.
import 'server-only'
import { after } from 'next/server'
import { getSupabaseAdmin } from './supabase-admin'
import { isReadOnlyDb, resolveDbTier } from './db-env'

// sys_user 행 형태 — packages/pi-db/sql/000_baseline.sql 정본(Pi 전용 최소 컬럼, cafe 전용 Google·LBS·프로필 컬럼 제외)
export interface UserRow {
  id: string
  pi_uid: string | null
  pi_username: string | null
  pi_wallet_address: string | null
  display_name: string
  // ADMIN(최상위) / USER — 문자열 단독 비교 대신 isAdmin()·isMaster()
  role: string
  last_login_dtm: string | null
  // 재가입 이력 컷오프 — 이 시각 이전 기록은 사용자에게 숨긴다
  rejoin_dtm: string | null
  // 삭제사유코드: WDRW(자진탈퇴)·ADMIN_BLCK(관리자차단)·SYS_DUP(uid 재발급 중복정리), NULL=미상(부활 금지)
  del_rsn_cd: string | null
  del_yn: string
  del_dtm: string | null
  regr_id: string
  reg_dtm: string
  modr_id: string
  mod_dtm: string
}

export interface PiUserInput {
  uid: string
  username: string | null
  walletAddress: string | null
}

// 로그인 거부 — code는 @pi/guard AUTH_ERRORS 키. @pi/auth 라우트가 403 + code로 응답한다(세션 미발급)
export class PiLoginRejectedError extends Error {
  constructor(
    readonly code: 'AUTH_PI_ACCOUNT_CONFLICT' | 'AUTH_PI_ACCOUNT_INACTIVE',
    message: string,
  ) {
    super(message)
    this.name = 'PiLoginRejectedError'
  }
}

export interface UpsertPiUserOptions {
  // 처음 보는 uid + 같은 pi_username 행 존재 시 그 행에 uid 재바인딩(활성)·부활(논리삭제)할지. 기본 true(cafe 의미).
  // false = 다른 Pi 앱이 발급한 토큰의 username 재사용(계정 탈취) 차단 → 로그인 거부(AUTH_PI_ACCOUNT_CONFLICT).
  // ADMIN 계정은 이 옵션과 무관하게 재바인딩하지 않는다
  rebindByUsername?: boolean
  // 재가입 부활 직후 사이트 고유 정리(예: cafe의 동의 이력 논리삭제·LBS 동의 초기화). 실패는 로그인에 영향 없음
  onRevive?: (userId: string) => Promise<void> | void
}

// Pi 로그인 upsert — ① pi_uid 일치 ② 불변 키(pi_username) 폴백 재바인딩 ②-b 재가입 부활 ③ 신규 INSERT
// sandbox 플립·메인넷 전환·포털 앱 변경 시 uid가 전원 재발급되므로, 처음 보는 uid라도
// 같은 username의 활성 계정이 있으면 그 행에 uid를 재바인딩해 원 계정으로 잇는다.
export async function upsertPiUser(
  piUser: PiUserInput,
  opts: UpsertPiUserOptions = {},
): Promise<UserRow> {
  // 읽기전용 모드: 쓰기 불가 → 기존 사용자 read 반환(세션 유지), 신규 가입만 불가
  if (isReadOnlyDb()) {
    const existing = await getUserByPiUid(piUser.uid)
    if (existing) return existing
    if (piUser.username) {
      const { data } = await getSupabaseAdmin()
        .from('sys_user')
        .select()
        .eq('pi_username', piUser.username)
        .eq('del_yn', 'N')
        .order('reg_dtm', { ascending: true })
        .limit(1)
      const row = data?.[0] as UserRow | undefined
      // uid 불일치 username 매칭 = 재바인딩과 같은 위험 → 쓰기 경로와 동일 규칙으로 거부
      if (row && (opts.rebindByUsername === false || isAdminRole(row.role)))
        throw accountConflict()
      if (row) return row
    }
    throw new Error('읽기전용 모드: 신규 Pi 사용자 생성 불가')
  }

  const db = getSupabaseAdmin()
  const nowIso = new Date().toISOString()

  // ② 이 uid를 가진 행이 전무(비활성 포함)할 때만 username 폴백
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
      if (opts.rebindByUsername === false || isAdminRole(original.role)) {
        console.warn(
          `[auth] pi_uid 재바인딩 거부: @${piUser.username} ${original.pi_uid} → ${piUser.uid}`,
        )
        throw accountConflict()
      }
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
      // 재바인딩 실패는 기록만 하고 기존 경로로 폴스루 — 로그인 관문은 살린다
      console.error('[auth] pi_uid 재바인딩 실패:', rebindError?.message)
    } else {
      // ②-b 재가입 부활: 같은 username의 논리삭제 행을 살린다(pi_username 유일성 — 중복 행 금지).
      // 부활 허용 사유는 WDRW·SYS_DUP만 — 그 외는 신규 INSERT가 차단 우회가 되므로 로그인 거부
      const { data: delCands } = await db
        .from('sys_user')
        .select()
        .eq('pi_username', piUser.username)
        .eq('del_yn', 'Y')
        .order('reg_dtm', { ascending: true })
        .limit(1)
      const delRow = delCands?.[0] as UserRow | undefined
      if (delRow) {
        // 부활도 uid 재바인딩이다 — 옵션 false·ADMIN 행이면 같은 사유로 거부(신규 INSERT로 우회도 불가)
        if (opts.rebindByUsername === false || isAdminRole(delRow.role)) {
          throw accountConflict()
        }
        if (delRow.del_rsn_cd !== 'WDRW' && delRow.del_rsn_cd !== 'SYS_DUP') {
          throw new PiLoginRejectedError(
            'AUTH_PI_ACCOUNT_INACTIVE',
            '비활성 계정입니다. 관리자에게 문의하세요.',
          )
        }
        const { data: revived, error: reviveError } = await db
          .from('sys_user')
          .update({
            del_yn: 'N',
            del_dtm: null,
            rejoin_dtm: nowIso, // del_rsn_cd는 이력으로 보존
            pi_uid: piUser.uid,
            pi_wallet_address: piUser.walletAddress,
            last_login_dtm: nowIso,
            modr_id: 'SYSTEM',
            mod_dtm: nowIso,
          })
          .eq('id', delRow.id)
          .select()
          .single()
        if (!reviveError && revived) {
          try {
            await opts.onRevive?.(delRow.id)
          } catch (e) {
            console.error('[auth] 재가입 후처리 실패:', e)
          }
          console.warn(
            `[auth] 재가입 부활: @${piUser.username} (${delRow.id}) rejoin_dtm=${nowIso}`,
          )
          return revived as UserRow
        }
        // 부활 실패는 기록 후 폴스루 — 활성 pi_username UNIQUE 인덱스가 중복 INSERT를 막는다
        console.error('[auth] 재가입 부활 실패:', reviveError?.message)
      }
    }
  }

  // ①·③ uid 일치 행 갱신 또는 신규 가입
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

const accountConflict = () =>
  new PiLoginRejectedError(
    'AUTH_PI_ACCOUNT_CONFLICT',
    '이미 등록된 Pi 계정과 인증 정보가 다릅니다. 관리자에게 문의하세요.',
  )

function isAdminRole(role: string): boolean {
  return role === 'ADMIN' || role === 'MASTER'
}

// del_yn='N' 필수 — 세션 검증 경로의 계정 차단 단일지점. 0행 대비 .maybeSingle()
export async function getUserById(id: string): Promise<UserRow | null> {
  const { data } = await getSupabaseAdmin()
    .from('sys_user')
    .select()
    .eq('id', id)
    .eq('del_yn', 'N')
    .maybeSingle()
  return (data as UserRow) ?? null
}

// 구버전 토큰(userId='')·DB 오류 폴백용. 비활성 계정은 유효 토큰이어도 차단
export async function getUserByPiUid(uid: string): Promise<UserRow | null> {
  const { data } = await getSupabaseAdmin()
    .from('sys_user')
    .select()
    .eq('pi_uid', uid)
    .eq('del_yn', 'N')
    .maybeSingle()
  return (data as UserRow) ?? null
}

// 접속 기록(last_login_dtm) — Pi Browser는 토큰 재사용으로 /api/auth/pi를 다시 타지 않으므로
// 세션 검증 성공 시마다 호출하되 5분 스로틀한다.
// ponytail: 인스턴스 메모리 스로틀 — 서버리스 재기동 시 초기화, DB 조건(lt threshold)이 2차 방어
const TOUCH_INTERVAL_MS = 5 * 60 * 1000
const lastTouchAt = new Map<string, number>()

export function touchLastLogin(userId: string): void {
  if (isReadOnlyDb()) return
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
    after(run) // 응답 이후 실행 보장
  } catch {
    void run() // 요청 스코프 밖 호출
  }
}

// env 시드 관리자(PRD_28 §5) — adminUsernames(쉼표 구분, 예: ADMIN_PI_USERNAMES)에 pi_username이 있으면 role=ADMIN 승격.
// 승격만 한다: 목록에서 빠져도 자동 강등하지 않음(오설정 1회로 운영자 전원 잠김 방지) — 강등은 DB에서 수동.
// adminUids(예: ADMIN_PI_UIDS) 설정 시 pi_uid도 목록에 있어야 승격(username만으로 승격 불가 — 타 앱 토큰 재사용 방어).
// 운영 tier(resolveDbTier()==='prod', 미설정 기본 포함)에서 adminUids 가 비면 승격하지 않는다(KISA 2026-10-09 재점검 — env 검증 우회 대비 이중 방어)
export async function grantEnvAdmin(
  user: UserRow,
  adminUsernames: string | undefined,
  adminUids?: string,
): Promise<UserRow> {
  if (user.role === 'ADMIN' || !user.pi_username || isReadOnlyDb()) return user
  const list = (v: string | undefined) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  if (!list(adminUsernames).includes(user.pi_username)) return user
  const uids = list(adminUids)
  if (!uids.length && resolveDbTier() === 'prod') {
    console.warn('[users] 운영 tier 에서 adminUids 미설정 — ADMIN 승격 생략')
    return user
  }
  if (uids.length && !(user.pi_uid && uids.includes(user.pi_uid))) return user
  const { data, error } = await getSupabaseAdmin()
    .from('sys_user')
    .update({ role: 'ADMIN', modr_id: 'SYSTEM' })
    .eq('id', user.id)
    .select()
    .single()
  if (error) {
    console.error('[users] ADMIN 승격 실패:', error.message)
    return user
  }
  return data as UserRow
}
