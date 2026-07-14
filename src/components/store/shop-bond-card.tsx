'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BeanIcon } from '@/components/ui/bean-icon'
import { beanToPi, useFeeMode } from '@/hooks/use-fee-mode'
import { useApiErrorMessage, type ApiErrorPayload } from '@/hooks/use-api-error'

interface BondState {
  kind: string
  balance: number // 보증금 잔액(Bean)
  wallet: number // 내 Bean 지갑 잔액
  max_reward: number // 후기 1건 최대 보상액(임계)
  sufficient: boolean // 후기 버튼 활성 조건(잔액 ≥ 최대 보상액)
}

// 후기 보상 보증금 예치 카드 (판매자 SHOP 보증금) — PRD_24 §10-7.
//   매장주가 Bean 지갑에서 보증금으로 예치 → 잔액 ≥ 최대 보상액일 때 상품 후기 작성 버튼 활성.
//   잔액은 Bean 기준 단일 저장, PI 모드 표시=÷100 (§10-7 Bean/Pi 일관 규칙).
//   PI 모드 예치는 서버 미구현(501 FBCK_PI_BOND_NOT_READY) — 입력 대신 안내 노출.
export function ShopBondCard() {
  const t = useTranslations('store')
  const tc = useTranslations('common')
  const tErr = useTranslations('apiErrors')
  const apiErr = useApiErrorMessage()
  const feeMode = useFeeMode()
  const isPi = feeMode === 'PI'
  const [state, setState] = useState<BondState | null>(null)
  const [amt, setAmt] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await piFetch('/api/feedback/bond?kind=SHOP')
      if (res.ok) setState((await res.json()) as BondState)
    } catch {
      // 비치명적 — 카드 미표시
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const deposit = useCallback(async () => {
    const v = Math.floor(Number(amt))
    if (!Number.isFinite(v) || v <= 0) {
      toast.error(t('rewardBond.enterAmount'))
      return
    }
    setBusy(true)
    try {
      const res = await piFetch('/api/feedback/bond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'SHOP', bean_amt: v }),
      })
      const data = (await res.json()) as ApiErrorPayload & { ok?: boolean }
      if (res.ok && data.ok) {
        toast.success(t('rewardBond.depositSuccess', { n: v }))
        setAmt('')
        void load()
      } else {
        toast.error(apiErr(data, t('rewardBond.depositFail')))
      }
    } catch {
      toast.error(tc('networkError'))
    } finally {
      setBusy(false)
    }
  }, [amt, load])

  if (!state) return null

  return (
    <div className="shadow-soft bg-card space-y-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {isPi ? (
            <span className="text-base font-bold">π</span>
          ) : (
            <BeanIcon className="h-5 w-5" />
          )}{' '}
          {t('rewardBond.title')}
        </p>
        {state.sufficient ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
            {t('rewardBond.badgeActive')}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
            {t('rewardBond.badgeNeedCharge')}
          </span>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        {t.rich(isPi ? 'rewardBond.descPi' : 'rewardBond.desc', {
          amount: isPi ? beanToPi(state.max_reward) : state.max_reward,
          b: (c) => <b>{c}</b>,
        })}
      </p>

      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <span className="text-muted-foreground text-xs">
          {t('rewardBond.balanceLabel')}
        </span>
        <span className="flex items-center gap-1 text-base font-bold">
          {isPi ? (
            <>π {beanToPi(state.balance).toLocaleString()}</>
          ) : (
            <>
              <BeanIcon className="h-4 w-4" /> {state.balance.toLocaleString()}
            </>
          )}
        </span>
      </div>

      {isPi ? (
        // PI 모드 예치는 Pi 직결제(createPayment) 후속 구현 전 — 전 locale 기번역 키 재사용
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
          {tErr('FBCK_PI_BOND_NOT_READY')}
        </p>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-muted-foreground text-xs">
              {t('rewardBond.depositInputLabel', {
                wallet: state.wallet.toLocaleString(),
              })}
            </label>
            <Input
              type="number"
              min="1"
              inputMode="numeric"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              placeholder={t('rewardBond.amountPlaceholder', {
                n: Math.max(state.max_reward, 100),
              })}
            />
          </div>
          <Button onClick={deposit} disabled={busy}>
            {busy ? t('rewardBond.depositing') : t('rewardBond.depositBtn')}
          </Button>
        </div>
      )}
    </div>
  )
}
