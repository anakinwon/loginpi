'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'
import { piFetch } from '@/lib/pi-fetch'

// 가입/이용 동의 모달 — 통합로그인·매장등록 등 공통 사용.
// 필수(이용약관·개인정보)는 체크해야 진행, 마케팅은 선택. 동의 시 /api/consent 기록 후 onAgreed.
interface Props {
  onAgreed: () => void
}

export function ConsentDialog({ onAgreed }: Props) {
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [saving, setSaving] = useState(false)

  const allChecked = terms && privacy && marketing
  const requiredOk = terms && privacy

  function toggleAll() {
    const next = !allChecked
    setTerms(next)
    setPrivacy(next)
    setMarketing(next)
  }

  async function submit() {
    if (!requiredOk) return
    setSaving(true)
    try {
      const res = await piFetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms, privacy, marketing }),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(d.error ?? '동의 저장에 실패했습니다')
        return
      }
      onAgreed()
    } catch {
      toast.error('네트워크 오류로 동의를 저장하지 못했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="bg-background w-full max-w-md rounded-t-2xl p-5 shadow-xl sm:rounded-2xl">
        <h2 className="text-base font-bold">서비스 이용 동의</h2>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          Cafe.pi 이용을 위해 아래 약관에 동의해 주세요. (필수 항목 동의 후 이용 가능)
        </p>

        {/* 전체 동의 */}
        <button
          type="button"
          onClick={toggleAll}
          className="mt-4 flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left"
        >
          <Check checked={allChecked} />
          <span className="text-sm font-semibold">전체 동의</span>
        </button>

        <div className="mt-2 space-y-1.5">
          <Row
            checked={terms}
            onToggle={() => setTerms((v) => !v)}
            required
            label="이용약관 동의"
            href="/docs/legal/terms"
          />
          <Row
            checked={privacy}
            onToggle={() => setPrivacy((v) => !v)}
            required
            label="개인정보 수집·이용 동의"
            href="/docs/legal/privacy-consent"
          />
          <Row
            checked={marketing}
            onToggle={() => setMarketing((v) => !v)}
            label="마케팅 정보 수신 동의"
            href="/docs/legal/privacy"
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!requiredOk || saving}
          className="bg-primary text-primary-foreground mt-4 w-full rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {saving ? '처리 중…' : '동의하고 계속'}
        </button>
        <p className="text-muted-foreground mt-2 text-center text-[11px]">
          필수 항목(이용약관·개인정보)에 동의해야 서비스를 이용할 수 있습니다.
        </p>
      </div>
    </div>
  )
}

function Row({
  checked,
  onToggle,
  label,
  href,
  required,
}: {
  checked: boolean
  onToggle: () => void
  label: string
  href: string
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
          <span className={required ? 'text-primary font-medium' : 'text-muted-foreground'}>
            {required ? '(필수)' : '(선택)'}
          </span>{' '}
          {label}
        </span>
      </button>
      <Link
        href={href}
        target="_blank"
        className="text-muted-foreground shrink-0 text-xs underline"
      >
        보기
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
