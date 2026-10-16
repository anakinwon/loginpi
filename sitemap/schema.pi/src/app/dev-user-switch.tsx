'use client'
// 개발 전용 사용자 전환(Pi 로그인 구현 전) — /api/dev/user, 운영 빌드에서는 표시하지 않음
import { useEffect, useState } from 'react'

export default function DevUserSwitch() {
  const [cur, setCur] = useState<string | null>(null)
  const [nm, setNm] = useState('')
  useEffect(() => {
    fetch('/api/dev/user')
      .then((r) => r.json())
      .then((j) => setCur(j.ok ? (j.user?.pi_usr_nm ?? '(없음)') : null))
  }, [])
  if (process.env.NODE_ENV === 'production' || cur === null) return null

  const change = async (e: React.FormEvent) => {
    e.preventDefault()
    const j = await (await fetch('/api/dev/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pi_usr_nm: nm }) })).json()
    if (j.ok) location.reload()
  }
  return (
    <form onSubmit={change} className="mt-4 flex items-center gap-2 rounded border border-dashed border-amber-500 p-2 text-xs">
      <span className="text-amber-700">개발용 사용자 : {cur}</span>
      <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="전환할 사용자명(영소문자·숫자·_)" className="flex-1 rounded border px-2 py-1" pattern="[a-z0-9_]{3,30}" />
      <button className="rounded border px-2 py-1">전환</button>
    </form>
  )
}
