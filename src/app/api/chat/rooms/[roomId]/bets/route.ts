import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { broadcastToRoom } from '@/lib/realtime-broadcast'
import { recordUserAction } from '@/lib/event'

type Params = { params: Promise<{ roomId: string }> }

// TASK-071: Pi Bet 투표
// GET /api/chat/rooms/[roomId]/bets — 방 베팅 목록 (옵션·참가 현황·내 참가 포함)
export async function GET(_request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr)
    return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })

  const db = getSupabaseAdmin()
  const { data: bets, error } = await db
    .from('msg_bet')
    .select(
      'bet_id, room_id, crtr_usr_id, bet_titl, bet_amt_pi, bet_st_cd, close_dtm, win_optn_no, settle_dtm, reg_dtm',
    )
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .limit(20)

  if (error)
    return NextResponse.json({ error: '베팅 목록 조회 실패' }, { status: 500 })

  const betIds = (bets ?? []).map((b: { bet_id: string }) => b.bet_id)
  let options: { bet_id: string; optn_no: number; optn_nm: string }[] = []
  let entries: {
    bet_id: string
    usr_id: string
    optn_no: number
    bet_amt_pi: number
    win_yn: string
    payout_pi: number
  }[] = []

  if (betIds.length > 0) {
    const [{ data: optRows }, { data: entryRows }] = await Promise.all([
      db
        .from('msg_bet_optn')
        .select('bet_id, optn_no, optn_nm')
        .in('bet_id', betIds)
        .eq('del_yn', 'N')
        .order('optn_no'),
      db
        .from('msg_bet_entry')
        .select('bet_id, usr_id, optn_no, bet_amt_pi, win_yn, payout_pi')
        .in('bet_id', betIds)
        .eq('del_yn', 'N'),
    ])
    options = optRows ?? []
    entries = entryRows ?? []
  }

  const result = (bets ?? []).map(
    (b: { bet_id: string; crtr_usr_id: string }) => {
      const betEntries = entries.filter((e) => e.bet_id === b.bet_id)
      const myEntry = betEntries.find((e) => e.usr_id === user.id) ?? null
      return {
        ...b,
        is_creator: b.crtr_usr_id === user.id,
        options: options
          .filter((o) => o.bet_id === b.bet_id)
          .map((o) => ({
            optn_no: o.optn_no,
            optn_nm: o.optn_nm,
            entry_cnt: betEntries.filter((e) => e.optn_no === o.optn_no).length,
          })),
        total_pool_pi: betEntries.reduce(
          (sum, e) => sum + Number(e.bet_amt_pi),
          0,
        ),
        my_entry: myEntry
          ? {
              optn_no: myEntry.optn_no,
              win_yn: myEntry.win_yn,
              payout_pi: myEntry.payout_pi,
            }
          : null,
      }
    },
  )

  return NextResponse.json({
    bets: result,
    is_room_owner: mbr.mbr_role_cd === 'OWNER',
  })
}

// POST /api/chat/rooms/[roomId]/bets — 베팅 이벤트 생성 (방장 전용)
export async function POST(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr)
    return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })
  if (mbr.mbr_role_cd !== 'OWNER') {
    return NextResponse.json(
      { error: '방장만 베팅을 생성할 수 있습니다' },
      { status: 403 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { bet_titl, bet_amt_pi, close_dtm, options } = body as {
    bet_titl?: string
    bet_amt_pi?: number
    close_dtm?: string
    options?: string[]
  }

  const title = bet_titl?.trim()
  const amount = Number(bet_amt_pi)
  const optionNames = (options ?? [])
    .map((o) => String(o).trim())
    .filter(Boolean)

  if (!title || title.length > 200) {
    return NextResponse.json(
      { error: '베팅 주제를 입력해주세요 (200자 이내)' },
      { status: 400 },
    )
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100) {
    return NextResponse.json(
      { error: '베팅 금액은 0 초과 100 Pi 이하여야 합니다' },
      { status: 400 },
    )
  }
  if (optionNames.length < 2 || optionNames.length > 10) {
    return NextResponse.json(
      { error: '선택지는 2~10개여야 합니다' },
      { status: 400 },
    )
  }
  if (close_dtm && Number.isNaN(Date.parse(close_dtm))) {
    return NextResponse.json(
      { error: '유효하지 않은 마감 시각' },
      { status: 400 },
    )
  }

  const db = getSupabaseAdmin()
  const slug = user.display_name.slice(0, 20)

  const { data: bet, error } = await db
    .from('msg_bet')
    .insert({
      room_id: roomId,
      crtr_usr_id: user.id,
      bet_titl: title,
      bet_amt_pi: amount,
      close_dtm: close_dtm ?? null,
      regr_id: slug,
      modr_id: slug,
    })
    .select()
    .single()

  if (error || !bet)
    return NextResponse.json({ error: '베팅 생성 실패' }, { status: 500 })

  const { error: optError } = await db.from('msg_bet_optn').insert(
    optionNames.map((nm, i) => ({
      bet_id: bet.bet_id,
      optn_no: i + 1,
      optn_nm: nm.slice(0, 100),
      regr_id: slug,
      modr_id: slug,
    })),
  )

  if (optError) {
    // 옵션 삽입 실패 시 베팅 본체 논리삭제 (고아 행 방지)
    await db
      .from('msg_bet')
      .update({ del_yn: 'Y', del_dtm: new Date().toISOString() })
      .eq('bet_id', bet.bet_id)
    return NextResponse.json({ error: '베팅 옵션 생성 실패' }, { status: 500 })
  }

  // BET_NOTI 메시지 발송 + broadcast
  const { data: notiMsg } = await db
    .from('msg_msg')
    .insert({
      room_id: roomId,
      snd_usr_id: user.id,
      snd_usr_nm: user.display_name,
      msg_cont: `🎲 새 베팅: "${title}" — 참가 π${amount} · ${optionNames.join(' vs ')}`,
      msg_tp_cd: 'BET_NOTI',
      regr_id: slug,
      modr_id: slug,
    })
    .select()
    .single()

  if (notiMsg) await broadcastToRoom(roomId, 'new_msg', notiMsg)

  // M4: Pi Bet 생성 미션 기록 (비블로킹)
  recordUserAction('pibet_create', user.id, { roomId, bet_id: bet.bet_id })
    .catch(err => console.error(`[M4] 미션 기록 실패: ${err.message}`))

  return NextResponse.json({ bet }, { status: 201 })
}
