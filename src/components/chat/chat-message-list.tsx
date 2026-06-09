'use client'
import { useEffect, useRef, useCallback, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'
import type { ChatMessage } from '@/hooks/use-chat-room'
import { PiTipButton } from './pi-tip-button'

interface ChatMessageListProps {
  roomId: string
  messages: ChatMessage[]
  currentUserId: string
  canTip: boolean
  prependMessages: (msgs: ChatMessage[]) => void
}

export function ChatMessageList({
  roomId,
  messages,
  currentUserId,
  canTip,
  prependMessages,
}: ChatMessageListProps) {
  const [hasMore, setHasMore] = useState(messages.length >= 50)
  const [isLoading, setIsLoading] = useState(false)
  const [oldestMsgId, setOldestMsgId] = useState<string | null>(messages[0]?.msg_id ?? null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isInitial = useRef(true)

  // 최초 렌더 시 맨 아래로 스크롤
  useEffect(() => {
    if (isInitial.current) {
      bottomRef.current?.scrollIntoView()
      isInitial.current = false
    }
  }, [])

  // 새 메시지 도착 시 맨 아래로 스크롤 (자신이 보낸 메시지 or 화면 하단에 있을 때)
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last) return
    if (last.snd_usr_id === currentUserId) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, currentUserId])

  // scroll-up 무한로드
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || !oldestMsgId) return
    setIsLoading(true)

    const container = containerRef.current
    const prevScrollHeight = container?.scrollHeight ?? 0

    const res = await piFetch(`/api/chat/rooms/${roomId}/messages?limit=50&before=${oldestMsgId}`)
    if (res.ok) {
      const { messages: older, hasMore: more, oldestMsgId: nextCursor } = await res.json()
      prependMessages(older)
      setHasMore(more)
      setOldestMsgId(nextCursor)

      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight
        }
      })
    }
    setIsLoading(false)
  }, [hasMore, isLoading, oldestMsgId, roomId, prependMessages])

  // 스크롤 최상단 감지 → loadMore 호출
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onScroll = () => { if (container.scrollTop < 80) loadMore() }
    container.addEventListener('scroll', onScroll)
    return () => container.removeEventListener('scroll', onScroll)
  }, [loadMore])

  return (
    <div ref={containerRef} className='flex flex-1 flex-col gap-1 overflow-y-auto p-4'>
      {isLoading && (
        <div className='py-2 text-center text-sm text-muted-foreground'>불러오는 중...</div>
      )}
      {!hasMore && messages.length > 0 && (
        <div className='py-2 text-center text-xs text-muted-foreground'>대화의 시작입니다</div>
      )}
      {messages.map((msg, idx) => (
        <div key={msg.msg_id}>
          {(idx === 0 || !isSameDay(messages[idx - 1].reg_dtm, msg.reg_dtm)) && (
            <DateDivider dtm={msg.reg_dtm} />
          )}
          <MessageBubble msg={msg} isMe={msg.snd_usr_id === currentUserId} canTip={canTip} roomId={roomId} />
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
}

function formatKoreanDate(dtm: string): string {
  const d = new Date(dtm)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DAY_NAMES[d.getDay()]}요일`
}

function DateDivider({ dtm }: { dtm: string }) {
  return (
    <div className='my-3 flex items-center gap-3'>
      <div className='h-px flex-1 bg-border' />
      <span className='text-xs text-muted-foreground'>{formatKoreanDate(dtm)}</span>
      <div className='h-px flex-1 bg-border' />
    </div>
  )
}

// Node.js는 ICU 없이 빌드되면 toLocaleTimeString('ko-KR')이 'PM HH:MM'을 반환해 hydration 불일치 발생.
// 직접 구현으로 서버·클라이언트 동일 출력 보장.
function formatKoreanTime(dtm: string): string {
  const d = new Date(dtm)
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const period = h < 12 ? '오전' : '오후'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${period} ${h12.toString().padStart(2, '0')}:${m}`
}

function MessageBubble({ msg, isMe, canTip, roomId }: {
  msg: ChatMessage; isMe: boolean; canTip: boolean; roomId: string
}) {
  if (msg.msg_tp_cd === 'SYSTEM' || msg.msg_tp_cd === 'TIP_NOTI') {
    return (
      <div className='py-1 text-center text-xs text-muted-foreground'>
        {msg.msg_cont}
      </div>
    )
  }

  return (
    <div className={`group flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
      {!isMe && (
        <span className='text-xs text-muted-foreground'>{msg.snd_usr_nm}</span>
      )}
      <div
        className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
          isMe
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm bg-muted'
        }`}
      >
        {msg.msg_cont}
      </div>
      <div className='flex items-center gap-1'>
        <span className='text-[10px] text-muted-foreground'>
          {formatKoreanTime(msg.reg_dtm)}
        </span>
        {!isMe && canTip && (
          <PiTipButton roomId={roomId} recipientId={msg.snd_usr_id} recipientName={msg.snd_usr_nm} />
        )}
      </div>
    </div>
  )
}
