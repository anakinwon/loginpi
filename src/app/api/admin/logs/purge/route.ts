import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeError } from '@/lib/sanitize-error'

// 로그성 테이블 기간 기준 물리 정리 — fn_log_table_purge RPC 호출.
// 안전장치는 DB 함수에 내장(PURGEABLE 화이트리스트 + 최소 보존일 7일).
// 회계 원장·감사 로그는 RPC가 거부하므로 API는 입력만 가볍게 검증한다.
export async function POST(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  let body: { table?: unknown; days?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const table = typeof body.table === 'string' ? body.table.trim() : ''
  const days =
    typeof body.days === 'number' ? Math.floor(body.days) : Number.NaN

  if (!table) {
    return NextResponse.json({ error: '대상 테이블 누락' }, { status: 400 })
  }
  if (!Number.isFinite(days) || days < 7) {
    return NextResponse.json(
      { error: '보존일은 7일 이상의 숫자여야 합니다' },
      { status: 400 },
    )
  }

  const { data, error } = await getSupabaseAdmin().rpc('fn_log_table_purge', {
    p_tbl: table,
    p_days: days,
    p_actor: requester?.id ?? 'ADMIN',
  })

  if (error) {
    // RPC의 화이트리스트·보존일 위반은 의도된 거부 → 400으로 전달
    const denied =
      error.code === '42501' || error.message?.includes('정리 대상이 아닌')
    return NextResponse.json(
      {
        error: sanitizeError(
          'api/admin/logs/purge/post',
          error,
          '로그 정리 실패',
        ),
      },
      { status: denied ? 400 : 500 },
    )
  }

  return NextResponse.json({ deleted: data ?? 0 })
}
