'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { usePiAuth } from '@/components/pi-auth-provider'
import { BeanIcon } from '@/components/ui/bean-icon'

interface TypeRow {
  txn_tp_cd: string
  txn_cnt: number
  gross_bean: number
  net_bean: number
  usr_cnt: number
}

interface DistributionData {
  by_type: TypeRow[]
  total_cnt: number
  total_gross_bean: number
}

// 거래 유형별 메타 (콩 이모지 금지 — Bean 표시는 BeanIcon만)
// flow: in(유입 — USER 지갑 증가) / out(소비 — 거버넌스 회수) / move(이동 — 순증감 0)
// label은 i18n: t(`txnLabel.${txn_tp_cd}`) — txn_tp_cd 코드값을 그대로 번역 키로 재사용.
type Flow = 'in' | 'out' | 'move'
const TYPE_META: Record<string, { emoji: string; bar: string; flow: Flow }> = {
  CHARGE: { emoji: '💳', bar: 'bg-blue-500', flow: 'in' },
  REWARD: { emoji: '🎁', bar: 'bg-teal-500', flow: 'in' },
  REFUND: { emoji: '↩️', bar: 'bg-amber-500', flow: 'in' },
  SPEND: { emoji: '🛒', bar: 'bg-purple-500', flow: 'out' },
  SUBSCRIBE: { emoji: '📅', bar: 'bg-indigo-500', flow: 'out' }, // 구독료(SPEND군 회수)
  TIP: { emoji: '💝', bar: 'bg-rose-500', flow: 'out' }, // 팁(SPEND군 회수, TRANSFER와 별개)
  FEE: { emoji: '🧾', bar: 'bg-orange-500', flow: 'out' }, // 수수료(SPEND군 회수)
  TRANSFER: { emoji: '🤝', bar: 'bg-pink-500', flow: 'move' }, // P2P 선물
  ETC: { emoji: '❓', bar: 'bg-gray-400', flow: 'move' },
}

// flow 배지 색상 — 라벨은 i18n: t(`flowBadge.${flow}`)
const FLOW_BADGE_CLS: Record<Flow, string> = {
  in: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  out: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
  move: 'bg-muted text-muted-foreground',
}

// 분포 막대 리스트 — 데이터 확정 후에만 렌더(정렬·비율 계산 분리)
function BeanDistList({ data }: { data: DistributionData }) {
  const t = useTranslations('adminStats')
  // gross(움직인 총량) 내림차순 — 분포 비율의 기준
  const items = [...data.by_type].sort((a, b) => b.gross_bean - a.gross_bean)
  const maxGross = Math.max(...items.map((i) => Number(i.gross_bean)), 1)
  const totalGross = Number(data.total_gross_bean)

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        {t('beanDistTotalPrefix', {
          cnt: data.total_cnt.toLocaleString(),
          gross: totalGross.toLocaleString(),
        })}{' '}
        <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />{' '}
        {t('beanDistTotalSuffix')}
      </p>

      <ul className="space-y-2.5">
        {items.map((it) => {
          const known = TYPE_META[it.txn_tp_cd]
          const meta = known ?? TYPE_META.ETC
          // 미매핑 코드는 '기타'로 뭉뚱그리지 않고 원본 코드를 노출해 추적 가능하게
          const label = known
            ? t(`txnLabel.${it.txn_tp_cd}`)
            : `${t('txnLabel.ETC')} (${it.txn_tp_cd})`
          const gross = Number(it.gross_bean)
          const net = Number(it.net_bean)
          const pct = Math.max(2, (gross / maxGross) * 100)
          const share =
            totalGross > 0 ? ((gross / totalGross) * 100).toFixed(1) : '0.0'
          const badgeCls = FLOW_BADGE_CLS[meta.flow]
          const badgeLabel = t(`flowBadge.${meta.flow}`)
          return (
            <li key={it.txn_tp_cd} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  <span className="shrink-0">
                    {meta.emoji} {label}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badgeCls}`}
                  >
                    {badgeLabel}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {t('beanDistRowMeta', {
                      cnt: it.txn_cnt.toLocaleString(),
                      users: it.usr_cnt.toLocaleString(),
                      share,
                    })}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-semibold tabular-nums">
                    {gross.toLocaleString()}{' '}
                    <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />
                  </span>
                  {/* 순증감(net): 유입 +초록 / 회수 -보라 / 이동 0 회색 */}
                  <span
                    className={`ml-2 text-xs tabular-nums ${
                      net > 0
                        ? 'text-green-600 dark:text-green-400'
                        : net < 0
                          ? 'text-purple-600 dark:text-purple-400'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {t('beanDistNet', {
                      net: `${net > 0 ? '+' : ''}${net.toLocaleString()}`,
                    })}
                  </span>
                </span>
              </div>
              <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full ${meta.bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>

      <p className="text-muted-foreground border-t pt-2.5 text-[11px]">
        {t('beanDistFootnote')}
      </p>
    </div>
  )
}

// Bean 거래 유형별 분포 — 메인 대시보드 '매출 분포'(테마 도넛/트리맵)를 대체.
// self-contained: period(최근 N일) prop으로 자체 piFetch 후 갱신. 단위는 Bean(BeanIcon).
// 분류축 = txn_tp_cd(충전·사용·보상·환불·전송). 매출 회수 부분집합이 아닌 활동 전반.
export function BeanRevenueDistribution({ period }: { period: number }) {
  const t = useTranslations('adminStats')
  const { isLoading: authLoading, signIn } = usePiAuth()
  const [data, setData] = useState<DistributionData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Pi Browser 레이스 컨디션 대응: 401 수신 후 signIn 완료 시 1회 자동 재시도
  const retried = useRef(false)

  const doFetch = (alive: () => boolean) => {
    setLoading(true)
    setError(null)
    piFetch(`/api/admin/token/distribution?period=${period}`)
      .then(async (r) => {
        if (r.status === 401) {
          // signIn 완료 전 마운트로 인한 레이스 컨디션 → 1회 재시도
          if (!retried.current) {
            retried.current = true
            await signIn({ silent: true })
            if (!alive()) return
            return doFetch(alive)
          }
          throw new Error('세션 만료 — 다시 로그인하세요 (HTTP 401)')
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DistributionData>
      })
      .then((d) => {
        if (d && alive()) setData(d)
      })
      .catch((e: Error) => {
        if (alive()) setError(e.message)
      })
      .finally(() => {
        if (alive()) setLoading(false)
      })
  }

  useEffect(() => {
    // signIn 진행 중이면 완료를 기다렸다가 fetch (레이스 컨디션 방지)
    if (authLoading) return
    retried.current = false
    let _alive = true
    doFetch(() => _alive)
    return () => { _alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, authLoading])

  return (
    <div className="rounded-lg border p-4">
      <p className="mb-2 text-sm font-medium">{t('beanDistTitle')}</p>
      {loading ? (
        <div className="bg-muted h-64 animate-pulse rounded-lg" />
      ) : error ? (
        <p className="text-sm text-red-500">{t('beanDistError', { error })}</p>
      ) : !data || data.by_type.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {t('beanDistEmpty')}
        </p>
      ) : (
        <BeanDistList data={data} />
      )}
    </div>
  )
}
