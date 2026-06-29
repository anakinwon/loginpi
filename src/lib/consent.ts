import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// 가입/이용 동의 — sys_user_consent(sql/033) 범용 테이블 재사용(consent_tp_cd로 유형 구분).
// 스키마 변경 없음. 약관 개정 시 CONSENT_VER 갱신 → 재동의 유도(최신 버전 미동의로 판단 가능).
export const CONSENT_VER = '2026-06-24'

// AGE14 = 만 14세 이상(또는 법정대리인 동의로 통과) · GUARDIAN = 만 14세 미만 법정대리인 동의
// LBS = 위치기반서비스 이용·위치정보 수집·이용 동의(가까운 카페/매장/거리순에 필수)
export type ConsentType =
  | 'TERMS'
  | 'PRIVACY'
  | 'MKT'
  | 'AGE14'
  | 'GUARDIAN'
  | 'LBS'
export const REQUIRED_CONSENTS: ConsentType[] = [
  'TERMS',
  'PRIVACY',
  'AGE14',
  'LBS',
]
export const MIN_AGE = 14
// 위치 동의 약관 버전 — 기존 LBS 라우트(/api/location/consent)와 동일해야 캐시·재동의 판단 일치
export const LBS_CONSENT_VER = 'v1.0'

// 만 나이 계산(생년월일 'YYYY-MM-DD' 기준). 데이터 최소수집: 원본 생년월일은 저장하지 않고 검증만.
export function calcAge(birth: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const bd = new Date(y, mo - 1, d)
  if (bd.getFullYear() !== y || bd.getMonth() !== mo - 1 || bd.getDate() !== d)
    return null
  if (bd.getTime() > now.getTime()) return null // 미래 생년월일 거부
  let age = now.getFullYear() - y
  const mDiff = now.getMonth() - (mo - 1)
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < d)) age--
  if (age < 0 || age > 120) return null
  return age
}

// 사용자별 최신 동의 상태 (유형 → 동의여부). 최신 reg_dtm 우선.
export async function getUserConsents(
  userId: string,
): Promise<Record<string, boolean>> {
  const { data } = await getSupabaseAdmin()
    .from('sys_user_consent')
    .select('consent_tp_cd, consent_yn, reg_dtm')
    .eq('user_str_id', userId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })

  const latest: Record<string, boolean> = {}
  for (const r of (data ?? []) as {
    consent_tp_cd: string
    consent_yn: string
  }[]) {
    if (!(r.consent_tp_cd in latest))
      latest[r.consent_tp_cd] = r.consent_yn === 'Y'
  }
  return latest
}

// 동의 기록 (append-only 이력). 감사용 IP/UA 스냅샷.
export async function recordConsents(
  userId: string,
  consents: { tp: ConsentType; yn: boolean }[],
  meta: { ip?: string | null; ua?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const rows = consents.map((c) => ({
    user_str_id: userId,
    consent_tp_cd: c.tp,
    consent_yn: c.yn ? 'Y' : 'N',
    consent_ver: CONSENT_VER,
    client_ip: meta.ip ?? null,
    user_agent: meta.ua ?? null,
    regr_id: userId,
    modr_id: userId,
  }))
  const { error } = await getSupabaseAdmin()
    .from('sys_user_consent')
    .insert(rows)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// 위치(LBS) 동의 즉시 동기화 — 기존 LBS 라우트와 동일하게 sys_user 캐시 + 이력 기록.
// 이 캐시(lbs_consent_yn='Y')를 가까운 카페/지도가 공유하므로 별도 LBS 다이얼로그가 다시 안 뜬다.
export async function syncLbsConsent(
  userId: string,
  meta: { ip?: string | null; ua?: string | null },
): Promise<{ ok: boolean }> {
  const db = getSupabaseAdmin()
  const now = new Date().toISOString()
  const [u, c] = await Promise.all([
    db
      .from('sys_user')
      .update({
        lbs_consent_yn: 'Y',
        lbs_consent_dtm: now,
        lbs_consent_ver: LBS_CONSENT_VER,
        mod_dtm: now,
      })
      .eq('id', userId),
    db.from('sys_user_consent').insert({
      user_str_id: userId,
      consent_tp_cd: 'LBS',
      consent_yn: 'Y',
      consent_ver: LBS_CONSENT_VER,
      client_ip: meta.ip ?? null,
      user_agent: meta.ua ?? null,
      regr_id: userId,
      modr_id: userId,
    }),
  ])
  return { ok: !u.error && !c.error }
}
