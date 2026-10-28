'use client'

// 개최자 요금제(/plan) — 무료·월간·연간 카드 + 내 남은 시간, 구매 = Pi createPayment(seminar-detail pay() 와 같은 흐름).
//  금액은 POST /api/plan 이 시세로 환산·서명한 견적(원화는 참고 표시, NEXT_PUBLIC_PLAN_KRW_REF='0' 이면 숨김). 비로그인도 가격표는 보인다(redirect 없음)
//  결제 가능 판정은 UA 가 아니라 usePiAuth().isInPiBrowser(authenticate 성공 신호)
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch, usePiAuth } from '@pi/auth/client'
import { env } from '@/env'
import { useAppUser } from '@/components/google-auth'
import { BTN, BTN_PRIMARY, useSeminarErrText } from '@/components/seminar/shared'
import { readApi } from '@/lib/client-api'

export type PlanMe = { admin: true } | { admin: false; remainSec: number; paid: boolean; endAt: string | null }
type PlanInfo = {
  freeSec: number
  plans: { plan: 'M' | 'Y'; sec: number; months: number; krw: number; pi: string | null }[]
  fees: { krw: number; pi: string | null }[] // 세미나 만들기 개설비 선택지 참고값
  me: PlanMe | null
}
type Quote = { amount: number; memo: string; metadata: Record<string, unknown> }

const KRW_REF = env.NEXT_PUBLIC_PLAN_KRW_REF !== '0'
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
      return m >= 60 ? t('hm', { h: Math.floor(m / 60), m: m % 60 }) : t('m', { m })
    },
    [t],
  )
}

export function PlanBoard() {
  const t = useTranslations('plan')
  const dur = useDuration()
  const { info, reload } = usePlan()
  if (!info) return <p className="text-muted-foreground text-sm">{t('loading')}</p>
  const me = info.me
  return (
    <div className="space-y-6">
      {me && (
        <p role="status" className="bg-surface rounded-xl p-4 text-sm">
          {me.admin ? t('meAdmin') : t('meRemain', { time: dur(me.remainSec) })}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card title={t('free')} desc={t('freeDesc', { time: dur(info.freeSec) })} price={t('freePrice')} note={t('noAi')} />
        {info.plans.map((p) => (
          <Card
            key={p.plan}
            title={t(p.plan === 'M' ? 'monthly' : 'yearly')}
            desc={t('paidDesc', { time: dur(p.sec), months: p.months })}
            price={p.pi ? t('pi', { amount: p.pi }) : t('priceUnknown')}
            sub={KRW_REF ? t('krwRef', { krw: p.krw.toLocaleString() }) : undefined}
            note={t('withAi')}
          >
            {me && !me.admin && <Buy plan={p.plan} onDone={reload} />}
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
  sub,
  note,
  children,
}: {
  title: string
  desc: string
  price: string
  sub?: string
  note: string
  children?: React.ReactNode
}) {
  return (
    <section className="bg-surface flex flex-col gap-2 rounded-xl p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-2xl font-bold">{price}</p>
      {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
      <p className="text-sm">{desc}</p>
      <p className="text-muted-foreground text-xs">{note}</p>
      <div className="mt-auto pt-2">{children}</div>
    </section>
  )
}

function Buy({ plan, onDone }: { plan: 'M' | 'Y'; onDone: () => void }) {
  const t = useTranslations('plan')
  const ts = useTranslations('seminar')
  const errText = useSeminarErrText()
  const { isInPiBrowser } = usePiAuth()
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const settled = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 첫 결과만 남긴다 — 서버 거부 뒤 SDK 가 onCancel·onError 를 이어 불러도 원인 문구를 덮지 않게
  const finish = (ok: boolean, text: string) => {
    if (settled.current) return
    settled.current = true
    if (timer.current) clearTimeout(timer.current)
    setWaiting(false)
    setBusy(false)
    setMsg({ ok, text })
    onDone()
  }

  async function buy() {
    // Pi SDK 는 일반 브라우저에도 주입되므로 window.Pi 존재로는 부족 — authenticate 성공 세션만 결제
    if (!isInPiBrowser || !window.Pi) return setMsg({ ok: false, text: ts('piBrowserOnly') })
    settled.current = false
    setBusy(true)
    setMsg(null)
    const q = await post<Quote>('/api/plan', { plan })
    if (!q.ok) return finish(false, errText(q.body))
    let currentId: string | null = null
    timer.current = setTimeout(() => setWaiting(true), STILL_WAITING_MS)
    try {
      window.Pi.createPayment(
        { amount: q.data.amount, memo: q.data.memo, metadata: q.data.metadata },
        {
          onReadyForServerApproval: async (paymentId) => {
            currentId = paymentId
            const r = await post('/api/payments/approve', { paymentId })
            if (!r.ok) finish(false, errText(r.body))
          },
          onReadyForServerCompletion: async (paymentId, txid) => {
            const r = await post('/api/payments/complete', { paymentId, txid })
            finish(r.ok, r.ok ? t('bought') : errText(r.body))
          },
          onCancel: (paymentId) => {
            const pid = paymentId || currentId
            if (pid) void post('/api/payments/cancel', { paymentId: pid })
            finish(false, ts('payCancelled'))
          },
          onError: (e, p) => {
            const pid = p?.identifier || currentId
            if (pid) void post('/api/payments/cancel', { paymentId: pid })
            console.error('[plan] Pi createPayment onError', e)
            finish(false, ts('payFailed'))
          },
        },
      )
    } catch (e) {
      console.error('[plan] Pi createPayment', e)
      finish(false, ts('payFailed'))
    }
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
