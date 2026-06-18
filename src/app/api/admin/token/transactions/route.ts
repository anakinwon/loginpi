import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const txnTp = searchParams.get('txn_tp') ?? undefined       // CHARGE|SPEND|REWARD|REFUND
  const usrId = searchParams.get('usr_id') ?? undefined
  const limitStr = searchParams.get('limit') ?? '100'
  const offsetStr = searchParams.get('offset') ?? '0'
  const limit = Math.min(parseInt(limitStr, 10) || 100, 500)
  const offset = parseInt(offsetStr, 10) || 0

  let q = getSupabaseAdmin()
    .from('bean_txn')
    .select(
      `txn_id, usr_id, txn_tp_cd, bean_amt, bal_amt, pi_amt,
       pymnt_id, ref_tp_cd, ref_id, memo_txt, reg_dtm,
       sys_user:usr_id ( pi_username, nick_nm, real_nm, display_name )`,
    )
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .range(offset, offset + limit - 1)

  if (txnTp) q = q.eq('txn_tp_cd', txnTp)
  if (usrId) q = q.eq('usr_id', usrId)

  const { data, error } = await q
  if (error) {
    console.error('[token/transactions] 쿼리 실패:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ transactions: data ?? [], limit, offset })
}
