'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { BeanIcon } from '@/components/ui/bean-icon'

interface Campaign {
  campaign_cd: string
  campaign_nm: string
  reward_bean: number
  max_grant_cnt: number
  src_wallet: string
  require_shop_yn: string
  require_item_yn: string
  require_telegram_yn: string
  require_tlgm_alrt_yn: string
  require_mission_cnt: number
  active_yn: string
  start_dtm: string
  end_dtm: string | null
  pending: number
  approved: number
  rejected: number
}

interface ListData {
  campaigns: Campaign[]
  reward_pool_balance: number
}

interface PendingRow {
  grant_id: string
  usr_id: string
  bean_amt: number
  reg_dtm: string
  shop_nm: string | null
  sys_user: {
    pi_username: string | null
    nick_nm: string | null
    real_nm: string | null
    display_name: string
  } | null
}

interface PendingData {
  campaign_cd: string
  campaign_nm: string
  pending: PendingRow[]
  approved_cnt: number
  max_cnt: number
  reward_bean: number
}

// 처리 결과 성공 여부 — 메시지는 i18n(adminCampaign.result.*)
const RESULT_OK: Record<string, boolean> = {
  APPROVED: true,
  REJECTED: true,
  SOLD_OUT: false,
  INSUFFICIENT_POOL: false,
  NOT_PENDING: false,
}

// ── 재원(REWARD_POOL) 충전 박스 ──────────────────────────────
function MintBox({ balance, onDone }: { balance: number; onDone: () => void }) {
  const t = useTranslations()
  const [amt, setAmt] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function mint() {
    const n = Math.floor(Number(amt))
    if (!Number.isInteger(n) || n <= 0) {
      toast.error(t('adminCampaign.mintAmountError'))
      return
    }
    if (!reason.trim()) {
      toast.error(t('adminCampaign.mintReasonError'))
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/token/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bean_amt: n,
          dest_wallet: 'REWARD_POOL',
          reason: reason.trim(),
        }),
      })
      const d = (await res.json()) as { ok?: boolean; error?: string }
      if (res.ok && d.ok) {
        toast.success(t('adminCampaign.mintSuccess'))
        setAmt('')
        setReason('')
        onDone()
      } else {
        toast.error(d.error ?? t('adminCampaign.mintFail'))
      }
    } catch {
      toast.error(t('adminCampaign.networkError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950/30">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {t('adminCampaign.mintTitle')}
        </p>
        <span className="rounded bg-black/10 px-1.5 py-0.5 text-xs font-semibold dark:bg-white/10">
          {t('adminCampaign.mintBadge')}
        </span>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold tabular-nums">
        <BeanIcon className="inline-block h-5 w-5" /> {balance.toLocaleString()}
      </p>
      <p className="text-muted-foreground text-sm tabular-nums">
        ≈ π {(balance / 100).toFixed(2)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          placeholder={t('adminCampaign.mintAmountPlaceholder')}
          className="bg-background w-32 rounded-md border px-2 py-1 text-sm tabular-nums"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('adminCampaign.mintReasonPlaceholder')}
          className="bg-background min-w-40 flex-1 rounded-md border px-2 py-1 text-sm"
        />
        <button
          onClick={mint}
          disabled={busy}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {t('adminCampaign.mintBtn')}
        </button>
      </div>
      <p className="text-muted-foreground mt-1.5 text-xs">
        {t('adminCampaign.mintNote')}
      </p>
    </div>
  )
}

// ── 새 캠페인 생성 폼 ────────────────────────────────────────
function CreateForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [cd, setCd] = useState('')
  const [nm, setNm] = useState('')
  const [reward, setReward] = useState('')
  const [maxCnt, setMaxCnt] = useState('')
  const [reqShop, setReqShop] = useState(false)
  const [reqItem, setReqItem] = useState(false)
  const [reqTlgm, setReqTlgm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          campaign: {
            campaign_cd: cd.trim().toUpperCase(),
            campaign_nm: nm.trim(),
            reward_bean: reward,
            max_grant_cnt: maxCnt,
            require_shop_yn: reqShop,
            require_item_yn: reqItem,
            require_telegram_yn: reqTlgm,
            active_yn: 'Y',
          },
        }),
      })
      const d = (await res.json()) as { status?: string; error?: string }
      if (res.ok && d.status === 'CREATED') {
        toast.success(t('adminCampaign.createSuccess', { status: d.status }))
        setCd('')
        setNm('')
        setReward('')
        setMaxCnt('')
        setReqShop(false)
        setReqItem(false)
        setReqTlgm(false)
        setOpen(false)
        onDone()
      } else {
        toast.error(d.error ?? t('adminCampaign.createFail'))
      }
    } catch {
      toast.error(t('adminCampaign.networkError'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hover:bg-muted rounded-lg border border-dashed px-4 py-2 text-sm font-medium"
      >
        {t('adminCampaign.createOpen')}
      </button>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-semibold">{t('adminCampaign.createTitle')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            {t('adminCampaign.codeLabel')}
          </span>
          <input
            value={cd}
            onChange={(e) => setCd(e.target.value)}
            placeholder="EVENT_M1"
            className="bg-background w-full rounded-md border px-2 py-1 text-sm uppercase"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            {t('adminCampaign.nameLabel')}
          </span>
          <input
            value={nm}
            onChange={(e) => setNm(e.target.value)}
            placeholder={t('adminCampaign.namePlaceholder')}
            className="bg-background w-full rounded-md border px-2 py-1 text-sm"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            {t('adminCampaign.rewardLabel')}
          </span>
          <input
            type="number"
            min={1}
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            placeholder="10000"
            className="bg-background w-full rounded-md border px-2 py-1 text-sm tabular-nums"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            {t('adminCampaign.maxCntLabel')}
          </span>
          <input
            type="number"
            min={1}
            value={maxCnt}
            onChange={(e) => setMaxCnt(e.target.value)}
            placeholder="100"
            className="bg-background w-full rounded-md border px-2 py-1 text-sm tabular-nums"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={reqShop}
            onChange={(e) => setReqShop(e.target.checked)}
          />
          {t('adminCampaign.reqShop')}
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={reqItem}
            onChange={(e) => setReqItem(e.target.checked)}
          />
          {t('adminCampaign.reqItem')}
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={reqTlgm}
            onChange={(e) => setReqTlgm(e.target.checked)}
          />
          {t('adminCampaign.reqTelegram')}
        </label>
      </div>
      <div className="flex gap-2">
        <button
          onClick={create}
          disabled={busy}
          className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-40"
        >
          {t('adminCampaign.createBtn')}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="hover:bg-muted rounded-lg border px-3 py-1.5 text-sm"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

// ── 캠페인 카드 (활성 토글 + 신청 관리 진입) ──────────────────
function CampaignCard({
  c,
  onSelect,
  onChanged,
}: {
  c: Campaign
  onSelect: () => void
  onChanged: () => void
}) {
  const t = useTranslations()
  const [busy, setBusy] = useState(false)
  const active = c.active_yn === 'Y'

  async function toggle() {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          campaign_cd: c.campaign_cd,
          patch: { active_yn: active ? 'N' : 'Y' },
        }),
      })
      if (res.ok) {
        toast.success(
          active
            ? t('adminCampaign.deactivated')
            : t('adminCampaign.activated'),
        )
        onChanged()
      } else {
        const d = (await res.json()) as { error?: string }
        toast.error(d.error ?? t('adminCampaign.updateFail'))
      }
    } catch {
      toast.error(t('adminCampaign.networkError'))
    } finally {
      setBusy(false)
    }
  }

  const reqs = [
    c.require_shop_yn === 'Y' && t('adminCampaign.req.shop'),
    c.require_item_yn === 'Y' && t('adminCampaign.req.item'),
    c.require_telegram_yn === 'Y' && t('adminCampaign.req.telegram'),
    c.require_tlgm_alrt_yn === 'Y' && t('adminCampaign.req.tlgmAlrt'),
    c.require_mission_cnt > 0 &&
      t('adminCampaign.req.mission', { count: c.require_mission_cnt }),
  ].filter(Boolean) as string[]

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{c.campaign_nm}</p>
          <p className="text-muted-foreground font-mono text-xs">
            {c.campaign_cd}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            active
              ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {active ? t('adminCampaign.active') : t('adminCampaign.inactive')}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="bg-muted/40 rounded-md py-1.5">
          <p className="font-bold tabular-nums">
            {c.reward_bean.toLocaleString()}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('adminCampaign.rewardPerCase')}
          </p>
        </div>
        <div className="bg-muted/40 rounded-md py-1.5">
          <p className="font-bold tabular-nums">
            {c.approved}/{c.max_grant_cnt}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('adminCampaign.approvedLimit')}
          </p>
        </div>
        <div className="bg-muted/40 rounded-md py-1.5">
          <p className="font-bold text-amber-600 tabular-nums dark:text-amber-400">
            {c.pending}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('adminCampaign.pending')}
          </p>
        </div>
      </div>

      {reqs.length > 0 && (
        <p className="text-muted-foreground mt-2 text-xs">
          {t('adminCampaign.eligibility', { reqs: reqs.join(' · ') })}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={onSelect}
          className="bg-primary text-primary-foreground flex-1 rounded-lg px-3 py-1.5 text-xs font-medium hover:opacity-90"
        >
          {t('adminCampaign.manageApply')} {c.pending > 0 && `(${c.pending})`}
        </button>
        <button
          onClick={toggle}
          disabled={busy}
          className="hover:bg-muted rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {active ? t('adminCampaign.deactivate') : t('adminCampaign.activate')}
        </button>
      </div>
    </div>
  )
}

// ── 선택 캠페인의 PENDING 신청 승인/거절 패널 ──────────────────
function PendingPanel({
  campaignCd,
  onClose,
  onActed,
}: {
  campaignCd: string
  onClose: () => void
  onActed: () => void
}) {
  const t = useTranslations()
  const [data, setData] = useState<PendingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(
      `/api/admin/campaign?campaign_cd=${encodeURIComponent(campaignCd)}`,
    )
    if (res.ok) setData((await res.json()) as PendingData)
    setLoading(false)
  }, [campaignCd])

  useEffect(() => {
    void load()
  }, [load])

  async function act(usrId: string, action: 'approve' | 'reject') {
    setBusy(usrId)
    try {
      const res = await fetch('/api/admin/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          usr_id: usrId,
          campaign_cd: campaignCd,
        }),
      })
      const d = (await res.json()) as { status?: string }
      const status = d.status ?? ''
      const ok = RESULT_OK[status] ?? true
      const text =
        status in RESULT_OK
          ? t(`adminCampaign.result.${status}`)
          : t('adminCampaign.result.DONE')
      if (ok) toast.success(text)
      else toast.error(text)
      await load()
      onActed()
    } catch {
      toast.error(t('adminCampaign.networkError'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">
            {t('adminCampaign.applyTitle', {
              name: data?.campaign_nm ?? campaignCd,
            })}
          </p>
          {data && (
            <p className="text-muted-foreground mt-0.5 text-sm">
              {t('adminCampaign.applyStat', {
                approved: data.approved_cnt,
                max: data.max_cnt,
                reward: data.reward_bean.toLocaleString(),
              })}{' '}
              <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />{' '}
              {t('adminCampaign.applyPending', { count: data.pending.length })}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="hover:bg-muted rounded-lg border px-2.5 py-1 text-xs"
        >
          {t('common.close')}
        </button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">{t('common.fetching')}</p>
      ) : !data || data.pending.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          {t('adminCampaign.noPending')}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">
                  {t('adminCampaign.colApplicant')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('adminCampaign.colApplyDate')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('adminCampaign.colReward')}
                </th>
                <th className="px-4 py-2 text-center font-medium">
                  {t('adminCampaign.colAction')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.pending.map((r) => {
                const soldOut = data.approved_cnt >= data.max_cnt
                return (
                  <tr key={r.grant_id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {r.sys_user?.nick_nm ||
                          r.sys_user?.real_nm ||
                          r.sys_user?.display_name ||
                          '—'}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {r.sys_user?.pi_username
                          ? `@${r.sys_user.pi_username}`
                          : r.usr_id.slice(0, 8)}
                      </p>
                      {r.shop_nm && (
                        <p className="mt-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                          🏪 {r.shop_nm}
                        </p>
                      )}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                      {new Date(r.reg_dtm).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {r.bean_amt.toLocaleString()}{' '}
                      <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1.5">
                        <button
                          onClick={() => act(r.usr_id, 'approve')}
                          disabled={busy === r.usr_id || soldOut}
                          title={
                            soldOut
                              ? t('adminCampaign.soldOutTitle')
                              : undefined
                          }
                          className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
                        >
                          {t('adminCampaign.approve')}
                        </button>
                        <button
                          onClick={() => act(r.usr_id, 'reject')}
                          disabled={busy === r.usr_id}
                          className="hover:bg-muted rounded-lg border px-3 py-1 text-xs font-medium disabled:opacity-40"
                        >
                          {t('adminCampaign.reject')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────
export default function AdminCampaignPage() {
  const t = useTranslations()
  const [data, setData] = useState<ListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/campaign')
    if (res.ok) setData((await res.json()) as ListData)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BeanIcon className="inline-block h-6 w-6" />{' '}
          {t('adminCampaign.title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('adminCampaign.subtitle')}
        </p>
      </div>

      {data && <MintBox balance={data.reward_pool_balance} onDone={load} />}

      <CreateForm onDone={load} />

      {selected && (
        <PendingPanel
          campaignCd={selected}
          onClose={() => setSelected(null)}
          onActed={load}
        />
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">{t('common.fetching')}</p>
      ) : !data || data.campaigns.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          {t('adminCampaign.noCampaign')}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.campaigns.map((c) => (
            <CampaignCard
              key={c.campaign_cd}
              c={c}
              onSelect={() => setSelected(c.campaign_cd)}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}
