'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BeanIcon } from '@/components/ui/bean-icon'

interface PendingRow {
  grant_id: string
  usr_id: string
  bean_amt: number
  reg_dtm: string
  sys_user: {
    pi_username: string | null
    nick_nm: string | null
    real_nm: string | null
    display_name: string
  } | null
}

interface Data {
  pending: PendingRow[]
  approved_cnt: number
  max_cnt: number
  reward_bean: number
}

const RESULT_MSG: Record<string, { text: string; ok: boolean }> = {
  APPROVED: { text: '승인·지급 완료', ok: true },
  REJECTED: { text: '거절 처리됨', ok: true },
  SOLD_OUT: { text: '선착순 한도 도달 — 더 승인할 수 없습니다', ok: false },
  INSUFFICIENT_POOL: { text: '보상 재원(REWARD_POOL)이 부족합니다', ok: false },
  NOT_PENDING: { text: '대기 중인 신청이 아닙니다', ok: false },
}

export default function AdminCampaignPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/campaign')
    if (res.ok) setData((await res.json()) as Data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function act(usrId: string, action: 'approve' | 'reject') {
    setBusy(usrId)
    try {
      const res = await fetch('/api/admin/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usr_id: usrId, action }),
      })
      const d = (await res.json()) as { status?: string }
      const m = RESULT_MSG[d.status ?? ''] ?? { text: '처리 완료', ok: true }
      if (m.ok) toast.success(m.text)
      else toast.error(m.text)
      await load()
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">매장 온보딩 보상 승인</h1>
        {data && (
          <p className="text-muted-foreground mt-1 text-sm">
            승인 {data.approved_cnt}/{data.max_cnt}매장 · 건당{' '}
            {data.reward_bean.toLocaleString()}{' '}
            <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />{' '}
            · 대기 {data.pending.length}건
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">불러오는 중...</p>
      ) : !data || data.pending.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          승인 대기 중인 신청이 없습니다.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">신청자</th>
                <th className="px-4 py-2 text-left font-medium">신청일</th>
                <th className="px-4 py-2 text-right font-medium">보상</th>
                <th className="px-4 py-2 text-center font-medium">처리</th>
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
                          title={soldOut ? '선착순 한도 도달' : undefined}
                          className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
                        >
                          승인
                        </button>
                        <button
                          onClick={() => act(r.usr_id, 'reject')}
                          disabled={busy === r.usr_id}
                          className="hover:bg-muted rounded-lg border px-3 py-1 text-xs font-medium disabled:opacity-40"
                        >
                          거절
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
