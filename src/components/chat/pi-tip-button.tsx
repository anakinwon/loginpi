'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { TIP_PRESETS_BEAN } from '@/lib/bean-shared'

interface PiTipButtonProps {
  roomId: string
  recipientId: string
  recipientName: string
}

export function PiTipButton({
  roomId,
  recipientId,
  recipientName,
}: PiTipButtonProps) {
  const [open, setOpen] = useState(false)
  const [confirmAmt, setConfirmAmt] = useState<number | null>(null) // null=금액선택, 값=확인단계
  const [sending, setSending] = useState(false)

  function close() {
    setOpen(false)
    setConfirmAmt(null)
  }

  async function sendTip(amount: number) {
    setSending(true)
    try {
      // Bean 실전송 — Pi 결제 없이 USER→USER 즉시 이전 (window.Pi 불필요)
      const res = await piFetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          recipient_id: recipientId,
          amount,
        }),
      })
      const data = (await res.json()) as { error?: string }
      setSending(false)
      close()
      if (res.ok) {
        toast.success(`${recipientName} 님께 ${amount} Bean을 선물했습니다!`)
      } else {
        toast.error(data.error ?? 'Bean 전송에 실패했습니다')
      }
    } catch (e) {
      setSending(false)
      toast.error(e instanceof Error ? e.message : 'Bean 오류')
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="hover:bg-muted rounded-full px-2 py-0.5 text-xs opacity-0 transition-opacity group-hover:opacity-100"
        title={`${recipientName}님께 Bean 선물하기`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bean.png"
          alt="Bean"
          className="inline-block h-8 w-8 brightness-125"
        />
      </button>
      {open && (
        <div className="bg-popover absolute bottom-full left-0 z-20 mb-1 min-w-[200px] rounded-xl border p-2 shadow-lg">
          {confirmAmt === null ? (
            // ── 1단계: 금액 선택 ──
            <>
              <div className="text-muted-foreground mb-1.5 px-1 text-xs">
                Bean 금액 선택
              </div>
              <div className="flex gap-1">
                {TIP_PRESETS_BEAN.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setConfirmAmt(amt)}
                    className="bg-primary/10 text-primary hover:bg-primary/20 flex-1 rounded-lg px-2 py-1.5 text-xs font-medium"
                  >
                    {amt} Bean
                  </button>
                ))}
                <button
                  onClick={close}
                  className="text-muted-foreground hover:text-foreground rounded-lg px-2 py-1.5 text-xs"
                >
                  ✕
                </button>
              </div>
            </>
          ) : (
            // ── 2단계: 선물 확인 ──
            <>
              <div className="mb-2 px-1 text-sm">
                <span className="font-semibold">{recipientName}</span> 님께{' '}
                <span className="text-primary font-semibold">
                  {confirmAmt} Bean
                </span>
                을 선물하시겠습니까?
              </div>
              <div className="flex gap-1">
                <button
                  disabled={sending}
                  onClick={() => sendTip(confirmAmt)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1 rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {sending ? '전송 중…' : '선물하기'}
                </button>
                <button
                  disabled={sending}
                  onClick={() => setConfirmAmt(null)}
                  className="hover:bg-muted text-muted-foreground rounded-lg border px-2 py-1.5 text-xs disabled:opacity-50"
                >
                  취소
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
