'use client'
import { useState, useRef, useCallback } from 'react'

interface ChatInputProps {
  onSend: (text: string) => Promise<void>
}

export function ChatInput({ onSend }: ChatInputProps) {
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const send = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return

    setIsSending(true)
    setText('')

    try {
      await onSend(trimmed)
    } catch (err) {
      // rate limit이거나 전송 실패 시 입력 내용 복원
      setText(trimmed)
    } finally {
      setIsSending(false)
      textareaRef.current?.focus()
    }
  }, [text, isSending, onSend])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        send()
      }
    },
    [send],
  )

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
