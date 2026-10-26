'use client'
// 발표자 연결 점검(설계서 14.5) — 입장 뒤 발행 PC getStats 로 손실률·송신 처리량을 재 좋음/보통/나쁨 + 원인 문장.
// [설계 편차] 설계서는 대기실 측정이지만 대기실엔 엔진 연결이 없어(입장권 60초·1회용) 입장 직후 측정하고, 대기실엔 "입장 후 측정" 안내만
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { gradeNet, NET, readStats, type NetKind, type NetResult } from './room-rules'

type Check = NetResult | 'measuring' | null

// active 동안 1회 측정(재연결 뒤 joined 로 돌아오면 다시 잰다). on 은 측정 끝 시점 값을 쓴다
export function useConnectionCheck(
  getStats: () => Promise<RTCStatsReport | null>,
  active: boolean,
  on: Record<NetKind, boolean>,
): Check {
  const [res, setRes] = useState<Check>(null)
  const latest = useRef({ getStats, on })
  useEffect(() => {
    latest.current = { getStats, on }
  })
  useEffect(() => {
    if (!active) {
      setRes(null)
      return
    }
    setRes('measuring')
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const sample = async () => readStats((await latest.current.getStats())?.values() ?? null)
    timer = setTimeout(async () => {
      const first = await sample()
      if (!alive) return
      timer = setTimeout(async () => {
        const second = await sample()
        if (alive) setRes(gradeNet(first, second, latest.current.on))
      }, NET.windowMs)
    }, NET.delayMs)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [active])
  return res
}

// 상단 정보 줄 배지 — 보통·나쁨(또는 원인 있음)이면 원인 문장을 옆에 보인다. 색 + 글자(색만으로 전하지 않음)
export function ConnectionBadge({ check }: { check: Check }) {
  const t = useTranslations('room.net')
  if (!check) return null
  if (check === 'measuring') return <span className="text-muted-foreground">{t('measuring')}</span>
  const { grade, reason } = check
  const tone = grade === 'poor' ? 'bg-danger text-white' : grade === 'fair' ? 'bg-warning text-black' : 'bg-surface-raised'
  return (
    <span role="status" className="inline-flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-3 py-1 ${tone}`}>{t(grade)}</span>
      {reason && (
        <span className="text-muted-foreground">
          {reason.metric === 'loss'
            ? t(`reason.loss.${reason.kind}`, { pct: Math.round(reason.value * 100) })
            : t(`reason.rate.${reason.kind}`, { kbps: Math.round(reason.value) })}
        </span>
      )}
    </span>
  )
}
