import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { getChatPlan } from '@/lib/chat-auth'

type Params = { params: Promise<{ roomId: string }> }

// TASK-073: 채팅방 분석 대시보드 (Business 전용, 방장만)
// GET /api/chat/rooms/[roomId]/analytics?days=30
export async function GET(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr || mbr.mbr_role_cd !== 'OWNER') {
    return NextResponse.json({ error: '방장만 분석을 볼 수 있습니다' }, { status: 403 })
  }

  const plan = await getChatPlan(user.id)
  if (plan.tier !== 'BUSINESS') {
    return NextResponse.json(
      { error: '분석 대시보드는 Business 플랜 전용 기능입니다', businessRequired: true },
      { status: 402 },
    )
  }

  const daysParam = Number(new URL(request.url).searchParams.get('days') ?? '30')
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30

  const db = getSupabaseAdmin()
  const [{ data: daily, error }, { data: mau }, { count: mbrCount }] = await Promise.all([
    db.rpc('fn_room_analytics', { p_room_id: roomId, p_days: days }),
    db.rpc('fn_room_mau', { p_room_id: roomId, p_days: days }),
    db
      .from('msg_room_mbr')
      .select('room_mbr_id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('del_yn', 'N'),
  ])

  if (error) return NextResponse.json({ error: '분석 조회 실패' }, { status: 500 })

  const rows = (daily ?? []) as {
    stat_dt: string
    msg_cnt: number
    active_usr_cnt: number
    tip_amt_pi: number
    new_mbr_cnt: number
  }[]

  return NextResponse.json({
    days,
    daily: rows,
    summary: {
      mau: Number(mau ?? 0),
      cur_mbr_cnt: mbrCount ?? 0,
      total_msg_cnt: rows.reduce((s, r) => s + Number(r.msg_cnt), 0),
      total_tip_pi: rows.reduce((s, r) => s + Number(r.tip_amt_pi), 0),
      total_new_mbr_cnt: rows.reduce((s, r) => s + Number(r.new_mbr_cnt), 0),
    },
  })
}
