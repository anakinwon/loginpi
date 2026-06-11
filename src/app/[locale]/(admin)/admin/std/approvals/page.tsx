'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ApprovalRow {
  apv_id: string
  entity_type: string
  entity_id: string
  entity_nm: string | null
  apv_status: string
  req_data: Record<string, unknown> | null
  req_by: string | null
  req_at: string | null
  decided_by: string | null
  decided_at: string | null
  reject_reason: string | null
  reg_dtm: string
}

const STATUS_STYLE: Record<string, string> = {
  PENDING:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  APPROVED:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

export default function StdApprovalsPage() {
  const t = useTranslations('admin.std.approvals')
  const tc = useTranslations('common')

  const STATUS_LABELS: Record<string, string> = {
    PENDING: t('status.pending'),
    APPROVED: t('status.approved'),
    REJECTED: t('status.rejected'),
  }

  const ENTITY_LABELS: Record<string, string> = {
    STD_DIC: t('entity.stdDic'),
    STD_DOM: t('entity.stdDom'),
    STD_TERM: t('entity.stdTerm'),
  }

  const [approvals, setApprovals] = useState<ApprovalRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [entityFilter, setEntityFilter] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({
      status: statusFilter,
      page: String(page),
    })
    if (entityFilter) params.set('entity_type', entityFilter)
    fetch(`/api/admin/std/approvals?${params}`)
      .then((r) => r.json())
      .then((d: { approvals: ApprovalRow[]; total: number }) => {
        setApprovals(d.approvals ?? [])
        setTotal(d.total ?? 0)
      })
      .finally(() => setLoading(false))
  }, [statusFilter, entityFilter, page])

  useEffect(() => {
    load()
  }, [load])

  async function decide(
    apvId: string,
    action: 'approve' | 'reject',
    reason?: string,
  ) {
    setProcessing(apvId)
    try {
      const res = await fetch(`/api/admin/std/approvals/${apvId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reject_reason: reason }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('processFail'))
      }
      toast.success(
        action === 'approve' ? t('approveSuccess') : t('rejectSuccess'),
      )
      setRejectId(null)
      setRejectReason('')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc('error'))
    } finally {
      setProcessing(null)
    }
  }

  const totalPages = Math.ceil(total / 30)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('totalCount', { count: total.toLocaleString() })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['PENDING', 'APPROVED', 'REJECTED', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s)
              setPage(1)
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {s === 'all' ? t('status.all') : STATUS_LABELS[s]}
          </button>
        ))}
        <select
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value)
            setPage(1)
          }}
          className="border-input bg-background h-7 rounded-full border px-3 text-xs"
        >
          <option value="">{t('allTypes')}</option>
          {Object.entries(ENTITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">{tc('loading')}</p>
      ) : approvals.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {statusFilter === 'PENDING' ? t('noPending') : t('noData')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.requestedAt')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.type')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.target')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.requestedBy')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.status')}
                </th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {approvals.map((apv) => (
                <Fragment key={apv.apv_id}>
                  <tr className="hover:bg-muted/30 transition-colors">
                    <td className="text-muted-foreground px-4 py-3 font-mono text-xs whitespace-nowrap">
                      {new Date(apv.reg_dtm).toLocaleString('ko-KR')}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      {ENTITY_LABELS[apv.entity_type] ?? apv.entity_type}
                    </td>
                    <td className="max-w-40 truncate px-4 py-3 font-medium">
                      {apv.entity_nm ?? apv.entity_id}
                    </td>
                    <td className="text-muted-foreground max-w-32 truncate px-4 py-3 font-mono text-xs">
                      {apv.req_by ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[apv.apv_status] ?? ''}`}
                      >
                        {STATUS_LABELS[apv.apv_status] ?? apv.apv_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {apv.apv_status === 'PENDING' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs text-green-700 hover:text-green-700"
                              disabled={processing === apv.apv_id}
                              onClick={() => decide(apv.apv_id, 'approve')}
                            >
                              {t('approve')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive h-6 px-2 text-xs"
                              disabled={processing === apv.apv_id}
                              onClick={() => {
                                setRejectId(apv.apv_id)
                                setRejectReason('')
                              }}
                            >
                              {t('reject')}
                            </Button>
                          </>
                        )}
                        <button
                          className="text-muted-foreground hover:text-foreground ml-1 text-xs"
                          onClick={() =>
                            setExpanded((p) =>
                              p === apv.apv_id ? null : apv.apv_id,
                            )
                          }
                        >
                          {expanded === apv.apv_id ? '▲' : '▼'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {rejectId === apv.apv_id && (
                    <tr className="bg-red-50/30 dark:bg-red-900/10">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder={t('rejectReasonPlaceholder')}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="h-8 max-w-sm text-sm"
                          />
                          <Button
                            size="sm"
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground h-8"
                            disabled={
                              !rejectReason.trim() || processing === apv.apv_id
                            }
                            onClick={() =>
                              decide(apv.apv_id, 'reject', rejectReason)
                            }
                          >
                            {t('rejectConfirm')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setRejectId(null)}
                          >
                            {tc('cancel')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {expanded === apv.apv_id && (
                    <tr className="bg-muted/20">
                      <td colSpan={6} className="space-y-2 px-4 py-3 text-xs">
                        {apv.reject_reason && (
                          <p className="text-destructive">
                            {t('rejectReason', { reason: apv.reject_reason })}
                          </p>
                        )}
                        {apv.decided_by && (
                          <p className="text-muted-foreground">
                            {t('decidedBy', {
                              name: apv.decided_by,
                              date: apv.decided_at
                                ? new Date(apv.decided_at).toLocaleString(
                                    'ko-KR',
                                  )
                                : '',
                            })}
                          </p>
                        )}
                        {apv.req_data && (
                          <div>
                            <p className="text-muted-foreground mb-1 font-semibold">
                              {t('requestData')}
                            </p>
                            <pre className="bg-muted max-h-48 overflow-x-auto rounded p-2 font-mono">
                              {JSON.stringify(apv.req_data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {tc('prev')}
          </Button>
          <span className="text-muted-foreground text-sm">
            {tc('pageOf', { current: page, total: totalPages })}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {tc('next')}
          </Button>
        </div>
      )}
    </div>
  )
}
