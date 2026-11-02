'use client'

// 연결 요금제 화면(/plan) — 현재 요금제·남은 기간·AI 남은 횟수 + FREE·D1·D2·D3 카드(월·연) + 업그레이드 + schema.pi 묶음 할인 표시.
//  표시 : ko = 원화 정가(Pi 병기), 그 외 = Pi 위주. 금액은 결제 직전 prepare 가 시세로 환산·서명한 Pi 만 결제(원화는 참고, memory krw-display-only-pay-pi)
//  결제 = Pi SDK createPayment(seminar.pi plan-board 와 같은 흐름) — 결제 가능 판정은 UA 가 아니라 usePiAuth().isInPiBrowser(authenticate 성공 신호). redirect 없음
import { useCallback, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { piFetch, usePiAuth } from '@pi/auth/client'
import { LinkPicker } from '@/components/link/link-picker'
import { LoginGate } from '@/components/login-gate'
import { BTN, BTN_PRIMARY } from '@/components/ui'
import { readApi, useApiErrorText } from '@/lib/client-api'
import type { PaidPlan, PlanCd } from '@/lib/plan-rules'
import { usePlanInfo, type PlanInfo } from './use-plan'

type Quote = { amount: number; memo: string; metadata: Record<string, unknown> }
type PayArgs = { plan_cd: PaidPlan; prd_cd: 'M' | 'Y' | 'U'; prd?: 'M' | 'Y' }
type PayResult = { ok: boolean; text: string }
const STILL_WAITING_MS = 120_000
const PLAN_LIST: PlanCd[] = ['FREE', 'D1', 'D2', 'D3']

const post = <T,>(path: string, body: unknown) =>
  readApi<T>(piFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))

export function PlanBoard() {
  return <LoginGate>{() => <Inner />}</LoginGate>
}

function Inner() {
  const [linkId, setLinkId] = useState<string | null>(null)
  const onChange = useCallback((s: { linkId: string | null }) => setLinkId(s.linkId), [])
  return (
    <div className="space-y-4">
      <LinkPicker needConn={false} onChange={onChange} />
      {linkId && <Board linkId={linkId} />}
    </div>
  )
}

// 금액 표시 — ko = "9,900원 (33.00 Pi)", 그 외 = "33.00 Pi"(시세 없으면 원화 참고)
function useMoney() {
  const t = useTranslations('plan')
  const locale = useLocale()
  return useCallback(
    (krw: number | null, pi: string | null) => {
      if (!krw) return t('freePrice')
      if (locale === 'ko') return pi ? t('moneyKo', { won: krw.toLocaleString('ko'), pi }) : t('won', { won: krw.toLocaleString('ko') })
      return pi ? t('pi', { pi }) : new Intl.NumberFormat(locale, { style: 'currency', currency: 'KRW' }).format(krw)
    },
    [t, locale],
  )
}

function Board({ linkId }: { linkId: string }) {
  const t = useTranslations('plan')
  const money = useMoney()
  const { info, loading, reload } = usePlanInfo(linkId, true)
  if (loading) return <p className="text-muted-foreground text-sm">{t('loading')}</p>
  if (!info) return <p className="text-danger text-sm">{t('loadFail')}</p>
  const c = info.cur
  const paid = c.plan !== 'FREE' && !c.grace
  const days = c.end ? Math.max(0, Math.ceil((Date.parse(c.end) - Date.now()) / 86_400_000)) : null
  return (
    <div className="space-y-4">
      <section role="status" className="bg-surface space-y-1 rounded-2xl p-4 text-sm">
        <p className="text-base font-bold">
          {t('cur', { plan: t(`names.${c.plan}`) })}
          {c.grace && <span className="ms-2 rounded bg-amber-400/20 px-1.5 text-xs text-amber-200">{t('grace')}</span>}
        </p>
        {c.end && <p>{t('until', { date: new Date(c.end).toLocaleDateString(), days: days ?? 0 })}</p>}
        <p>{c.aiMon > 0 ? t('aiLeft', { left: Math.max(0, c.aiMon - info.used.ai), total: c.aiMon }) : t('aiNone')}</p>
        {c.clctDay != null && <p>{t('clctLeft', { left: Math.max(0, c.clctDay - info.used.clct), total: c.clctDay })}</p>}
        <p className="text-muted-foreground">{t('keep', { days: c.keepDays })}</p>
      </section>
      <p className={`rounded-xl p-3 text-sm ${info.bndl ? 'bg-emerald-500/15 text-emerald-200' : 'bg-surface text-muted-foreground'}`}>
        {info.bndl ? t('bndlOn') : t('bndlOff')}
      </p>
      {paid && info.upgrades.length > 0 && (
        <section className="bg-surface space-y-2 rounded-2xl p-4">
          <h2 className="font-bold">{t('upgradeTitle')}</h2>
          <p className="text-muted-foreground text-xs">{t('upgradeNote')}</p>
          <ul className="space-y-2">
            {info.upgrades.map((u) => (
              <li key={u.plan_cd + u.prd} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  {t('upgradeTo', { plan: t(`names.${u.plan_cd}`), prd: t(u.prd === 'Y' ? 'yearly' : 'monthly') })} — {money(u.due, u.pi)}
                </span>
                <Buy linkId={linkId} args={{ plan_cd: u.plan_cd, prd_cd: 'U', prd: u.prd }} onDone={reload} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_LIST.map((p) => (
          <Card key={p} p={p} info={info} money={money} canBuy={!paid || p === c.plan} linkId={linkId} onDone={reload} />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{t('payNote')}</p>
    </div>
  )
}

function Card({
  p,
  info,
  money,
  canBuy,
  linkId,
  onDone,
}: {
  p: PlanCd
  info: PlanInfo
  money: (krw: number | null, pi: string | null) => string
  canBuy: boolean
  linkId: string
  onDone: () => void
}) {
  const t = useTranslations('plan')
  const rows = info.fees.filter((f) => f.plan === p)
  const m = rows.find((f) => f.prd === 'M')
  const on = info.cur.plan === p
  return (
    <section className={`bg-surface flex flex-col gap-2 rounded-2xl p-4 ${on ? 'ring-accent ring-2' : ''}`}>
      <h2 className="text-lg font-bold">{t(`names.${p}`)}</h2>
      <p className="text-muted-foreground text-xs">{t(`desc.${p}`)}</p>
      {rows.map((f) => (
        <p key={f.prd} className="text-sm font-semibold">
          {p === 'FREE' ? t('freePrice') : `${t(f.prd === 'Y' ? 'yearly' : 'monthly')} ${money(f.due, f.pi)}`}
        </p>
      ))}
      {m && (
        <ul className="text-muted-foreground list-disc space-y-0.5 ps-4 text-xs">
          <li>{t(`feat.${p}`)}</li>
          <li>{m.aiMon > 0 ? t('featAi', { n: m.aiMon }) : t('aiNone')}</li>
          <li>{t('keep', { days: m.keepDays })}</li>
          {m.clctDay != null && <li>{t('featClct', { n: m.clctDay })}</li>}
        </ul>
      )}
      {p !== 'FREE' && canBuy && (
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {rows.map((f) => (
            <Buy key={f.prd} linkId={linkId} args={{ plan_cd: p as PaidPlan, prd_cd: f.prd }} onDone={onDone} label={t(on ? 'extend' : 'buy', { prd: t(f.prd === 'Y' ? 'yearly' : 'monthly') })} />
          ))}
        </div>
      )}
    </section>
  )
}

// 결제 1회 — 서명 견적(prepare) → Pi createPayment → approve → complete. 첫 결과만(서버 거부 뒤 SDK 가 onCancel·onError 를 이어 불러도 원인 문구 유지)
function usePlanPay() {
  const t = useTranslations('plan')
  const errText = useApiErrorText()
  const { isInPiBrowser } = usePiAuth()
  return useCallback(
    async (linkId: string, args: PayArgs, onWait?: () => void): Promise<PayResult> => {
      // Pi SDK 는 일반 브라우저에도 주입되므로 window.Pi 존재로는 부족 — authenticate 성공 세션만 결제
      if (!isInPiBrowser || !window.Pi) return { ok: false, text: t('piBrowserOnly') }
      const q = await post<Quote>('/api/payments/prepare', { linkId, ...args })
      if (!q.ok) return { ok: false, text: errText(q.body) }
      const Pi = window.Pi
      return new Promise<PayResult>((resolve) => {
        let done = false
        let currentId: string | null = null
        const timer = setTimeout(() => onWait?.(), STILL_WAITING_MS)
        const end = (ok: boolean, text: string) => {
          if (done) return
          done = true
          clearTimeout(timer)
          resolve({ ok, text })
        }
        try {
          Pi.createPayment(
            { amount: q.data.amount, memo: q.data.memo, metadata: q.data.metadata },
            {
              onReadyForServerApproval: async (paymentId) => {
                currentId = paymentId
                const r = await post('/api/payments/approve', { paymentId })
                if (!r.ok) end(false, errText(r.body))
              },
              onReadyForServerCompletion: async (paymentId, txid) => {
                const r = await post('/api/payments/complete', { paymentId, txid })
                end(r.ok, r.ok ? t('bought') : errText(r.body))
              },
              onCancel: (paymentId) => {
                const pid = paymentId || currentId
                if (pid) void post('/api/payments/cancel', { paymentId: pid })
                end(false, t('payCancelled'))
              },
              onError: (e, p) => {
                const pid = p?.identifier || currentId
                if (pid) void post('/api/payments/cancel', { paymentId: pid })
                console.error('[plan] Pi createPayment onError', e)
                end(false, t('payFailed'))
              },
            },
          )
        } catch (e) {
          console.error('[plan] Pi createPayment', e)
          end(false, t('payFailed'))
        }
      })
    },
    [t, errText, isInPiBrowser],
  )
}

function Buy({ linkId, args, onDone, label }: { linkId: string; args: PayArgs; onDone: () => void; label?: string }) {
  const t = useTranslations('plan')
  const { isInPiBrowser } = usePiAuth()
  const pay = usePlanPay()
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [msg, setMsg] = useState<PayResult | null>(null)

  async function buy() {
    setBusy(true)
    setMsg(null)
    setWaiting(false)
    const r = await pay(linkId, args, () => setWaiting(true))
    setBusy(false)
    setWaiting(false)
    setMsg(r)
    if (r.ok) onDone()
  }

  return (
    <div className="space-y-1">
      <button type="button" className={isInPiBrowser ? BTN_PRIMARY : BTN} disabled={busy} onClick={() => void buy()}>
        {busy ? t('paying') : (label ?? t('upgradeBtn'))}
      </button>
      {!isInPiBrowser && <p className="text-muted-foreground text-xs">{t('piBrowserOnly')}</p>}
      {busy && waiting && (
        <p role="status" className="text-muted-foreground text-xs">
          {t('payStillWaiting')}
        </p>
      )}
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm text-emerald-300' : 'text-danger text-sm'}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
