'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

type Attachment = {
  attch_id: string
  fl_nm: string
  fl_url: string
  fl_sz: number
  reg_dtm: string
}

type Props = {
  category: string
  postId: string
  initialAttachments: Attachment[]
  canUpload: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function AttachmentSection({ category, postId, initialAttachments, canUpload }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (files: FileList) => {
    if (!files.length) return
    setUploading(true)
    const formData = new FormData()
    Array.from(files).forEach((f) => formData.append('files', f))

    const res = await fetch(`/api/board/${category}/${postId}/attachments`, {
      method: 'POST',
      body: formData,
    })

    if (res.ok) {
      const { uploaded } = await res.json()
      setAttachments((prev) => [
        ...prev,
        ...uploaded.map((u: { attch_id: string; fl_nm: string; fl_url: string; fl_sz: number }) => ({
          ...u,
          reg_dtm: new Date().toISOString(),
        })),
      ])
      toast.success(`${uploaded.length}개 파일이 업로드됐습니다`)
    } else {
      const { error } = await res.json()
      toast.error(error ?? '업로드 실패')
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDelete = async (attchId: string) => {
    if (!confirm('첨부파일을 삭제할까요?')) return
    const res = await fetch(`/api/board/${category}/${postId}/attachments/${attchId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      setAttachments((prev) => prev.filter((a) => a.attch_id !== attchId))
      toast.success('삭제됐습니다')
    } else {
      const { error } = await res.json()
      toast.error(error ?? '삭제 실패')
    }
  }

  if (attachments.length === 0 && !canUpload) return null

  return (
    <div className='mb-8 rounded-lg border p-4'>
      <h3 className='mb-3 text-sm font-medium'>
        첨부파일{attachments.length > 0 ? ` (${attachments.length})` : ''}
      </h3>

      {attachments.length > 0 && (
        <ul className='mb-3 space-y-1.5'>
          {attachments.map((att) => (
            <li key={att.attch_id} className='flex items-center justify-between gap-2 text-sm'>
              <a
                href={att.fl_url}
                target='_blank'
                rel='noopener noreferrer'
                className='flex min-w-0 items-center gap-1.5 text-blue-600 hover:underline dark:text-blue-400'
              >
                <span className='truncate'>{att.fl_nm}</span>
                <span className='shrink-0 text-xs text-muted-foreground'>
                  ({formatSize(att.fl_sz)})
                </span>
              </a>
              {canUpload && (
                <button
                  onClick={() => handleDelete(att.attch_id)}
                  className='shrink-0 text-xs text-destructive hover:underline'
                >
                  삭제
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <>
          <input
            ref={fileInputRef}
            type='file'
            multiple
            className='hidden'
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
          <Button
            variant='outline'
            size='sm'
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? '업로드 중…' : '파일 추가'}
          </Button>
          <p className='mt-1.5 text-xs text-muted-foreground'>최대 5개 · 파일당 20MB</p>
        </>
      )}
    </div>
  )
}
