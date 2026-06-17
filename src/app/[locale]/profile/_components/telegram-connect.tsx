'use client'

import { useEffect, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'

interface Status {
  connected: boolean
  botConfigured: boolean
  url: string | null
}

// 판매자 Telegram 알림 연동 — 주문 발생 시 Telegram으로 알림을 받기 위한 1회 연동.
export function TelegramConnect() {
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
    setHint('Telegram에서 "시작"을 누른 뒤, 아래 "연동 확인"을 눌러 주세요.')
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
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">📨 Telegram 주문 알림</h2>
      <p className="text-muted-foreground text-sm">
        매장에 새 주문이 들어오면 Telegram으로 즉시 알려드립니다. 앱을 닫아도
        받을 수 있어요.
      </p>

      <div className="bg-card rounded-xl border p-4">
        {loading ? (
          <p className="text-muted-foreground text-sm">로딩 중…</p>
        ) : !status?.botConfigured ? (
          <p className="text-muted-foreground text-sm">
            알림 봇이 아직 준비 중입니다. 잠시 후 다시 확인해 주세요.
          </p>
        ) : status.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-green-600">
              ✅ 연동됨 — 주문 알림을 받고 있습니다
            </span>
            <button
              onClick={disconnect}
              disabled={busy}
              className="text-destructive text-sm underline underline-offset-2 disabled:opacity-50"
            >
              {busy ? '처리 중…' : '연동 해제'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={openBot}
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            >
              📨 Telegram 봇 열어 연동하기
            </button>
            <div>
              <button
                onClick={confirm}
                disabled={busy}
                className="text-primary text-sm underline underline-offset-2 disabled:opacity-50"
              >
                {busy ? '확인 중…' : '연동 확인'}
              </button>
            </div>
            {hint && <p className="text-muted-foreground text-xs">{hint}</p>}

            <details className="bg-muted/40 rounded-lg p-3 text-xs">
              <summary className="text-foreground cursor-pointer font-medium select-none">
                ❓ 처음이세요? 연동 방법 보기
              </summary>
              <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-4">
                <li>
                  휴대폰에 <b>Telegram(텔레그램)</b> 앱이 없다면 먼저
                  설치하세요. (앱스토어/플레이스토어에서 “Telegram” 검색)
                </li>
                <li>
                  위 <b>“📨 Telegram 봇 열어 연동하기”</b> 버튼을 누르면
                  텔레그램이 열립니다.
                </li>
                <li>
                  텔레그램 화면 맨 아래 <b>“시작(START)”</b> 버튼을 한 번
                  누르세요.
                </li>
                <li>
                  이 화면으로 돌아와 <b>“연동 확인”</b>을 누르면 완료! ✅
                </li>
              </ol>
              <p className="text-muted-foreground mt-3">
                연동하면 새 주문이 들어올 때마다 텔레그램으로 알림이 와요.{' '}
                <b>앱을 닫아도</b> 휴대폰 알림으로 받을 수 있습니다.
              </p>
            </details>
          </div>
        )}
      </div>
    </section>
  )
}
