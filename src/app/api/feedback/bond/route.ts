import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getActiveFeeMode } from '@/lib/fee-resolver'
import { apiError } from '@/lib/api-errors'

// 후기 보상 보증금 — 매장 주체(seller/카페 owner)가 보상 재원을 선예치. PRD_24 §10-7.
//   보증금은 owner_id(usr_id) + bond_kind(SHOP/CAFE)당 1행(매장 여러 개여도 주체당 1개).
//   GET: 내 보증금 잔액 + 내 Bean 지갑 + 임계(최대 보상액).
//   POST: { kind, bean_amt } 예치(BEAN=지갑 차감 원자). PI 모드 예치는 후속(501).

const KINDS = ['SHOP', 'CAFE'] as const
type BondKind = (typeof KINDS)[number]

type Db = ReturnType<typeof getSupabaseAdmin>

// 최대 후기 보상액(FR_1~5 중 최대) — 보증금 충분 임계
async function getMaxReward(db: Db): Promise<number> {
  const { data } = await db
    .from('bean_fee_plan')
    .select('amt_bean')
    .in('fee_plan_cd', ['FR_1', 'FR_2', 'FR_3', 'FR_4', 'FR_5'])
    .eq('del_yn', 'N')
  return Math.max(
    0,
    ...(data ?? []).map((r) => Number((r as { amt_bean: number }).amt_bean)),
  )
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const kind = (req.nextUrl.searchParams.get('kind') ?? 'SHOP') as BondKind
  if (!KINDS.includes(kind)) return apiError('FBCK_INVALID_BOND_KIND', 400)

  const db = getSupabaseAdmin()
  const [{ data: bond }, { data: wlt }, maxReward] = await Promise.all([
    db
      .from('fbck_reward_bond')
      .select('bond_bal_bean')
      .eq('owner_id', user.id)
      .eq('bond_kind', kind)
      .eq('del_yn', 'N')
      .maybeSingle(),
    db
      .from('bean_wlt')
      .select('bean_amt')
      .eq('usr_id', user.id)
      .eq('del_yn', 'N')
      .maybeSingle(),
    getMaxReward(db),
  ])

  const balance = Number(
    (bond as { bond_bal_bean: number } | null)?.bond_bal_bean ?? 0,
  )
  const wallet = Number((wlt as { bean_amt: number } | null)?.bean_amt ?? 0)

  return NextResponse.json({
    kind,
    balance, // 현재 보증금 잔액(Bean)
    wallet, // 내 Bean 지갑 잔액(예치 가능액)
    max_reward: maxReward, // 후기 1건 최대 보상액(임계)
    sufficient: maxReward > 0 && balance >= maxReward, // 후기 버튼 활성 조건
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  let body: { kind?: string; bean_amt?: number }
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const kind = (body.kind ?? 'SHOP') as BondKind
  const beanAmt = Math.floor(Number(body.bean_amt))
  if (!KINDS.includes(kind)) return apiError('FBCK_INVALID_BOND_KIND', 400)
  if (!Number.isFinite(beanAmt) || beanAmt <= 0)
    return apiError('FBCK_INVALID_DEPOSIT_QTY', 400)

  // PI 모드 예치는 Pi Browser 직결제(createPayment) 필요 — 후속 단계로 분리
  const mode = await getActiveFeeMode()
  if (mode === 'PI') return apiError('FBCK_PI_BOND_NOT_READY', 501)

  const db = getSupabaseAdmin()
  const { data, error } = await db.rpc('fn_fbck_bond_deposit', {
    p_owner_id: user.id,
    p_bond_kind: kind,
    p_bean_amt: beanAmt,
    p_pay_src: 'BEAN',
    p_pymnt_id: null,
    p_regr_id: user.id,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('INSUFFICIENT_BEAN'))
      return apiError('FBCK_INSUFFICIENT_BEAN', 400)
    if (msg.includes('INVALID_AMOUNT'))
      return apiError('FBCK_INVALID_DEPOSIT_AMOUNT', 400)
    console.error('[보증금 예치] 실패:', msg)
    return apiError('FBCK_DEPOSIT_FAILED', 500)
  }

  const balance = Number(Array.isArray(data) ? data[0] : data)
  return NextResponse.json({ ok: true, balance })
}
