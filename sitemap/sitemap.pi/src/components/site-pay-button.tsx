'use client'

// 사용료 결제 버튼 — Pi Browser 에서만 결제. 판정은 UA 가 아니라 usePiAuth().isInPiBrowser(authenticate 성공 신호).
//  서버 prepare → SDK createPayment → approve → complete(piFetch, X-Pi-Token 자동). 금액·memo·metadata 는 서버 값 그대로.
//  취소·오류 시 /api/payments/cancel 로 원장·Pi 측 정리(좀비 APPROVED 방지). createPayment 예외·무응답 대비 try/catch + 타임아웃
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch, usePiAuth } from '@pi/auth/client'
import { readApi, useApiErrorText } from '@/lib/client-api'
import type { OwnerSite } from '@/lib/site'

type Prep = { amount: number; memo: string; metadata: Record<string, unknown> }
const CALLBACK_TIMEOUT_MS = 120_000 // 서명 대기 포함 상한 — 지나면 사용자에게 재시도 안내

const post = (path: string, body: unknown) =>
  readApi(
    piFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

export function SitePayButton({
  site,
  amount,
  onPaid,
}: {
  site: OwnerSite
  amount: number | null // 표시용 단가(요금표) — null 이면 미조회
  onPaid: () => void
}) {
  const t = useTranslations('pay')
  const tp = useTranslations('plan')
  const errText = useApiErrorText()
  const { isInPiBrowser } = usePiAuth()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const finish = (m: { ok: boolean; text: string }) => {
    if (timer.current) clearTimeout(timer.current)
    setMsg(m)
    setBusy(false)
  }

  async function pay() {
    // Pi SDK 는 일반 브라우저에도 주입되므로 window.Pi 존재로는 부족 — authenticate 가 성공한 세션만 결제
    if (!isInPiBrowser || !window.Pi) {
      setMsg({ ok: false, text: t('piBrowserOnly') })
      return
    }
    setBusy(true)
    setMsg(null)
    const prep = await readApi<Prep>(
      piFetch('/api/payments/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: site.site_id }),
      }),
    )
    if (!prep.ok) return finish({ ok: false, text: errText(prep.body) })

    let currentId: string | null = null
    timer.current = setTimeout(
      () => finish({ ok: false, text: t('timeout') }),
      CALLBACK_TIMEOUT_MS,
    )
    try {
      window.Pi.createPayment(prep.data, {
        onReadyForServerApproval: async (paymentId) => {
          currentId = paymentId
          const r = await post('/api/payments/approve', { paymentId })
          if (!r.ok) finish({ ok: false, text: errText(r.body) })
        },
        onReadyForServerCompletion: async (paymentId, txid) => {
          const r = await post('/api/payments/complete', { paymentId, txid })
          if (r.ok) {
            finish({ ok: true, text: t('done') })
            onPaid()
          } else finish({ ok: false, text: errText(r.body) })
        },
        onCancel: (paymentId) => {
          void post('/api/payments/cancel', {
            paymentId: paymentId || currentId,
          })
          finish({ ok: false, text: t('cancelled') })
        },
        onError: (e, p) => {
          const id = p?.identifier || currentId
          if (id) void post('/api/payments/cancel', { paymentId: id })
          finish({ ok: false, text: e.message || t('failed') })
        },
      })
    } catch (e) {
      finish({ ok: false, text: e instanceof Error ? e.message : t('failed') })
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={() => void pay()}
      >
        {busy
          ? t('paying')
          : t('payNow', {
              plan: tp(site.plan_cd),
              amount: amount == null ? '…' : String(amount),
            })}
      </button>
      {!isInPiBrowser && (
        <p className="text-muted-foreground text-xs">{t('piBrowserOnly')}</p>
      )}
      {msg && (
        <p
          className={msg.ok ? 'text-sm' : 'text-destructive text-sm'}
          role={msg.ok ? 'status' : 'alert'}
        >
          {msg.text}
        </p>
      )}
    </div>
  )
}
