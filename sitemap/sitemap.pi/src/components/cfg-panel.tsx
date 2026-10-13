'use client'
// 관리자 운영 설정 탭 — sys_cfg 타이머 3종(시간) 조회·변경(/api/admin/cfg, piFetch). 키별 입력 + 저장, 마지막 변경 시각 표시
import { useCallback, useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'

type CfgKey =
  | 'SITE_PAY_TIMEOUT_HOUR'
  | 'SITE_USE_BGN_DELAY_HOUR'
  | 'SITE_REAPLY_WINDOW_HOUR'
interface CfgRow {
  cfg_key: CfgKey
  cfg_val: number
  cfg_desc: string | null
  mod_dtm: string
}
// 서버 CFG_HOUR_MIN/MAX 와 동일(src/lib/cfg.ts) — 클라이언트는 입력 보조, 판정은 서버
const MIN = 0.01
const MAX = 720

export function CfgPanel() {
  const t = useTranslations('cfg')
  const fmt = useFormatter()
  const errText = useApiErrorText()
  const [rows, setRows] = useState<CfgRow[] | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await readApi<{ items: CfgRow[] }>(piFetch('/api/admin/cfg'))
    if (r.ok) {
      setRows(r.data.items)
      setDraft(
        Object.fromEntries(
          r.data.items.map((x) => [x.cfg_key, String(x.cfg_val)]),
        ),
      )
    } else setError(r.body)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const save = async (key: CfgKey) => {
    const val = Number(draft[key])
    if (!Number.isFinite(val) || val < MIN || val > MAX)
      return setError({ code: 'INVALID_INPUT' })
    setBusy(key)
    setError(null)
    setSaved(null)
    const r = await readApi<{ items: CfgRow[] }>(
      piFetch('/api/admin/cfg', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, val }),
      }),
    )
    setBusy(null)
    if (r.ok) {
      setRows(r.data.items)
      setSaved(key)
    } else setError(r.body)
  }

  if (error && !rows)
    return (
      <p className="text-destructive text-sm" role="alert">
        {errText(error)}
      </p>
    )
  if (!rows)
    return <p className="text-muted-foreground text-sm">{t('loading')}</p>

  return (
    <section className="flex max-w-xl flex-col gap-3">
      <p className="text-muted-foreground text-sm">{t('intro')}</p>
      {rows.map((r) => (
        <div key={r.cfg_key} className="card flex flex-col gap-2">
          <label className="label" htmlFor={`cfg-${r.cfg_key}`}>
            {t(r.cfg_key)}
          </label>
          <p className="text-muted-foreground text-xs">
            {t(`${r.cfg_key}_hint`)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`cfg-${r.cfg_key}`}
              className="input w-32"
              type="number"
              inputMode="decimal"
              min={MIN}
              max={MAX}
              step={0.01}
              value={draft[r.cfg_key] ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [r.cfg_key]: e.target.value }))
              }
            />
            <span className="text-sm">{t('hourUnit')}</span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                busy === r.cfg_key || draft[r.cfg_key] === String(r.cfg_val)
              }
              onClick={() => void save(r.cfg_key)}
            >
              {t('save')}
            </button>
            {saved === r.cfg_key && (
              <span className="text-xs text-emerald-600" role="status">
                {t('saved')}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('current', { val: r.cfg_val })}
            {r.mod_dtm
              ? ` · ${t('modAt', { time: fmt.dateTime(new Date(r.mod_dtm), { dateStyle: 'short', timeStyle: 'short' }) })}`
              : ''}
          </p>
        </div>
      ))}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {errText(error)}
        </p>
      )}
    </section>
  )
}
