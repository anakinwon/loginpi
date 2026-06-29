'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BeanIcon } from '@/components/ui/bean-icon'

interface BondState {
  kind: string
  balance: number // 보증금 잔액(Bean)
  wallet: number // 내 Bean 지갑 잔액
  max_reward: number // 후기 1건 최대 보상액(임계)
  sufficient: boolean // 후기 버튼 활성 조건(잔액 ≥ 최대 보상액)
}

// 후기 보상 보증금 예치 카드 (판매자 SHOP 보증금) — PRD_24 §10-7.
//   매장주가 Bean 지갑에서 보증금으로 예치 → 잔액 ≥ 최대 보상액일 때 상품 후기 작성 버튼 활성.
export function ShopBondCard() {
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
      toast.error('예치할 Bean 수량을 입력하세요')
      return
    }
    setBusy(true)
    try {
      const res = await piFetch('/api/feedback/bond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'SHOP', bean_amt: v }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (res.ok && data.ok) {
        toast.success(`${v} Bean을 보증금으로 예치했습니다`)
        setAmt('')
        void load()
      } else {
        toast.error(data.error ?? '예치 실패')
      }
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setBusy(false)
    }
  }, [amt, load])

  if (!state) return null

  return (
    <div className="shadow-soft bg-card space-y-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <BeanIcon className="h-5 w-5" /> 후기 보상 보증금
        </p>
        {state.sufficient ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
            ✓ 후기 활성
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
            ⚠ 충전 필요
          </span>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        고객 후기 보상은 이 보증금에서 지급됩니다. 잔액이{' '}
        <b>{state.max_reward} Bean</b> 이상일 때만 내 상품에 후기 작성 버튼이
        활성화됩니다.
      </p>

      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <span className="text-muted-foreground text-xs">현재 보증금 잔액</span>
        <span className="flex items-center gap-1 text-base font-bold">
          <BeanIcon className="h-4 w-4" /> {state.balance.toLocaleString()}
        </span>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-muted-foreground text-xs">
            예치할 Bean (내 지갑: {state.wallet.toLocaleString()})
          </label>
          <Input
            type="number"
            min="1"
            inputMode="numeric"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            placeholder={`예: ${Math.max(state.max_reward, 100)}`}
          />
        </div>
        <Button onClick={deposit} disabled={busy}>
          {busy ? '예치 중…' : '보증금 예치'}
        </Button>
      </div>
    </div>
  )
}
