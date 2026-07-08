'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { DistCfgRow } from '@/lib/mps-dist-cfg'

const PRESETS = [5, 10, 20, 30, 50, 100, 0] as const

interface HistoryResp {
  history: DistCfgRow[]
}

export default function DistanceCfgPage() {
  const t = useTranslations('adminMgmt.distanceCfg')
  const tc = useTranslations('common')
  const [history, setHistory] = useState<DistCfgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [km, setKm] = useState(50)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/admin/store/distance-cfg')
      .then((r) => r.json() as Promise<HistoryResp>)
      .then((d) => {
        setHistory(d.history ?? [])
        if (d.history?.length) setKm(d.history[0].max_dist_km)
      })
      .catch(() => setErr(t('loadFail')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setErr(null)
    try {
      const res = await fetch('/api/admin/store/distance-cfg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_dist_km: km, note_txt: note }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '저장 실패')
      }
      setSaved(true)
      setNote('')
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const current = history[0]
  const unchanged = current ? current.max_dist_km === km : false

  const labelKm = (v: number) => (v === 0 ? t('unlimited') : `${v}km`)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('subtitleLine1')}
          <br />
          {t('subtitleLine2')}
        </p>
      </div>

      {/* 현재 설정 배지 */}
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-sm">
          {t('currentApplied')}
        </span>
        {loading ? (
          <span className="text-muted-foreground text-sm">
            {tc('fetching')}
          </span>
        ) : (
          <span className="rounded-full bg-blue-100 px-4 py-1 text-base font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            {current ? labelKm(current.max_dist_km) : '—'}
          </span>
        )}
      </div>

      {err && <p className="text-sm text-red-500">⚠ {err}</p>}

      {/* 설정 카드 */}
      <div className="bg-card rounded-2xl border p-6 shadow-sm">
        <p className="mb-4 text-sm font-semibold">{t('newLimitTitle')}</p>

        {/* 프리셋 버튼 */}
        <div className="mb-5 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setKm(p)}
              className={`flex flex-col items-center rounded-xl border px-4 py-2 text-xs transition-colors ${
                km === p
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:border-muted-foreground/40'
              }`}
            >
              <span className="text-sm font-bold">{labelKm(p)}</span>
              <span className="mt-0.5 text-[10px] opacity-70">
                {t(`preset.${p}`)}
              </span>
            </button>
          ))}
        </div>

        {/* 슬라이더 */}
        <div className="mb-2 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('unlimitedZero')}</span>
            <span className="font-bold tabular-nums">
              {km === 0 ? t('unlimited') : `${km} km`}
            </span>
            <span className="text-muted-foreground">200km</span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={km}
            onChange={(e) => setKm(Number(e.target.value))}
            className="w-full accent-blue-600"
          />
        </div>

        {/* 직접 입력 */}
        <div className="mb-5 flex items-center gap-2">
          <input
            ref={inputRef}
            type="number"
            min={0}
            max={200}
            step={1}
            value={km}
            onChange={(e) => {
              const v = Math.max(0, Math.min(200, Number(e.target.value)))
              setKm(isNaN(v) ? 0 : v)
            }}
            className="border-input bg-background w-28 rounded-lg border px-3 py-1.5 text-right text-sm tabular-nums focus:ring-2 focus:outline-none"
          />
          <span className="text-sm">km</span>
          {km === 0 && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {t('unlimitedMode')}
            </span>
          )}
        </div>

        {/* 변경 사유 */}
        <div className="mb-5">
          <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            {t('changeReason')}
          </label>
          <input
            type="text"
            maxLength={200}
            placeholder={t('changeReasonPlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="border-input bg-background w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>

        {/* 저장 영역 */}
        <div className="flex items-center gap-3">
          <Button
            disabled={saving || unchanged}
            onClick={handleSave}
            className="px-6"
          >
            {saving ? tc('saving') : tc('save')}
          </Button>
          {unchanged && (
            <span className="text-muted-foreground text-xs">
              {t('sameValue')}
            </span>
          )}
          {saved && !unchanged && (
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              {t('savedApplied')}
            </span>
          )}
        </div>
      </div>

      {/* 안내 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        {t.rich('notice', { strong: (c) => <strong>{c}</strong> })}
      </div>

      {/* 변경 이력 */}
      {history.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold">{t('historyTitle')}</h2>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">
                    {t('colDistLimit')}
                  </th>
                  <th className="px-4 py-2 text-left font-medium">
                    {t('colReason')}
                  </th>
                  <th className="px-4 py-2 text-left font-medium">
                    {t('colChanger')}
                  </th>
                  <th className="px-4 py-2 text-left font-medium">
                    {t('colChangedAt')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((row, i) => (
                  <tr
                    key={row.cfg_id}
                    className={`transition-colors ${i === 0 ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'hover:bg-muted/30'}`}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          row.max_dist_km === 0
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        }`}
                      >
                        {labelKm(row.max_dist_km)}
                      </span>
                      {i === 0 && (
                        <span className="ml-2 text-[10px] font-medium text-blue-600">
                          {t('current')}
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground max-w-xs truncate px-4 py-3 text-xs">
                      {row.note_txt ?? '—'}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 font-mono text-xs">
                      {row.modr_id.slice(0, 8)}…
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                      {new Date(row.reg_dtm).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
