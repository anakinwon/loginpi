'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ApprovalRow {
  apv_id:        string
  entity_type:   string
  entity_id:     string
  entity_nm:     string | null
  apv_status:    string
  req_data:      Record<string, unknown> | null
  req_by:        string | null
  req_at:        string | null
  decided_by:    string | null
  decided_at:    string | null
  reject_reason: string | null
  reg_dtm:       string
}

const STATUS_LABELS: Record<string, string> = {
  PENDING:  '대기',
  APPROVED: '승인',
  REJECTED: '반려',
}

const STATUS_STYLE: Record<string, string> = {
  PENDING:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const ENTITY_LABELS: Record<string, string> = {
  STD_DIC:  '표준단어',
  STD_DOM:  '표준도메인',
  STD_TERM: '표준용어',
}

export default function StdApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRow[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [entityFilter, setEntityFilter] = useState('')
  const [page, setPage]           = useState(1)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [rejectId, setRejectId]   = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ status: statusFilter, page: String(page) })
    if (entityFilter) params.set('entity_type', entityFilter)
    fetch(`/api/admin/std/approvals?${params}`)
      .then((r) => r.json())
      .then((d: { approvals: ApprovalRow[]; total: number }) => {
        setApprovals(d.approvals ?? [])
        setTotal(d.total ?? 0)
      })
      .finally(() => setLoading(false))
  }, [statusFilter, entityFilter, page])

  useEffect(() => { load() }, [load])

  async function decide(apvId: string, action: 'approve' | 'reject', reason?: string) {
    setProcessing(apvId)
    try {
      const res = await fetch(`/api/admin/std/approvals/${apvId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reject_reason: reason }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '처리 실패')
      }
      toast.success(action === 'approve' ? '승인됐습니다' : '반려됐습니다')
      setRejectId(null)
      setRejectReason('')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
    } finally {
      setProcessing(null)
    }
  }

  const totalPages = Math.ceil(total / 30)

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-bold'>승인 워크플로우</h1>
        <p className='text-muted-foreground mt-1 text-sm'>전체 {total.toLocaleString()}건</p>
      </div>

      {/* 상태 필터 칩 */}
      <div className='flex flex-wrap gap-2'>
        {(['PENDING', 'APPROVED', 'REJECTED', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1) }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {s === 'all' ? '전체' : STATUS_LABELS[s]}
          </button>
        ))}
        <select
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(1) }}
          className='border-input bg-background h-7 rounded-full border px-3 text-xs'
        >
          <option value=''>모든 유형</option>
          {Object.entries(ENTITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className='text-muted-foreground text-sm'>로딩 중…</p>
      ) : approvals.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {statusFilter === 'PENDING' ? '대기 중인 승인 요청이 없습니다.' : '데이터가 없습니다.'}
        </p>
      ) : (
        <div className='rounded-lg border overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>요청일시</th>
                <th className='text-left px-4 py-2 font-medium'>유형</th>
                <th className='text-left px-4 py-2 font-medium'>대상</th>
                <th className='text-left px-4 py-2 font-medium'>요청자</th>
                <th className='text-left px-4 py-2 font-medium'>상태</th>
                <th className='px-4 py-2'></th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {approvals.map((apv) => (
                <Fragment key={apv.apv_id}>
                  <tr
                    className='hover:bg-muted/30 transition-colors'
                  >
                    <td className='px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap'>
                      {new Date(apv.reg_dtm).toLocaleString('ko-KR')}
                    </td>
                    <td className='px-4 py-3 text-xs text-muted-foreground'>
                      {ENTITY_LABELS[apv.entity_type] ?? apv.entity_type}
                    </td>
                    <td className='px-4 py-3 font-medium max-w-40 truncate'>
                      {apv.entity_nm ?? apv.entity_id}
                    </td>
                    <td className='px-4 py-3 font-mono text-xs text-muted-foreground max-w-32 truncate'>
                      {apv.req_by ?? '—'}
                    </td>
                    <td className='px-4 py-3'>
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[apv.apv_status] ?? ''}`}>
                        {STATUS_LABELS[apv.apv_status] ?? apv.apv_status}
                      </span>
                    </td>
                    <td className='px-4 py-3'>
                      <div className='flex items-center gap-1'>
                        {apv.apv_status === 'PENDING' && (
                          <>
                            <Button
                              size='sm' variant='outline'
                              className='h-6 px-2 text-xs text-green-700 hover:text-green-700'
                              disabled={processing === apv.apv_id}
                              onClick={() => decide(apv.apv_id, 'approve')}
                            >
                              승인
                            </Button>
                            <Button
                              size='sm' variant='outline'
                              className='h-6 px-2 text-xs text-destructive hover:text-destructive'
                              disabled={processing === apv.apv_id}
                              onClick={() => { setRejectId(apv.apv_id); setRejectReason('') }}
                            >
                              반려
                            </Button>
                          </>
                        )}
                        <button
                          className='text-muted-foreground text-xs hover:text-foreground ml-1'
                          onClick={() => setExpanded((p) => (p === apv.apv_id ? null : apv.apv_id))}
                        >
                          {expanded === apv.apv_id ? '▲' : '▼'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* 반려 사유 입력 인라인 폼 */}
                  {rejectId === apv.apv_id && (
                    <tr className='bg-red-50/30 dark:bg-red-900/10'>
                      <td colSpan={6} className='px-4 py-3'>
                        <div className='flex items-center gap-2'>
                          <Input
                            placeholder='반려 사유를 입력해 주세요 *'
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className='max-w-sm h-8 text-sm'
                          />
                          <Button
                            size='sm'
                            className='h-8 bg-destructive hover:bg-destructive/90 text-destructive-foreground'
                            disabled={!rejectReason.trim() || processing === apv.apv_id}
                            onClick={() => decide(apv.apv_id, 'reject', rejectReason)}
                          >
                            반려 확정
                          </Button>
                          <Button size='sm' variant='outline' className='h-8' onClick={() => setRejectId(null)}>
                            취소
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* 상세 정보 펼침 */}
                  {expanded === apv.apv_id && (
                    <tr className='bg-muted/20'>
                      <td colSpan={6} className='px-4 py-3 text-xs space-y-2'>
                        {apv.reject_reason && (
                          <p className='text-destructive'>반려 사유: {apv.reject_reason}</p>
                        )}
                        {apv.decided_by && (
                          <p className='text-muted-foreground'>
                            처리자: {apv.decided_by}
                            {apv.decided_at && ` / ${new Date(apv.decided_at).toLocaleString('ko-KR')}`}
                          </p>
                        )}
                        {apv.req_data && (
                          <div>
                            <p className='font-semibold text-muted-foreground mb-1'>요청 데이터</p>
                            <pre className='rounded bg-muted p-2 overflow-x-auto font-mono max-h-48'>
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

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className='flex items-center gap-2'>
          <Button size='sm' variant='outline' disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            이전
          </Button>
          <span className='text-sm text-muted-foreground'>{page} / {totalPages}</span>
          <Button size='sm' variant='outline' disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            다음
          </Button>
        </div>
      )}
    </div>
  )
}
