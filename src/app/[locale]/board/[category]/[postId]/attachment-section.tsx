'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('attachment')
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
      toast.success(t('uploadSuccess', { count: uploaded.length }))
    } else {
      const { error } = await res.json()
      toast.error(error ?? t('uploadFail'))
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDelete = async (attchId: string) => {
    if (!confirm(t('deleteConfirm'))) return
    const res = await fetch(`/api/board/${category}/${postId}/attachments/${attchId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      setAttachments((prev) => prev.filter((a) => a.attch_id !== attchId))
      toast.success(t('deleteSuccess'))
    } else {
      const { error } = await res.json()
      toast.error(error ?? t('deleteFail'))
    }
  }

  if (attachments.length === 0 && !canUpload) return null

  return (
    <div className='mb-8 rounded-lg border p-4'>
      <h3 className='mb-3 text-sm font-medium'>
        {attachments.length > 0 ? t('titleCount', { count: attachments.length }) : t('title')}
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
                  {t('delete')}
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
            {uploading ? t('uploading') : t('upload')}
          </Button>
          <p className='mt-1.5 text-xs text-muted-foreground'>{t('sizeLimit')}</p>
        </>
      )}
    </div>
  )
}
