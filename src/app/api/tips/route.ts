import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { canSendTip } from '@/lib/chat-auth'

const VALID_AMOUNTS = [0.1, 0.5, 1] as const

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const allowed = await canSendTip(user.id)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Pi Tip은 PREMIUM 이상 구독자만 사용할 수 있습니다' },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { room_id, recipient_id, amount } = body as {
    room_id?: string
    recipient_id?: string
    amount?: number
  }

  if (!room_id || !recipient_id || amount === undefined) {
    return NextResponse.json({ error: 'room_id, recipient_id, amount가 필요합니다' }, { status: 400 })
  }

  if (!(VALID_AMOUNTS as readonly number[]).includes(amount)) {
    return NextResponse.json({ error: '유효한 금액: 0.1, 0.5, 1 Pi' }, { status: 400 })
  }

  if (recipient_id === user.id) {
    return NextResponse.json({ error: '자기 자신에게 Tip을 보낼 수 없습니다' }, { status: 400 })
  }

  const db = getSupabaseAdmin()

  const [{ data: recipient }, { data: senderMbr }, { data: recipientMbr }] = await Promise.all([
    db.from('sys_user').select('id, display_name').eq('id', recipient_id).maybeSingle(),
    db.from('msg_room_mbr').select('room_id').eq('room_id', room_id).eq('usr_id', user.id).eq('del_yn', 'N').maybeSingle(),
    db.from('msg_room_mbr').select('room_id').eq('room_id', room_id).eq('usr_id', recipient_id).eq('del_yn', 'N').maybeSingle(),
  ])

  if (!recipient) {
    return NextResponse.json({ error: '수신자를 찾을 수 없습니다' }, { status: 404 })
  }
  if (!senderMbr) {
    return NextResponse.json({ error: '해당 채팅방에 참여 중이 아닙니다' }, { status: 403 })
  }
  if (!recipientMbr) {
    return NextResponse.json({ error: '수신자가 해당 채팅방에 없습니다' }, { status: 400 })
  }

  const recipientRow = recipient as { id: string; display_name: string | null }

  return NextResponse.json({
    amount,
    memo: `💰 @${user.display_name} → @${recipientRow.display_name ?? 'user'} Pi Tip`,
    metadata: {
      type: 'PI_TIP',
      room_id,
      recipient_id,
      recipient_nm: recipientRow.display_name ?? 'user',
    },
  })
}
