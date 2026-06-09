'use client'

import { useRef, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'
import type { UserRow } from '@/lib/users'

interface Props {
  initialUser: UserRow
  onSaved: (user: UserRow) => void
}

const FIELDS: { name: keyof UserRow; label: string; placeholder: string }[] = [
  { name: 'display_name', label: '표시 이름',  placeholder: '화면에 표시될 이름' },
  { name: 'real_nm',      label: '실명',       placeholder: '실제 성명' },
  { name: 'nick_nm',      label: '닉네임',     placeholder: '닉네임' },
  { name: 'phone_no',     label: '연락처',     placeholder: '010-0000-0000' },
  { name: 'addr',         label: '주소',       placeholder: '기본 주소' },
  { name: 'addr_dtl',     label: '상세 주소',  placeholder: '동·호수 등' },
]

export function ProfileForm({ initialUser, onSaved }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const fd = new FormData(e.currentTarget)
    const body: Record<string, string> = {}
    fd.forEach((v, k) => {
      if (typeof v === 'string' && v.trim() !== '') body[k] = v.trim()
    })

    // piFetch — X-Pi-Token 헤더 자동 첨부 (Pi Browser 필수)
    const res = await piFetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    setSaving(false)

    if (!res.ok) {
      setMessage({ type: 'err', text: '저장에 실패했습니다. 다시 시도해 주세요.' })
      return
    }

    const { user } = (await res.json()) as { user: UserRow }
    onSaved(user)
    setMessage({ type: 'ok', text: '저장되었습니다.' })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className='space-y-4'>
      {FIELDS.map(({ name, label, placeholder }) => (
        <div key={name} className='flex flex-col gap-1'>
          <label className='text-sm font-medium' htmlFor={name}>
            {label}
          </label>
          <input
            id={name}
            name={name}
            defaultValue={(initialUser[name] as string | null) ?? ''}
            placeholder={placeholder}
            className='rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50'
          />
        </div>
      ))}

      {message && (
        <p className={`text-sm ${message.type === 'ok' ? 'text-green-600' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}

      <button
        type='submit'
        disabled={saving}
        className='w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50'
      >
        {saving ? '저장 중…' : '저장'}
      </button>
    </form>
  )
}
