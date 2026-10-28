'use client'

// S5 세미나 개설 — Pi 로그인 사용자 누구나(요금제 2026-10-28, PRD D-1 개정). 비로그인 = LoginGate. 성공 시 상세(S2)로 이동.
//  관리자 아닌 개최자 = 개설비 칸 없음(서버도 0 고정, 정산 전) + 남은 이용 시간 표시, 0 이면 요금제 링크
//  개설비 = 원화 선택지 콤보박스 "5,000원 (≈ 49.04 Pi)" — 원화는 참고, 개설 때 서버가 그 시점 시세로 Pi 환산해 고정, 참가자는 Pi 로 결제
// 입력 검사는 화면이 먼저 하고 서버(zod)가 다시 한다 — 지금 이후 ~ 1년 안 일시, 정원 1~100, 개설비 = FEE_KRW 중 하나
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from '@/components/login-gate'
import { Link, useRouter } from '@/i18n/navigation'
import { readApi } from '@/lib/client-api'
import { startAtOk } from '@/lib/seminar-rules'
import { useDuration, usePlan, type PlanMe } from '@/components/plan/plan-board'
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

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const startMs = Date.parse(String(f.get('startAt') ?? '')) // datetime-local = 보는 사람 지역 시간
    const maxCnt = Number(f.get('maxCnt'))
    const feeKrw = admin ? Number(f.get('feeKrw') ?? 0) : 0
    const subTitle = String(f.get('subTitle') ?? '').trim()
    if (!startAtOk(startMs))
      return setMsg(t('invalid'))
    setBusy(true)
    setMsg(null)
    const r = await readApi<{ id: string }>(
      piFetch('/api/seminars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startAt: new Date(startMs).toISOString(),
          maxCnt,
          feeKrw,
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
      {admin && (
        <label className="block space-y-1 text-sm">
          <span>{t('fee')}</span>
          <select name="feeKrw" defaultValue="0" className={INPUT}>
            <option value="0">{t('feeFree')}</option>
            {info?.fees.map((o) => (
              <option key={o.krw} value={o.krw}>
                {o.pi
                  ? t('feeOption', { krw: o.krw.toLocaleString(), pi: o.pi })
                  : t('feeOptionNoPi', { krw: o.krw.toLocaleString() })}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-xs">{t('feeHint')}</span>
        </label>
      )}
      <button type="submit" disabled={busy} className={BTN_PRIMARY}>
        {busy ? t('submitting') : t('submit')}
      </button>
      {msg && (
        <p role="alert" className="text-danger text-sm">
          {msg}
        </p>
      )}
    </form>
  )
}
