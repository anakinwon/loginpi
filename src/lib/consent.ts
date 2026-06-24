import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// 가입/이용 동의 — sys_user_consent(sql/033) 범용 테이블 재사용(consent_tp_cd로 유형 구분).
// 스키마 변경 없음. 약관 개정 시 CONSENT_VER 갱신 → 재동의 유도(최신 버전 미동의로 판단 가능).
export const CONSENT_VER = '2026-06-24'

export type ConsentType = 'TERMS' | 'PRIVACY' | 'MKT'
export const REQUIRED_CONSENTS: ConsentType[] = ['TERMS', 'PRIVACY']

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
  for (const r of (data ?? []) as { consent_tp_cd: string; consent_yn: string }[]) {
    if (!(r.consent_tp_cd in latest)) latest[r.consent_tp_cd] = r.consent_yn === 'Y'
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
  const { error } = await getSupabaseAdmin().from('sys_user_consent').insert(rows)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
