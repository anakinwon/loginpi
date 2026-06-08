'use client'
import { useState, useRef, useCallback } from 'react'
import type { ChatMessage } from '@/hooks/use-chat-room'

interface ChatInputProps {
  roomId: string
  onSend: (msg: ChatMessage) => void
}

export function ChatInput({ roomId, onSend }: ChatInputProps) {
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const send = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return

    setIsSending(true)
    setText('')

    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg_cont: trimmed, msg_tp_cd: 'TEXT' }),
      })

      if (res.status === 429) {
        // rate limit — 텍스트 복원
        setText(trimmed)
        return
      }

      if (res.ok) {
        const { message } = await res.json()
        onSend(message)
      } else {
        // 전송 실패 시 텍스트 복원
        setText(trimmed)
      }
    } finally {
      setIsSending(false)
      textareaRef.current?.focus()
    }
  }, [text, isSending, roomId, onSend])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter 전송 / Shift+Enter 줄바꿈
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        send()
      }
    },
    [send],
  )

  // textarea 높이 자동 조절
  const onInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }, [])

  return (
    <div className='flex items-end gap-2 border-t p-3'>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={onInput}
        onKeyDown={onKeyDown}
        placeholder='메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)'
        rows={1}
        className='flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring'
        style={{ maxHeight: '120px' }}
      />
      <button
        onClick={send}
        disabled={!text.trim() || isSending}
        className='shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40'
      >
        {isSending ? '...' : '전송'}
      </button>
    </div>
  )
}
