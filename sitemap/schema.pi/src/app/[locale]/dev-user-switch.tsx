'use client'
import { piFetch } from '@pi/auth/client'
// 개발 전용 사용자 전환(Pi 로그인 구현 전) — /api/dev/user, 운영 빌드에서는 표시하지 않음
import { useEffect, useState } from 'react'

export default function DevUserSwitch() {
  const [cur, setCur] = useState<string | null>(null)
  const [nm, setNm] = useState('')
  useEffect(() => {
    // 운영 빌드에서는 호출하지 않음(상수 치환으로 코드 제거)
    if (process.env.NODE_ENV === 'production') return
    piFetch('/api/dev/user')
      .then((r) => r.json())
      .then((j) => setCur(j.ok ? (j.user?.pi_usr_nm ?? '(없음)') : null))
  }, [])
  if (process.env.NODE_ENV === 'production' || cur === null) return null

  const change = async (e: React.FormEvent) => {
    e.preventDefault()
    const j = await (await piFetch('/api/dev/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pi_usr_nm: nm }) })).json()
    if (j.ok) location.reload()
  }
  return (
    <form onSubmit={change} className="flex flex-wrap items-center gap-2 rounded-card border border-dashed border-line-strong bg-surface px-3 py-2 text-xs text-ink-2">
      <span className="badge" data-tone="warn">
        개발
      </span>
      <span className="font-mono">{cur}</span>
      <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="사용자명" aria-label="전환할 사용자명(영소문자·숫자·_)" title="영소문자·숫자·_ 3~30자" className="input-sm min-w-0 flex-1" pattern="[a-z0-9_]{3,30}" />
      <button className="btn-key btn-sm">전환</button>
    </form>
  )
}
