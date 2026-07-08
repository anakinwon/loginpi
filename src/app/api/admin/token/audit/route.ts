import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeError } from '@/lib/sanitize-error'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const limit = Math.min(Number(searchParams.get('limit') ?? '100'), 500)
  const offset = Number(searchParams.get('offset') ?? '0')
  const usrId = searchParams.get('usr_id')

  const db = getSupabaseAdmin()

  // bean_audit_log → sys_user FK가 없어 PostgREST 임베디드 조인(sys_user:usr_id)은
  // PGRST200으로 실패한다(조정 내역 0건이어도 관계 해석 단계에서 500).
  // → 감사 로그만 조회한 뒤 usr_id로 sys_user를 별도 조회해 코드에서 병합
  //   (event.ts getEventRanking과 동일한 FK-less 수동 병합 패턴).
  let query = db
    .from('bean_audit_log')
    .select(
      `
      audit_id,
      usr_id,
      adj_before,
      adj_bean,
      adj_after,
      reason_txt,
      adj_admin_id,
      evidence_url,
      reg_dtm
    `,
      { count: 'exact' },
    )
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .range(offset, offset + limit - 1)

  if (usrId) {
    query = query.eq('usr_id', usrId)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json(
      {
        error: sanitizeError(
          'api/admin/token/audit/get',
          error,
          '감사 로그 조회 실패',
        ),
      },
      { status: 500 },
    )
  }

  // 대상 사용자 정보 병합 — usr_id 집합으로 sys_user 일괄 조회 후 매핑
  type AuditRow = { usr_id: string } & Record<string, unknown>
  const rows = (data ?? []) as AuditRow[]
  type SysUserRow = {
    id: string
    pi_username: string | null
    nick_nm: string | null
    real_nm: string | null
  }
  const userIds = [...new Set(rows.map((r) => r.usr_id))]
  const userMap = new Map<string, Omit<SysUserRow, 'id'>>()
  if (userIds.length > 0) {
    const { data: users } = await db
      .from('sys_user')
      .select('id, pi_username, nick_nm, real_nm')
      .in('id', userIds)
    for (const u of (users ?? []) as SysUserRow[]) {
      const { id, ...rest } = u
      userMap.set(id, rest)
    }
  }

  const merged = rows.map((r) => ({
    ...r,
    sys_user: userMap.get(r.usr_id) ?? null,
  }))

  return NextResponse.json({ data: merged, total: count ?? 0 })
}
