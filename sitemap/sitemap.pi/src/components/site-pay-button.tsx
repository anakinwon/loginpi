'use client'

// 등록 심사비 결제 버튼 — Pi Browser(window.Pi) 에서만 결제 가능. 서버 prepare → SDK createPayment → approve → complete(piFetch, X-Pi-Token 자동).
//  금액·memo·metadata 는 서버가 내려준 값을 그대로 전달(클라이언트가 금액을 정하지 않는다)
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi, useApiErrorText } from '@/lib/client-api'
import type { OwnerSite } from '@/lib/site'

type Prep = { amount: number; memo: string; metadata: Record<string, unknown> }

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
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function pay() {
    if (!window.Pi) {
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
    if (!prep.ok) {
      setMsg({ ok: false, text: errText(prep.body) })
      setBusy(false)
      return
    }
    const Pi = window.Pi
    const finish = (m: { ok: boolean; text: string }) => {
      setMsg(m)
      setBusy(false)
    }
    Pi.createPayment(prep.data, {
      onReadyForServerApproval: async (paymentId) => {
        const r = await readApi(
          piFetch('/api/payments/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId }),
          }),
        )
        if (!r.ok) finish({ ok: false, text: errText(r.body) })
      },
      onReadyForServerCompletion: async (paymentId, txid) => {
        const r = await readApi(
          piFetch('/api/payments/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId, txid }),
          }),
        )
        if (r.ok) {
          finish({ ok: true, text: t('done') })
          onPaid()
        } else finish({ ok: false, text: errText(r.body) })
      },
      onCancel: () => finish({ ok: false, text: t('cancelled') }),
      onError: (e) => finish({ ok: false, text: e.message || t('failed') }),
    })
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
