'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'

interface BatchLog {
  batch_log_id: number
  job_nm: string
  trigger_cd: 'CRON' | 'MANUAL' | 'BACKFILL'
  from_dt: string | null
  to_dt: string | null
  start_dtm: string
  end_dtm: string
  success_yn: 'Y' | 'N'
  total_cnt: number
  failed_cnt: number
  result_msg: string | null
  regr_id: string
}

const TRIGGER_KEY = {
  CRON: 'triggerCron',
  MANUAL: 'triggerManual',
  BACKFILL: 'triggerBackfill',
} as const

function formatDtm(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE') // YYYY-MM-DD HH:mm:ss (로컬)
}

function durationSec(start: string, end: string): string {
  const sec = (new Date(end).getTime() - new Date(start).getTime()) / 1000
  return sec < 1 ? '<1s' : `${Math.round(sec)}s`
}

export function BatchLogTable() {
  const t = useTranslations('admin.batch')
  const [logs, setLogs] = useState<BatchLog[] | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await piFetch('/api/admin/batch/logs?limit=50')
      if (res.ok) {
        const data = (await res.json()) as { logs: BatchLog[] }
        setLogs(data.logs)
      }
    } catch {
      // 네트워크 오류 — 기존 목록 유지
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4 rounded-lg border p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{t('logTitle')}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">{t('logDesc')}</p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline" size="sm">
          {loading ? t('logLoading') : t('logRefresh')}
        </Button>
      </div>

      {logs === null ? (
        <p className="text-muted-foreground text-sm">{t('logLoading')}</p>
      ) : logs.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('logEmpty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3 font-medium">{t('logColStart')}</th>
                <th className="py-2 pr-3 font-medium">{t('logColTrigger')}</th>
                <th className="py-2 pr-3 font-medium">{t('logColPeriod')}</th>
                <th className="py-2 pr-3 font-medium">{t('logColResult')}</th>
                <th className="py-2 pr-3 font-medium">{t('logColDays')}</th>
                <th className="py-2 pr-3 font-medium">{t('logColDuration')}</th>
                <th className="py-2 pr-3 font-medium">{t('logColRunner')}</th>
                <th className="py-2 font-medium">{t('logColMsg')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.batch_log_id} className="border-b last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {formatDtm(log.start_dtm)}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        log.trigger_cd === 'CRON'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {t(TRIGGER_KEY[log.trigger_cd])}
                    </span>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {log.from_dt === log.to_dt
                      ? log.from_dt
                      : `${log.from_dt} ~ ${log.to_dt}`}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        log.success_yn === 'Y'
                          ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {log.success_yn === 'Y' ? t('logSuccess') : t('logFail')}
                    </span>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {log.failed_cnt > 0
                      ? `${log.total_cnt} (${t('logFailedCnt', { failed: log.failed_cnt })})`
                      : log.total_cnt}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {durationSec(log.start_dtm, log.end_dtm)}
                  </td>
                  <td className="py-2 pr-3">{log.regr_id}</td>
                  <td className="text-muted-foreground py-2 text-xs break-all">
                    {log.result_msg ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
