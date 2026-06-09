'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { GalleryBodyEditor } from './gallery-body-editor'
import {
  parseBlocks,
  serializeBlocks,
  type EditorBlock,
  type SavedImageBlock,
} from './gallery-block-utils'

type Props = { category: string }

export function GalleryPostForm({ category }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => parseBlocks(null))
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { toast.error('제목을 입력해주세요'); return }
    setSubmitting(true)

    // 1. 글 생성 (post_cont는 이후 PATCH로 채움)
    const res = await piFetch(`/api/board/${category}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_ttl: title.trim() }),
    })

    if (!res.ok) {
      const { error } = (await res.json()) as { error?: string }
      toast.error(error ?? '게시글 작성 실패')
      setSubmitting(false)
      return
    }

    const { post_id } = (await res.json()) as { post_id: string }

    // 2. pending 이미지 업로드 → saved 블록으로 교체
    const finalBlocks: EditorBlock[] = []
    for (const block of blocks) {
      if (block.t !== 'img' || block.kind !== 'pending') {
        finalBlocks.push(block)
        continue
      }
      const fd = new FormData()
      fd.append('files', block.file)
      fd.append('sort_ord', String(finalBlocks.length))
      const uploadRes = await piFetch(`/api/board/${category}/${post_id}/attachments`, {
        method: 'POST',
        body: fd,
      })
      if (uploadRes.ok) {
        const data = (await uploadRes.json()) as {
          uploaded: { attch_id: string; fl_nm: string; fl_url: string }[]
        }
        const u = data.uploaded[0]
        URL.revokeObjectURL(block.blobUrl)
        const saved: SavedImageBlock = { t: 'img', kind: 'saved', id: u.attch_id, url: u.fl_url, nm: u.fl_nm }
        finalBlocks.push(saved)
      } else {
        toast.error(`이미지 업로드 실패: ${block.nm}`)
      }
    }

    // 3. post_cont PATCH
    const postCont = serializeBlocks(finalBlocks)
    if (postCont) {
      await piFetch(`/api/board/${category}/${post_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_ttl: title.trim(), post_cont: postCont }),
      })
    }

    toast.success('게시글이 작성되었습니다')
    router.push(`/board/${category}/${post_id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-5'>
      <div className='space-y-1.5'>
        <Label htmlFor='post-title'>제목</Label>
        <Input
          id='post-title'
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='제목을 입력하세요'
          required
          disabled={submitting}
        />
      </div>

      <div className='space-y-1.5'>
        <Label>본문</Label>
        <GalleryBodyEditor
          blocks={blocks}
          onChange={setBlocks}
          disabled={submitting}
        />
      </div>

      <div className='flex gap-2'>
        <Button type='submit' disabled={submitting}>
          {submitting ? '작성 중...' : '작성하기'}
        </Button>
        <Button type='button' variant='outline' onClick={() => router.back()} disabled={submitting}>
          취소
        </Button>
      </div>
    </form>
  )
}
