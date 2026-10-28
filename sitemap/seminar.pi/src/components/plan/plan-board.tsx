'use client'

// 개최자 요금제(/plan) — 무료·월간·연간 카드 + 내 남은 시간, 구매 = Pi createPayment(seminar-detail pay() 와 같은 흐름).
//  금액은 POST /api/plan 이 시세로 환산·서명한 견적(원화는 참고 표시, NEXT_PUBLIC_PLAN_KRW_REF='0' 이면 숨김). 비로그인도 가격표는 보인다(redirect 없음)
//  결제 가능 판정은 UA 가 아니라 usePiAuth().isInPiBrowser(authenticate 성공 신호)
import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { piFetch, usePiAuth } from '@pi/auth/client'
import { env } from '@/env'
import { useAppUser } from '@/components/google-auth'
import { BTN, BTN_PRIMARY, useSeminarErrText } from '@/components/seminar/shared'
import { readApi } from '@/lib/client-api'
import type { PlanCd, PlanPool } from '@/lib/seminar-rules'

// 내 요금제별 남은 시간(sql/018) — 관리자도 같다(마스터 2026-10-29). 세미나 만들기 기본 요금제(pickPlan)·남은 시간 표시에 쓴다
export type PlanMe = { remainSec: number; paid: boolean; byPlan: Partial<Record<PlanCd, PlanPool>> }
type PlanInfo = {
  freeSec: number
  usdPerPi: number | null // 영어 화면 달러 표시용
  plans: { plan: 'M' | 'Y'; sec: number; months: number; krw: number; pi: string | null }[]
  me: PlanMe | null
}
type Quote = { amount: number; memo: string; metadata: Record<string, unknown> }

const KRW_REF = env.NEXT_PUBLIC_PLAN_KRW_REF !== '0'
const PLAN_NAME = { FREE: 'free', M: 'monthly', Y: 'yearly' } as const
const STILL_WAITING_MS = 120_000

const post = <T,>(path: string, body: unknown) =>
  readApi<T>(
    piFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  )

// 가격표·내 남은 시간 — 로그인 상태가 바뀌면 다시 읽는다(host-form 도 같이 씀)
export function usePlan() {
  const { user } = useAppUser()
  const userId = user?.userId ?? null
  const [info, setInfo] = useState<PlanInfo | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    void readApi<PlanInfo>(piFetch('/api/plan', { cache: 'no-store' })).then((r) => {
      if (live && r.ok) setInfo(r.data)
    })
    return () => {
      live = false
    }
  }, [userId, n])
  return { info, reload: useCallback(() => setN((v) => v + 1), []) }
}

// 초 → "N시간 M분"
export function useDuration() {
  const t = useTranslations('plan')
  return useCallback(
    (sec: number) => {
      const m = Math.max(0, Math.floor(sec / 60))
      if (m < 60) return t('m', { m })
      return m % 60 ? t('hm', { h: Math.floor(m / 60), m: m % 60 }) : t('h', { h: m / 60 })
    },
    [t],
  )
}

// 자국 통화(Pi) 표시 — 결제는 언제나 Pi, 자국 통화는 익숙한 참고 표시(마스터 2026-10-28).
//  ko = 원화 정가 "5,000원 (48.99 Pi)", 그 외 = Pi × 달러 시세 "$3.62 (48.99 Pi)"(달러 시세 없으면 원화). NEXT_PUBLIC_PLAN_KRW_REF='0' 이면 Pi 만
export function useMoney(usdPerPi: number | null | undefined) {
  const t = useTranslations('plan')
  const locale = useLocale()
  return useCallback(
    (krw: number, pi: string | null) => {
      if (!KRW_REF) return pi ? t('pi', { amount: pi }) : t('priceUnknown')
      const usd = locale !== 'ko' && usdPerPi && pi ? Number(pi) * usdPerPi : null
      const fiat =
        usd !== null
          ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(usd)
          : locale === 'ko'
            ? t('won', { n: krw.toLocaleString('ko') })
            : new Intl.NumberFormat(locale, { style: 'currency', currency: 'KRW' }).format(krw)
      return pi ? t('money', { fiat, pi }) : t('moneyNoPi', { fiat })
    },
    [t, locale, usdPerPi],
  )
}

export function PlanBoard() {
  const t = useTranslations('plan')
  const dur = useDuration()
  const { info, reload } = usePlan()
  const money = useMoney(info?.usdPerPi)
  if (!info) return <p className="text-muted-foreground text-sm">{t('loading')}</p>
  const me = info.me
  return (
    <div className="space-y-6">
      {me && (
        <p role="status" className="bg-surface rounded-xl p-4 text-sm">
          {t('meRemain', {
            time: (['FREE', 'M', 'Y'] as const)
              .filter((cd) => (me.byPlan[cd]?.sec ?? 0) > 0)
              .map((cd) => `${t(PLAN_NAME[cd])} ${dur(me.byPlan[cd]?.sec ?? 0)}`)
              .join(' · ') || dur(0),
          })}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card title={t('free')} desc={t('freeDesc', { time: dur(info.freeSec) })} price={money(0, '0')} note={t('noAi')} />
        {info.plans.map((p) => (
          <Card
            key={p.plan}
            title={t(p.plan === 'M' ? 'monthly' : 'yearly')}
            desc={t('paidDesc', { time: dur(p.sec), months: p.months })}
            price={money(p.krw, p.pi)}
            note={t('withAi')}
          >
            {me && <Buy plan={p.plan} onDone={reload} />}
          </Card>
        ))}
      </div>
      {!me && <p className="text-muted-foreground text-sm">{t('loginToBuy')}</p>}
      <p className="text-muted-foreground text-xs">{t('payNote')}</p>
    </div>
  )
}

function Card({
  title,
  desc,
  price,
  note,
  children,
}: {
  title: string
  desc: string
  price: string
  note: string
  children?: React.ReactNode
}) {
  return (
    <section className="bg-surface flex flex-col gap-2 rounded-xl p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-2xl font-bold">{price}</p>
      <p className="text-sm">{desc}</p>
      <p className="text-muted-foreground text-xs">{note}</p>
      <div className="mt-auto pt-2">{children}</div>
    </section>
  )
}

// 요금제 결제 1회 — 서명 견적(POST /api/plan) → Pi createPayment → approve → complete. 결과(성공·문구)를 돌려준다.
//  요금제 화면 [Pi 로 결제]·세미나 만들기(월간·연간 선택 후 개설) 공용. 첫 결과만 — 서버 거부 뒤 SDK 가 onCancel·onError 를 이어 불러도 원인 문구 유지
//  onWait = 지갑 서명이 2분 넘게 걸리면 1번(오류 대신 "아직 기다리는 중" 안내, U8)
export type PayResult = { ok: boolean; text: string }
export function usePlanPay() {
  const t = useTranslations('plan')
  const ts = useTranslations('seminar')
  const errText = useSeminarErrText()
  const { isInPiBrowser } = usePiAuth()
  return useCallback(
    async (plan: 'M' | 'Y', onWait?: () => void): Promise<PayResult> => {
      // Pi SDK 는 일반 브라우저에도 주입되므로 window.Pi 존재로는 부족 — authenticate 성공 세션만 결제
      if (!isInPiBrowser || !window.Pi) return { ok: false, text: ts('piBrowserOnly') }
      const q = await post<Quote>('/api/plan', { plan })
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
                end(false, ts('payCancelled'))
              },
              onError: (e, p) => {
                const pid = p?.identifier || currentId
                if (pid) void post('/api/payments/cancel', { paymentId: pid })
                console.error('[plan] Pi createPayment onError', e)
                end(false, ts('payFailed'))
              },
            },
          )
        } catch (e) {
          console.error('[plan] Pi createPayment', e)
          end(false, ts('payFailed'))
        }
      })
    },
    [t, ts, errText, isInPiBrowser],
  )
}

function Buy({ plan, onDone }: { plan: 'M' | 'Y'; onDone: () => void }) {
  const t = useTranslations('plan')
  const ts = useTranslations('seminar')
  const { isInPiBrowser } = usePiAuth()
  const pay = usePlanPay()
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [msg, setMsg] = useState<PayResult | null>(null)

  async function buy() {
    setBusy(true)
    setMsg(null)
    setWaiting(false)
    const r = await pay(plan, () => setWaiting(true))
    setBusy(false)
    setWaiting(false)
    setMsg(r)
    onDone()
  }

  return (
    <div className="space-y-2">
      <button type="button" className={isInPiBrowser ? BTN_PRIMARY : BTN} disabled={busy} onClick={() => void buy()}>
        {busy ? ts('paying') : t('buy')}
      </button>
      {!isInPiBrowser && <p className="text-muted-foreground text-xs">{ts('piBrowserOnly')}</p>}
      {busy && waiting && (
        <p role="status" className="text-muted-foreground text-xs">
          {ts('payStillWaiting')}
        </p>
      )}
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-speaking text-sm' : 'text-danger text-sm'}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
