'use client'
import { useState, useEffect } from 'react'
import { useChatRoom, type ChatMessage } from '@/hooks/use-chat-room'
import { piFetch } from '@/lib/pi-fetch'
import { ChatMessageList } from './chat-message-list'
import { ChatInput } from './chat-input'

interface ChatRoomPanelProps {
  roomId: string
  initialMessages: ChatMessage[]
  currentUserId: string
  currentUserDisplayName: string
}

export function ChatRoomPanel({
  roomId,
  initialMessages,
  currentUserId,
  currentUserDisplayName,
}: ChatRoomPanelProps) {
  const { messages, sendMessage, prependMessages } = useChatRoom(
    roomId,
    initialMessages,
    { currentUserId, currentUserDisplayName },
  )
  const [canTip, setCanTip] = useState(false)

  useEffect(() => {
    piFetch('/api/subscriptions/check')
      .then(r => r.ok ? r.json() : null)
      .then((d: { canTip?: boolean } | null) => { if (d?.canTip) setCanTip(true) })
      .catch(() => {})
  }, [])

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <ChatMessageList
        roomId={roomId}
        messages={messages}
        currentUserId={currentUserId}
        canTip={canTip}
        prependMessages={prependMessages}
      />
      <ChatInput onSend={sendMessage} />
    </div>
  )
}
