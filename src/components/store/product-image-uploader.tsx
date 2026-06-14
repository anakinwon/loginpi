'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { resizeImage } from '@/lib/image-resize'
import { Button } from '@/components/ui/button'

export interface ProductImage {
  url: string // 원본(압축) 이미지
  thumbUrl: string // 목록용 썸네일
}

interface Props {
  images: ProductImage[]
  onChange: (images: ProductImage[]) => void
  max?: number
}

const ONE_MB = 1024 * 1024

// 상품 이미지 업로더 — 갤러리 선택 또는 촬영. 클라이언트 압축(원본 1280px·썸네일 400px)
// 후 1MB 이하로 업로드. 첫 장이 대표(목록 썸네일)로 사용된다.
export function ProductImageUploader({ images, onChange, max = 3 }: Props) {
  const [busy, setBusy] = useState(false)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  async function upload(blob: Blob): Promise<string> {
    const fd = new FormData()
    fd.append('file', blob, 'image.jpg')
    const res = await piFetch('/api/store/items/images', {
      method: 'POST',
      body: fd,
    })
    if (!res.ok) {
      const { error } = (await res.json().catch(() => ({}))) as {
        error?: string
      }
      throw new Error(error ?? '업로드 실패')
    }
    const { url } = (await res.json()) as { url: string }
    return url
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setBusy(true)
    try {
      const next = [...images]
      for (const file of Array.from(fileList)) {
        if (next.length >= max) {
          toast.error(`이미지는 최대 ${max}장까지 등록할 수 있습니다`)
          break
        }
        if (!file.type.startsWith('image/')) {
          toast.error('이미지 파일만 등록할 수 있습니다')
          continue
        }
        // 원본 압축(1280px, 1MB 이하 보장) + 목록용 썸네일(400px)
        const origBlob = await resizeImage(file, 1280, {
          quality: 0.85,
          maxBytes: ONE_MB,
        })
        if (origBlob.size > ONE_MB) {
          toast.error('이미지를 1MB 이하로 줄일 수 없습니다')
          continue
        }
        const thumbBlob = await resizeImage(file, 400, { quality: 0.7 })
        const [url, thumbUrl] = await Promise.all([
          upload(origBlob),
          upload(thumbBlob),
        ])
        next.push({ url, thumbUrl })
      }
      onChange(next)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '업로드에 실패했습니다')
    } finally {
      setBusy(false)
      // 같은 파일 재선택 가능하도록 input 초기화
      if (galleryRef.current) galleryRef.current.value = ''
      if (cameraRef.current) cameraRef.current.value = ''
    }
  }

  function remove(idx: number) {
    onChange(images.filter((_, i) => i !== idx))
  }

  const canAdd = images.length < max && !busy

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {images.map((img, i) => (
          <div
            key={img.url}
            className="bg-muted relative aspect-square overflow-hidden rounded-md border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.thumbUrl}
              alt={`상품 이미지 ${i + 1}`}
              className="h-full w-full object-cover"
            />
            {i === 0 && (
              <span className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
                대표
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
              aria-label="이미지 삭제"
            >
              ×
            </button>
          </div>
        ))}

        {images.length < max && (
          <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed">
            {busy ? (
              <span className="text-muted-foreground text-xs">업로드 중…</span>
            ) : (
              <span className="text-muted-foreground text-2xl">＋</span>
            )}
          </div>
        )}
      </div>

      {/* 숨김 input — 갤러리(multiple) / 촬영(capture) */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAdd}
          onClick={() => galleryRef.current?.click()}
        >
          🖼️ 사진 선택
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAdd}
          onClick={() => cameraRef.current?.click()}
        >
          📷 촬영
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        최대 {max}장 · 1MB 이하로 자동 압축 · 첫 번째 사진이 목록 대표(썸네일)로
        사용됩니다.
      </p>
    </div>
  )
}
