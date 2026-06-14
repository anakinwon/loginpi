import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { type TxnDivCd, pymntTypeToDiv, mpsTxnToDiv } from '@/lib/txn-div'

// 결제 내역 = pi_pymnt(U2A 결제) + mps_txn_hist(취소·환불·수수료·정산) 통합.
// 각 거래에 거래구분코드(txn_div_cd)를 부여해 단일 목록으로 반환한다.
// ESCROW_IN은 pi_pymnt MPS_ESCROW와 동일 입금이라 mps 쪽에서 제외(mpsTxnToDiv가 null).

interface PymntMeta {
  type?: string
}

interface UserRef {
  display_name: string
  nick_nm: string | null
  real_nm: string | null
  pi_username: string | null
  google_email: string | null
}

interface UnifiedTxn {
  id: string
  source: 'pymnt' | 'mps'
  txn_div_cd: TxnDivCd
  amount: number // 부호 유지 — 환불/수령 양수, 수수료/정산 음수
  memo: string | null
  status: 'pending' | 'approved' | 'completed' | 'cancelled' | 'error'
  payment_id: string | null
  reg_dtm: string
  sys_user: UserRef | null
}

export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const db = getSupabaseAdmin()

  // 결제외 거래만(REFUND_IN·FEE·CANCEL_FEE_IN·RELEASE_OUT) — ESCROW_IN 제외
  const [pymntRes, mpsRes] = await Promise.all([
    db
      .from('pi_pymnt')
      .select(
        `id, payment_id, txid, amount, memo, status, metadata, reg_dtm,
         sys_user ( display_name, nick_nm, real_nm, pi_username, google_email )`,
      )
      .order('reg_dtm', { ascending: false }),
    db
      .from('mps_txn_hist')
      .select('txn_id, user_id, txn_type_cd, pi_amt, pi_txid, memo, txn_dtm')
      .eq('del_yn', 'N')
      .in('txn_type_cd', ['REFUND_IN', 'FEE', 'CANCEL_FEE_IN', 'RELEASE_OUT'])
      .order('txn_dtm', { ascending: false }),
  ])

  if (pymntRes.error) {
    return NextResponse.json({ error: '결제 내역 조회 실패' }, { status: 500 })
  }

  // pi_pymnt → 통합 행
  const pymntRows = (pymntRes.data ?? []) as unknown as Array<{
    id: string
    payment_id: string
    amount: number
    memo: string | null
    status: UnifiedTxn['status']
    metadata: PymntMeta | null
    reg_dtm: string
    sys_user: UserRef | null
  }>
  const pymntTxns: UnifiedTxn[] = pymntRows.map((p) => ({
    id: p.id,
    source: 'pymnt',
    txn_div_cd: pymntTypeToDiv(p.metadata?.type),
    amount: Number(p.amount),
    memo: p.memo,
    status: p.status,
    payment_id: p.payment_id,
    reg_dtm: p.reg_dtm,
    sys_user: p.sys_user,
  }))

  // mps_txn_hist → 통합 행 (user_id로 sys_user 수동 조인)
  const mpsRows = (mpsRes.data ?? []) as Array<{
    txn_id: string
    user_id: string
    txn_type_cd: string
    pi_amt: number
    pi_txid: string | null
    memo: string | null
    txn_dtm: string
  }>
  const userIds = [...new Set(mpsRows.map((r) => r.user_id))]
  const userMap = new Map<string, UserRef>()
  if (userIds.length > 0) {
    const { data: users } = await db
      .from('sys_user')
      .select('id, display_name, nick_nm, real_nm, pi_username, google_email')
      .in('id', userIds)
    for (const u of (users ?? []) as Array<{ id: string } & UserRef>) {
      userMap.set(u.id, {
        display_name: u.display_name,
        nick_nm: u.nick_nm,
        real_nm: u.real_nm,
        pi_username: u.pi_username,
        google_email: u.google_email,
      })
    }
  }
  const mpsTxns: UnifiedTxn[] = mpsRows.flatMap((r) => {
    const div = mpsTxnToDiv(r.txn_type_cd)
    if (!div) return [] // 결제 중복/대상 외
    return [
      {
        id: r.txn_id,
        source: 'mps' as const,
        txn_div_cd: div,
        amount: Number(r.pi_amt),
        memo: r.memo,
        status: 'completed' as const, // mps 거래는 이미 완료
        payment_id: r.pi_txid,
        reg_dtm: r.txn_dtm,
        sys_user: userMap.get(r.user_id) ?? null,
      },
    ]
  })

  // 통합 + 일시 내림차순 정렬
  const txns = [...pymntTxns, ...mpsTxns].sort((a, b) =>
    a.reg_dtm < b.reg_dtm ? 1 : a.reg_dtm > b.reg_dtm ? -1 : 0,
  )

  return NextResponse.json({ payments: txns })
}
