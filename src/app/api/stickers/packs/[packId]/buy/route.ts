import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'

type Params = { params: Promise<{ packId: string }> }

// POST /api/stickers/packs/[packId]/buy — Pi 결제 파라미터 반환
export async function POST(_req: NextRequest, { params }: Params) {
  const { packId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const db = getSupabaseAdmin()

  const { data: pack } = await db
    .from('msg_stkr_pack')
    .select('pack_id, pack_nm, price_pi')
    .eq('pack_id', packId)
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!pack) {
    return NextResponse.json(
      { error: '존재하지 않는 스티커 팩입니다' },
      { status: 404 },
    )
  }

  const packRow = pack as { pack_id: string; pack_nm: string; price_pi: number }

  if (Number(packRow.price_pi) === 0) {
    return NextResponse.json(
      { error: '무료 팩은 구매가 필요 없습니다' },
      { status: 400 },
    )
  }

  // 이미 보유 여부 확인 (중복 구매 방지)
  const { data: existing } = await db
    .from('msg_usr_stkr')
    .select('usr_stkr_id')
    .eq('usr_id', user.id)
    .eq('pack_id', packId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: '이미 보유한 스티커 팩입니다' },
      { status: 409 },
    )
  }

  return NextResponse.json({
    amount: Number(packRow.price_pi),
    memo: `스티커팩 구매: ${packRow.pack_nm}`,
    metadata: {
      type: 'STICKER_PACK',
      pack_id: packId,
      pack_nm: packRow.pack_nm,
    },
  })
}
