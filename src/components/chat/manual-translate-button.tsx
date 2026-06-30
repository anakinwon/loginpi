'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { TranslatedMessage } from './translated-message'
import { useOpenPromoActive } from '@/components/feature-flag-provider'

// 비구독자 수동 번역 버튼 — 건당 Bean 과금(confirm:true). 구독자는 자동번역되므로 노출되지 않음.
// 번역 성공 시 컴포넌트 로컬 상태로 번역문을 표시(메시지 목록 상태는 건드리지 않음).
export function ManualTranslateButton({
  roomId,
  msgId,
  localeCd,
  original,
  feeBean,
}: {
  roomId: string
  msgId: string
  localeCd: string
  original: string
  feeBean: number
}) {
  const [translated, setTranslated] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // 번역 요금은 오픈프로모로만 통제(서버 applyPromoGate와 일관) — 프로모 ON 무료, OFF 정상요금.
  //   번역은 PI 마이크로 무료화 대상이 아니므로 PI 모드여도 프로모 OFF면 Bean 과금.
  const promoActive = useOpenPromoActive()
  const feeLabel = promoActive ? '무료' : `${feeBean} Bean`

  // 이미 번역됨 → 번역/원문 토글 UI 재사용
  if (translated !== null) {
    return (
      <TranslatedMessage
        original={original}
        translated={translated}
        roomId={roomId}
        msgId={msgId}
        localeCd={localeCd}
      />
    )
  }

  async function doTranslate() {
    setLoading(true)
    try {
      const res = await piFetch(
        `/api/chat/rooms/${roomId}/messages/${msgId}/translate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale_cd: localeCd, confirm: true }),
        },
      )
      const data = (await res.json()) as {
        trans_cont?: string
        error?: string
      }
      if (res.ok) {
        setTranslated(data.trans_cont ?? original)
      } else if (res.status === 402) {
        toast.error(data.error ?? `번역에 ${feeBean} Bean이 필요합니다`)
      } else {
        toast.error(data.error ?? '번역에 실패했습니다')
      }
    } catch {
      toast.error('번역 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="whitespace-pre-wrap">{original}</span>
      <button
        type="button"
        onClick={doTranslate}
        disabled={loading}
        className="text-primary self-start text-[10px] underline opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
      >
        🌐 {loading ? '번역 중…' : `번역 (${feeLabel})`}
      </button>
    </div>
  )
}
