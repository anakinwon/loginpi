'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { StickerPicker } from './sticker-picker'

interface ChatInputProps {
  onSend: (text: string) => Promise<void>
  onSendSticker: (stkrId: string, stkrUrl: string) => Promise<void>
}

export function ChatInput({ onSend, onSendSticker }: ChatInputProps) {
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 외부 클릭 시 스티커 피커 닫기
  useEffect(() => {
    if (!showPicker) return
    function handleMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setShowPicker(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [showPicker])

  const send = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return

    setIsSending(true)
    setText('')

    try {
      await onSend(trimmed)
    } catch {
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

  const handleStickerSelect = useCallback(async (stkrId: string, stkrUrl: string) => {
    setShowPicker(false)
    await onSendSticker(stkrId, stkrUrl)
  }, [onSendSticker])

  return (
    <div
      ref={containerRef}
      className='relative flex shrink-0 items-end gap-2 border-t border-border/50 bg-zinc-200 p-3 shadow-[0_-4px_12px_rgb(0_0_0_/_0.06)] dark:bg-zinc-700'
    >
      {showPicker && (
        <StickerPicker onSelect={handleStickerSelect} onClose={() => setShowPicker(false)} />
      )}
      <button
        onClick={() => setShowPicker(o => !o)}
        className='shrink-0 rounded-xl p-2 text-lg text-muted-foreground transition-colors hover:bg-muted'
        title='스티커'
        aria-label='스티커 선택'
      >
        😊
      </button>
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
