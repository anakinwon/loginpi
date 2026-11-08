import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// 번역 일일 무료 한도 — PRD_26. 비구독자의 무료 자동번역 남용 방지(Gemini API 비용 통제).
//   신규 번역(캐시 미스)만 차감, 캐시 재표시는 무차감. KST 자정 리셋. 구독자는 미적용(무제한).

/** 비구독자 1일 무료 번역 한도(건). 마스터 정책(2026-06-30). */
export const TRANSLATE_DAILY_FREE = 10

/**
 * 일일 무료 한도 소비(원자적). n건 소비 시도 → 잔여 내에서 granted건만 승인.
 *   granted < n 이면 한도 소진(부분 승인), granted=0 이면 전량 차단.
 * RPC 미적용/오류 시 fail-open(granted=n) — 한도 기능 때문에 번역이 깨지지 않게(기능 우선).
 */
export async function consumeTransQuota(
  usrId: string,
  n = 1,
): Promise<{ granted: number; used: number; quota: number }> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc(
      'fn_trans_quota_consume',
      { p_usr_id: usrId, p_limit: TRANSLATE_DAILY_FREE, p_n: n },
    )
    if (error) return { granted: n, used: 0, quota: TRANSLATE_DAILY_FREE }
    const row = Array.isArray(data) ? data[0] : data
    return {
      granted: row?.granted ?? n,
      used: row?.used ?? 0,
      quota: TRANSLATE_DAILY_FREE,
    }
  } catch {
    return { granted: n, used: 0, quota: TRANSLATE_DAILY_FREE }
  }
}
