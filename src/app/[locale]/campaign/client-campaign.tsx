'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { BeanIcon } from '@/components/ui/bean-icon'
import { piFetch } from '@/lib/pi-fetch'

interface MyShop { shop_id: string; shop_nm: string }

interface Status {
  campaign_nm: string
  reward_bean: number
  require_mission_cnt: number
  active: boolean
  conditions: { shop: boolean; item: boolean; telegram: boolean; tlgm_alrt: boolean; mission: boolean }
  eligible: boolean
  my_shops: MyShop[]
  grant_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  claimed_shop_id: string | null
  granted_cnt: number
  max_cnt: number
  sold_out: boolean
}

const CLAIM_MSG: Record<string, { text: string; ok: boolean }> = {
  SUBMITTED: { text: '✅ 신청 완료! 관리자 승인 후 지급됩니다', ok: true },
  ALREADY_SUBMITTED: { text: '이미 신청하셨습니다', ok: false },
  NOT_ELIGIBLE: { text: '아직 자격 조건을 충족하지 않았습니다', ok: false },
  NOT_ACTIVE: { text: '진행 중인 캠페인이 아닙니다', ok: false },
  NO_CAMPAIGN: { text: '캠페인을 찾을 수 없습니다', ok: false },
}

const COND_ROWS: {
  key: keyof Status['conditions']
  label: string
  href?: string
  cta?: string
  hint?: string
}[] = [
  { key: 'shop',      label: 'M1 매장 가입',          href: '/store/my/shops',      cta: '매장 관리' },
  { key: 'item',      label: 'M2 상품 1개 이상 등록', href: '/store/my/items',      cta: '상품 관리' },
  { key: 'telegram',  label: 'M3 텔레그램 연동',       href: '/profile',             cta: '연동하기' },
  { key: 'tlgm_alrt', label: 'M4 텔레그램 알림 확인', href: '/profile',             cta: '알림 확인' },
]

export function ClientCampaign() {
  const [st, setSt] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [selectedShopId, setSelectedShopId] = useState<string>('')

  const load = useCallback(async () => {
    const res = await piFetch('/api/campaign/status')
    if (res.status === 401) { setAuthed(false); setLoading(false); return }
    if (res.ok) {
      const data = (await res.json()) as Status
      setSt(data)
      // 이미 신청한 매장이 있으면 선택, 없으면 첫 매장 자동 선택
      if (data.claimed_shop_id) setSelectedShopId(data.claimed_shop_id)
      else if (data.my_shops.length > 0) setSelectedShopId(data.my_shops[0].shop_id)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function claim() {
    if (!selectedShopId) { toast.error('참여할 매장을 선택해주세요'); return }
    setClaiming(true)
    try {
      const res = await piFetch('/api/campaign/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: selectedShopId }),
      })
      const d = (await res.json()) as { status?: string }
      const m = CLAIM_MSG[d.status ?? ''] ?? { text: '처리 결과를 확인하세요', ok: false }
      if (m.ok) toast.success(m.text)
      else toast.error(m.text)
      await load()
    } catch {
      toast.error('네트워크 오류가 발생했습니다')
    } finally {
      setClaiming(false)
    }
  }

  if (loading) return <p className="text-muted-foreground text-sm">불러오는 중…</p>
  if (!authed)
    return (
      <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        로그인이 필요합니다.
      </p>
    )
  if (!st)
    return <p className="text-muted-foreground text-sm">캠페인 정보를 불러올 수 없습니다.</p>

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
          {st.reward_bean.toLocaleString()}
          <BeanIcon className="inline-block h-7 w-7 align-text-bottom" />
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          선착순 {st.max_cnt}매장 · 잔여 {remaining}매장 ({st.granted_cnt}/{st.max_cnt})
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs font-medium">
          1인 1회 · 대표 매장 1개 지정 참여
        </p>
      </div>

      {/* 자격 조건 체크리스트 */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">참여 조건</p>
        <ul className="divide-y rounded-lg border">
          {COND_ROWS.map((c) => (
            <li
              key={c.key}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className={st.conditions[c.key] ? 'text-green-600' : 'text-muted-foreground'}>
                  {st.conditions[c.key] ? '✅' : '⬜'}
                </span>
                <span className={st.conditions[c.key] ? '' : 'text-muted-foreground'}>
                  {c.label}
                </span>
                {c.hint && !st.conditions[c.key] && (
                  <span className="text-muted-foreground text-xs">({c.hint})</span>
                )}
              </span>
              {/* 참여 링크 — 충족 여부와 무관하게 항상 노출(충족 후에도 매장·상품 추가/재확인 가능) */}
              {c.href && c.cta && (
                <Link href={c.href} className="text-primary text-xs hover:underline">
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
          <p className="text-sm font-semibold">대표 매장 선택</p>
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
          <p className="text-muted-foreground text-xs">
            이벤트는 1인 1회, 대표 매장 1개로 참여합니다
          </p>
        </div>
      )}

      {/* 신청 버튼 / 상태 */}
      {st.grant_status === 'APPROVED' ? (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-center text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
          🎉 승인 완료 — {st.reward_bean.toLocaleString()} Bean 지급
          {claimedShop && (
            <p className="mt-1 text-xs opacity-75">참여 매장: {claimedShop.shop_nm}</p>
          )}
        </div>
      ) : st.grant_status === 'PENDING' ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-center text-sm font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          ⏳ 신청 완료 — 관리자 승인 대기 중
          {claimedShop && (
            <p className="mt-1 text-xs opacity-75">참여 매장: {claimedShop.shop_nm}</p>
          )}
        </div>
      ) : st.grant_status === 'REJECTED' ? (
        <div className="text-muted-foreground rounded-lg border p-4 text-center text-sm">
          신청이 거절되었습니다
        </div>
      ) : st.sold_out ? (
        <div className="text-muted-foreground rounded-lg border p-4 text-center text-sm">
          선착순이 마감되었습니다
        </div>
      ) : (
        <>
          <button
            onClick={claim}
            disabled={!st.eligible || claiming || !selectedShopId}
            className="bg-primary text-primary-foreground w-full rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {claiming
              ? '처리 중…'
              : st.eligible
                ? `${st.reward_bean.toLocaleString()} Bean 신청하기`
                : '조건을 모두 충족하면 신청할 수 있어요'}
          </button>
          <p className="text-muted-foreground mt-1.5 text-center text-xs">
            신청 후 관리자 승인을 거쳐 지급됩니다
          </p>
        </>
      )}
    </div>
  )
}
