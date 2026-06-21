import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getRoomMember } from '@/lib/chat'
import { applyBean } from '@/lib/bean'
import { ROOM_BOOST_BEAN, ROOM_BOOST_DAYS } from '@/lib/bean-fee'

type Params = { params: Promise<{ roomId: string }> }

// POST /api/chat/rooms/[roomId]/boost — 카페 부스트(노출 우선) 구매 (방장 전용, Bean SPEND)
//   기존 부스트가 유효하면 그 만료에서 ROOM_BOOST_DAYS 연장, 아니면 now 기준.
export async function POST(_req: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // 방장(OWNER)만 부스트 구매 가능
  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr || mbr.mbr_role_cd !== 'OWNER')
    return NextResponse.json(
      { error: '카페 방장만 부스트할 수 있습니다' },
      { status: 403 },
    )

  const db = getSupabaseAdmin()
  const { data: room } = await db
    .from('msg_room')
    .select('room_id, boost_expire_dtm')
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .maybeSingle()
  if (!room)
    return NextResponse.json(
      { error: '카페를 찾을 수 없습니다' },
      { status: 404 },
    )

  // Bean 차감 (잔액 부족 시 402)
  const charge = await applyBean({
    usrId: user.id,
    txnTp: 'SPEND',
    beanAmt: -ROOM_BOOST_BEAN,
    refTp: 'ROOM_BOOST',
    refId: roomId,
    memo: `카페 부스트 ${ROOM_BOOST_DAYS}일`,
    regrId: user.display_name.slice(0, 20),
  })
  if (!charge.ok) {
    const insufficient = charge.error === 'INSUFFICIENT_BEAN'
    return NextResponse.json(
      {
        error: insufficient
          ? `부스트에 ${ROOM_BOOST_BEAN} Bean이 필요합니다. 충전 후 다시 시도하세요.`
          : '부스트 처리에 실패했습니다',
        requiresBean: insufficient,
        feeBean: ROOM_BOOST_BEAN,
      },
      { status: insufficient ? 402 : 500 },
    )
  }

  // 만료 연장 — 기존 부스트가 유효하면 그 시점부터, 아니면 지금부터 N일
  const now = new Date()
  const cur = (room as { boost_expire_dtm: string | null }).boost_expire_dtm
  const base = cur && new Date(cur) > now ? new Date(cur) : now
  const newExpire = new Date(
    base.getTime() + ROOM_BOOST_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { error: updErr } = await db
    .from('msg_room')
    .update({
      boost_expire_dtm: newExpire,
      modr_id: user.display_name.slice(0, 20),
      mod_dtm: now.toISOString(),
    })
    .eq('room_id', roomId)

  // 갱신 실패 시 차감 롤백(REFUND) — 돈만 빠지고 부스트 미적용 방지
  if (updErr) {
    await applyBean({
      usrId: user.id,
      txnTp: 'REFUND',
      beanAmt: ROOM_BOOST_BEAN,
      refTp: 'ROOM_BOOST',
      refId: roomId,
      memo: '카페 부스트 적용 실패 환불',
      regrId: user.display_name.slice(0, 20),
    })
    return NextResponse.json(
      { error: '부스트 적용에 실패했습니다 (환불 처리됨)' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    boost_expire_dtm: newExpire,
    balance: charge.balance,
  })
}
