// schema.pi 서버 인증 — @pi/auth 세션(쿠키 OR X-Pi-Token 헤더)과 sys_user 를 잇는다. 라우트·서버 컴포넌트 전용
// ⚠ getSessionUser() null 시 redirect 금지(Pi Browser 무한 루프) → 클라이언트 게이트(src/app/login-gate.tsx)로 위임
// 사용자 매칭 철칙 : pi_uid 는 앱·네트워크 scoped 라 영구 식별자 금지 — 사람의 불변 키는 pi_usr_nm(활성 행 UNIQUE)
import 'server-only'
import { createGetSessionUser, type PiAuthUserRecord, type TokenSource } from '@pi/auth'
import { auth, googleEnabled } from '@/auth'
import { db } from './db'

export interface AuthUser extends PiAuthUserRecord {
  usr_id: string
  pi_usr_nm: string
}

const COLS = 'usr_id, pi_uid, pi_usr_nm, dsp_nm, role_cd'
type Row = { usr_id: string; pi_uid: string | null; pi_usr_nm: string | null; dsp_nm: string; role_cd: string }

function toAuthUser(r: Row): AuthUser {
  return {
    id: r.usr_id,
    usr_id: r.usr_id,
    role: r.role_cd,
    pi_uid: r.pi_uid,
    pi_username: r.pi_usr_nm,
    pi_usr_nm: r.pi_usr_nm ?? '',
    display_name: r.dsp_nm || r.pi_usr_nm || '',
  }
}

async function findOne(col: 'usr_id' | 'pi_usr_nm' | 'pi_uid', val: string): Promise<AuthUser | null> {
  const { data, error } = await db().from('sys_user').select(COLS).eq(col, val).eq('del_yn', 'N').maybeSingle()
  if (error) throw error
  return data ? toAuthUser(data as Row) : null
}

export const getUserById = (id: string) => findOne('usr_id', id)
export const getUserByPiUid = (uid: string) => findOne('pi_uid', uid)

function isEnvAdmin(username: string | null): boolean {
  const list = (process.env.ADMIN_PI_USERNAMES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return !!username && list.includes(username)
}

// /api/auth/pi POST — /v2/me 검증을 통과한 Pi 사용자 → sys_user 행(없으면 생성). username 우선 매칭, 없으면 uid 로 찾아 username 보강
export async function upsertUser(pi: { uid: string; username: string | null; walletAddress: string | null }): Promise<AuthUser> {
  const found = (pi.username && (await findOne('pi_usr_nm', pi.username))) || (await findOne('pi_uid', pi.uid))
  const role_cd = found?.role === 'ADMIN' || isEnvAdmin(pi.username) ? 'ADMIN' : 'USER'
  const now = new Date().toISOString()
  if (found) {
    const patch = {
      pi_uid: pi.uid,
      pi_usr_nm: pi.username ?? found.pi_username,
      dsp_nm: found.display_name || pi.username || '',
      role_cd,
      lst_lgn_dtm: now,
      modr_id: found.usr_id,
    }
    const { data, error } = await db().from('sys_user').update(patch).eq('usr_id', found.usr_id).select(COLS).single()
    if (error) throw error
    return toAuthUser(data as Row)
  }
  const { data, error } = await db()
    .from('sys_user')
    .insert({
      pi_uid: pi.uid,
      pi_usr_nm: pi.username,
      dsp_nm: pi.username ?? '',
      role_cd,
      lst_lgn_dtm: now,
      regr_id: 'PI_LOGIN',
      modr_id: 'PI_LOGIN',
    })
    .select(COLS)
    .single()
  if (error) throw error
  return toAuthUser(data as Row)
}

// 통합 세션 — Pi 우선, 없으면 Google(NextAuth) 세션의 연동 사용자(session.user.id = sys_user.usr_id, 미연동이면 '')
export async function getAppUser(req?: TokenSource): Promise<AuthUser | null> {
  const pi = await getSessionUser(req)
  if (pi) return pi
  if (!googleEnabled()) return null
  try {
    const session = await auth()
    const id = session?.user?.id
    return id ? await getUserById(id) : null
  } catch {
    return null
  }
}

// Pi 세션만(쿠키 우선 → X-Pi-Token 헤더 폴백) — 연동 코드 발급처럼 "Pi Browser 로그인" 자체가 조건인 곳에서 사용. 로그인 시각 갱신은 응답을 막지 않는다
export const getSessionUser = createGetSessionUser<AuthUser>({
  sessionSecret: process.env.PI_SESSION_SECRET,
  getUserById,
  getUserByPiUid,
  onAuthenticated: (u) => {
    void db()
      .from('sys_user')
      .update({ lst_lgn_dtm: new Date().toISOString() })
      .eq('usr_id', u.usr_id)
      .then(() => {})
  },
})
