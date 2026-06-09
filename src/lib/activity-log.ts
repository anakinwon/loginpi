import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

export type ActivityType = 'LOGIN' | 'CHAT' | 'MSG' | 'PAYMENT'

// fire-and-forget — 오류가 발생해도 호출 흐름을 차단하지 않음
export function recordActivity(userId: string, type: ActivityType = 'LOGIN'): void {
  void getSupabaseAdmin().rpc('fn_record_activity', { p_usr_id: userId, p_type: type })
}
