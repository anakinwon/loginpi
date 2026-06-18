'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { BeanIcon } from '@/components/ui/bean-icon'
import { CHARGE_PRESETS, BEAN_PER_PI, type BeanTxn } from '@/lib/bean-shared'

interface WalletData {
  balance: number
  txns: BeanTxn[]
}

// 거래 유형별 배지 색·부호
const TXN_STYLE: Record<string, { color: string; emoji: string }> = {
  CHARGE: {
    color:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    emoji: '🟢',
  },
  SPEND: {
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    emoji: '🔵',
  },
  REWARD: {
    color:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    emoji: '🎁',
  },
  REFUND: {
    color:
      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    emoji: '🟠',
  },
}

export function ClientBeanWallet({ serverAuthed }: { serverAuthed: boolean }) {
  const t = useTranslations('bean')
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [authed, setAuthed] = useState(serverAuthed)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [custom, setCustom] = useState('')

  const load = useCallback(async () => {
    const res = await piFetch('/api/bean/wallet')
    if (res.ok) {
      setAuthed(true)
      setWallet((await res.json()) as WalletData)
    } else if (res.status === 401) {
      setAuthed(false)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function charge(beanAmt: number) {
    if (!Number.isInteger(beanAmt) || beanAmt < BEAN_PER_PI) {
      toast.error(t('minCharge', { min: BEAN_PER_PI }))
      return
    }
    if (!window.Pi) {
      toast.error(t('piBrowserOnly'))
      return
    }
    setPaying(true)
    try {
      const res = await piFetch('/api/bean/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bean_amt: beanAmt }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('chargeFail'))
      }
      const prep = (await res.json()) as {
        amount: number
        memo: string
        metadata: Record<string, unknown>
      }

      window.Pi.createPayment(prep, {
        onReadyForServerApproval: async (paymentId) => {
          await fetch('/api/payments/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId }),
          })
        },
        onReadyForServerCompletion: async (paymentId, txid) => {
          const r = await fetch('/api/payments/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId, txid }),
          })
          setPaying(false)
          if (r.ok) {
            toast.success(
              t('chargeSuccess', { bean: beanAmt.toLocaleString() }),
            )
            setCustom('')
            void load()
          } else {
            toast.error(t('chargeFail'))
          }
        },
        onCancel: () => setPaying(false),
        onError: (e) => {
          setPaying(false)
          toast.error(e.message)
        },
      })
    } catch (e) {
      setPaying(false)
      toast.error(e instanceof Error ? e.message : t('chargeFail'))
    }
  }

  if (loading)
    return <p className="text-muted-foreground text-sm">{t('loading')}</p>

  if (!authed)
    return (
      <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        {t('loginRequired')}
      </p>
    )

  const balance = wallet?.balance ?? 0
  const customNum = Number(custom)

  return (
    <div className="space-y-6">
      {/* 잔액 카드 */}
      <div className="from-primary/10 to-primary/5 flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-b p-6">
        <p className="text-muted-foreground text-sm">{t('myBalance')}</p>
        <p className="text-4xl font-bold tabular-nums">
          {balance.toLocaleString()}{' '}
          <BeanIcon className="inline-block h-7 w-7 align-text-bottom" />
        </p>
        <p className="text-muted-foreground text-xs">Bean</p>
      </div>

      {/* 충전 패키지 */}
      <div className="space-y-3">
        <p className="text-sm font-semibold">{t('chargeTitle')}</p>
        <p className="text-muted-foreground text-xs">
          {t('rateHint', { per: BEAN_PER_PI })}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHARGE_PRESETS.map((amt) => (
            <button
              key={amt}
              disabled={paying}
              onClick={() => charge(amt)}
              className="hover:border-primary flex flex-col items-center gap-0.5 rounded-xl border p-3 transition-colors disabled:opacity-50"
            >
              <span className="text-base font-bold tabular-nums">
                {amt.toLocaleString()}{' '}
                <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />
              </span>
              <span className="text-muted-foreground text-xs">
                {amt / BEAN_PER_PI} π
              </span>
            </button>
          ))}
        </div>

        {/* 직접 입력 */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-muted-foreground text-xs">
              {t('customLabel')}
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={BEAN_PER_PI}
              step={BEAN_PER_PI}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={String(BEAN_PER_PI)}
              className="border-input bg-background mt-0.5 w-full rounded-lg border px-3 py-2 text-sm"
            />
            {customNum >= BEAN_PER_PI && Number.isInteger(customNum) && (
              <p className="text-muted-foreground mt-0.5 text-xs">
                = {customNum / BEAN_PER_PI} π
              </p>
            )}
          </div>
          <Button
            onClick={() => charge(Math.floor(customNum))}
            disabled={paying || !(customNum >= BEAN_PER_PI)}
          >
            {paying ? t('buying') : t('chargeBtn')}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">ℹ️ {t('piBrowserHint')}</p>
      </div>

      {/* 거래 내역 */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">{t('txnTitle')}</p>
        {!wallet || wallet.txns.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('txnEmpty')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {wallet.txns.map((tx) => {
              const style = TXN_STYLE[tx.txn_tp_cd] ?? TXN_STYLE.SPEND
              const positive = tx.bean_amt >= 0
              return (
                <li
                  key={tx.txn_id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.color}`}
                    >
                      {t(`type.${tx.txn_tp_cd}`)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(tx.reg_dtm).toLocaleDateString()}
                      {tx.pi_amt != null && ` · ${tx.pi_amt}π`}
                    </span>
                  </div>
                  <span
                    className={`font-semibold tabular-nums ${positive ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}
                  >
                    {positive ? '+' : ''}
                    {tx.bean_amt.toLocaleString()}{' '}
                    <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
