'use client'

import { useEffect, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { ChatRoomPanel } from './chat-room-panel'
import type { ChatMessage } from '@/hooks/use-chat-room'

type RoomInfo = { room_nm: string; room_desc: string | null; theme_cd: string }

// Pi Browser 전용 채팅방 게이트.
// 서버가 쿠키로 신원을 못 찾을 때 렌더되며, localStorage 토큰을 X-Pi-Token 헤더로 실어
// 방 정보·초기 메시지를 클라이언트에서 로드한 뒤 ChatRoomPanel(실시간 패널)에 전달한다.
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      className='mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground'
      style={{ height: 'calc(100vh - 3.5rem)' }}
    >
      {children}
    </div>
  )
}

export function ClientChatRoom({ roomId }: { roomId: string }) {
  const { user, isLoading: authLoading } = usePiAuth()
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [themeEmoji, setThemeEmoji] = useState('💬')
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading')

  useEffect(() => {
    if (!user) return
    let cancelled = false

    ;(async () => {
      const roomRes = await piFetch(`/api/chat/rooms/${roomId}`)
      if (cancelled) return
      if (roomRes.status === 403) {
        setState('forbidden')
        return
      }
      if (!roomRes.ok) {
        setState('error')
        return
      }
      const roomData = (await roomRes.json()) as { room: RoomInfo; themeEmoji?: string }

      const msgRes = await piFetch(`/api/chat/rooms/${roomId}/messages?limit=50`)
      if (cancelled) return
      if (!msgRes.ok) {
        setState('error')
        return
      }
      const msgData = (await msgRes.json()) as { messages: ChatMessage[] }

      setRoom(roomData.room)
      setThemeEmoji(roomData.themeEmoji ?? '💬')
      setInitialMessages(msgData.messages ?? [])
      setState('ready')
    })()

    return () => {
      cancelled = true
    }
  }, [user, roomId])

  if (authLoading) return <Centered>Pi 계정 인증 중…</Centered>
  if (!user) {
    return (
      <Centered>
        채팅은 로그인 후 이용할 수 있습니다
        <Link href='/' className='text-primary underline'>홈으로 이동</Link>
      </Centered>
    )
  }
  if (state === 'loading') return <Centered>채팅방을 불러오는 중…</Centered>
  if (state === 'forbidden') {
    return (
      <Centered>
        채팅방 멤버가 아닙니다
        <Link href='/chat' className='text-primary underline'>채팅 목록으로</Link>
      </Centered>
    )
  }
  if (state === 'error') {
    return (
      <Centered>
        채팅방을 불러오지 못했습니다
        <Link href='/chat' className='text-primary underline'>채팅 목록으로</Link>
      </Centered>
    )
  }

  return (
    <div
      className='mx-auto flex w-full max-w-2xl flex-col overflow-hidden'
      style={{ height: 'calc(100vh - 3.5rem)' }}
    >
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
          <p className='truncate font-semibold text-sm'>{room?.room_nm}</p>
          {room?.room_desc && (
            <p className='truncate text-xs text-muted-foreground'>{room.room_desc}</p>
          )}
        </div>
      </header>

      <ChatRoomPanel
        roomId={roomId}
        initialMessages={initialMessages}
        currentUserId={user.userId}
        currentUserDisplayName={user.displayName}
      />
    </div>
  )
}
