import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { applyBean } from '@/lib/bean'
import { getActiveFeeMode } from '@/lib/fee-resolver'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ packId: string }> }

// POST /api/stickers/packs/[packId]/buy — Bean 차감 후 즉시 소유권 부여
// (기존 Pi 3단계 결제 흐름 → Bean 단일 서버 호출로 전환: PRD_15_FEE §1-6 #8)
export async function POST(_req: NextRequest, { params }: Params) {
  const { packId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const db = getSupabaseAdmin()

  const { data: pack } = await db
    .from('msg_stkr_pack')
    .select('pack_id, pack_nm, price_bean, is_dflt_yn')
    .eq('pack_id', packId)
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!pack) {
    return apiError('STKR_PACK_NOT_FOUND', 404)
  }

  const packRow = pack as {
    pack_id: string
    pack_nm: string
    price_bean: number
    is_dflt_yn: string
  }

  const isFree = packRow.is_dflt_yn === 'Y' || Number(packRow.price_bean) === 0
  if (isFree) {
    return apiError('STKR_FREE_PACK_NO_BUY', 400)
  }

  // 중복 구매 방지
  const { data: existing } = await db
    .from('msg_usr_stkr')
    .select('usr_stkr_id')
    .eq('usr_id', user.id)
    .eq('pack_id', packId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (existing) {
    return apiError('STKR_ALREADY_OWNED', 409)
  }

  const feeBean = Number(packRow.price_bean)
  const slug = String(user.display_name ?? 'user').slice(0, 20)

  // PI 모드 — Bean 차감 대신 Pi 직결제. 소유권은 결제 완료(complete) 시 부여.
  const feeMode = await getActiveFeeMode()
  if (feeMode === 'PI') {
    return NextResponse.json({
      mode: 'PI',
      pay: {
        amount: feeBean / 100, // 1 Pi = 100 Bean
        memo: `sticker pack ${packRow.pack_id}`,
        metadata: { type: 'STICKER_PACK', pack_id: packRow.pack_id },
      },
    })
  }

  // Bean 차감 (잔액 부족 시 402)
  const charge = await applyBean({
    usrId: user.id,
    txnTp: 'SPEND',
    beanAmt: -feeBean,
    refTp: 'STICKER_PACK',
    refId: packId,
    memo: `스티커팩 구매: ${packRow.pack_nm}`,
    regrId: slug,
  })

  if (!charge.ok) {
    return NextResponse.json(
      {
        error: 'Bean 잔액이 부족합니다. 충전 후 다시 시도하세요.',
        code: 'CHAT_BEAN_INSUFFICIENT',
        requiresBean: true,
        feeBean,
      },
      { status: 402 },
    )
  }

  // 소유권 UPSERT (Bean 차감 성공 후)
  await db.from('msg_usr_stkr').upsert(
    {
      usr_id: user.id,
      pack_id: packRow.pack_id,
      del_yn: 'N',
      del_dtm: null,
      regr_id: slug,
      modr_id: slug,
      mod_dtm: new Date().toISOString(),
    },
    { onConflict: 'usr_id,pack_id' },
  )

  return NextResponse.json({ ok: true, balance: charge.balance })
}
