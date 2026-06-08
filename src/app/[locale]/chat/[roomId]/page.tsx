import { redirect } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getRoom, getRoomMember } from '@/lib/chat'
import { ChatRoomPanel } from '@/components/chat/chat-room-panel'
import type { ChatMessage } from '@/hooks/use-chat-room'

type Params = { params: Promise<{ locale: string; roomId: string }> }

export default async function ChatRoomPage({ params }: Params) {
  const { locale, roomId } = await params
  const user = await getSessionUser()
  if (!user) redirect(`/${locale}?error=login_required&next=${encodeURIComponent(`/${locale}/chat/${roomId}`)}`)

  const [room, mbr] = await Promise.all([
    getRoom(roomId),
    getRoomMember(roomId, user.id),
  ])

  if (!room) redirect(`/${locale}/chat`)

  // 비멤버: 공개방이면 join 안내, 비공개방이면 홈으로
  if (!mbr) {
    if (room.is_public_yn === 'Y') {
      redirect(`/${locale}/chat?join=${roomId}`)
    }
    redirect(`/${locale}/chat`)
  }

  // 초기 메시지 50건 (최신 → 오래된 순 조회 후 역순 정렬)
  const { data: rawMsgs } = await getSupabaseAdmin()
    .from('msg_msg')
    .select('msg_id, room_id, snd_usr_id, snd_usr_nm, msg_cont, msg_tp_cd, attch_url, stkr_id, ref_msg_id, del_yn, reg_dtm')
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .limit(50)

  const initialMessages = ((rawMsgs ?? []) as ChatMessage[]).reverse()

  // msg_theme JOIN으로 테마 이모지 가져오기
  const { data: themeData } = await getSupabaseAdmin()
    .from('msg_theme')
    .select('theme_emoji')
    .eq('theme_cd', room.theme_cd)
    .single()

  const themeEmoji = (themeData as { theme_emoji?: string } | null)?.theme_emoji ?? '💬'

  return (
    <div
      className='mx-auto flex w-full max-w-2xl flex-col overflow-hidden'
      style={{ height: 'calc(100vh - 3.5rem)' }}
    >
      {/* 채팅방 헤더 */}
      <header className='flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3'>
        <Link
          href='/chat'
          className='shrink-0 text-muted-foreground transition-colors hover:text-foreground'
          aria-label='채팅 목록으로'
        >
          ←
        </Link>
        <span className='text-xl'>{themeEmoji}</span>
        <div className='min-w-0'>
          <p className='truncate font-semibold text-sm'>{room.room_nm}</p>
          {room.room_desc && (
            <p className='truncate text-xs text-muted-foreground'>{room.room_desc}</p>
          )}
        </div>
      </header>

      {/* 메시지 목록 + 입력창 */}
      <ChatRoomPanel
        roomId={roomId}
        initialMessages={initialMessages}
        currentUserId={user.id}
      />
    </div>
  )
}
