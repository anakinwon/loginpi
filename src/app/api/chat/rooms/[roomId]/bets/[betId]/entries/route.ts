import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'

type Params = { params: Promise<{ roomId: string; betId: string }> }

// TASK-071: 베팅 참가 준비 — Pi 결제 파라미터 반환 (/api/tips 패턴)
// POST /api/chat/rooms/[roomId]/bets/[betId]/entries
// 실제 참가 INSERT는 결제 완료 시 payments/complete의 PI_BET 분기에서 수행한다.
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId, betId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr)
    return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }
  const optnNo = Number((body as { optn_no?: number }).optn_no)
  if (!Number.isInteger(optnNo) || optnNo < 1) {
    return NextResponse.json(
      { error: '유효하지 않은 옵션 번호' },
      { status: 400 },
    )
  }

  const db = getSupabaseAdmin()
  const [{ data: bet }, { data: optn }, { data: existing }] = await Promise.all(
    [
      db
        .from('msg_bet')
        .select(
          'bet_id, room_id, bet_titl, bet_amt_pi, bet_st_cd, close_dtm, crtr_usr_id',
        )
        .eq('bet_id', betId)
        .eq('room_id', roomId)
        .eq('del_yn', 'N')
        .maybeSingle(),
      db
        .from('msg_bet_optn')
        .select('optn_no, optn_nm')
        .eq('bet_id', betId)
        .eq('optn_no', optnNo)
        .eq('del_yn', 'N')
        .maybeSingle(),
      db
        .from('msg_bet_entry')
        .select('bet_entry_id')
        .eq('bet_id', betId)
        .eq('usr_id', user.id)
        .eq('del_yn', 'N')
        .maybeSingle(),
    ],
  )

  if (!bet)
    return NextResponse.json(
      { error: '베팅을 찾을 수 없습니다' },
      { status: 404 },
    )
  if (!optn)
    return NextResponse.json(
      { error: '존재하지 않는 선택지입니다' },
      { status: 404 },
    )
  if (existing)
    return NextResponse.json(
      { error: '이미 참가한 베팅입니다' },
      { status: 409 },
    )

  const betRow = bet as {
    bet_titl: string
    bet_amt_pi: number
    bet_st_cd: string
    close_dtm: string | null
    crtr_usr_id: string
  }
  if (betRow.bet_st_cd !== 'OPEN') {
    return NextResponse.json(
      { error: '참가가 마감된 베팅입니다' },
      { status: 409 },
    )
  }
  if (betRow.close_dtm && new Date(betRow.close_dtm) <= new Date()) {
    return NextResponse.json(
      { error: '베팅 마감 시각이 지났습니다' },
      { status: 409 },
    )
  }
  if (betRow.crtr_usr_id === user.id) {
    return NextResponse.json(
      { error: '베팅 생성자는 참가할 수 없습니다' },
      { status: 403 },
    )
  }

  // Pi SDK createPayment 파라미터 — 금액은 서버가 결정 (클라이언트 변조 불가)
  return NextResponse.json({
    amount: Number(betRow.bet_amt_pi),
    memo: `Pi Bet: ${betRow.bet_titl.slice(0, 50)}`,
    metadata: {
      type: 'PI_BET',
      bet_id: betId,
      room_id: roomId,
      optn_no: optnNo,
    },
  })
}
