import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { viewerScopedCacheHeaders } from '@/lib/cache-headers'
import { type TxnDivCd, pymntTypeToDiv, mpsTxnToDiv } from '@/lib/txn-div'
import { apiError } from '@/lib/api-errors'

// 결제 내역 = pi_pymnt(U2A 결제) + mps_txn_hist(취소·환불·수수료·정산) 통합.
// 각 거래에 거래구분코드(txn_div_cd)를 부여해 단일 목록으로 반환한다.
// ESCROW_IN은 pi_pymnt MPS_ESCROW와 동일 입금이라 mps 쪽에서 제외(mpsTxnToDiv가 null).
//
// q(검색어)가 오면 sys_user.pi_username을 trigram GIN(.ilike '%q%')으로 먼저 좁혀
// 매칭된 user_id 집합으로 pi_pymnt·mps_txn_hist를 한정한다(subscriptions와 동일 패턴).

// LIKE 와일드카드(%, _, \) 이스케이프 — 사용자 입력이 패턴으로 오작동/주입되지 않게.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&')
}

interface PymntMeta {
  type?: string
  refund?: { status: 'processing' | 'completed' | 'error'; txid?: string }
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
  // 관리자 환불 상태 (pi_pymnt.metadata.refund) — U2A 완료 결제에만 존재 가능
  refund: { status: 'processing' | 'completed' | 'error'; txid?: string } | null
}

// GET /api/admin/payments?page=1&limit=30&q=username
export async function GET(req: NextRequest) {
  const requester = await getSessionUser()
  const admin = isAdmin(requester)
  if (!admin) {
    return apiError('FORBIDDEN', 403)
  }

  const db = getSupabaseAdmin()
  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') ?? '').trim()
  const page = Math.max(1, Number(sp.get('page') ?? 1))
  const limit = Math.min(100, Math.max(1, Number(sp.get('limit') ?? 30)))
  const from = (page - 1) * limit

  // 검색어가 있으면(2글자↑) pi_username 부분일치(trigram GIN)로 user_id 후보를 먼저 구한다.
  // trigram은 3글자 단위라 2글자 미만은 의미가 적어 검색 자체를 생략(전체 반환).
  let matchedIds: string[] | null = null
  if (q.length >= 2) {
    const { data: users } = await db
      .from('sys_user')
      .select('id')
      .ilike('pi_username', `%${escapeLike(q)}%`)
    matchedIds = (users ?? []).map((u) => u.id)
    // 매칭 사용자가 없으면 결제도 없음 — 빈 결과 즉시 반환
    if (matchedIds.length === 0) {
      return NextResponse.json({ payments: [] })
    }
  }

  // 결제외 거래만(REFUND_IN·FEE·CANCEL_FEE_IN·RELEASE_OUT) — ESCROW_IN 제외
  let pymntQuery = db
    .from('pi_pymnt')
    .select(
      `id, payment_id, txid, amount, memo, status, metadata, reg_dtm,
       sys_user ( display_name, nick_nm, real_nm, pi_username, google_email )`,
    )
    .order('reg_dtm', { ascending: false })
  let mpsQuery = db
    .from('mps_txn_hist')
    .select('txn_id, user_id, txn_type_cd, pi_amt, pi_txid, memo, txn_dtm')
    .eq('del_yn', 'N')
    .in('txn_type_cd', ['REFUND_IN', 'FEE', 'CANCEL_FEE_IN', 'RELEASE_OUT'])
    .order('txn_dtm', { ascending: false })
  if (matchedIds) {
    pymntQuery = pymntQuery.in('user_id', matchedIds)
    mpsQuery = mpsQuery.in('user_id', matchedIds)
  }

  const [pymntRes, mpsRes] = await Promise.all([pymntQuery, mpsQuery])

  if (pymntRes.error) {
    return apiError('ADM_PAYMENTS_LIST_FAILED', 500)
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
    refund: p.metadata?.refund ?? null,
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
        refund: null, // mps 거래는 주문 단위 환불(mps-refund) 경로 사용
      },
    ]
  })

  // 통합 + 일시 내림차순 정렬
  const allTxns = [...pymntTxns, ...mpsTxns].sort((a, b) =>
    a.reg_dtm < b.reg_dtm ? 1 : a.reg_dtm > b.reg_dtm ? -1 : 0,
  )

  // 페이지네이션
  const totalPages = Math.ceil(allTxns.length / limit)
  const txns = allTxns.slice(from, from + limit)

  return NextResponse.json(
    {
      payments: txns,
      pagination: {
        page,
        limit,
        total: allTxns.length,
        totalPages,
      },
    },
    { headers: viewerScopedCacheHeaders(admin) },
  )
}
