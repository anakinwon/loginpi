import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin, getDbTierInfo } from '@/lib/supabase-admin'
import {
  getDbSwitchState,
  setStagingDbTarget,
  type DbTarget,
} from '@/lib/ops-deploy'
import { sanitizeError } from '@/lib/sanitize-error'
import { apiError } from '@/lib/api-errors'

// Staging DB 스위치 — MASTER 전용. ⛔ 스테이징 환경에서만 동작(운영 WAS 불변),
// 운영DB(prod-ro)는 읽기전용 자격증명 있을 때만(쓰기 사고 차단).
async function requireMaster() {
  const user = await getSessionUser()
  return user?.role === 'MASTER' ? user : null
}

// 현재 DB(읽기전용 포함)에서 read가 실제로 되는지 라이브 진단 — RO JWT 거부 여부 판별용
async function testRead(): Promise<{
  ok: boolean
  count?: number
  error?: string
}> {
  try {
    const { count, error } = await getSupabaseAdmin()
      .from('sys_user')
      .select('id', { count: 'exact', head: true })
    return error
      ? {
          ok: false,
          error: sanitizeError(
            'api/admin/db-switch/get:testRead',
            error,
            'DB 읽기 진단 실패(상세는 서버 로그 확인)',
          ),
        }
      : { ok: true, count: count ?? 0 }
  } catch (e) {
    return {
      ok: false,
      error: sanitizeError(
        'api/admin/db-switch/get:testRead',
        e,
        'DB 읽기 진단 실패(상세는 서버 로그 확인)',
      ),
    }
  }
}

export async function GET() {
  if (!(await requireMaster()))
    return apiError('ADM_MASTER_ONLY', 403)
  const connTest = await testRead()
  return NextResponse.json({
    ...getDbSwitchState(),
    tierInfo: getDbTierInfo(),
    connTest,
  })
}

export async function POST(req: NextRequest) {
  if (!(await requireMaster()))
    return apiError('ADM_MASTER_ONLY', 403)

  let body: { target?: string }
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }
  if (body.target !== 'staging' && body.target !== 'prod-ro')
    return apiError('ADM_DB_TARGET_INVALID', 400)

  const r = await setStagingDbTarget(body.target as DbTarget)
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
