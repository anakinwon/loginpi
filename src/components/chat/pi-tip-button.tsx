'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

interface PiTipButtonProps {
  roomId: string
  recipientId: string
  recipientName: string
}

const TIP_AMOUNTS = [0.1, 0.5, 1] as const

export function PiTipButton({
  roomId,
  recipientId,
  recipientName,
}: PiTipButtonProps) {
  const [open, setOpen] = useState(false)
  const [paying, setPaying] = useState(false)

  async function sendTip(amount: number) {
    if (!window.Pi) {
      toast.error('Pi Browser에서만 Bean을 보낼 수 있습니다')
      setOpen(false)
      return
    }
    setPaying(true)
    try {
      const prep = await piFetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          recipient_id: recipientId,
          amount,
        }),
      })
      if (!prep.ok) {
        const d = (await prep.json()) as { error?: string }
        throw new Error(d.error ?? 'Bean 준비 실패')
      }
      const params = (await prep.json()) as {
        amount: number
        memo: string
        metadata: Record<string, unknown>
      }

      window.Pi.createPayment(params, {
        onReadyForServerApproval: async (paymentId) => {
          await fetch('/api/payments/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId }),
          })
        },
        onReadyForServerCompletion: async (paymentId, txid) => {
          const res = await fetch('/api/payments/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId, txid }),
          })
          setPaying(false)
          setOpen(false)
          if (res.ok)
            toast.success(`${recipientName} 님께 π${amount} Bean을 선물했습니다!`)
          else toast.error('Bean 결제 완료 처리에 실패했습니다')
        },
        onCancel: () => {
          setPaying(false)
        },
        onError: (e) => {
          setPaying(false)
          toast.error(e.message)
        },
      })
    } catch (e) {
      setPaying(false)
      toast.error(e instanceof Error ? e.message : 'Bean 오류')
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-muted rounded-full px-2 py-0.5 text-xs opacity-0 transition-opacity group-hover:opacity-100"
        title={`${recipientName}님께 Pi Bean 보내기`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bean.png"
          alt="Bean"
          className="inline-block h-8 w-8 brightness-125"
        />
      </button>
      {open && (
        <div className="bg-popover absolute bottom-full left-0 z-20 mb-1 min-w-[160px] rounded-xl border p-2 shadow-lg">
          <div className="text-muted-foreground mb-1.5 px-1 text-xs">
            Bean 금액 선택
          </div>
          <div className="flex gap-1">
            {TIP_AMOUNTS.map((amt) => (
              <button
                key={amt}
                disabled={paying}
                onClick={() => sendTip(amt)}
                className="bg-primary/10 text-primary hover:bg-primary/20 flex-1 rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {paying ? '…' : `π${amt}`}
              </button>
            ))}
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground rounded-lg px-2 py-1.5 text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
