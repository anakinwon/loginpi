import { getSessionUser } from '@/lib/auth-check'
import { getChatRoomLists } from '@/lib/chat-room-list'
import {
  ChatListView,
  type RoomWithTheme,
} from '@/components/chat/chat-list-view'
import { ClientChatList } from '@/components/chat/client-chat-list'

// 카페 목록 — 일반 브라우저는 쿠키 세션으로 SSR, Pi Browser는 클라이언트 게이트로 위임
// 데이터 조회는 chat-room-list 공통 모듈 (내 카페·공개 카페 병렬 + Bet 뱃지 1쿼리)
export default async function ChatPage() {
  const user = await getSessionUser()

  // 쿠키로 신원을 못 찾으면(Pi Browser는 Set-Cookie 미저장) redirect 대신 클라이언트 게이트로 위임.
  // 클라이언트가 localStorage 토큰을 X-Pi-Token 헤더로 실어 목록을 로드한다.
  if (!user) {
    return <ClientChatList />
  }

  const { rooms, publicRooms } = await getChatRoomLists(user.id, true)
  const myRooms = rooms as unknown as RoomWithTheme[]
  const myRoomIds = new Set(myRooms.map((r) => r.room_id))
  const discoverRooms = (publicRooms as unknown as RoomWithTheme[]).filter(
    (r) => !myRoomIds.has(r.room_id),
  )

  return <ChatListView myRooms={myRooms} discoverRooms={discoverRooms} />
}
