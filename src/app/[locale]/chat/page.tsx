import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { ChatListView, type RoomWithTheme } from '@/components/chat/chat-list-view'
import { ClientChatList } from '@/components/chat/client-chat-list'

const ROOM_SELECT = 'room_id, room_nm, theme_cd, room_tp_cd, is_public_yn, msg_theme(theme_nm, theme_emoji)'

export default async function ChatPage() {
  const user = await getSessionUser()

  // 쿠키로 신원을 못 찾으면(Pi Browser는 Set-Cookie 미저장) redirect 대신 클라이언트 게이트로 위임.
  // 클라이언트가 localStorage 토큰을 X-Pi-Token 헤더로 실어 목록을 로드한다.
  // 일반 브라우저는 쿠키가 있어 이 분기를 타지 않고 아래 SSR 경로로 진행한다.
  if (!user) {
    return <ClientChatList />
  }

  const db = getSupabaseAdmin()

  // 내 채팅방 목록
  const { data: mbrs } = await db
    .from('msg_room_mbr')
    .select('room_id')
    .eq('usr_id', user.id)
    .eq('del_yn', 'N')

  let myRooms: RoomWithTheme[] = []
  if (mbrs && mbrs.length > 0) {
    const roomIds = mbrs.map((m: { room_id: string }) => m.room_id)
    const { data } = await db
      .from('msg_room')
      .select(ROOM_SELECT)
      .in('room_id', roomIds)
      .eq('del_yn', 'N')
      .order('mod_dtm', { ascending: false })
    myRooms = (data ?? []) as RoomWithTheme[]
  }

  // 공개 그룹 채팅방 (최근 10개)
  const { data: publicRooms } = await db
    .from('msg_room')
    .select(ROOM_SELECT)
    .eq('is_public_yn', 'Y')
    .eq('room_tp_cd', 'G')
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .limit(10)

  const myRoomIds = new Set(myRooms.map(r => r.room_id))
  const discoverRooms = ((publicRooms ?? []) as RoomWithTheme[]).filter(r => !myRoomIds.has(r.room_id))

  return <ChatListView myRooms={myRooms} discoverRooms={discoverRooms} />
}
