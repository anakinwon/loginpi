'use client'
import { useChatRoom, type ChatMessage } from '@/hooks/use-chat-room'
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

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <ChatMessageList
        roomId={roomId}
        messages={messages}
        currentUserId={currentUserId}
        prependMessages={prependMessages}
      />
      <ChatInput onSend={sendMessage} />
    </div>
  )
}
