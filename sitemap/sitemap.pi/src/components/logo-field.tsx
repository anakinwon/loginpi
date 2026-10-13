'use client'
// 회사 로고 입력 — 파일 선택 → 300×300 정규화(src/lib/logo.ts) → /api/me/upload → 공개 URL. 신청 폼(my-sites)·관리자 수정(admin-panel) 공용
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi, useApiErrorText } from '@/lib/client-api'
import { normalizeLogo } from '@/lib/logo'
import { IMG_MIME, LIMITS } from '@/lib/site'

export function LogoField({
  id = 'f-img',
  value,
  onChange,
  onError,
  onBusy,
  disabled,
}: {
  id?: string
  value: string | null
  onChange: (url: string | null) => void
  onError: (msg: string | null) => void
  onBusy?: (busy: boolean) => void
  disabled?: boolean
}) {
  const t = useTranslations('form')
  const errText = useApiErrorText()
  const [busy, setBusy] = useState(false)
  const setWorking = (b: boolean) => {
    setBusy(b)
    onBusy?.(b)
  }

  const upload = async (file: File) => {
    if (file.size > LIMITS.imgMaxBytes)
      return onError(errText({ code: 'IMG_TOO_LARGE' }))
    setWorking(true)
    onError(null)
    // 300×300 정사각형(중앙 자르기)으로 맞춰 올린다 — 디코딩 실패(HEIC 등)면 원본 그대로, 서버 형식 검사(매직바이트)에 맡긴다
    const blob = await normalizeLogo(file).catch(() => file)
    const fd = new FormData()
    fd.append('file', blob, blob instanceof File ? blob.name : 'logo.png')
    const r = await readApi<{ url: string }>(
      piFetch('/api/me/upload', { method: 'POST', body: fd }),
    )
    setWorking(false)
    if (r.ok) onChange(r.data.url)
    else onError(errText(r.body))
  }

  return (
    <div>
      <label className="label" htmlFor={id}>
        {t('image')}
      </label>
      {value && (
        <img
          src={value}
          alt=""
          className="mb-2 size-24 rounded-full object-cover"
        />
      )}
      <input
        id={id}
        type="file"
        accept={IMG_MIME.join(',')}
        className="text-sm"
        disabled={disabled || busy}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
        }}
      />
      <p className="text-muted-foreground mt-1 text-xs">{t('imageHint')}</p>
      {value && (
        <button
          type="button"
          className="btn mt-1"
          disabled={disabled || busy}
          onClick={() => onChange(null)}
        >
          {t('imageRemove')}
        </button>
      )}
    </div>
  )
}
