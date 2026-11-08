'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { BeanIcon } from '@/components/ui/bean-icon'
import { beanToPi, useFeeMode } from '@/hooks/use-fee-mode'
import { piFetch } from '@/lib/pi-fetch'

interface MyShop {
  shop_id: string
  shop_nm: string
}

interface Status {
  campaign_nm: string
  reward_bean: number
  require_mission_cnt: number
  active: boolean
  conditions: {
    shop: boolean
    item: boolean
    telegram: boolean
    tlgm_alrt: boolean
    mission: boolean
  }
  eligible: boolean
  my_shops: MyShop[]
  grant_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  claimed_shop_id: string | null
  granted_cnt: number
  max_cnt: number
  sold_out: boolean
}

export function ClientCampaign() {
  const t = useTranslations('event.shop')
  // PI 모드(운영)에선 보상 표기도 π — 실지급이 Pi A2U(관리자 승인)라 표시 단위를 일치시킨다
  const isPi = useFeeMode() === 'PI'
  const [st, setSt] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [selectedShopId, setSelectedShopId] = useState<string>('')

  // 조건 행 — 번역 키가 필요해 컴포넌트 내부에 정의
  const condRows: {
    key: keyof Status['conditions']
    label: string
    href: string
    cta: string
  }[] = [
    { key: 'shop', label: t('condM1'), href: '/map', cta: t('ctaM1') },
    {
      key: 'item',
      label: t('condM2'),
      href: '/store/my/shop-items/new',
      cta: t('ctaM2'),
    },
    {
      key: 'telegram',
      label: t('condM3'),
      // 개인 Telegram 연동 카드가 내 PyShop™ 탭 → 개인정보 탭으로 이동(2026-07-15)
      href: '/profile?tab=info',
      cta: t('ctaM3'),
    },
    {
      key: 'tlgm_alrt',
      label: t('condM4'),
      href: '/profile?tab=info',
      cta: t('ctaM4'),
    },
  ]

  const load = useCallback(async () => {
    const res = await piFetch('/api/campaign/status')
    if (res.status === 401) {
      setAuthed(false)
      setLoading(false)
      return
    }
    if (res.ok) {
      const data = (await res.json()) as Status
      setSt(data)
      if (data.claimed_shop_id) setSelectedShopId(data.claimed_shop_id)
      else if (data.my_shops.length > 0)
        setSelectedShopId(data.my_shops[0].shop_id)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function claim() {
    if (!selectedShopId) {
      toast.error(t('claimErrSelect'))
      return
    }
    setClaiming(true)
    try {
      const res = await piFetch('/api/campaign/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: selectedShopId }),
      })
      const d = (await res.json()) as { status?: string }
      const statusMap: Record<string, { text: string; ok: boolean }> = {
        SUBMITTED: { text: t('claimSubmitted'), ok: true },
        ALREADY_SUBMITTED: { text: t('claimAlreadySubmitted'), ok: false },
        NOT_ELIGIBLE: { text: t('claimNotEligible'), ok: false },
        NOT_ACTIVE: { text: t('claimNotActive'), ok: false },
        NO_CAMPAIGN: { text: t('claimNoCampaign'), ok: false },
      }
      const m = statusMap[d.status ?? ''] ?? {
        text: t('claimDefault'),
        ok: false,
      }
      if (m.ok) toast.success(m.text)
      else toast.error(m.text)
      await load()
    } catch {
      toast.error(t('claimErrNetwork'))
    } finally {
      setClaiming(false)
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
  if (!st)
    return <p className="text-muted-foreground text-sm">{t('loadError')}</p>

  const remaining = Math.max(0, st.max_cnt - st.granted_cnt)
  const claimedShop = st.claimed_shop_id
    ? st.my_shops.find((s) => s.shop_id === st.claimed_shop_id)
    : null

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="from-primary/10 to-primary/5 rounded-2xl bg-gradient-to-b p-6 text-center">
        <p className="text-sm font-semibold">🏪 {st.campaign_nm}</p>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-3xl font-bold tabular-nums">
          {isPi ? (
            <>
              {beanToPi(st.reward_bean).toLocaleString()}
              <span className="align-text-bottom">π</span>
            </>
          ) : (
            <>
              {st.reward_bean.toLocaleString()}
              <BeanIcon className="inline-block h-7 w-7 align-text-bottom" />
            </>
          )}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {t('remaining', {
            max: st.max_cnt,
            remaining,
            granted: st.granted_cnt,
          })}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs font-medium">
          {t('onePerPerson')}
        </p>
      </div>

      {/* 자격 조건 체크리스트 */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">{t('condTitle')}</p>
        <ul className="divide-y rounded-lg border">
          {condRows.map((c) => (
            <li
              key={c.key}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className={
                    st.conditions[c.key]
                      ? 'text-green-600'
                      : 'text-muted-foreground'
                  }
                >
                  {st.conditions[c.key] ? '✅' : '⬜'}
                </span>
                <span
                  className={
                    st.conditions[c.key] ? '' : 'text-muted-foreground'
                  }
                >
                  {c.label}
                </span>
              </span>
              {c.href && c.cta && (
                <Link
                  href={c.href}
                  className="text-primary text-xs hover:underline"
                >
                  {c.cta} →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* 대표 매장 선택 */}
      {st.my_shops.length > 0 && !st.grant_status && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{t('shopSelect')}</p>
          <select
            value={selectedShopId}
            onChange={(e) => setSelectedShopId(e.target.value)}
            className="border-input bg-background w-full rounded-lg border px-3 py-2.5 text-sm"
          >
            {st.my_shops.map((s) => (
              <option key={s.shop_id} value={s.shop_id}>
                {s.shop_nm}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">{t('shopSelectHint')}</p>
        </div>
      )}

      {/* 신청 버튼 / 상태 */}
      {st.grant_status === 'APPROVED' ? (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-center text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
          {t('approved', { bean: st.reward_bean.toLocaleString() })}
          {claimedShop && (
            <p className="mt-1 text-xs opacity-75">
              {t('approvedShop', { shop: claimedShop.shop_nm })}
            </p>
          )}
        </div>
      ) : st.grant_status === 'PENDING' ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-center text-sm font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          {t('pending')}
          {claimedShop && (
            <p className="mt-1 text-xs opacity-75">
              {t('approvedShop', { shop: claimedShop.shop_nm })}
            </p>
          )}
        </div>
      ) : st.grant_status === 'REJECTED' ? (
        <div className="text-muted-foreground rounded-lg border p-4 text-center text-sm">
          {t('rejected')}
        </div>
      ) : st.sold_out ? (
        <div className="text-muted-foreground rounded-lg border p-4 text-center text-sm">
          {t('soldOut')}
        </div>
      ) : (
        <>
          <button
            onClick={claim}
            disabled={!st.eligible || claiming || !selectedShopId}
            className="bg-primary text-primary-foreground w-full rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {claiming
              ? t('claimProcessing')
              : st.eligible
                ? t('claimBtn', { bean: st.reward_bean.toLocaleString() })
                : t('claimBtnDisabled')}
          </button>
          <p className="text-muted-foreground mt-1.5 text-center text-xs">
            {t('claimNote')}
          </p>
        </>
      )}
    </div>
  )
}
