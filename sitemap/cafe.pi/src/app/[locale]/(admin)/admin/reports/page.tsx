'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
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

const STATUS_CODES = ['PENDING', 'REVIEWING', 'RESOLVED', 'REJECTED'] as const
const STATUS_FILTERS = ['', ...STATUS_CODES] as const

export default function ReportsPage() {
  const t = useTranslations('adminMgmt.reports')
  const tc = useTranslations('common')
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
      toast.error(t('loadFail'))
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
      toast.error(t('saveFail'))
      void load()
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 30))

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('subtitle', { total: total.toLocaleString() })}
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
            {s === '' ? tc('all') : t(`status.${s}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground p-6 text-sm">{tc('fetching')}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          {t('empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.rpt_id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="bg-muted rounded px-1.5 py-0.5 text-xs">
                  {t.has(`target.${r.target_tp_cd}`)
                    ? t(`target.${r.target_tp_cd}`)
                    : r.target_tp_cd}
                </span>
                <span className="font-medium">
                  {t.has(`reason.${r.reason_cd}`)
                    ? t(`reason.${r.reason_cd}`)
                    : r.reason_cd}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t('reporter', { name: r.reporter_nm })} ·{' '}
                  {new Date(r.reg_dtm).toLocaleString()}
                </span>
              </div>
              {r.reason_txt && (
                <p className="text-muted-foreground bg-muted/30 rounded p-2 text-xs">
                  {r.reason_txt}
                </p>
              )}
              <p className="text-muted-foreground text-[11px]">
                {t('targetId')} <code>{r.target_id}</code>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={r.status_cd}
                  onChange={(e) =>
                    patch(r.rpt_id, { status_cd: e.target.value })
                  }
                  className="border-input bg-background rounded-md border px-2 py-1 text-xs"
                >
                  {STATUS_CODES.map((v) => (
                    <option key={v} value={v}>
                      {t(`status.${v}`)}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  defaultValue={r.admin_memo ?? ''}
                  placeholder={t('memoPlaceholder')}
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
