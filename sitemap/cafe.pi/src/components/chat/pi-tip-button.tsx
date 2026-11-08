'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { TIP_PRESETS_BEAN, TIP_CUSTOM_MAX_BEAN } from '@/lib/bean-shared'
import { useFeeMode, beanToPi } from '@/hooks/use-fee-mode'

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
  const t = useTranslations('chat')
  const tc = useTranslations('common')
  // PI 모드: 실제 Pi 전송이므로 표시도 Pi(÷100, π). 내부 amount는 항상 Bean(서버 계약 유지).
  const feeMode = useFeeMode()
  const isPi = feeMode === 'PI'
  const unit = isPi ? 'π' : 'Bean'
  const disp = (bean: number) => (isPi ? beanToPi(bean) : bean)
  const fmt = (bean: number) => `${disp(bean).toLocaleString()} ${unit}`

  const [open, setOpen] = useState(false)
  const [confirmAmt, setConfirmAmt] = useState<number | null>(null) // 내부 Bean(확인 단계)
  const [sending, setSending] = useState(false)
  // 선물 설정 — 런타임(관리자) 값(Bean). 로딩/실패 시 코드 상수로 폴백.
  const [presets, setPresets] = useState<number[]>([...TIP_PRESETS_BEAN])
  const [customMax, setCustomMax] = useState<number>(TIP_CUSTOM_MAX_BEAN)
  // 직접 입력 상태
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

  // 직접입력: PI 모드=Pi 입력(소수)→내부 Bean(×100) / BEAN 모드=Bean 정수.
  const customNum = Number(customVal)
  const customBean = isPi ? Math.round(customNum * 100) : Math.round(customNum)
  const customValid =
    customVal !== '' &&
    customNum > 0 &&
    customBean > 0 &&
    customBean <= customMax &&
    (isPi
      ? Math.abs(customNum * 100 - Math.round(customNum * 100)) < 1e-9 // Pi 소수 2자리 이내
      : Number.isInteger(customNum))
  const customMaxDisp = disp(customMax)

  // PI 모드 선물 — 서버가 내려준 pay로 Pi 직결제(U2A). 받는 사람 A2U는 complete가 처리.
  function startTipPiPayment(pay: {
    amount: number
    memo: string
    metadata: Record<string, unknown>
  }) {
    if (typeof window === 'undefined' || !window.Pi) {
      toast.error(t('tip.piBrowserOnly'))
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
            toast.error(t('tip.approveFail'))
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
            toast.success(t('tip.sentPi', { name: recipientName }))
          } catch {
            toast.error(t('tip.processFail'))
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
          toast.error(e?.message ?? t('tip.error'))
          setSending(false)
          close()
        },
      },
    )
  }

  async function sendTip(amount: number) {
    // amount = 내부 Bean(서버 계약). PI 모드면 서버가 Pi 결제로 핸드오프.
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
        pay?: {
          amount: number
          memo: string
          metadata: Record<string, unknown>
        }
      }
      // PI 모드 — 서버가 Pi 직결제 요구(앱 경유 U2A→A2U). createPayment로 핸드오프.
      if (data.mode === 'PI' && data.pay) {
        piHandoff = true
        startTipPiPayment(data.pay)
        return
      }
      close()
      if (res.ok) {
        toast.success(
          t('tip.sent', { name: recipientName, amount: fmt(amount) }),
        )
      } else {
        toast.error(data.error ?? t('tip.sendFail'))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('tip.sendError'))
    } finally {
      if (!piHandoff) setSending(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="hover:bg-muted rounded-full px-2 py-0.5 text-xs opacity-70 transition-opacity hover:opacity-100"
        title={t('tip.giveTo', { name: recipientName })}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bean.png"
          alt={t('tip.giftAlt')}
          className="inline-block h-8 w-8 brightness-125"
        />
      </button>
      {open && (
        <div className="bg-popover absolute bottom-full left-0 z-20 mb-1 min-w-[230px] rounded-xl border p-2 shadow-lg">
          {confirmAmt === null ? (
            // ── 1단계: 금액 선택 ──
            <>
              <div className="text-muted-foreground mb-1.5 flex items-center justify-between px-1 text-xs">
                <span>{t('tip.amountSelect', { unit })}</span>
                <button
                  onClick={close}
                  className="hover:text-foreground"
                  aria-label={tc('close')}
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
                    {disp(amt).toLocaleString()}
                  </button>
                ))}
              </div>

              {/* 직접 입력 */}
              {!customOpen ? (
                <button
                  onClick={() => setCustomOpen(true)}
                  className="hover:bg-muted mt-1 w-full rounded-lg border border-dashed px-2 py-1.5 text-xs font-medium"
                >
                  {t('tip.customInput', {
                    max: customMaxDisp.toLocaleString(),
                    unit,
                  })}
                </button>
              ) : (
                <div className="mt-1.5">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={customVal}
                      onChange={(e) =>
                        setCustomVal(
                          e.target.value.replace(
                            isPi ? /[^0-9.]/g : /[^0-9]/g,
                            '',
                          ),
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customValid)
                          setConfirmAmt(customBean)
                      }}
                      placeholder={`${isPi ? '0.01' : '1'} ~ ${customMaxDisp.toLocaleString()}`}
                      className="border-input bg-background min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-right text-xs tabular-nums"
                    />
                    <button
                      disabled={!customValid}
                      onClick={() => setConfirmAmt(customBean)}
                      className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                    >
                      {tc('confirm')}
                    </button>
                  </div>
                  {customVal !== '' && !customValid && (
                    <p className="mt-1 px-1 text-[11px] text-amber-600 dark:text-amber-400">
                      {t('tip.rangeOnly', {
                        min: isPi ? '0.01' : '1',
                        max: customMaxDisp.toLocaleString(),
                        unit,
                      })}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            // ── 2단계: 선물 확인 ──
            <>
              <div className="mb-2 px-1 text-sm">
                {t.rich('tip.confirmQuestion', {
                  name: recipientName,
                  amount: fmt(confirmAmt),
                  b: (chunks) => (
                    <span className="font-semibold">{chunks}</span>
                  ),
                  amt: (chunks) => (
                    <span className="text-primary font-semibold">{chunks}</span>
                  ),
                })}
              </div>
              <div className="flex gap-1">
                <button
                  disabled={sending}
                  onClick={() => sendTip(confirmAmt)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1 rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {sending ? t('tip.sending') : t('tip.give')}
                </button>
                <button
                  disabled={sending}
                  onClick={() => setConfirmAmt(null)}
                  className="hover:bg-muted text-muted-foreground rounded-lg border px-2 py-1.5 text-xs disabled:opacity-50"
                >
                  {tc('cancel')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
