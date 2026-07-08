'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

type ImageItem = {
  attch_id: string
  fl_nm: string
  fl_url: string
}

type Props = {
  images: ImageItem[]
}

export function GallerySection({ images }: Props) {
  const t = useTranslations('board')
  const [selected, setSelected] = useState<ImageItem | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)

  const navigate = useCallback(
    (dir: number) => {
      const next = (selectedIdx + dir + images.length) % images.length
      setSelectedIdx(next)
      setSelected(images[next])
    },
    [selectedIdx, images],
  )

  useEffect(() => {
    if (!selected) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
      if (e.key === 'ArrowRight') navigate(1)
      if (e.key === 'ArrowLeft') navigate(-1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected, navigate])

  if (images.length === 0) return null

  const open = (idx: number) => {
    setSelectedIdx(idx)
    setSelected(images[idx])
  }

  return (
    <>
      <div className="mb-8">
        <h3 className="mb-3 text-sm font-medium">
          {t('galleryTitle', { count: images.length })}
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((img, idx) => (
            <button
              key={img.attch_id}
              onClick={() => open(idx)}
              className="group bg-muted relative aspect-square overflow-hidden rounded-lg border"
              aria-label={img.fl_nm}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.fl_url}
                alt={img.fl_nm}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label={selected.fl_nm}
        >
          {/* 닫기 */}
          <button
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            onClick={() => setSelected(null)}
            aria-label={t('galleryClose')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {/* 이전 */}
          {images.length > 1 && (
            <button
              className="absolute top-1/2 left-4 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation()
                navigate(-1)
              }}
              aria-label={t('gallery.prevImage')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}

          {/* 이미지 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.fl_url}
            alt={selected.fl_nm}
            className="max-h-[90vh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* 다음 */}
          {images.length > 1 && (
            <button
              className="absolute top-1/2 right-4 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation()
                navigate(1)
              }}
              aria-label={t('gallery.nextImage')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}

          {/* 카운터 */}
          {images.length > 1 && (
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/70">
              {selectedIdx + 1} / {images.length}
            </p>
          )}
        </div>
      )}
    </>
  )
}
