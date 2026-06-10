import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getRoom, getRoomMember } from '@/lib/chat'
import { ChatRoomPanel } from '@/components/chat/chat-room-panel'
import { ClientChatRoom } from '@/components/chat/client-chat-room'
import type { ChatMessage } from '@/hooks/use-chat-room'

type Params = { params: Promise<{ locale: string; roomId: string }> }

export default async function ChatRoomPage({ params }: Params) {
  const { locale, roomId } = await params
  const user = await getSessionUser()

  // 쿠키로 신원을 못 찾으면(Pi Browser는 Set-Cookie 미저장) redirect 대신 클라이언트 게이트로 위임.
  // 클라이언트가 localStorage 토큰을 X-Pi-Token 헤더로 실어 방 정보·메시지를 로드한다.
  if (!user) {
    return <ClientChatRoom roomId={roomId} />
  }

  const [room, mbr] = await Promise.all([
    getRoom(roomId),
    getRoomMember(roomId, user.id),
  ])

  if (!room) redirect(`/${locale}/chat`)

  // 비멤버: 공개 그룹방이면 자동 입장, 비공개·이벤트방은 목록으로
  if (!mbr) {
    if (room.room_tp_cd === 'G' && room.is_public_yn === 'Y') {
      const { count } = await getSupabaseAdmin()
        .from('msg_room_mbr')
        .select('room_mbr_id', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .eq('del_yn', 'N')
      if ((count ?? 0) >= room.max_mbr_cnt) redirect(`/${locale}/chat`)
      await getSupabaseAdmin()
        .from('msg_room_mbr')
        .insert({
          room_id: roomId,
          usr_id: user.id,
          mbr_role_cd: 'MEMBER',
          regr_id: user.display_name.slice(0, 20),
          modr_id: user.display_name.slice(0, 20),
        })
      // insert 후 이하 코드에서 그대로 렌더
    } else {
      redirect(`/${locale}/chat`)
    }
  }

  // 초기 메시지 50건 (최신 → 오래된 순 조회 후 역순 정렬)
  const { data: rawMsgs } = await getSupabaseAdmin()
    .from('msg_msg')
    .select('msg_id, room_id, snd_usr_id, snd_usr_nm, msg_cont, msg_tp_cd, attch_url, stkr_id, ref_msg_id, src_lang_cd, del_yn, reg_dtm')
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .limit(50)

  const initialMessages = ((rawMsgs ?? []) as ChatMessage[]).reverse()

  // PiTranslate™ — 현재 locale의 캐시된 번역을 trans_cont로 pre-populate (조회만, 신규 번역 없음)
  if (initialMessages.length > 0) {
    const { data: transRows } = await getSupabaseAdmin()
      .from('msg_trans')
      .select('msg_id, trans_cont')
      .in('msg_id', initialMessages.map(m => m.msg_id))
      .eq('locale_cd', locale)
      .eq('del_yn', 'N')

    if (transRows && transRows.length > 0) {
      const transMap = new Map(transRows.map((t: { msg_id: string; trans_cont: string }) => [t.msg_id, t.trans_cont]))
      for (const msg of initialMessages) {
        const trans = transMap.get(msg.msg_id)
        if (trans) msg.trans_cont = trans
      }
    }
  }

  // msg_theme JOIN으로 테마 이모지 가져오기
  const { data: themeData } = await getSupabaseAdmin()
    .from('msg_theme')
    .select('theme_emoji')
    .eq('theme_cd', room.theme_cd)
    .single()

  const themeEmoji = (themeData as { theme_emoji?: string } | null)?.theme_emoji ?? '💬'

  return (
    // 화면 직접 고정 프레임: top-14(사이트 헤더 아래) ~ bottom-0(화면 바닥).
    // fixed는 뷰포트 기준이라 URL바·키보드 변화를 자동 추적하고,
    // 레이아웃의 Footer가 아래에 있어도 페이지 전체 스크롤이 생기지 않는다 (본문만 스크롤).
    <div className='fixed inset-x-0 top-14 bottom-0 z-40 mx-auto flex w-full max-w-2xl flex-col overflow-hidden bg-background'>
      {/* 헤더(제목+언어콤보 고정)·메시지(스크롤)·입력창(고정)은 ChatRoomPanel이 렌더 */}
      <ChatRoomPanel
        roomId={roomId}
        initialMessages={initialMessages}
        currentUserId={user.id}
        currentUserDisplayName={user.display_name}
        roomNm={room.room_nm}
        roomDesc={room.room_desc}
        themeEmoji={themeEmoji}
      />
    </div>
  )
}
