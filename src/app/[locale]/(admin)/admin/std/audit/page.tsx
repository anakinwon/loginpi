'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AuditLog {
  log_id:    string
  tgt_tbl:   string
  tgt_id:    string
  action_cd: 'INSERT' | 'UPDATE' | 'DELETE'
  old_val:   Record<string, unknown> | null
  new_val:   Record<string, unknown> | null
  chgr_id:   string
  chg_dtm:   string
}

const ACTION_STYLE: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  UPDATE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

export default function StdAuditPage() {
  const t = useTranslations('admin.std.audit')
  const tc = useTranslations('common')

  const TBL_LABELS: Record<string, string> = {
    std_dic:  t('tableLabel.stdDic'),
    std_dom:  t('tableLabel.stdDom'),
    std_term: t('tableLabel.stdTerm'),
  }

  const [logs, setLogs]       = useState<AuditLog[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [tbl, setTbl]         = useState('')
  const [from, setFrom]       = useState('')
  const [to, setTo]           = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (tbl)  params.set('tbl',  tbl)
    if (from) params.set('from', from)
    if (to)   params.set('to',   to)
    fetch(`/api/admin/std/audit?${params}`)
      .then((r) => r.json())
      .then((d: { logs: AuditLog[]; total: number }) => {
        setLogs(d.logs ?? [])
        setTotal(d.total ?? 0)
      })
      .finally(() => setLoading(false))
  }, [page, tbl, from, to])

  useEffect(() => { load() }, [load])

  function toggle(id: string) {
    setExpanded((prev) => (prev === id ? null : id))
  }

  function getEntityName(log: AuditLog): string {
    const src = log.new_val ?? log.old_val
    if (!src) return log.tgt_id
    const nm =
      (src['dic_log_nm'] as string | undefined) ??
      (src['dom_nm'] as string | undefined) ??
      (src['term_log_nm'] as string | undefined)
    return nm ?? log.tgt_id
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-bold'>{t('title')}</h1>
        <p className='text-muted-foreground mt-1 text-sm'>{t('totalCount', { count: total.toLocaleString() })}</p>
      </div>

      <div className='flex flex-wrap items-end gap-3'>
        <label className='space-y-1'>
          <span className='text-xs text-muted-foreground'>{t('filter.table')}</span>
          <select
            value={tbl}
            onChange={(e) => { setTbl(e.target.value); setPage(1) }}
            className='border-input bg-background h-9 rounded-md border px-3 text-sm'
          >
            <option value=''>{t('filter.allTables')}</option>
            {Object.entries(TBL_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className='space-y-1'>
          <span className='text-xs text-muted-foreground'>{t('filter.from')}</span>
          <Input type='date' value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className='h-9 w-36' />
        </label>
        <label className='space-y-1'>
          <span className='text-xs text-muted-foreground'>{t('filter.to')}</span>
          <Input type='date' value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} className='h-9 w-36' />
        </label>
        <Button size='sm' variant='outline' onClick={() => { setTbl(''); setFrom(''); setTo(''); setPage(1) }}>
          {tc('reset')}
        </Button>
      </div>

      {loading ? (
        <p className='text-muted-foreground text-sm'>{tc('loading')}</p>
      ) : logs.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{t('noData')}</p>
      ) : (
        <div className='rounded-lg border overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>{t('col.changedAt')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.table')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.target')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.action')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.changedBy')}</th>
                <th className='px-4 py-2'></th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {logs.map((log) => (
                <Fragment key={log.log_id}>
                  <tr
                    className='hover:bg-muted/30 transition-colors cursor-pointer'
                    onClick={() => toggle(log.log_id)}
                  >
                    <td className='px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap'>
                      {new Date(log.chg_dtm).toLocaleString('ko-KR')}
                    </td>
                    <td className='px-4 py-3'>
                      <span className='text-xs text-muted-foreground'>
                        {TBL_LABELS[log.tgt_tbl] ?? log.tgt_tbl}
                      </span>
                    </td>
                    <td className='px-4 py-3 font-medium max-w-40 truncate'>
                      {getEntityName(log)}
                    </td>
                    <td className='px-4 py-3'>
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${ACTION_STYLE[log.action_cd] ?? ''}`}>
                        {log.action_cd}
                      </span>
                    </td>
                    <td className='px-4 py-3 font-mono text-xs text-muted-foreground max-w-32 truncate'>
                      {log.chgr_id}
                    </td>
                    <td className='px-4 py-3 text-muted-foreground text-xs'>
                      {expanded === log.log_id ? '▲' : '▼'}
                    </td>
                  </tr>
                  {expanded === log.log_id && (
                    <tr className='bg-muted/20'>
                      <td colSpan={6} className='px-4 py-3'>
                        <div className='grid grid-cols-2 gap-4 text-xs'>
                          {log.old_val && (
                            <div>
                              <p className='font-semibold text-muted-foreground mb-1'>{t('before')}</p>
                              <pre className='rounded bg-muted p-2 overflow-x-auto font-mono text-xs max-h-48'>
                                {JSON.stringify(log.old_val, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.new_val && (
                            <div>
                              <p className='font-semibold text-muted-foreground mb-1'>{t('after')}</p>
                              <pre className='rounded bg-muted p-2 overflow-x-auto font-mono text-xs max-h-48'>
                                {JSON.stringify(log.new_val, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
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
        <div className='flex items-center gap-2'>
          <Button size='sm' variant='outline' disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {tc('prev')}
          </Button>
          <span className='text-sm text-muted-foreground'>{tc('pageOf', { current: page, total: totalPages })}</span>
          <Button size='sm' variant='outline' disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            {tc('next')}
          </Button>
        </div>
      )}
    </div>
  )
}
