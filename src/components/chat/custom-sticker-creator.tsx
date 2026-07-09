'use client'
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import {
  useApiErrorMessage,
  type ApiErrorPayload,
} from '@/hooks/use-api-error'

// TASK-074: 커스텀 스티커 제작 다이얼로그 (Business 전용 — 권한은 API가 검증)
// 이미지 1~10장 업로드 → 팩 생성. 마켓 판매 옵션 시 다른 사용자가 구매 가능.

export function CustomStickerCreator({
  onCreated,
  onClose,
}: {
  onCreated: () => void
  onClose: () => void
}) {
  const t = useTranslations('chat')
  const tc = useTranslations('common')
  const apiErr = useApiErrorMessage()
  const [packNm, setPackNm] = useState('')
  const [priceBean, setPriceBean] = useState('50')
  const [mktYn, setMktYn] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFiles(selected: FileList | null) {
    if (!selected) return
    const next = [...files, ...Array.from(selected)].slice(0, 10)
    setFiles(next)
  }

  async function submit() {
    if (!packNm.trim()) {
      toast.error(t('customSticker.packNameRequired'))
      return
    }
    if (files.length === 0) {
      toast.error(t('customSticker.imagesRequired'))
      return
    }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set('pack_nm', packNm.trim())
      fd.set('price_bean', mktYn ? priceBean : '0')
      fd.set('mkt_yn', mktYn ? 'Y' : 'N')
      for (const f of files) fd.append('files', f)

      const res = await piFetch('/api/stickers/custom', {
        method: 'POST',
        body: fd,
      })
      const data = (await res.json()) as ApiErrorPayload & {
        businessRequired?: boolean
        pack?: { sticker_cnt: number }
      }
      if (!res.ok) {
        toast.error(
          data.businessRequired
            ? t('customSticker.businessOnly')
            : apiErr(data, t('customSticker.createFail')),
        )
        return
      }
      toast.success(
        t('customSticker.created', { count: data.pack?.sticker_cnt ?? 0 }),
      )
      onCreated()
    } catch {
      toast.error(t('customSticker.createError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background w-full max-w-sm rounded-2xl border p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            {t('customSticker.title')}
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label={tc('close')}
          >
            ✕
          </button>
        </div>
        <p className="text-muted-foreground mb-3 text-xs">
          {t('customSticker.subtitle')}
        </p>

        <div className="space-y-3">
          <input
            value={packNm}
            onChange={(e) => setPackNm(e.target.value)}
            placeholder={t('customSticker.packNameLabel')}
            maxLength={100}
            className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
          />

          {/* 이미지 선택 + 미리보기 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-muted-foreground hover:bg-muted w-full rounded-lg border border-dashed py-3 text-xs"
          >
            {t('customSticker.selectImages', { count: files.length })}
          </button>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <div key={i} className="relative">
                  <img
                    src={URL.createObjectURL(f)}
                    alt={f.name}
                    className="h-12 w-12 rounded-lg border object-contain"
                  />
                  <button
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="bg-destructive absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-white"
                    aria-label={tc('delete')}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 마켓 판매 옵션 */}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={mktYn}
              onChange={(e) => setMktYn(e.target.checked)}
            />
            {t('customSticker.sellOptionBean')}
          </label>
          {mktYn && (
            <div className="flex items-center gap-2">
              <label className="text-muted-foreground text-xs">
                {t('customSticker.priceLabelBean')}
              </label>
              <input
                type="number"
                value={priceBean}
                onChange={(e) => setPriceBean(e.target.value)}
                min="0"
                max="10000"
                step="1"
                className="w-24 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
              />
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting}
            className="bg-primary text-primary-foreground w-full rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting
              ? t('customSticker.creating')
              : t('customSticker.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
