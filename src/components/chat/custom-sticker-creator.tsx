'use client'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

// TASK-074: 커스텀 스티커 제작 다이얼로그 (Business 전용 — 권한은 API가 검증)
// 이미지 1~10장 업로드 → 팩 생성. 마켓 판매 옵션 시 다른 사용자가 구매 가능.

export function CustomStickerCreator({
  onCreated,
  onClose,
}: {
  onCreated: () => void
  onClose: () => void
}) {
  const [packNm, setPackNm] = useState('')
  const [pricePi, setPricePi] = useState('0.5')
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
    if (!packNm.trim()) { toast.error('팩 이름을 입력해주세요'); return }
    if (files.length === 0) { toast.error('스티커 이미지를 1장 이상 선택해주세요'); return }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set('pack_nm', packNm.trim())
      fd.set('price_pi', mktYn ? pricePi : '0')
      fd.set('mkt_yn', mktYn ? 'Y' : 'N')
      for (const f of files) fd.append('files', f)

      const res = await piFetch('/api/stickers/custom', { method: 'POST', body: fd })
      const data = (await res.json()) as { error?: string; businessRequired?: boolean; pack?: { sticker_cnt: number } }
      if (!res.ok) {
        toast.error(
          data.businessRequired
            ? 'Business 플랜(Pi Host) 전용 기능입니다'
            : (data.error ?? '팩 생성 실패'),
        )
        return
      }
      toast.success(`커스텀 팩 생성 완료! (스티커 ${data.pack?.sticker_cnt}개)`)
      onCreated()
    } catch {
      toast.error('팩 생성 중 오류가 발생했습니다')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4' onClick={onClose}>
      <div
        className='w-full max-w-sm rounded-2xl border bg-background p-4 shadow-xl'
        onClick={e => e.stopPropagation()}
      >
        <div className='mb-3 flex items-center justify-between'>
          <h3 className='text-base font-semibold'>🎨 커스텀 스티커팩 만들기</h3>
          <button onClick={onClose} className='text-muted-foreground hover:text-foreground' aria-label='닫기'>✕</button>
        </div>
        <p className='mb-3 text-xs text-muted-foreground'>
          Business 전용 · 팩당 최대 10장 (png/jpg/gif/webp, 장당 2MB)
        </p>

        <div className='space-y-3'>
          <input
            value={packNm}
            onChange={e => setPackNm(e.target.value)}
            placeholder='팩 이름'
            maxLength={100}
            className='w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm'
          />

          {/* 이미지 선택 + 미리보기 */}
          <input
            ref={fileInputRef}
            type='file'
            accept='image/png,image/jpeg,image/gif,image/webp'
            multiple
            hidden
            onChange={e => handleFiles(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className='w-full rounded-lg border border-dashed py-3 text-xs text-muted-foreground hover:bg-muted'
          >
            + 이미지 선택 ({files.length}/10)
          </button>
          {files.length > 0 && (
            <div className='flex flex-wrap gap-1.5'>
              {files.map((f, i) => (
                <div key={i} className='relative'>
                  <img
                    src={URL.createObjectURL(f)}
                    alt={f.name}
                    className='h-12 w-12 rounded-lg border object-contain'
                  />
                  <button
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className='absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] text-white'
                    aria-label='삭제'
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 마켓 판매 옵션 */}
          <label className='flex items-center gap-2 text-xs'>
            <input type='checkbox' checked={mktYn} onChange={e => setMktYn(e.target.checked)} />
            마켓플레이스에 판매 (다른 사용자가 Pi로 구매)
          </label>
          {mktYn && (
            <div className='flex items-center gap-2'>
              <label className='text-xs text-muted-foreground'>판매가 π</label>
              <input
                type='number'
                value={pricePi}
                onChange={e => setPricePi(e.target.value)}
                min='0'
                max='100'
                step='0.1'
                className='w-24 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm'
              />
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting}
            className='w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50'
          >
            {submitting ? '생성 중…' : '팩 만들기'}
          </button>
        </div>
      </div>
    </div>
  )
}
