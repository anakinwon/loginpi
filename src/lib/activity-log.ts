import 'server-only'
import { after } from 'next/server'
import { getSupabaseAdmin } from './supabase-admin'
import { isReadOnlyDb } from './db-env'

export type ActivityType = 'LOGIN' | 'CHAT' | 'MSG' | 'PAYMENT'

// fire-and-forget — 오류가 발생해도 호출 흐름을 차단하지 않음
// 주의: supabase-js 쿼리 빌더는 lazy thenable — await/.then() 없이는 실행되지 않는다
export function recordActivity(
  userId: string,
  type: ActivityType = 'LOGIN',
): void {
  if (isReadOnlyDb()) return // 읽기전용 모드: 활동기록 쓰기 스킵
  const run = async () => {
    const { error } = await getSupabaseAdmin().rpc('fn_record_activity', {
      p_usr_id: userId,
      p_type: type,
    })
    if (error)
      console.error(`[activity-log] 활동 기록 실패 (${type}):`, error.message)
  }
  try {
    // 응답 이후 서버리스 함수가 동결되지 않도록 after()로 실행 보장
    after(run)
  } catch {
    // 요청 스코프 밖에서 호출된 경우 — 즉시 실행
    void run()
  }
}
