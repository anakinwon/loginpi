'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { AdminPagination } from '@/components/admin/admin-pagination'

interface Row {
  rpt_id: string
  reporter_id: string
  reporter_nm: string
  target_tp_cd: string
  target_id: string
  reason_cd: string
  reason_txt: string | null
  status_cd: string
  admin_memo: string | null
  reg_dtm: string
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: '접수',
  REVIEWING: '검토중',
  RESOLVED: '조치완료',
  REJECTED: '반려',
}
const REASON_LABEL: Record<string, string> = {
  SPAM: '스팸·광고',
  ABUSE: '욕설·괴롭힘',
  SEXUAL: '음란·선정성',
  PRIVACY: '개인정보',
  COPYRIGHT: '저작권',
  FRAUD: '사기·거래',
  ETC: '기타',
}
const TARGET_LABEL: Record<string, string> = {
  POST: '게시물',
  COMMENT: '댓글',
  SHOP: '상점',
  USER: '사용자',
  CHAT: '채팅',
}
const STATUS_FILTERS = [
  '',
  'PENDING',
  'REVIEWING',
  'RESOLVED',
  'REJECTED',
] as const

export default function ReportsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (status) params.set('status', status)
      const res = await piFetch(`/api/admin/reports?${params}`)
      if (!res.ok) throw new Error()
      const d = (await res.json()) as { rows: Row[]; total: number }
      setRows(d.rows)
      setTotal(d.total)
    } catch {
      toast.error('신고 내역을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => {
    void load()
  }, [load])

  async function patch(
    rpt_id: string,
    body: { status_cd?: string; admin_memo?: string },
  ) {
    setRows((prev) =>
      prev.map((r) => (r.rpt_id === rpt_id ? { ...r, ...body } : r)),
    )
    try {
      const res = await piFetch('/api/admin/reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rpt_id, ...body }),
      })
      if (!res.ok) throw new Error()
    } catch {
      toast.error('저장 실패')
      void load()
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 30))

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold">🚨 신고 처리</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          커뮤니티 신고 접수·처리 (총 {total.toLocaleString()}건)
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setPage(1)
              setStatus(s)
            }}
            className={`rounded-full border px-3 py-1 text-xs ${status === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            {s === '' ? '전체' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground p-6 text-sm">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          신고 내역이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.rpt_id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="bg-muted rounded px-1.5 py-0.5 text-xs">
                  {TARGET_LABEL[r.target_tp_cd] ?? r.target_tp_cd}
                </span>
                <span className="font-medium">
                  {REASON_LABEL[r.reason_cd] ?? r.reason_cd}
                </span>
                <span className="text-muted-foreground text-xs">
                  신고자 {r.reporter_nm} ·{' '}
                  {new Date(r.reg_dtm).toLocaleString()}
                </span>
              </div>
              {r.reason_txt && (
                <p className="text-muted-foreground bg-muted/30 rounded p-2 text-xs">
                  {r.reason_txt}
                </p>
              )}
              <p className="text-muted-foreground text-[11px]">
                대상 ID: <code>{r.target_id}</code>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={r.status_cd}
                  onChange={(e) =>
                    patch(r.rpt_id, { status_cd: e.target.value })
                  }
                  className="border-input bg-background rounded-md border px-2 py-1 text-xs"
                >
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  defaultValue={r.admin_memo ?? ''}
                  placeholder="처리 메모"
                  onBlur={(e) => {
                    if (e.target.value !== (r.admin_memo ?? ''))
                      patch(r.rpt_id, { admin_memo: e.target.value })
                  }}
                  className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1 text-xs"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <AdminPagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  )
}
