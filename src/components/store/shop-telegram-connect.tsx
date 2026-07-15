'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

interface Status {
  connected: boolean
  botConfigured: boolean
  url: string | null
  groupUrl: string | null
}

// 매장별 Telegram 주문 알림 연동 (매장당 1:1) — 매장 수정 화면에 삽입.
//   기존 사용자(프로필) 연동과 별개로, 이 매장의 주문만 지정한 Telegram으로 받는다.
export function ShopTelegramConnect({ shopId }: { shopId: string }) {
  const t = useTranslations('store')
  const tc = useTranslations('common')
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await piFetch(`/api/store/shops/${shopId}/telegram`)
      if (res.ok) setStatus((await res.json()) as Status)
    } catch {
      // 비치명적
    }
  }, [shopId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const disconnect = useCallback(async () => {
    setBusy(true)
    try {
      await piFetch(`/api/store/shops/${shopId}/telegram`, { method: 'DELETE' })
      await refresh()
      setHint(null)
      toast.success(t('tlgm.disconnected'))
    } finally {
      setBusy(false)
    }
  }, [shopId, refresh])

  if (!status) return null

  return (
    <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/20">
      <p className="text-sm font-medium">{t('tlgm.title')}</p>

      {!status.botConfigured ? (
        <p className="text-muted-foreground text-xs">{t('tlgm.botNotReady')}</p>
      ) : status.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-green-600 dark:text-green-400">
            {t('tlgm.connected')}
          </span>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="text-destructive text-xs underline underline-offset-2 disabled:opacity-50"
          >
            {busy ? tc('processing') : t('tlgm.disconnect')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">{t('tlgm.desc')}</p>
          <p className="text-muted-foreground text-xs">{t('tlgm.groupDesc')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (!status.groupUrl) return
                window.open(status.groupUrl, '_blank', 'noopener,noreferrer')
                setHint(t('tlgm.groupHint'))
              }}
              className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
            >
              {t('tlgm.groupConnect')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!status.url) return
                window.open(status.url, '_blank', 'noopener,noreferrer')
                setHint(t('tlgm.hint'))
              }}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
            >
              {t('tlgm.connect')}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              className="text-primary text-xs underline underline-offset-2"
            >
              {t('tlgm.refresh')}
            </button>
          </div>
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        </div>
      )}
    </div>
  )
}
