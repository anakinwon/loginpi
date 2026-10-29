'use client'

// S5 세미나 개설 — Pi 로그인 사용자 누구나(요금제 2026-10-28, PRD D-1 개정). 비로그인 = LoginGate. 성공 시 상세(S2)로 이동.
//  요금제 콤보(무료 / 월간 / 연간)는 관리자 포함 모두(마스터 2026-10-29) — 고른 요금제가 세미나에 묶여(sql/018) 그 이용권에서만 시간이 빠진다.
//  기본값 = 가입 중(남은 시간 있는) 유료 요금제(pickPlan), 없으면 무료. 가입 중 요금제 = 결제 없이 개설,
//  가입 안 한 월간·연간 = [개설] 때 먼저 Pi 로 이용권 결제(usePlanPay, 요금제 화면과 같은 흐름) → 성공하면 개설. 참가자 입장은 언제나 무료
// 입력 검사는 화면이 먼저 하고 서버(zod)가 다시 한다 — 지금 이후 ~ 1년 안 일시, 정원 1~100, 요금제 남은 시간 > 0(서버 402)
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from '@/components/login-gate'
import { Link, useRouter } from '@/i18n/navigation'
import { readApi } from '@/lib/client-api'
import { isPlanCd, pickPlan, startAtOk, type PlanCd } from '@/lib/seminar-rules'
import { useDuration, useMoney, usePlan, usePlanPay } from '@/components/plan/plan-board'
import { DateCalendar } from './date-calendar'
import { markCreated } from './share-links'
import { BTN_PRIMARY, useSeminarErrText } from './shared'

const INPUT = 'bg-surface w-full rounded-lg border border-white/10 px-3 py-2'

export function HostForm() {
  return <LoginGate>{() => <Form />}</LoginGate>
}

function Form() {
  const t = useTranslations('host')
  const tp = useTranslations('plan')
  const ts = useTranslations('seminar')
  const errText = useSeminarErrText()
  const router = useRouter()
  const { info, reload } = usePlan() // 요금제별 남은 시간·가격 — 한 번만 읽고, 결제 뒤에만 다시(R-P2)
  const money = useMoney(info?.usdPerPi)
  const dur = useDuration()
  const pay = usePlanPay()
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // 사용자가 고르기 전에는 가입 중 요금제를 따라간다(정보가 늦게 와도 기본값이 맞게)
  const [picked, setPicked] = useState<PlanCd | null>(null)
  const by = info?.me?.byPlan
  const plan = picked ?? pickPlan(by)
  const left = (cd: PlanCd) => by?.[cd]?.sec ?? 0
  // 이 화면에서 이미 결제한 요금제 — 결제 뒤 개설이 실패해 다시 눌러도 두 번 결제하지 않는다(검토 지적, 요금제 정보가 다시 오기 전에도)
  const paid = useRef(new Set<PlanCd>())
  const owned = (cd: PlanCd) => left(cd) > 0 || paid.current.has(cd)
  // 유료 이용권 만료 — 가진 것은 그 만료, 새로 사면(또는 이 화면에서 산 것) 지금 + 이용 개월수. 시작이 그 뒤면 결제·개설하지 않는다(서버도 409)
  const endOf = (cd: PlanCd) => {
    if (left(cd) > 0 && !paid.current.has(cd)) return Date.parse(by?.[cd]?.endAt ?? '') || 0
    const d = new Date()
    d.setMonth(d.getMonth() + (info?.plans.find((p) => p.plan === cd)?.months ?? 0))
    return d.getTime()
  }
  // 화면에 보일 유료 요금제 = 판매 중이거나 가진 것(판매 중지돼도 가진 이용권은 쓸 수 있다)
  const shown = (['M', 'Y'] as const).filter((cd) => info?.plans.some((p) => p.plan === cd) || left(cd) > 0)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const startMs = Date.parse(String(f.get('startAt') ?? '')) // datetime-local = 보는 사람 지역 시간
    const maxCnt = Number(f.get('maxCnt'))
    const subTitle = String(f.get('subTitle') ?? '').trim()
    if (!startAtOk(startMs)) return setMsg(t('invalid'))
    if (plan !== 'FREE' && startMs >= endOf(plan)) return setMsg(t('planEnds'))
    setBusy(true)
    setMsg(null)
    // 가입 안 한 월간·연간 = 이용권 먼저(결제 실패·취소면 개설하지 않는다). 가입 중·이 화면에서 결제함이면 결제 없이 바로
    if (plan !== 'FREE' && !owned(plan)) {
      setWaiting(false)
      const p = await pay(plan, () => setWaiting(true))
      setWaiting(false)
      reload() // 성공·실패 모두 — complete 응답만 끊겨도 이용권은 생겼을 수 있다
      if (!p.ok) {
        setBusy(false)
        return setMsg(p.text)
      }
      paid.current.add(plan)
    }
    const r = await readApi<{ id: string }>(
      piFetch('/api/seminars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startAt: new Date(startMs).toISOString(),
          maxCnt,
          plan,
          ...(subTitle ? { subTitle } : {}),
        }),
      }),
    )
    if (r.ok) {
      markCreated(r.data.id) // 상세 첫 화면에 'Google 캘린더에 추가' 안내 1회
      return router.push(`/s/${r.data.id}`)
    }
    setBusy(false)
    setMsg(paid.current.has(plan) ? `${errText(r.body)} ${t('paidKept')}` : errText(r.body))
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
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
      <label className="block space-y-1 text-sm">
        <span>{t('plan')}</span>
        <select
          name="plan"
          value={plan}
          onChange={(e) => isPlanCd(e.target.value) && setPicked(e.target.value)}
          className={`${INPUT} [&_option]:bg-background [&_option]:text-foreground`}
        >
          <option value="FREE">{info?.me ? t('planFree', { time: dur(left('FREE')) }) : tp('free')}</option>
          {shown.map((cd) => {
            const name = tp(cd === 'M' ? 'monthly' : 'yearly')
            const p = info?.plans.find((x) => x.plan === cd)
            return (
              <option key={cd} value={cd}>
                {owned(cd) || !p
                  ? t('planOwned', { name, time: dur(left(cd)) })
                  : t('planPaid', { name, time: dur(p.sec), price: money(p.krw, p.pi) })}
              </option>
            )
          })}
        </select>
        <span className="text-muted-foreground text-xs">{t('planHint')}</span>
        {plan === 'FREE' && info?.me && left('FREE') <= 0 && (
          <Link href="/plan" className="text-accent block text-xs hover:underline">
            {tp('charge')}
          </Link>
        )}
      </label>
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
