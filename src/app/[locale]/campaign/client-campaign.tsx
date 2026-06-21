'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { Link } from '@/i18n/navigation'
import { BeanIcon } from '@/components/ui/bean-icon'

interface Status {
  campaign_nm: string
  reward_bean: number
  require_mission_cnt: number
  active: boolean
  conditions: {
    shop: boolean
    item: boolean
    telegram: boolean
    mission: boolean
  }
  eligible: boolean
  grant_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  claimed: boolean
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

export function ClientCampaign() {
  const [st, setSt] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(true)
  const [claiming, setClaiming] = useState(false)

  const load = useCallback(async () => {
    const res = await piFetch('/api/campaign/status')
    if (res.status === 401) {
      setAuthed(false)
      setLoading(false)
      return
    }
    if (res.ok) setSt((await res.json()) as Status)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function claim() {
    setClaiming(true)
    try {
      const res = await piFetch('/api/campaign/claim', { method: 'POST' })
      const d = (await res.json()) as { status?: string }
      const m = CLAIM_MSG[d.status ?? ''] ?? {
        text: '처리 결과를 확인하세요',
        ok: false,
      }
      if (m.ok) toast.success(m.text)
      else toast.error(m.text)
      await load()
    } catch {
      toast.error('네트워크 오류가 발생했습니다')
    } finally {
      setClaiming(false)
    }
  }

  if (loading)
    return <p className="text-muted-foreground text-sm">불러오는 중…</p>
  if (!authed)
    return (
      <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        로그인이 필요합니다.
      </p>
    )
  if (!st)
    return (
      <p className="text-muted-foreground text-sm">
        캠페인 정보를 불러올 수 없습니다.
      </p>
    )

  // 조건 체크리스트 (미션은 require_mission_cnt>0일 때만 노출)
  const conds: {
    key: keyof Status['conditions']
    label: string
    ok: boolean
    href: string
    cta: string
  }[] = [
    {
      key: 'shop',
      label: '매장 가입',
      ok: st.conditions.shop,
      href: '/store/my/shops',
      cta: '매장 등록',
    },
    {
      key: 'item',
      label: '상품 1개 이상 등록',
      ok: st.conditions.item,
      href: '/store/my/items',
      cta: '상품 등록',
    },
    {
      key: 'telegram',
      label: '텔레그램 알림 연동',
      ok: st.conditions.telegram,
      href: '/profile',
      cta: '연동하기',
    },
  ]
  if (st.require_mission_cnt > 0)
    conds.push({
      key: 'mission',
      label: `오픈 미션 ${st.require_mission_cnt}개 완료`,
      ok: st.conditions.mission,
      href: '/event',
      cta: '미션 보기',
    })

  const remaining = Math.max(0, st.max_cnt - st.granted_cnt)

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="from-primary/10 to-primary/5 rounded-2xl bg-gradient-to-b p-6 text-center">
        <p className="text-sm font-semibold">🏪 {st.campaign_nm}</p>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-3xl font-bold tabular-nums">
          {st.reward_bean.toLocaleString()}{' '}
          <BeanIcon className="inline-block h-7 w-7 align-text-bottom" />
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          선착순 {st.max_cnt}매장 · 잔여 {remaining}매장 ({st.granted_cnt}/
          {st.max_cnt})
        </p>
      </div>

      {/* 자격 조건 체크리스트 */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">참여 조건</p>
        <ul className="divide-y rounded-lg border">
          {conds.map((c) => (
            <li
              key={c.key}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className={c.ok ? 'text-green-600' : 'text-muted-foreground'}
                >
                  {c.ok ? '✅' : '⬜'}
                </span>
                <span className={c.ok ? '' : 'text-muted-foreground'}>
                  {c.label}
                </span>
              </span>
              {!c.ok && (
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

      {/* 신청 버튼 / 상태 — 자동 지급 없음, 관리자 승인 후 지급 */}
      {st.grant_status === 'APPROVED' ? (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-center text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
          🎉 승인 완료 — {st.reward_bean.toLocaleString()} Bean이 지급되었습니다
        </div>
      ) : st.grant_status === 'PENDING' ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-center text-sm font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          ⏳ 신청 완료 — 관리자 승인 대기 중입니다
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
            disabled={!st.eligible || claiming}
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
