'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { TIP_PRESETS_BEAN, TIP_CUSTOM_MAX_BEAN } from '@/lib/bean-shared'

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
  // 선물 설정 — 런타임(관리자) 값. 로딩/실패 시 코드 상수로 폴백.
  const [presets, setPresets] = useState<number[]>([...TIP_PRESETS_BEAN])
  const [customMax, setCustomMax] = useState<number>(TIP_CUSTOM_MAX_BEAN)
  // 직접 입력(프리셋 4) 상태
  const [customOpen, setCustomOpen] = useState(false)
  const [customVal, setCustomVal] = useState('')

  useEffect(() => {
    let alive = true
    piFetch('/api/tip-presets')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { presets?: number[]; customMax?: number } | null) => {
        if (!alive || !d) return
        if (d.presets?.length === 3) setPresets(d.presets)
        if (typeof d.customMax === 'number' && d.customMax > 0)
          setCustomMax(d.customMax)
      })
      .catch(() => {}) // 실패 시 상수 유지
    return () => {
      alive = false
    }
  }, [])

  function close() {
    setOpen(false)
    setConfirmAmt(null)
    setCustomOpen(false)
    setCustomVal('')
  }

  const customNum = Number(customVal)
  const customValid =
    customVal !== '' &&
    Number.isInteger(customNum) &&
    customNum > 0 &&
    customNum <= customMax

  // PI 모드 선물 — 서버가 내려준 pay로 Pi 직결제(U2A). 받는 사람 A2U는 complete가 처리.
  function startTipPiPayment(
    pay: { amount: number; memo: string; metadata: Record<string, unknown> },
  ) {
    if (typeof window === 'undefined' || !window.Pi) {
      toast.error('Pi Browser에서 선물할 수 있습니다')
      setSending(false)
      return
    }
    window.Pi.createPayment(
      { amount: pay.amount, memo: pay.memo, metadata: pay.metadata },
      {
        onReadyForServerApproval: async (paymentId: string) => {
          try {
            const r = await piFetch('/api/payments/approve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId }),
            })
            if (!r.ok) throw new Error()
          } catch {
            toast.error('선물 결제 승인 실패')
            setSending(false)
            close()
          }
        },
        onReadyForServerCompletion: async (paymentId: string, txid: string) => {
          try {
            const r = await piFetch('/api/payments/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId, txid }),
            })
            if (!r.ok) throw new Error()
            toast.success(`${recipientName} 님께 Pi를 선물했습니다!`)
          } catch {
            toast.error('선물 처리 실패')
          } finally {
            setSending(false)
            close()
          }
        },
        onCancel: () => {
          setSending(false)
          close()
        },
        onError: (e: Error) => {
          toast.error(e?.message ?? '선물 오류')
          setSending(false)
          close()
        },
      },
    )
  }

  async function sendTip(amount: number) {
    setSending(true)
    let piHandoff = false
    try {
      const res = await piFetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          recipient_id: recipientId,
          amount,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        mode?: string
        pay?: { amount: number; memo: string; metadata: Record<string, unknown> }
      }
      // PI 모드 — 서버가 Pi 직결제 요구(앱 경유 U2A→A2U). createPayment로 핸드오프.
      if (data.mode === 'PI' && data.pay) {
        piHandoff = true
        startTipPiPayment(data.pay)
        return
      }
      close()
      if (res.ok) {
        toast.success(`${recipientName} 님께 ${amount} Bean을 선물했습니다!`)
      } else {
        toast.error(data.error ?? 'Bean 전송에 실패했습니다')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bean 오류')
    } finally {
      if (!piHandoff) setSending(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="hover:bg-muted rounded-full px-2 py-0.5 text-xs opacity-70 transition-opacity hover:opacity-100"
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
        <div className="bg-popover absolute bottom-full left-0 z-20 mb-1 min-w-[230px] rounded-xl border p-2 shadow-lg">
          {confirmAmt === null ? (
            // ── 1단계: 금액 선택 ──
            <>
              <div className="text-muted-foreground mb-1.5 flex items-center justify-between px-1 text-xs">
                <span>Bean 금액 선택</span>
                <button
                  onClick={close}
                  className="hover:text-foreground"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {presets.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setConfirmAmt(amt)}
                    className="bg-primary/10 text-primary hover:bg-primary/20 rounded-lg px-2 py-1.5 text-xs font-medium"
                  >
                    {amt.toLocaleString()}
                  </button>
                ))}
              </div>

              {/* 프리셋 4 — 직접 입력 */}
              {!customOpen ? (
                <button
                  onClick={() => setCustomOpen(true)}
                  className="hover:bg-muted mt-1 w-full rounded-lg border border-dashed px-2 py-1.5 text-xs font-medium"
                >
                  ✏️ 직접 입력 (최대 {customMax.toLocaleString()} Bean)
                </button>
              ) : (
                <div className="mt-1.5">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      value={customVal}
                      onChange={(e) =>
                        setCustomVal(e.target.value.replace(/[^0-9]/g, ''))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customValid)
                          setConfirmAmt(customNum)
                      }}
                      placeholder={`1 ~ ${customMax.toLocaleString()}`}
                      className="border-input bg-background min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-right text-xs tabular-nums"
                    />
                    <button
                      disabled={!customValid}
                      onClick={() => setConfirmAmt(customNum)}
                      className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                    >
                      확인
                    </button>
                  </div>
                  {customVal !== '' && !customValid && (
                    <p className="mt-1 px-1 text-[11px] text-amber-600 dark:text-amber-400">
                      1 ~ {customMax.toLocaleString()} Bean 사이 정수만 가능
                    </p>
                  )}
                  {customValid && (
                    <p className="text-muted-foreground mt-1 px-1 text-[11px]">
                      ≈ π{(customNum / 100).toFixed(2)}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            // ── 2단계: 선물 확인 ──
            <>
              <div className="mb-2 px-1 text-sm">
                <span className="font-semibold">{recipientName}</span> 님께{' '}
                <span className="text-primary font-semibold">
                  {confirmAmt.toLocaleString()} Bean
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
