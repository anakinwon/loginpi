import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeError } from '@/lib/sanitize-error'

// 로그성 테이블 모니터 — fn_log_table_stats RPC로 각 테이블 행수·용량·기간 통계 조회.
// 카탈로그(정리가능/조회전용 분류)는 DB의 fn_log_catalog() 단일 출처를 따른다.
export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin().rpc('fn_log_table_stats')

  if (error) {
    return NextResponse.json(
      {
        error: sanitizeError(
          'api/admin/logs/get',
          error,
          '로그 통계 조회 실패',
        ),
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ tables: data ?? [] })
}
