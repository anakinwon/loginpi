'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { StickerPicker } from './sticker-picker'
import { StickerImg } from './sticker-img'

interface ChatInputProps {
  onSend: (text: string) => Promise<void>
  onSendSticker: (stkrId: string, stkrUrl: string) => Promise<void>
  onSendFile?: (file: File) => Promise<void>
}

// 전송 전 대기 중인 첨부 — 스티커/파일 모두 미리보기 후 명시적 전송으로 보낸다
interface PendingSticker {
  id: string
  url: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export function ChatInput({
  onSend,
  onSendSticker,
  onSendFile,
}: ChatInputProps) {
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  // 스티커: 1번 클릭 → 미리보기, 같은 스티커 재클릭 또는 전송 버튼 → 전송
  const [pendingSticker, setPendingSticker] = useState<PendingSticker | null>(
    null,
  )
  // 파일: 선택 → 미리보기(사진은 썸네일) → 전송 버튼으로 전송
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 외부 클릭 시 스티커 피커 닫기 (선택 대기 스티커는 유지 — 전송 버튼으로 보낼 수 있음)
  useEffect(() => {
    if (!showPicker) return
    function handleMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node))
        setShowPicker(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [showPicker])

  // 이미지 미리보기 objectURL 해제 (교체·취소·언마운트)
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    }
  }, [filePreviewUrl])

  const clearPendingFile = useCallback(() => {
    setPendingFile(null)
    setFilePreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url)
      return null
    })
  }, [])

  const send = useCallback(async () => {
    const trimmed = text.trim()
    if ((!trimmed && !pendingSticker && !pendingFile) || isSending) return

    setIsSending(true)
    setText('')
    // 줄바꿈으로 늘어난 높이 초기화 (setText는 onInput을 거치지 않음)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    try {
      // 첨부 우선 전송 → 텍스트 순서 (첨부 + 텍스트 동시 입력 시 둘 다 전송)
      if (pendingSticker) {
        await onSendSticker(pendingSticker.id, pendingSticker.url)
        setPendingSticker(null)
        setShowPicker(false)
      }
      if (pendingFile && onSendFile) {
        await onSendFile(pendingFile)
        clearPendingFile()
      }
      if (trimmed) await onSend(trimmed)
    } catch {
      // rate limit이거나 전송 실패 시 입력 내용 복원
      setText(trimmed)
    } finally {
      setIsSending(false)
      textareaRef.current?.focus()
    }
  }, [
    text,
    isSending,
    pendingSticker,
    pendingFile,
    onSend,
    onSendSticker,
    onSendFile,
    clearPendingFile,
  ])

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

  // 1번 클릭 → 미리보기 대기, 같은 스티커 재클릭 → 즉시 전송
  const handleStickerSelect = useCallback(
    async (stkrId: string, stkrUrl: string) => {
      if (pendingSticker?.id === stkrId) {
        if (isSending) return
        setShowPicker(false)
        setPendingSticker(null)
        setIsSending(true)
        try {
          await onSendSticker(stkrId, stkrUrl)
        } finally {
          setIsSending(false)
        }
      } else {
        setPendingSticker({ id: stkrId, url: stkrUrl })
      }
    },
    [pendingSticker, isSending, onSendSticker],
  )

  // 파일 선택 → 즉시 업로드하지 않고 미리보기 대기 상태로 전환
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      e.target.value = '' // 동일 파일 재선택 허용
      setFilePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      })
      setPendingFile(file)
    },
    [],
  )

  const hasPending = !!pendingSticker || !!pendingFile

  return (
    <div
      ref={containerRef}
      className="border-border/50 relative flex shrink-0 flex-col gap-2 border-t bg-zinc-200 p-3 shadow-[0_-4px_12px_rgb(0_0_0_/_0.06)] dark:bg-zinc-700"
    >
      {showPicker && (
        <StickerPicker
          onSelect={handleStickerSelect}
          onClose={() => setShowPicker(false)}
          selectedId={pendingSticker?.id ?? null}
        />
      )}

      {/* 전송 대기 미리보기 — 스티커 / 사진 썸네일 / 일반 파일 정보 */}
      {hasPending && (
        <div className="flex items-center gap-3">
          {pendingSticker && (
            <div className="bg-background relative rounded-xl border p-1.5">
              <StickerImg
                src={pendingSticker.url}
                alt="전송할 스티커 미리보기"
                className="h-16 w-16 object-contain"
              />
              <button
                onClick={() => setPendingSticker(null)}
                className="bg-foreground/70 text-background absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
                aria-label="스티커 선택 취소"
              >
                ✕
              </button>
            </div>
          )}
          {pendingFile && (
            <div className="bg-background relative flex items-center gap-2 rounded-xl border p-1.5 pr-3">
              {filePreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- objectURL 로컬 미리보기는 next/image 미지원
                <img
                  src={filePreviewUrl}
                  alt="전송할 사진 미리보기"
                  className="h-16 w-16 rounded-lg object-cover"
                />
              ) : (
                <span className="text-2xl" aria-hidden>
                  📄
                </span>
              )}
              <div className="min-w-0">
                <p className="max-w-40 truncate text-xs font-medium">
                  {pendingFile.name}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  {formatSize(pendingFile.size)}
                </p>
              </div>
              <button
                onClick={clearPendingFile}
                className="bg-foreground/70 text-background absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
                aria-label="파일 선택 취소"
              >
                ✕
              </button>
            </div>
          )}
          <p className="text-muted-foreground text-[11px]">
            전송 버튼을 누르면 보냅니다
          </p>
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => setShowPicker((o) => !o)}
          className="text-muted-foreground hover:bg-muted shrink-0 rounded-xl p-2 text-lg transition-colors"
          title="스티커"
          aria-label="스티커 선택"
        >
          😊
        </button>
        {onSendFile && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,audio/*,.pdf,.doc,.docx,.txt,.zip"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              className="text-muted-foreground hover:bg-muted shrink-0 rounded-xl p-2 text-lg transition-colors disabled:opacity-40"
              title="파일 첨부"
              aria-label="파일 첨부"
            >
              📎
            </button>
          </>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder="메시지를 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)"
          rows={1}
          className="bg-background focus:ring-ring flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ maxHeight: '120px' }}
        />
        <button
          onClick={send}
          // 터치/클릭 시 textarea의 포커스를 뺏지 않음 → 모바일 키보드 유지
          onPointerDown={(e) => e.preventDefault()}
          disabled={(!text.trim() && !hasPending) || isSending}
          className="bg-primary text-primary-foreground shrink-0 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {isSending ? '...' : '전송'}
        </button>
      </div>
    </div>
  )
}
