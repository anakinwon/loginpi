import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { broadcastToRoom } from './realtime-broadcast'

// TASK-062 Trigger 7 — 테마 활동 배지
// 수여 조건: 해당 테마 방들에서 30일(고유 날짜) 이상 메시지 전송

export interface AwardedBadge {
  badge_id: string
  theme_cd: string
  theme_nm: string
  theme_emoji: string
}

export interface UserBadge {
  badge_id: string
  theme_cd: string
  upgr_yn: 'Y' | 'N'
  noti_yn: 'Y' | 'N'
  reg_dtm: string
  theme_nm: string
  theme_emoji: string
}

// 메시지 전송 후 after()에서 호출 — 배지 보유 시 RPC가 즉시 반환(인덱스 1회 조회)
// 수여되면 SYSTEM 메시지 + badge_award broadcast로 방 전체·당사자에게 알림
export async function tryAwardBadge(params: {
  userId: string
  roomId: string
  displayName: string
}): Promise<AwardedBadge | null> {
  const db = getSupabaseAdmin()

  const { data, error } = await db.rpc('fn_award_theme_badge', {
    p_usr_id: params.userId,
    p_room_id: params.roomId,
  })

  if (error || !data || (data as AwardedBadge[]).length === 0) return null
  const badge = (data as AwardedBadge[])[0]

  const slug = params.displayName.slice(0, 20)
  const { data: sysMsg } = await db
    .from('msg_msg')
    .insert({
      room_id: params.roomId,
      snd_usr_id: params.userId,
      snd_usr_nm: params.displayName,
      msg_cont: `🏅 ${params.displayName} 님이 ${badge.theme_emoji} ${badge.theme_nm} 배지를 획득했습니다!`,
      msg_tp_cd: 'SYSTEM',
      regr_id: slug,
      modr_id: slug,
    })
    .select()
    .single()

  await Promise.all([
    sysMsg
      ? broadcastToRoom(params.roomId, 'new_msg', sysMsg)
      : Promise.resolve(),
    // 당사자 클라이언트가 수신해 축하 팝업(Trigger 7) 표시
    broadcastToRoom(params.roomId, 'badge_award', {
      usr_id: params.userId,
      ...badge,
    }),
  ])

  return badge
}

// 내 배지 목록 (테마명·이모지 포함)
export async function getUserBadges(userId: string): Promise<UserBadge[]> {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('msg_usr_badge')
    .select(
      'badge_id, theme_cd, upgr_yn, noti_yn, reg_dtm, msg_theme(theme_nm, theme_emoji)',
    )
    .eq('usr_id', userId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      badge_id: string
      theme_cd: string
      upgr_yn: 'Y' | 'N'
      noti_yn: 'Y' | 'N'
      reg_dtm: string
      msg_theme: { theme_nm: string; theme_emoji: string } | null
    }
    return {
      badge_id: r.badge_id,
      theme_cd: r.theme_cd,
      upgr_yn: r.upgr_yn,
      noti_yn: r.noti_yn,
      reg_dtm: r.reg_dtm,
      theme_nm: r.msg_theme?.theme_nm ?? r.theme_cd,
      theme_emoji: r.msg_theme?.theme_emoji ?? '🏅',
    }
  })
}
