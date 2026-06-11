import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { broadcastToRoom } from '@/lib/realtime-broadcast'

type Params = { params: Promise<{ roomId: string; betId: string }> }

// TASK-071: 베팅 정산 — 승리 옵션 확정 + 풀 균등 분배 (생성자 전용)
// POST /api/chat/rooms/[roomId]/bets/[betId]/settle  Body: { win_optn_no }
// payout_pi는 장부 기록 — 실제 Pi 송금(A2U)은 Pi SDK 지원 시 후속 (PiRC2 구독과 동일 전략)
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId, betId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }
  const winOptnNo = Number((body as { win_optn_no?: number }).win_optn_no)
  if (!Number.isInteger(winOptnNo) || winOptnNo < 1) {
    return NextResponse.json(
      { error: '유효하지 않은 승리 옵션 번호' },
      { status: 400 },
    )
  }

  const db = getSupabaseAdmin()
  const { data: bet } = await db
    .from('msg_bet')
    .select('bet_id, room_id, crtr_usr_id, bet_titl, bet_st_cd')
    .eq('bet_id', betId)
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!bet)
    return NextResponse.json(
      { error: '베팅을 찾을 수 없습니다' },
      { status: 404 },
    )

  const betRow = bet as {
    bet_id: string
    crtr_usr_id: string
    bet_titl: string
    bet_st_cd: string
  }
  if (betRow.crtr_usr_id !== user.id) {
    return NextResponse.json(
      { error: '베팅 생성자만 정산할 수 있습니다' },
      { status: 403 },
    )
  }
  if (betRow.bet_st_cd === 'SETTLED' || betRow.bet_st_cd === 'CANCELLED') {
    return NextResponse.json(
      { error: '이미 정산된 베팅입니다' },
      { status: 409 },
    )
  }

  const [{ data: optn }, { data: entries }] = await Promise.all([
    db
      .from('msg_bet_optn')
      .select('optn_no, optn_nm')
      .eq('bet_id', betId)
      .eq('optn_no', winOptnNo)
      .eq('del_yn', 'N')
      .maybeSingle(),
    db
      .from('msg_bet_entry')
      .select('bet_entry_id, usr_id, optn_no, bet_amt_pi')
      .eq('bet_id', betId)
      .eq('del_yn', 'N'),
  ])

  if (!optn)
    return NextResponse.json(
      { error: '존재하지 않는 선택지입니다' },
      { status: 404 },
    )

  const allEntries = (entries ?? []) as {
    bet_entry_id: string
    usr_id: string
    optn_no: number
    bet_amt_pi: number
  }[]
  const winners = allEntries.filter((e) => e.optn_no === winOptnNo)
  const totalPool = allEntries.reduce((sum, e) => sum + Number(e.bet_amt_pi), 0)
  // 승자 균등 분배 — 소수 4자리 절사 (DECIMAL(10,4) 정밀도)
  const payoutEach =
    winners.length > 0
      ? Math.floor((totalPool / winners.length) * 10000) / 10000
      : 0

  const slug = user.display_name.slice(0, 20)
  const now = new Date().toISOString()

  // 정산 상태 전이는 OPEN/CLOSED 조건부 UPDATE — 동시 정산 race 방지
  const { data: settled } = await db
    .from('msg_bet')
    .update({
      bet_st_cd: 'SETTLED',
      win_optn_no: winOptnNo,
      settle_dtm: now,
      modr_id: slug,
      mod_dtm: now,
    })
    .eq('bet_id', betId)
    .in('bet_st_cd', ['OPEN', 'CLOSED'])
    .select('bet_id')

  if (!settled || settled.length === 0) {
    return NextResponse.json(
      { error: '정산 처리에 실패했습니다 (동시 요청 충돌)' },
      { status: 409 },
    )
  }

  if (winners.length > 0) {
    await db
      .from('msg_bet_entry')
      .update({
        win_yn: 'Y',
        payout_pi: payoutEach,
        modr_id: slug,
        mod_dtm: now,
      })
      .eq('bet_id', betId)
      .eq('optn_no', winOptnNo)
      .eq('del_yn', 'N')
  }

  // 정산 결과 BET_NOTI 발송
  const optnRow = optn as { optn_nm: string }
  const resultText =
    winners.length > 0
      ? `승자 ${winners.length}명 · 1인당 π${payoutEach} 분배`
      : '적중자 없음'
  const { data: notiMsg } = await db
    .from('msg_msg')
    .insert({
      room_id: roomId,
      snd_usr_id: user.id,
      snd_usr_nm: user.display_name,
      msg_cont: `🏁 베팅 정산: "${betRow.bet_titl}" — 결과 [${optnRow.optn_nm}] · 총 풀 π${totalPool} · ${resultText}`,
      msg_tp_cd: 'BET_NOTI',
      regr_id: slug,
      modr_id: slug,
    })
    .select()
    .single()

  if (notiMsg) await broadcastToRoom(roomId, 'new_msg', notiMsg)

  return NextResponse.json({
    settled: true,
    win_optn_no: winOptnNo,
    total_pool_pi: totalPool,
    winner_cnt: winners.length,
    payout_each_pi: payoutEach,
  })
}
