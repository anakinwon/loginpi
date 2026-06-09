'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function toLocalDateStr(d: Date): string {
  return d.toLocaleDateString('sv-SE') // YYYY-MM-DD (ISO 8601 로컬)
}

function todayStr(): string {
  return toLocalDateStr(new Date())
}

function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return toLocalDateStr(d)
}

interface RunResult {
  date: string
  ok: boolean
  msg?: string
}

interface BackfillResult {
  total: number
  failed: number
  failedDates: string[]
}

export function BatchRunner() {
  const t = useTranslations('admin.batch')

  const [running, setRunning] = useState(false)
  const [dateInput, setDateInput] = useState(todayStr())
  const [lastResult, setLastResult] = useState<RunResult | null>(null)

  const [backfillFrom, setBackfillFrom] = useState(yesterdayStr())
  const [backfillTo, setBackfillTo] = useState(todayStr())
  const [backfillRunning, setBackfillRunning] = useState(false)
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null)

  async function runAggregate(date: string) {
    setRunning(true)
    setLastResult(null)
    try {
      const res = await piFetch('/api/admin/stats/aggregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      if (res.ok) {
        setLastResult({ date, ok: true })
        toast.success(t('success', { date }))
      } else {
        const { error } = (await res.json()) as { error?: string }
        setLastResult({ date, ok: false, msg: error })
        toast.error(t('error', { msg: error ?? res.status }))
      }
    } catch {
      setLastResult({ date, ok: false, msg: 'network error' })
      toast.error(t('error', { msg: 'network error' }))
    } finally {
      setRunning(false)
    }
  }

  async function runBackfill() {
    setBackfillRunning(true)
    setBackfillResult(null)
    try {
      const res = await piFetch('/api/admin/stats/aggregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backfill: true, from: backfillFrom, to: backfillTo }),
      })
      const data = (await res.json()) as BackfillResult & { error?: string }
      if (res.ok) {
        setBackfillResult(data)
        toast.success(t('backfillSuccess', { total: data.total, failed: data.failed }))
      } else {
        toast.error(t('error', { msg: data.error ?? res.status }))
      }
    } catch {
      toast.error(t('error', { msg: 'network error' }))
    } finally {
      setBackfillRunning(false)
    }
  }

  return (
    <div className='space-y-6'>
      {/* 빠른 실행 */}
      <div className='rounded-lg border p-5 space-y-4'>
        <div className='flex flex-wrap gap-2'>
          <Button
            onClick={() => runAggregate(todayStr())}
            disabled={running}
            variant='default'
          >
            {running ? t('running') : t('runToday')}
          </Button>
          <Button
            onClick={() => runAggregate(yesterdayStr())}
            disabled={running}
            variant='outline'
          >
            {t('runYesterday')}
          </Button>
        </div>

        {/* 특정 날짜 */}
        <div className='flex items-end gap-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='agg-date'>{t('runDate')}</Label>
            <Input
              id='agg-date'
              type='date'
              value={dateInput}
              onChange={e => setDateInput(e.target.value)}
              disabled={running}
              className='w-44'
            />
          </div>
          <Button
            onClick={() => runAggregate(dateInput)}
            disabled={running || !dateInput}
            variant='outline'
          >
            {t('runBtn')}
          </Button>
        </div>

        {/* 단일 실행 결과 */}
        {lastResult && (
          <div className={`rounded-md px-4 py-2 text-sm ${lastResult.ok ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
            {lastResult.ok
              ? t('success', { date: lastResult.date })
              : t('error', { msg: lastResult.msg ?? '' })}
          </div>
        )}
      </div>

      {/* 기간 백필 */}
      <div className='rounded-lg border p-5 space-y-4'>
        <div>
          <p className='text-sm font-semibold'>{t('backfillTitle')}</p>
          <p className='text-muted-foreground text-xs mt-0.5'>{t('backfillDesc')}</p>
        </div>

        <div className='flex flex-wrap items-end gap-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='bf-from'>{t('from')}</Label>
            <Input
              id='bf-from'
              type='date'
              value={backfillFrom}
              onChange={e => setBackfillFrom(e.target.value)}
              disabled={backfillRunning}
              className='w-44'
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='bf-to'>{t('to')}</Label>
            <Input
              id='bf-to'
              type='date'
              value={backfillTo}
              onChange={e => setBackfillTo(e.target.value)}
              disabled={backfillRunning}
              className='w-44'
            />
          </div>
          <Button
            onClick={runBackfill}
            disabled={backfillRunning || !backfillFrom || !backfillTo}
            variant='outline'
          >
            {backfillRunning ? t('backfillRunning') : t('backfillRun')}
          </Button>
        </div>

        {/* 백필 결과 */}
        {backfillResult && (
          <div className='rounded-md bg-muted px-4 py-3 text-sm space-y-1'>
            <p>{t('backfillSuccess', { total: backfillResult.total, failed: backfillResult.failed })}</p>
            {backfillResult.failedDates.length > 0 && (
              <p className='text-destructive text-xs'>
                실패 날짜: {backfillResult.failedDates.join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
