import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isMaster } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeError } from '@/lib/sanitize-error'
import { apiError } from '@/lib/api-errors'

// 요금제 모드(Bean ↔ Pi) 전환 — MASTER 전용. PRD_24 §6·§10.
//   GET: 현재 활성 모드 + 전환 이력
//   POST: { action:'switch', new_mode:'BEAN'|'PI', reason } | { action:'rollback', reason }
async function requireMaster() {
  const user = await getSessionUser()
  return isMaster(user) ? user : null
}

export async function GET() {
  const user = await requireMaster()
  if (!user) return apiError('ADM_MASTER_ONLY', 403)

  const db = getSupabaseAdmin()
  const { data: mode } = await db.rpc('fn_get_active_fee_mode')
  const { data: history } = await db
    .from('v_fee_mode_recent_history')
    .select('audit_id, old_mode, new_mode, changed_by, changed_at, reason_memo')
    .limit(20)

  return NextResponse.json({
    active_mode: mode === 'PI' ? 'PI' : 'BEAN',
    history: history ?? [],
  })
}

export async function POST(req: NextRequest) {
  const user = await requireMaster()
  if (!user) return apiError('ADM_MASTER_ONLY', 403)

  let body: { action?: string; new_mode?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const db = getSupabaseAdmin()
  const changedBy = user.pi_username ?? user.id

  // 롤백 — 직전 모드로 원자 복원
  if (body.action === 'rollback') {
    const { data, error } = await db.rpc('fn_rollback_fee_mode', {
      p_changed_by: changedBy,
      p_reason_memo: body.reason || '직전 요금제 복귀',
    })
    if (error)
      return NextResponse.json(
        {
          error: sanitizeError(
            'api/admin/fee-mode/post',
            error,
            '요금제 모드 처리 중 오류가 발생했습니다',
          ),
        },
        { status: 400 },
      )
    const row = Array.isArray(data) ? data[0] : data
    return NextResponse.json({ ok: row?.ok ?? false, result: row })
  }

  // 전환 — new_mode로
  if (body.new_mode !== 'BEAN' && body.new_mode !== 'PI')
    return apiError('ADM_FEE_MODE_INVALID', 400)

  const { data, error } = await db.rpc('fn_switch_fee_mode', {
    p_new_mode: body.new_mode,
    p_changed_by: changedBy,
    p_reason_memo: body.reason || '',
  })
  if (error)
    return NextResponse.json(
      {
        error: sanitizeError(
          'api/admin/fee-mode/post',
          error,
          '요금제 모드 처리 중 오류가 발생했습니다',
        ),
      },
      { status: 400 },
    )
  const row = Array.isArray(data) ? data[0] : data
  return NextResponse.json({ ok: row?.ok ?? false, result: row })
}
