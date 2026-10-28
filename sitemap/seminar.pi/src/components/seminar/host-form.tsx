'use client'

// S5 세미나 개설 — Pi 로그인 사용자 누구나(요금제 2026-10-28, PRD D-1 개정). 비로그인 = LoginGate. 성공 시 상세(S2)로 이동.
//  관리자 아닌 개최자 = 요금제 콤보(무료 / 월간 / 연간, "5,000원 (48.96 Pi)" 자국 통화 먼저 — useMoney). 월간·연간이면 [개설] 때
//  먼저 Pi 로 이용권 결제(usePlanPay, 요금제 화면과 같은 흐름) → 성공하면 개설. 참가자 입장은 언제나 무료(마스터 2026-10-28)
// 입력 검사는 화면이 먼저 하고 서버(zod)가 다시 한다 — 지금 이후 ~ 1년 안 일시, 정원 1~100
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from '@/components/login-gate'
import { Link, useRouter } from '@/i18n/navigation'
import { readApi } from '@/lib/client-api'
import { startAtOk } from '@/lib/seminar-rules'
import { useDuration, useMoney, usePlan, usePlanPay, type PlanMe } from '@/components/plan/plan-board'
import { DateCalendar } from './date-calendar'
import { BTN, BTN_PRIMARY, useSeminarErrText } from './shared'

const INPUT = 'bg-surface w-full rounded-lg border border-white/10 px-3 py-2'

export function HostForm() {
  return <LoginGate>{(user) => <Form admin={user.role === 'ADMIN' || user.role === 'MASTER'} />}</LoginGate>
}

// 내 남은 이용 시간 — 0 이면 개설은 되지만 발표 입장이 막히므로(서버 402) 충전 링크를 같이 보인다
function PlanLine({ me }: { me: PlanMe | null | undefined }) {
  const t = useTranslations('plan')
  const dur = useDuration()
  if (!me || me.admin) return null
  return (
    <div className="bg-surface space-y-2 rounded-xl p-4 text-sm">
      <p>{t('meRemain', { time: dur(me.remainSec) })}</p>
      {me.remainSec <= 0 && (
        <Link href="/plan" className={BTN}>
          {t('charge')}
        </Link>
      )}
    </div>
  )
}

function Form({ admin }: { admin: boolean }) {
  const t = useTranslations('host')
  const errText = useSeminarErrText()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const info = usePlan().info // 남은 시간·개설비 참고 환산 — 한 번만 읽어 둘 다 쓴다(R-P2)
  const money = useMoney(info?.usdPerPi)
  const dur = useDuration()
  const tp = useTranslations('plan')
  const ts = useTranslations('seminar')
  const pay = usePlanPay()
  const [waiting, setWaiting] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const startMs = Date.parse(String(f.get('startAt') ?? '')) // datetime-local = 보는 사람 지역 시간
    const maxCnt = Number(f.get('maxCnt'))
    const plan = admin ? 'F' : String(f.get('plan') ?? 'F')
    const subTitle = String(f.get('subTitle') ?? '').trim()
    if (!startAtOk(startMs))
      return setMsg(t('invalid'))
    setBusy(true)
    setMsg(null)
    // 월간·연간 = 이용권 먼저(결제 실패·취소면 개설하지 않는다)
    if (plan === 'M' || plan === 'Y') {
      setWaiting(false)
      const p = await pay(plan, () => setWaiting(true))
      setWaiting(false)
      if (!p.ok) {
        setBusy(false)
        return setMsg(p.text)
      }
    }
    const r = await readApi<{ id: string }>(
      piFetch('/api/seminars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startAt: new Date(startMs).toISOString(),
          maxCnt,
          ...(subTitle ? { subTitle } : {}),
        }),
      }),
    )
    if (r.ok) return router.push(`/s/${r.data.id}`)
    setBusy(false)
    setMsg(errText(r.body))
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      {!admin && <PlanLine me={info?.me} />}
      {/* 이름 입력 없음 — 개설 때 남은 섬 이름에서 무작위로 정해진다(sql/011) */}
      <p className="text-muted-foreground text-sm">🏝️ {t('name')}</p>
      <label className="block space-y-1 text-sm">
        <span>{t('subTitle')}</span>
        <input name="subTitle" maxLength={60} className={INPUT} />
      </label>
      {/* 시작일시 — 달력이 펼쳐진 채로(날짜 누르고 시·분 고르기), 값 형식은 datetime-local 과 같다 */}
      <DateCalendar name="startAt" label={t('startAt')} />
      <label className="block space-y-1 text-sm">
        <span>{t('maxCnt')}</span>
        <input name="maxCnt" type="number" required min={1} max={100} defaultValue={30} className={INPUT} />
      </label>
      {!admin && (
        <label className="block space-y-1 text-sm">
          <span>{t('plan')}</span>
          {/* 무료 = 이번 달 남은 시간으로, 월간·연간 = 개설 전에 Pi 로 이용권 결제 */}
          <select name="plan" defaultValue="F" className={`${INPUT} [&_option]:bg-background [&_option]:text-foreground`}>
            <option value="F">
              {info?.me && !info.me.admin ? t('planFree', { time: dur(info.me.remainSec) }) : tp('free')}
            </option>
            {info?.plans.map((p) => (
              <option key={p.plan} value={p.plan}>
                {t('planPaid', { name: tp(p.plan === 'M' ? 'monthly' : 'yearly'), time: dur(p.sec), price: money(p.krw, p.pi) })}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-xs">{t('planHint')}</span>
        </label>
      )}
      <button type="submit" disabled={busy} className={BTN_PRIMARY}>
        {busy ? t('submitting') : t('submit')}
      </button>
      {busy && waiting && (
        <p role="status" className="text-muted-foreground text-xs">
          {ts('payStillWaiting')}
        </p>
      )}
      {msg && (
        <p role="alert" className="text-danger text-sm">
          {msg}
        </p>
      )}
    </form>
  )
}
