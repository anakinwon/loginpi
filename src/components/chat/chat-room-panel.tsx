'use client'
import { useCallback } from 'react'
import { ChatMessageList } from './chat-message-list'
import { ChatInput } from './chat-input'
import type { ChatMessage } from '@/hooks/use-chat-room'

interface ChatRoomPanelProps {
  roomId: string
  initialMessages: ChatMessage[]
  currentUserId: string
}

// ChatMessageList 내부 useChatRoom이 Realtime 수신을 담당하므로 onSend는 no-op
export function ChatRoomPanel({ roomId, initialMessages, currentUserId }: ChatRoomPanelProps) {
  const noop = useCallback(() => {}, [])

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <ChatMessageList roomId={roomId} initialMessages={initialMessages} currentUserId={currentUserId} />
      <ChatInput roomId={roomId} onSend={noop} />
    </div>
  )
}
