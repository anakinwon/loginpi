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
  const txnTp = searchParams.get('txn_tp') ?? undefined // CHARGE|SPEND|REWARD|REFUND|SUBSCRIBE|TRANSFER(팁)|FEE
  const usrId = searchParams.get('usr_id') ?? undefined
  const limitStr = searchParams.get('limit') ?? '100'
  const offsetStr = searchParams.get('offset') ?? '0'
  const limit = Math.min(parseInt(limitStr, 10) || 100, 500)
  const offset = parseInt(offsetStr, 10) || 0

  const db = getSupabaseAdmin()

  // bean_txn ↔ sys_user 는 FK 제약이 없어 PostgREST 임베디드 조인 불가 →
  // 거래를 먼저 조회하고 usr_id로 사용자 정보를 별도 조회해 JS 병합한다.
  let q = db
    .from('bean_txn')
    .select(
      `txn_id, usr_id, txn_tp_cd, bean_amt, bal_amt, pi_amt,
       pymnt_id, ref_tp_cd, ref_id, memo_txt, reg_dtm`,
    )
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .range(offset, offset + limit - 1)

  if (txnTp) q = q.eq('txn_tp_cd', txnTp)
  if (usrId) q = q.eq('usr_id', usrId)

  const { data, error } = await q
  if (error) {
    return NextResponse.json(
      {
        error: sanitizeError(
          'api/admin/token/transactions/get',
          error,
          '거래 내역 조회 실패',
        ),
      },
      { status: 500 },
    )
  }

  const rows = data ?? []
  // 등장한 usr_id의 사용자 정보 일괄 조회 후 매핑
  const userIds = [...new Set(rows.map((r) => r.usr_id))]
  const userMap = new Map<string, Record<string, unknown>>()
  if (userIds.length > 0) {
    const { data: users } = await db
      .from('sys_user')
      .select('id, pi_username, nick_nm, real_nm, display_name')
      .in('id', userIds)
    for (const u of users ?? [])
      userMap.set((u as { id: string }).id, u as Record<string, unknown>)
  }

  const transactions = rows.map((r) => ({
    ...r,
    sys_user: userMap.get(r.usr_id) ?? null,
  }))

  return NextResponse.json({ transactions, limit, offset })
}
