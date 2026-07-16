'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { BeanIcon } from '@/components/ui/bean-icon'
import { piFetch } from '@/lib/pi-fetch'

interface GovWallet {
  wlt_id: string
  bean_amt: number
  status: string
  mod_dtm: string
}

interface UserWallet {
  wlt_id: string
  usr_id: string
  bean_amt: number
  status: string
  del_yn: string
  mod_dtm: string
  sys_user: {
    pi_username: string | null
    nick_nm: string | null
    real_nm: string | null
    display_name: string
  } | null
}

interface AdjustForm {
  usrId: string
  adjBean: string
  reason: string
}

// 조정 사유 코드값 — 표시 라벨은 i18n(adminToken.wallets.reason.*)
const REASONS = [
  'REFUND_PI_PAYMENT',
  'REWARD_EVENT',
  'REWARD_PROMOTION',
  'CORRECTION_OVERPAY',
  'CORRECTION_UNDERPAY',
  'PENALTY_ABUSE',
  'TEST_ADMIN',
] as const

const PAGE_SIZE = 50

export default function TokenWalletsPage() {
  const t = useTranslations()
  const [platform, setPlatform] = useState<GovWallet | null>(null)
  const [foundation, setFoundation] = useState<GovWallet | null>(null)
  const [rewardPool, setRewardPool] = useState<GovWallet | null>(null)
  const [wallets, setWallets] = useState<UserWallet[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [adjusting, setAdjusting] = useState(false)
  const [form, setForm] = useState<AdjustForm>({
    usrId: '',
    adjBean: '',
    reason: REASONS[0],
  })
  const [adjustMsg, setAdjustMsg] = useState<string | null>(null)
  const [adjustOk, setAdjustOk] = useState(false)
  // 프로모션 발행(거버넌스 지갑 충전)
  const [minting, setMinting] = useState(false)
  const [mintAmt, setMintAmt] = useState('')
  const [mintDest, setMintDest] = useState('REWARD_POOL')
  const [mintReason, setMintReason] = useState('')
  const [mintMsg, setMintMsg] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    piFetch('/api/admin/token/wallets?type=ALL&limit=500')
      .then((r) => r.json())
      .then(
        (d: {
          platform: GovWallet | null
          foundation: GovWallet | null
          reward_pool: GovWallet | null
          users: UserWallet[]
        }) => {
          setPlatform(d.platform)
          setFoundation(d.foundation)
          setRewardPool(d.reward_pool)
          setWallets(d.users ?? [])
        },
      )
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const totalPages = Math.ceil(wallets.length / PAGE_SIZE)
  const displayed = wallets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleAdjust = async () => {
    const adjBean = parseInt(form.adjBean, 10)
    if (!form.usrId || isNaN(adjBean) || adjBean === 0) {
      setAdjustMsg(t('adminToken.wallets.adjustInputError'))
      return
    }
    setAdjusting(true)
    setAdjustMsg(null)
    try {
      const res = await piFetch('/api/admin/token/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usr_id: form.usrId,
          adj_bean: adjBean,
          reason: form.reason,
        }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        before?: number
        adj?: number
        after?: number
      }
      if (!res.ok || !data.ok) {
        setAdjustOk(false)
        setAdjustMsg(
          t('adminToken.errorMsg', { msg: String(data.error ?? res.status) }),
        )
      } else {
        setAdjustOk(true)
        setAdjustMsg(
          t('adminToken.wallets.adjustSuccess', {
            before: String(data.before),
            after: String(data.after),
            adj: `${adjBean > 0 ? '+' : ''}${adjBean}`,
          }),
        )
        load()
      }
    } catch {
      setAdjustOk(false)
      setAdjustMsg(t('adminToken.networkError'))
    } finally {
      setAdjusting(false)
    }
  }

  async function mint() {
    const amt = Math.floor(Number(mintAmt))
    if (!Number.isInteger(amt) || amt <= 0) {
      setMintMsg(t('adminToken.wallets.mintAmountError'))
      return
    }
    if (!mintReason.trim()) {
      setMintMsg(t('adminToken.wallets.mintReasonError'))
      return
    }
    setMinting(true)
    setMintMsg(null)
    try {
      const res = await piFetch('/api/admin/token/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bean_amt: amt,
          dest_wallet: mintDest,
          reason: mintReason.trim(),
        }),
      })
      const d = (await res.json()) as { error?: string; balance?: number }
      if (!res.ok) {
        setMintMsg(
          t('adminToken.errorMsg', { msg: String(d.error ?? res.status) }),
        )
      } else {
        setMintMsg(
          t('adminToken.wallets.mintSuccess', {
            dest: mintDest,
            balance: d.balance?.toLocaleString() ?? '',
          }),
        )
        setMintAmt('')
        setMintReason('')
        load()
      }
    } catch {
      setMintMsg(t('adminToken.networkError'))
    } finally {
      setMinting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BeanIcon className="inline-block h-7 w-7" />{' '}
          {t('adminToken.wallets.title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('adminToken.wallets.subtitle', {
            count: wallets.length.toLocaleString(),
          })}
        </p>
      </div>

      {/* 거버넌스 지갑 3종 (Pi Network 공식 기준) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {platform && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950/30">
            <p className="text-xs font-semibold tracking-wide text-purple-600 uppercase dark:text-purple-400">
              {t('adminToken.wallets.platformLabel')}
            </p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums">
              <BeanIcon className="inline-block h-6 w-6" />{' '}
              {platform.bean_amt.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-xs">
              ≈ π {(platform.bean_amt / 100).toFixed(2)} ·{' '}
              {new Date(platform.mod_dtm).toLocaleString('ko-KR')}
            </p>
          </div>
        )}
        {foundation && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/30">
            <p className="text-xs font-semibold tracking-wide text-rose-600 uppercase dark:text-rose-400">
              {t('adminToken.wallets.foundationLabel')}
            </p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums">
              <BeanIcon className="inline-block h-6 w-6" />{' '}
              {foundation.bean_amt.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-xs">
              ≈ π {(foundation.bean_amt / 100).toFixed(2)} ·{' '}
              {t('adminToken.wallets.foundationSub')}
            </p>
          </div>
        )}
        {rewardPool && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950/30">
            <p className="text-xs font-semibold tracking-wide text-teal-600 uppercase dark:text-teal-400">
              {t('adminToken.wallets.rewardPoolLabel')}
            </p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums">
              <BeanIcon className="inline-block h-6 w-6" />{' '}
              {rewardPool.bean_amt.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-xs">
              ≈ π {(rewardPool.bean_amt / 100).toFixed(2)} ·{' '}
              {t('adminToken.wallets.rewardPoolSub')}
            </p>
          </div>
        )}
      </div>

      {/* 프로모션 발행 — 거버넌스 지갑 충전(보상 캠페인 재원) */}
      <div className="border-border rounded-lg border p-4">
        <p className="text-sm font-semibold">
          {t('adminToken.wallets.mintTitle')}
        </p>
        <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
          {t('adminToken.wallets.mintDesc')}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              {t('adminToken.wallets.mintAmountLabel')}
            </label>
            <input
              type="number"
              value={mintAmt}
              onChange={(e) => setMintAmt(e.target.value)}
              placeholder="1000000"
              className="w-36 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              {t('adminToken.wallets.mintDestLabel')}
            </label>
            <select
              value={mintDest}
              onChange={(e) => setMintDest(e.target.value)}
              className="rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            >
              <option value="REWARD_POOL">
                {t('adminToken.wallets.mintDestRewardPool')}
              </option>
              <option value="PLATFORM">
                {t('adminToken.wallets.mintDestPlatform')}
              </option>
              <option value="FOUNDATION">
                {t('adminToken.wallets.mintDestFoundation')}
              </option>
            </select>
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="text-muted-foreground mb-1 block text-xs">
              {t('adminToken.wallets.mintReasonLabel')}
            </label>
            <input
              value={mintReason}
              onChange={(e) => setMintReason(e.target.value)}
              placeholder={t('adminToken.wallets.mintReasonPlaceholder')}
              className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </div>
          <button
            onClick={mint}
            disabled={minting}
            className="bg-primary text-primary-foreground rounded-lg px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {minting
              ? t('adminToken.wallets.minting')
              : t('adminToken.wallets.mintBtn')}
          </button>
        </div>
        {mintMsg && <p className="mt-2 text-xs">{mintMsg}</p>}
      </div>

      {/* 수동 조정 패널 */}
      <div className="rounded-lg border p-4">
        <p className="mb-3 font-semibold">
          {t('adminToken.wallets.manualTitle')}
        </p>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder={t('adminToken.wallets.usrIdPlaceholder')}
            value={form.usrId}
            onChange={(e) => setForm((f) => ({ ...f, usrId: e.target.value }))}
            className="border-input bg-background h-9 w-72 rounded-md border px-3 text-sm"
          />
          <input
            type="number"
            placeholder={t('adminToken.wallets.adjBeanPlaceholder')}
            value={form.adjBean}
            onChange={(e) =>
              setForm((f) => ({ ...f, adjBean: e.target.value }))
            }
            className="border-input bg-background h-9 w-52 rounded-md border px-3 text-sm"
          />
          <select
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`adminToken.wallets.reason.${r}`)}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdjust}
            disabled={adjusting}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium disabled:opacity-50"
          >
            {adjusting
              ? t('common.processing')
              : t('adminToken.wallets.adjustRun')}
          </button>
        </div>
        {adjustMsg && (
          <p
            className={`mt-2 text-sm ${adjustOk ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}
          >
            {adjustMsg}
          </p>
        )}
      </div>

      {/* USER 지갑 목록 */}
      {loading ? (
        <p className="text-muted-foreground text-sm">{t('common.fetching')}</p>
      ) : (
        <div className="overflow-hidden overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">
                  {t('adminToken.wallets.colUser')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('adminToken.wallets.colBeanBalance')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('adminToken.wallets.colPiConv')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('adminToken.wallets.colStatus')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('adminToken.wallets.colLastUpdate')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayed.map((w) => (
                <tr
                  key={w.wlt_id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {w.sys_user?.nick_nm ||
                        w.sys_user?.real_nm ||
                        w.sys_user?.display_name ||
                        '—'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {w.sys_user?.pi_username
                        ? `@${w.sys_user.pi_username}`
                        : w.usr_id.slice(0, 8)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <BeanIcon className="inline-block h-5 w-5" />{' '}
                      {w.bean_amt.toLocaleString()}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                    π {(w.bean_amt / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        w.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : w.status === 'FROZEN'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {w.status}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                    {new Date(w.mod_dtm).toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  )
}
