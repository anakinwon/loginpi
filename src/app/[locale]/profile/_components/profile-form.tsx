'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch, setPiToken } from '@/lib/pi-fetch'
import { usePiAuth } from '@/components/pi-auth-provider'
import type { LocaleOption } from '@/lib/locale-options'
import type { UserRow } from '@/lib/users'

interface Props {
  initialUser: UserRow
  localeOptions: LocaleOption[]
  onSaved: (user: UserRow) => void
}

// 라벨/placeholder는 컴포넌트에서 t(`info.${key}`)·t(`infoExtra.${key}Ph`)로 해석한다.
// (모듈 상수에선 useTranslations 사용 불가)
const FIELDS: { name: keyof UserRow; key: string }[] = [
  { name: 'display_name', key: 'displayName' },
  { name: 'real_nm', key: 'realNm' },
  { name: 'nick_nm', key: 'nickNm' },
  { name: 'phone_no', key: 'phoneNo' },
  { name: 'addr', key: 'addr' },
  { name: 'addr_dtl', key: 'addrDtl' },
  { name: 'kakao_id', key: 'kakaoId' },
]

export function ProfileForm({ initialUser, localeOptions, onSaved }: Props) {
  const t = useTranslations('profile')
  const tc = useTranslations('common')
  const formRef = useRef<HTMLFormElement>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{
    type: 'ok' | 'err'
    text: string
  } | null>(null)
  const { updateUser } = usePiAuth()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const fd = new FormData(e.currentTarget)
    // display_name은 필수(빈값 시 전송 제외 → 기존값 유지).
    // 나머지 선택 필드는 빈값('')도 전송해야 '지우기'가 서버에 반영된다.
    // (빈값을 제외하면 서버 optional 스키마가 "수정 안 함"으로 처리해 옛값이 남는 버그)
    const REQUIRED_FIELDS = new Set(['display_name'])
    const body: Record<string, string> = {}
    fd.forEach((v, k) => {
      if (typeof v !== 'string') return
      const val = v.trim()
      if (val === '' && REQUIRED_FIELDS.has(k)) return
      body[k] = val
    })

    // piFetch — X-Pi-Token 헤더 자동 첨부 (Pi Browser 필수)
    const res = await piFetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    setSaving(false)

    if (!res.ok) {
      setMessage({
        type: 'err',
        text: t('info.saveError'),
      })
      return
    }

    const { user, token } = (await res.json()) as {
      user: UserRow
      token?: string
    }
    // nick_nm 변경 시 Pi 세션 in-memory state 즉시 갱신 → 헤더 바로 반영
    updateUser({ nick_nm: user.nick_nm ?? null })
    // localStorage Pi 토큰도 갱신 → 새로고침 후에도 헤더 유지
    if (token) setPiToken(token)
    onSaved(user)
    setMessage({ type: 'ok', text: t('info.saved') })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {FIELDS.map(({ name, key }) => (
        <div key={name} className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor={name}>
            {t(`info.${key}`)}{' '}
            <span className="text-muted-foreground font-normal">
              {name === 'display_name' ? tc('required') : tc('optional')}
            </span>
          </label>
          <input
            id={name}
            name={name}
            defaultValue={(initialUser[name] as string | null) ?? ''}
            placeholder={t(`infoExtra.${key}Ph`)}
            className="focus:ring-primary/50 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
        </div>
      ))}

      {/* PiTranslate™ 표시 언어 — 카페 메시지가 이 언어로 자동 번역됨 */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="display_locale_cd">
          {t('infoExtra.displayLocale')}{' '}
          <span className="text-muted-foreground font-normal">
            {tc('optional')}
          </span>
        </label>
        <select
          id="display_locale_cd"
          name="display_locale_cd"
          defaultValue={initialUser.display_locale_cd ?? ''}
          className="bg-background focus:ring-primary/50 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
        >
          <option value="">{t('infoExtra.displayLocaleNone')}</option>
          {localeOptions.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* 자기소개 — textarea (FIELDS 루프 밖에서 별도 렌더) */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="self_intro">
          {t('info.selfIntro')}{' '}
          <span className="text-muted-foreground font-normal">
            {tc('optional')}
          </span>
        </label>
        <textarea
          id="self_intro"
          name="self_intro"
          defaultValue={(initialUser.self_intro as string | null) ?? ''}
          placeholder={t('infoExtra.selfIntroPh')}
          maxLength={500}
          rows={4}
          className="focus:ring-primary/50 resize-none rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
        />
      </div>

      {message && (
        <p
          className={`text-sm ${message.type === 'ok' ? 'text-green-600' : 'text-destructive'}`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="bg-primary text-primary-foreground w-full rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {saving ? tc('saving') : tc('save')}
      </button>
    </form>
  )
}
