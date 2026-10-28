'use client'

// S5 세미나 개설 — ADMIN 만(PRD D-1). 비로그인 = LoginGate, 비관리자 = 안내(서버도 403). 성공 시 상세(S2)로 이동.
// 입력 검사는 화면이 먼저 하고 서버(zod)가 다시 한다 — 제목 1~100자, 지금 이후 ~ 1년 안 일시, 정원 1~100, 입장료 0 이상 소수 7자리
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from '@/components/login-gate'
import { useRouter } from '@/i18n/navigation'
import { readApi } from '@/lib/client-api'
import { FEE_RE, startAtOk } from '@/lib/seminar-rules'
import { BTN_PRIMARY, useSeminarErrText } from './shared'

const INPUT = 'bg-surface w-full rounded-lg border border-white/10 px-3 py-2'

export function HostForm() {
  const t = useTranslations('host')
  return (
    <LoginGate>
      {(user) =>
        user.role === 'ADMIN' || user.role === 'MASTER' ? (
          <Form />
        ) : (
          <p className="bg-surface rounded-xl p-4 text-sm">{t('notAdmin')}</p>
        )
      }
    </LoginGate>
  )
}

function Form() {
  const t = useTranslations('host')
  const errText = useSeminarErrText()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const startMs = Date.parse(String(f.get('startAt') ?? '')) // datetime-local = 보는 사람 지역 시간
    const maxCnt = Number(f.get('maxCnt'))
    const fee = String(f.get('fee') ?? '').trim()
    const subTitle = String(f.get('subTitle') ?? '').trim()
    if (!startAtOk(startMs) || !FEE_RE.test(fee))
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
          fee,
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
      {/* 이름 입력 없음 — 개설 때 남은 섬 이름에서 무작위로 정해진다(sql/011) */}
      <p className="text-muted-foreground text-sm">🏝️ {t('name')}</p>
      <label className="block space-y-1 text-sm">
        <span>{t('subTitle')}</span>
        <input name="subTitle" maxLength={60} className={INPUT} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t('startAt')}</span>
        <input
          name="startAt"
          type="datetime-local"
          required
          // 칸을 누르면 바로 달력이 열린다(작은 달력 아이콘을 찾지 않아도). showPicker 없는 브라우저는 기본 동작 그대로
          onClick={(e) => {
            try {
              e.currentTarget.showPicker?.()
            } catch {}
          }}
          className={`${INPUT} cursor-pointer`}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t('maxCnt')}</span>
        <input name="maxCnt" type="number" required min={1} max={100} defaultValue={30} className={INPUT} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{t('fee')}</span>
        <input name="fee" inputMode="decimal" required defaultValue="0" pattern="\d{1,11}(\.\d{1,7})?" className={INPUT} />
        <span className="text-muted-foreground text-xs">{t('feeHint')}</span>
      </label>
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
