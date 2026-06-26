'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'

interface Status {
  connected: boolean
  botConfigured: boolean
  url: string | null
}

// 가이드 단계의 <b> 강조어를 실제 굵게 렌더 (t.rich 청크)
const richB = { b: (chunks: React.ReactNode) => <b>{chunks}</b> }

// 판매자 Telegram 알림 연동 — 주문 발생 시 Telegram으로 알림을 받기 위한 1회 연동.
export function TelegramConnect() {
  const t = useTranslations('profile')
  const tc = useTranslations('common')
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  function refresh() {
    return piFetch('/api/auth/telegram')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatus(d))
      .catch(() => {})
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  function openBot() {
    if (!status?.url) return
    window.open(status.url, '_blank', 'noopener,noreferrer')
    setHint(t('telegram.hint'))
  }

  async function confirm() {
    setBusy(true)
    await refresh()
    setBusy(false)
  }

  async function disconnect() {
    setBusy(true)
    await piFetch('/api/auth/telegram', { method: 'DELETE' })
    await refresh()
    setHint(null)
    setBusy(false)
  }

  return (
    <section className="space-y-3 rounded-2xl border-2 border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-700/50 dark:bg-amber-950/20">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{t('telegram.title')}</h2>
        <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">
          {t('telegram.recommended')}
        </span>
      </div>
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        {t('telegram.desc')}
      </p>

      <div className="bg-card rounded-xl border p-4">
        {loading ? (
          <p className="text-muted-foreground text-sm">{tc('loading')}</p>
        ) : !status?.botConfigured ? (
          <p className="text-muted-foreground text-sm">
            {t('telegram.botNotReady')}
          </p>
        ) : status.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-green-600">
              {t('telegram.connected')}
            </span>
            <button
              onClick={disconnect}
              disabled={busy}
              className="text-destructive text-sm underline underline-offset-2 disabled:opacity-50"
            >
              {busy ? tc('processing') : t('telegram.disconnect')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={openBot}
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            >
              {t('telegram.openBot')}
            </button>
            <div>
              <button
                onClick={confirm}
                disabled={busy}
                className="text-primary text-sm underline underline-offset-2 disabled:opacity-50"
              >
                {busy ? t('telegram.confirming') : t('telegram.confirm')}
              </button>
            </div>
            {hint && <p className="text-muted-foreground text-xs">{hint}</p>}

            <details className="bg-muted/40 rounded-lg p-3 text-xs">
              <summary className="text-foreground cursor-pointer font-medium select-none">
                {t('telegram.guideSummary')}
              </summary>
              <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-4">
                <li>{t.rich('telegram.guideStep1', richB)}</li>
                <li>{t.rich('telegram.guideStep2', richB)}</li>
                <li>{t.rich('telegram.guideStep3', richB)}</li>
                <li>{t.rich('telegram.guideStep4', richB)}</li>
              </ol>
              <p className="text-muted-foreground mt-3">
                {t.rich('telegram.guideFooter', richB)}
              </p>
            </details>
          </div>
        )}
      </div>
    </section>
  )
}
