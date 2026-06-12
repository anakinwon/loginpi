'use client'
import { useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'

// PiTranslate™ 번역/원문 전환 (TASK-097) + 번역 품질 피드백 👍/👎 (TASK-099)
// 기본은 번역 텍스트 표시 — [원문 보기] 토글로 번역 투명성 보장
// roomId·msgId·localeCd가 모두 있을 때만 피드백 버튼 노출 (시스템 선번역 등 캐시 미보장 케이스 방어)
export function TranslatedMessage({
  original,
  translated,
  roomId,
  msgId,
  localeCd,
}: {
  original: string
  translated: string
  roomId?: string
  msgId?: string
  localeCd?: string | null
}) {
  const [showOriginal, setShowOriginal] = useState(false)
  const [feedback, setFeedback] = useState<'Y' | 'N' | null>(null)
  const [sending, setSending] = useState(false)

  const canFeedback = !!roomId && !!msgId && !!localeCd

  async function sendFeedback(value: 'Y' | 'N') {
    if (!canFeedback || sending || feedback === value) return
    setSending(true)
    try {
      const res = await piFetch(
        `/api/chat/rooms/${roomId}/messages/${msgId}/translate/feedback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale_cd: localeCd, feedback: value }),
        },
      )
      if (res.ok) setFeedback(value)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="whitespace-pre-wrap">
        {showOriginal ? original : translated}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          className="text-[10px] underline opacity-60 transition-opacity hover:opacity-100"
        >
          {showOriginal ? '번역 보기' : '원문 보기'}
        </button>
        {canFeedback && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label="번역 좋아요"
              disabled={sending}
              onClick={() => sendFeedback('Y')}
              className={`text-[11px] transition-opacity ${feedback === 'Y' ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
            >
              👍
            </button>
            <button
              type="button"
              aria-label="번역 별로예요"
              disabled={sending}
              onClick={() => sendFeedback('N')}
              className={`text-[11px] transition-opacity ${feedback === 'N' ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
            >
              👎
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
