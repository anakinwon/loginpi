'use client'

import { useEffect, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'
import { GalleryEditForm } from './gallery-edit-form'

interface Props {
  category: string
  postId: string
}

interface PostData {
  post_ttl: string
  post_cont: string | null
}

export function ClientGalleryEditGate({ category, postId }: Props) {
  const [post, setPost] = useState<PostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(false)
  const [notAllowed, setNotAllowed] = useState(false)

  useEffect(() => {
    async function load() {
      const meRes = await piFetch('/api/auth/me')
      if (!meRes.ok) { setAuthError(true); setLoading(false); return }

      const postRes = await piFetch(`/api/board/${category}/${postId}`)
      if (!postRes.ok) { setNotAllowed(true); setLoading(false); return }

      const data = (await postRes.json()) as { post: PostData }
      setPost(data.post)
      setLoading(false)
    }
    load()
  }, [category, postId])

  if (loading) {
    return <div className='p-8 text-center text-sm text-muted-foreground'>로딩 중...</div>
  }
  if (authError) {
    return (
      <div className='p-8 text-center text-sm text-muted-foreground'>
        로그인이 필요합니다.
      </div>
    )
  }
  if (notAllowed || !post) {
    return (
      <div className='p-8 text-center text-sm text-muted-foreground'>
        게시글을 불러올 수 없습니다.
      </div>
    )
  }

  return (
    <GalleryEditForm
      category={category}
      postId={postId}
      initialTitle={post.post_ttl}
      initialContent={post.post_cont ?? ''}
    />
  )
}
