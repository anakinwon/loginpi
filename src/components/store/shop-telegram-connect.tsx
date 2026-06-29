'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

interface Status {
  connected: boolean
  botConfigured: boolean
  url: string | null
}

// 매장별 Telegram 주문 알림 연동 (매장당 1:1) — 매장 수정 화면에 삽입.
//   기존 사용자(프로필) 연동과 별개로, 이 매장의 주문만 지정한 Telegram으로 받는다.
export function ShopTelegramConnect({ shopId }: { shopId: string }) {
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
      toast.success('Telegram 연동을 해제했습니다')
    } finally {
      setBusy(false)
    }
  }, [shopId, refresh])

  if (!status) return null

  return (
    <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/20">
      <p className="text-sm font-medium">📨 Telegram 주문 알림 (이 매장 전용)</p>

      {!status.botConfigured ? (
        <p className="text-muted-foreground text-xs">
          Telegram 봇이 아직 준비되지 않았습니다.
        </p>
      ) : status.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-green-600 dark:text-green-400">
            ✓ 연동됨 — 이 매장 주문이 Telegram으로 전송됩니다
          </span>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="text-destructive text-xs underline underline-offset-2 disabled:opacity-50"
          >
            {busy ? '처리 중…' : '연동 해제'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            이 매장의 주문 알림을 받을 Telegram을 연동하세요. 매장마다 다른
            Telegram으로 받을 수 있습니다.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (!status.url) return
                window.open(status.url, '_blank', 'noopener,noreferrer')
                setHint(
                  'Telegram에서 [시작]을 누른 뒤, 아래 [새로고침]으로 연동을 확인하세요.',
                )
              }}
              className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
            >
              Telegram 연동하기
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              className="text-primary text-xs underline underline-offset-2"
            >
              새로고침
            </button>
          </div>
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        </div>
      )}
    </div>
  )
}
