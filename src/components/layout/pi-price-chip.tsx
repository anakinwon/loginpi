'use client'

import { useEffect, useState } from 'react'
import { LOCALE_CURRENCY } from '@/lib/locale-currency'

// 통화별 가격 포매팅
function fmtPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (price >= 100) return price.toLocaleString('en-US', { maximumFractionDigits: 1 })
  if (price >= 1) return price.toFixed(2)
  return price.toFixed(4)
}

export function PiPriceChip({ locale }: { locale: string }) {
  const [piUsd, setPiUsd] = useState<number | null>(null)
  const [rates, setRates] = useState<Record<string, number>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/pi-price').then((r) => r.json()),
      fetch('/api/exchange-rates').then((r) => r.json()),
    ])
      .then(([priceData, rateData]) => {
        const p = priceData as { usd: number | null }
        const r = rateData as { rates: Record<string, number> }
        setPiUsd(p.usd ?? null)
        setRates(r.rates ?? {})
      })
      .catch(() => {})
  }, [])

  // 시세 로드 전 또는 조회 실패 시 미표시
  if (piUsd === null) return null

  // locale이 바뀌면 prop 변경으로 리렌더 → currency·price 자동 갱신
  const currency = LOCALE_CURRENCY[locale] ?? 'USD'
  const rate = rates[currency] ?? 1
  const price = piUsd * rate

  return (
    <div
      title={`1 π ≈ ${piUsd.toFixed(4)} USD (CoinGecko)`}
      className='flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs'
    >
      <span className='font-serif italic text-foreground'>π</span>
      <span className='tabular-nums font-semibold text-foreground'>{fmtPrice(price)}</span>
      <span className='text-[10px] font-medium uppercase tracking-wide text-muted-foreground'>
        {currency}
      </span>
    </div>
  )
}
