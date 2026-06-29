'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { piFetch } from '@/lib/pi-fetch'

// 가입/이용 동의 모달 — 통합로그인·매장등록 등 공통 사용.
// 필수(이용약관·개인정보·위치·연령)는 충족해야 진행, 마케팅은 선택. 동의 시 /api/consent 기록 후 onAgreed.
interface Props {
  onAgreed: () => void
}

// 만 나이 계산(클라이언트 사전 판단용 — 최종 검증은 서버)
function clientAge(birth: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const now = new Date()
  let age = now.getFullYear() - y
  const md = now.getMonth() - (mo - 1)
  if (md < 0 || (md === 0 && now.getDate() < d)) age--
  return age >= 0 && age <= 120 ? age : null
}

export function ConsentDialog({ onAgreed }: Props) {
  const t = useTranslations('consent')
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [lbs, setLbs] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [birth, setBirth] = useState('')
  const [guardian, setGuardian] = useState(false)
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const age = birth ? clientAge(birth) : null
  const birthValid = age !== null
  const isMinor = age !== null && age < 14

  const allChecked = terms && privacy && lbs && marketing
  const requiredOk =
    terms && privacy && lbs && birthValid && (!isMinor || guardian)

  function toggleAll() {
    const next = !allChecked
    setTerms(next)
    setPrivacy(next)
    setLbs(next)
    setMarketing(next)
  }

  async function submit() {
    if (!requiredOk) return
    setSaving(true)
    try {
      const res = await piFetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terms,
          privacy,
          lbs,
          marketing,
          birth,
          guardian,
        }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(d.error ?? t('errSave'))
        return
      }
      onAgreed()
    } catch {
      toast.error(t('errNetwork'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="bg-background w-full max-w-md rounded-t-2xl p-5 shadow-xl sm:rounded-2xl">
        <h2 className="text-base font-bold">{t('title')}</h2>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {t('desc')}
        </p>

        {/* 생년월일 (연령 게이트) */}
        <div className="mt-4">
          <label className="text-sm font-medium">
            {t('birthLabel')}{' '}
            <span className="text-primary">{t('required')}</span>
          </label>
          <input
            type="date"
            value={birth}
            max={today}
            onChange={(e) => setBirth(e.target.value)}
            className="border-input bg-background mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          />
          {birth && !birthValid && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              {t('birthInvalid')}
            </p>
          )}
          {isMinor && (
            <button
              type="button"
              onClick={() => setGuardian((v) => !v)}
              className="border-primary/40 bg-primary/5 mt-2 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left"
            >
              <Check checked={guardian} />
              <span className="text-xs leading-relaxed">
                <span className="text-primary font-medium">
                  {t('required')}
                </span>{' '}
                {t('guardian')}
              </span>
            </button>
          )}
        </div>

        {/* 전체 동의 */}
        <button
          type="button"
          onClick={toggleAll}
          className="mt-4 flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left"
        >
          <Check checked={allChecked} />
          <span className="text-sm font-semibold">{t('agreeAll')}</span>
        </button>

        <div className="mt-2 space-y-1.5">
          <Row
            checked={terms}
            onToggle={() => setTerms((v) => !v)}
            tag={t('required')}
            required
            label={t('terms')}
            viewText={t('view')}
            href="/docs/legal/terms"
          />
          <Row
            checked={privacy}
            onToggle={() => setPrivacy((v) => !v)}
            tag={t('required')}
            required
            label={t('privacy')}
            viewText={t('view')}
            href="/docs/legal/privacy-consent"
          />
          <Row
            checked={lbs}
            onToggle={() => setLbs((v) => !v)}
            tag={t('required')}
            required
            label={t('lbs')}
            viewText={t('view')}
            href="/docs/agreement/lbs"
          />
          <Row
            checked={marketing}
            onToggle={() => setMarketing((v) => !v)}
            tag={t('optional')}
            label={t('marketing')}
            viewText={t('view')}
            href="/docs/legal/privacy"
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!requiredOk || saving}
          className="bg-primary text-primary-foreground mt-4 w-full rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t('processing') : t('submit')}
        </button>
        <p className="text-muted-foreground mt-2 text-center text-[11px]">
          {t('note')}
        </p>
      </div>
    </div>
  )
}

function Row({
  checked,
  onToggle,
  label,
  tag,
  href,
  viewText,
  required,
}: {
  checked: boolean
  onToggle: () => void
  label: string
  tag: string
  href: string
  viewText: string
  required?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center gap-2 text-left"
      >
        <Check checked={checked} />
        <span className="text-sm">
          <span
            className={
              required ? 'text-primary font-medium' : 'text-muted-foreground'
            }
          >
            {tag}
          </span>{' '}
          {label}
        </span>
      </button>
      <Link
        href={href}
        target="_blank"
        className="text-muted-foreground shrink-0 text-xs underline"
      >
        {viewText}
      </Link>
    </div>
  )
}

function Check({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
        checked
          ? 'bg-primary border-primary text-primary-foreground'
          : 'border-input text-transparent'
      }`}
      aria-hidden="true"
    >
      ✓
    </span>
  )
}
