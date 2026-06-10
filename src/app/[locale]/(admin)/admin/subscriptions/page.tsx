'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { useDynamicLimit } from '@/hooks/use-dynamic-limit'

// p-6(48) + 제목+설명(56) + gap(16) + 필터(36) + gap(16) + 부여폼(88) + gap(16) + 테이블헤더(33) + gap(16) + 페이지(36)
const CHROME_PX = 361

type PlanTier = 'FREE' | 'PREMIUM' | 'BUSINESS'

interface SubscrRow {
  subscr_id: string
  plan_cd: string
  start_dtm: string
  expire_dtm: string
  auto_renew_yn: 'Y' | 'N' | null
  sys_user: {
    id: string
    display_name: string
    pi_username: string | null
    google_email: string | null
  } | null
  msg_subscr_plan: {
    plan_nm: string
    plan_tp_cd: PlanTier
    price_pi: number
    mth_cnt: number
  } | { plan_nm: string; plan_tp_cd: PlanTier; price_pi: number; mth_cnt: number }[] | null
}

interface PlanOption {
  plan_cd: string
  plan_nm: string
  plan_tp_cd: PlanTier
}

const TIER_COLOR: Record<PlanTier, string> = {
  FREE:     'bg-muted text-muted-foreground',
  PREMIUM:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  BUSINESS: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

function getPlanRow(row: SubscrRow['msg_subscr_plan']) {
  if (!row) return null
  return Array.isArray(row) ? row[0] : row
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

export default function SubscriptionsPage() {
  const t = useTranslations('adminSubscriptions')
  const tc = useTranslations('common')

  const [rows, setRows] = useState<SubscrRow[]>([])
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PlanTier | 'all'>('all')
  const [page, setPage] = useState(1)
  const limit = useDynamicLimit(CHROME_PX)

  // 부여 폼 상태
  const [grantUsrId, setGrantUsrId] = useState('')
  const [grantPlanCd, setGrantPlanCd] = useState('')
  const [grantMonths, setGrantMonths] = useState(1)
  const [granting, setGranting] = useState(false)

  // 연장 인라인 상태
  const [extendId, setExtendId] = useState<string | null>(null)
  const [extendMonths, setExtendMonths] = useState(1)

  useEffect(() => { setPage(1) }, [limit, filter])

  useEffect(() => {
    fetch('/api/admin/subscriptions')
      .then((r) => r.json())
      .then((d: { subscriptions: SubscrRow[] }) => setRows(d.subscriptions ?? []))
      .finally(() => setLoading(false))

    // 플랜 목록 조회 (Business/Premium만)
    fetch('/api/admin/subscriptions/plans')
      .then((r) => r.json())
      .then((d: { plans: PlanOption[] }) => setPlans(d.plans ?? []))
      .catch(() => {
        // plans API 없을 경우 하드코딩 fallback
        setPlans([
          { plan_cd: 'PREMIUM_MONTHLY', plan_nm: 'Pi Creator 월간', plan_tp_cd: 'PREMIUM' },
          { plan_cd: 'PREMIUM_ANNUAL',  plan_nm: 'Pi Creator 연간', plan_tp_cd: 'PREMIUM' },
          { plan_cd: 'BUSINESS_MONTHLY', plan_nm: 'Pi Host 월간',   plan_tp_cd: 'BUSINESS' },
          { plan_cd: 'BUSINESS_ANNUAL',  plan_nm: 'Pi Host 연간',   plan_tp_cd: 'BUSINESS' },
        ])
      })
  }, [])

  const filtered = filter === 'all'
    ? rows
    : rows.filter((r) => getPlanRow(r.msg_subscr_plan)?.plan_tp_cd === filter)

  const totalPages = Math.ceil(filtered.length / limit)
  const displayed = filtered.slice((page - 1) * limit, page * limit)

  const businessCount = rows.filter((r) => getPlanRow(r.msg_subscr_plan)?.plan_tp_cd === 'BUSINESS').length
  const premiumCount  = rows.filter((r) => getPlanRow(r.msg_subscr_plan)?.plan_tp_cd === 'PREMIUM').length

  async function grant() {
    if (!grantUsrId.trim() || !grantPlanCd) {
      toast.error(t('grantValidation'))
      return
    }
    setGranting(true)
    try {
      const res = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usr_id: grantUsrId.trim(), plan_cd: grantPlanCd, months: grantMonths }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('grantFail'))
      }
      toast.success(t('grantSuccess'))
      setGrantUsrId('')
      setGrantPlanCd('')
      setGrantMonths(1)
      // 목록 새로고침
      const updated = await fetch('/api/admin/subscriptions').then((r) => r.json())
      setRows(updated.subscriptions ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('grantFail'))
    } finally {
      setGranting(false)
    }
  }

  async function revoke(id: string, name: string) {
    if (!confirm(t('revokeConfirm', { name }))) return
    const res = await fetch(`/api/admin/subscriptions/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error(t('revokeFail')); return }
    toast.success(t('revokeSuccess'))
    setRows((prev) => prev.filter((r) => r.subscr_id !== id))
  }

  async function extend(id: string) {
    const res = await fetch(`/api/admin/subscriptions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extend_months: extendMonths }),
    })
    if (!res.ok) { toast.error(t('extendFail')); return }
    toast.success(t('extendSuccess'))
    setExtendId(null)
    // 만료일 갱신 반영
    const updated = await fetch('/api/admin/subscriptions').then((r) => r.json())
    setRows(updated.subscriptions ?? [])
  }

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-bold'>{t('title')}</h1>
        <p className='text-muted-foreground mt-1 text-sm'>
          {t('desc', { count: rows.length, business: businessCount, premium: premiumCount })}
        </p>
      </div>

      {/* 구독 수동 부여 폼 */}
      <div className='rounded-lg border p-4 space-y-3'>
        <p className='font-semibold text-sm'>{t('grantTitle')}</p>
        <div className='flex flex-wrap gap-2 items-end'>
          <div className='flex flex-col gap-1'>
            <label className='text-xs text-muted-foreground'>{t('grantUsrId')}</label>
            <input
              className='rounded-md border px-3 py-1.5 text-sm w-72 bg-background'
              placeholder='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
              value={grantUsrId}
              onChange={(e) => setGrantUsrId(e.target.value)}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <label className='text-xs text-muted-foreground'>{t('grantPlan')}</label>
            <select
              className='rounded-md border px-3 py-1.5 text-sm bg-background'
              value={grantPlanCd}
              onChange={(e) => setGrantPlanCd(e.target.value)}
            >
              <option value=''>— 선택 —</option>
              {plans.map((p) => (
                <option key={p.plan_cd} value={p.plan_cd}>
                  [{p.plan_tp_cd}] {p.plan_nm}
                </option>
              ))}
            </select>
          </div>
          <div className='flex flex-col gap-1'>
            <label className='text-xs text-muted-foreground'>{t('grantMonths')}</label>
            <input
              type='number'
              min={1}
              max={24}
              className='rounded-md border px-3 py-1.5 text-sm w-20 bg-background'
              value={grantMonths}
              onChange={(e) => setGrantMonths(Number(e.target.value))}
            />
          </div>
          <Button size='sm' disabled={granting} onClick={grant}>
            {granting ? t('granting') : t('grantBtn')}
          </Button>
        </div>
      </div>

      {/* 등급 필터 */}
      <div className='flex flex-wrap gap-2'>
        {(['all', 'BUSINESS', 'PREMIUM'] as const).map((tier) => (
          <button
            key={tier}
            onClick={() => setFilter(tier)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === tier
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {tier === 'all' ? t('filter.all') : t(`filter.${tier.toLowerCase() as 'business' | 'premium'}`)}
            {tier !== 'all' && (
              <span className='ml-1'>
                ({tier === 'BUSINESS' ? businessCount : premiumCount})
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className='text-muted-foreground text-sm'>{tc('loading')}</p>
      ) : filtered.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{t('noData')}</p>
      ) : (
        <div className='overflow-hidden overflow-x-auto rounded-lg border'>
          <table className='w-full text-sm'>
            <thead className='border-b bg-muted/50'>
              <tr>
                <th className='px-4 py-2 text-left font-medium'>{t('col.user')}</th>
                <th className='px-4 py-2 text-left font-medium'>{t('col.plan')}</th>
                <th className='px-4 py-2 text-left font-medium'>{t('col.tier')}</th>
                <th className='px-4 py-2 text-left font-medium'>{t('col.startAt')}</th>
                <th className='px-4 py-2 text-left font-medium'>{t('col.expireAt')}</th>
                <th className='px-4 py-2 text-left font-medium'>{t('col.autoRenew')}</th>
                <th className='px-4 py-2 text-left font-medium'>{t('col.manage')}</th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {displayed.map((row) => {
                const plan = getPlanRow(row.msg_subscr_plan)
                const tier = plan?.plan_tp_cd ?? 'FREE'
                const days = daysUntil(row.expire_dtm)
                const isExpired = days < 0
                const user = row.sys_user

                return (
                  <tr key={row.subscr_id} className='transition-colors hover:bg-muted/30'>
                    <td className='px-4 py-3'>
                      <p className='font-medium'>{user?.display_name ?? '—'}</p>
                      <p className='text-xs text-muted-foreground'>
                        {user?.pi_username ? `@${user.pi_username}` : user?.google_email ?? ''}
                      </p>
                      <p className='mt-0.5 font-mono text-[10px] text-muted-foreground/60'>
                        {user?.id ?? ''}
                      </p>
                    </td>
                    <td className='px-4 py-3 text-muted-foreground'>
                      {plan?.plan_nm ?? row.plan_cd}
                    </td>
                    <td className='px-4 py-3'>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIER_COLOR[tier]}`}>
                        {tier}
                      </span>
                    </td>
                    <td className='whitespace-nowrap px-4 py-3 text-xs text-muted-foreground'>
                      {new Date(row.start_dtm).toLocaleDateString('ko-KR')}
                    </td>
                    <td className='whitespace-nowrap px-4 py-3 text-xs'>
                      <p className={isExpired ? 'text-red-500' : 'text-foreground'}>
                        {new Date(row.expire_dtm).toLocaleDateString('ko-KR')}
                      </p>
                      <p className='text-muted-foreground'>
                        {isExpired ? t('expired') : t('dday', { n: days })}
                      </p>
                    </td>
                    <td className='px-4 py-3 text-center text-sm'>
                      {row.auto_renew_yn === 'Y' ? t('autoRenewYes') : t('autoRenewNo')}
                    </td>
                    <td className='px-4 py-3'>
                      {extendId === row.subscr_id ? (
                        <div className='flex items-center gap-1'>
                          <input
                            type='number'
                            min={1}
                            max={24}
                            className='w-14 rounded border px-2 py-1 text-xs bg-background'
                            value={extendMonths}
                            onChange={(e) => setExtendMonths(Number(e.target.value))}
                          />
                          <Button size='sm' className='h-6 px-2 text-xs' onClick={() => extend(row.subscr_id)}>
                            {tc('save')}
                          </Button>
                          <Button
                            size='sm'
                            variant='ghost'
                            className='h-6 px-2 text-xs'
                            onClick={() => setExtendId(null)}
                          >
                            {tc('cancel')}
                          </Button>
                        </div>
                      ) : (
                        <div className='flex gap-1'>
                          <Button
                            size='sm'
                            variant='outline'
                            className='h-6 px-2 text-xs'
                            onClick={() => { setExtendId(row.subscr_id); setExtendMonths(1) }}
                          >
                            {t('extend')}
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            className='h-6 px-2 text-xs text-red-600 hover:text-red-600'
                            onClick={() => revoke(row.subscr_id, user?.display_name ?? '?')}
                          >
                            {t('revoke')}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  )
}
