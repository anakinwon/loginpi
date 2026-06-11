'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'

interface BondStatus {
  deposited: boolean
  bonded: boolean
  bond_bal_pi: number
  avail_pi: number
  rsv_pi: number
  cancel_cnt: number
  remain_cancels: number
}

interface BondPrep {
  amount: number
  memo: string
  metadata: Record<string, unknown>
}

// 판매자 보증금 카드 (PRD FR-10 단서) — 1π 예치 옵션, 잔액·취소 횟수 상시 표시
// 반환(환불) 기능은 §12 #9 법적 자문 완료 전 미제공
export function SellerBondCard() {
  const t = useTranslations('store')
  const [bond, setBond] = useState<BondStatus | null>(null)
  const [paying, setPaying] = useState(false)

  const load = useCallback(async () => {
    const res = await piFetch('/api/store/bond')
    if (res.ok) {
      const data = (await res.json()) as { bond: BondStatus }
      setBond(data.bond)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function deposit() {
    if (!window.Pi) {
      toast.error(t('piBrowserOnly'))
      return
    }
    setPaying(true)
    try {
      const res = await piFetch('/api/store/bond', { method: 'POST' })
      if (!res.ok) throw new Error(t('saveFail'))
      const prep = (await res.json()) as BondPrep

      window.Pi.createPayment(
        { amount: prep.amount, memo: prep.memo, metadata: prep.metadata },
        {
          onReadyForServerApproval: async paymentId => {
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
              toast.success(t('bond.depositSuccess'))
              void load()
            } else {
              toast.error(t('saveFail'))
            }
          },
          onCancel: () => setPaying(false),
          onError: e => {
            setPaying(false)
            toast.error(e.message)
          },
        },
      )
    } catch (e) {
      setPaying(false)
      toast.error(e instanceof Error ? e.message : t('saveFail'))
    }
  }

  if (!bond) return null

  return (
    <div className='rounded-lg border p-4 space-y-3'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <p className='text-sm font-semibold'>
            🛡️ {t('bond.title')}{' '}
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                bond.bonded
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {bond.bonded ? t('bond.active') : t('bond.inactive')}
            </span>
          </p>
          <p className='text-muted-foreground mt-0.5 text-xs'>{t('bond.desc')}</p>
        </div>
        <Button size='sm' onClick={deposit} disabled={paying}>
          {paying ? t('buying') : bond.deposited ? t('bond.redeposit') : t('bond.deposit')}
        </Button>
      </div>

      {bond.deposited && (
        <div className='grid grid-cols-2 gap-2 text-sm sm:grid-cols-4'>
          <div className='bg-muted/50 rounded-md px-3 py-2'>
            <p className='text-muted-foreground text-xs'>{t('bond.balance')}</p>
            <p className='font-semibold tabular-nums'>{bond.bond_bal_pi} π</p>
          </div>
          <div className='bg-muted/50 rounded-md px-3 py-2'>
            <p className='text-muted-foreground text-xs'>{t('bond.avail')}</p>
            <p className='font-semibold tabular-nums'>{bond.avail_pi.toFixed(1)} π</p>
          </div>
          <div className='bg-muted/50 rounded-md px-3 py-2'>
            <p className='text-muted-foreground text-xs'>{t('bond.remainCancels')}</p>
            <p className='font-semibold tabular-nums'>{bond.remain_cancels}</p>
          </div>
          <div className='bg-muted/50 rounded-md px-3 py-2'>
            <p className='text-muted-foreground text-xs'>{t('bond.cancelCnt')}</p>
            <p className='font-semibold tabular-nums'>{bond.cancel_cnt}</p>
          </div>
        </div>
      )}

      {bond.deposited && !bond.bonded && (
        <p className='text-destructive text-xs'>{t('bond.exhausted')}</p>
      )}
      <p className='text-muted-foreground text-xs'>{t('bond.notice')}</p>
    </div>
  )
}
