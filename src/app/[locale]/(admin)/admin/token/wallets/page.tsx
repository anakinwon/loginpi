'use client'

import { useEffect, useState } from 'react'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { BeanIcon } from '@/components/ui/bean-icon'

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

const REASONS = [
  { value: 'REFUND_PI_PAYMENT', label: 'Pi 결제 환불 보상' },
  { value: 'REWARD_EVENT', label: '이벤트 보상' },
  { value: 'REWARD_PROMOTION', label: '프로모션 보상' },
  { value: 'CORRECTION_OVERPAY', label: '과충전 정정' },
  { value: 'CORRECTION_UNDERPAY', label: '미충전 정정' },
  { value: 'PENALTY_ABUSE', label: '어뷰징 패널티' },
  { value: 'TEST_ADMIN', label: '관리자 테스트' },
]

const PAGE_SIZE = 50

export default function TokenWalletsPage() {
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
    reason: REASONS[0].value,
  })
  const [adjustMsg, setAdjustMsg] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/admin/token/wallets?type=ALL&limit=500')
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
      setAdjustMsg('usr_id와 조정량(0 제외)을 입력하세요.')
      return
    }
    setAdjusting(true)
    setAdjustMsg(null)
    try {
      const res = await fetch('/api/admin/token/adjust', {
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
        setAdjustMsg(`오류: ${data.error ?? res.status}`)
      } else {
        setAdjustMsg(
          `완료 — 조정 전 ${data.before} → 후 ${data.after} (${adjBean > 0 ? '+' : ''}${adjBean} Bean)`,
        )
        load()
      }
    } catch {
      setAdjustMsg('네트워크 오류')
    } finally {
      setAdjusting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BeanIcon className="inline-block h-7 w-7" /> Bean 지갑 관리
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          거버넌스 지갑 3종 + USER 지갑 {wallets.length.toLocaleString()}개
        </p>
      </div>

      {/* 거버넌스 지갑 3종 (Pi Network 공식 기준) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {platform && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
              PLATFORM · 운영 수익 (70%)
            </p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums">
              <BeanIcon className="inline-block h-6 w-6" />{' '}
              {platform.bean_amt.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-xs">
              ≈ π {(platform.bean_amt / 100).toFixed(2)} · {new Date(platform.mod_dtm).toLocaleString('ko-KR')}
            </p>
          </div>
        )}
        {foundation && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
              FOUNDATION · 재단 적립금 (10%)
            </p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums">
              <BeanIcon className="inline-block h-6 w-6" />{' '}
              {foundation.bean_amt.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-xs">
              ≈ π {(foundation.bean_amt / 100).toFixed(2)} · Pi Network 재단 기준
            </p>
          </div>
        )}
        {rewardPool && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
              REWARD_POOL · 생태계 기금 (20%)
            </p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums">
              <BeanIcon className="inline-block h-6 w-6" />{' '}
              {rewardPool.bean_amt.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-xs">
              ≈ π {(rewardPool.bean_amt / 100).toFixed(2)} · Pi Network 생태계 기금 기준
            </p>
          </div>
        )}
      </div>

      {/* 수동 조정 패널 */}
      <div className="rounded-lg border p-4">
        <p className="mb-3 font-semibold">수동 Bean 조정</p>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="usr_id (UUID)"
            value={form.usrId}
            onChange={(e) => setForm((f) => ({ ...f, usrId: e.target.value }))}
            className="border-input bg-background h-9 w-72 rounded-md border px-3 text-sm"
          />
          <input
            type="number"
            placeholder="조정량 (양수=지급, 음수=차감)"
            value={form.adjBean}
            onChange={(e) =>
              setForm((f) => ({ ...f, adjBean: e.target.value }))
            }
            className="border-input bg-background h-9 w-52 rounded-md border px-3 text-sm"
          />
          <select
            value={form.reason}
            onChange={(e) =>
              setForm((f) => ({ ...f, reason: e.target.value }))
            }
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdjust}
            disabled={adjusting}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium disabled:opacity-50"
          >
            {adjusting ? '처리 중...' : '조정 실행'}
          </button>
        </div>
        {adjustMsg && (
          <p
            className={`mt-2 text-sm ${adjustMsg.startsWith('완료') ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}
          >
            {adjustMsg}
          </p>
        )}
      </div>

      {/* USER 지갑 목록 */}
      {loading ? (
        <p className="text-muted-foreground text-sm">불러오는 중...</p>
      ) : (
        <div className="overflow-hidden overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">사용자</th>
                <th className="px-4 py-2 text-right font-medium">Bean 잔액</th>
                <th className="px-4 py-2 text-right font-medium">Pi 환산</th>
                <th className="px-4 py-2 text-left font-medium">상태</th>
                <th className="px-4 py-2 text-left font-medium">최종 갱신</th>
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
