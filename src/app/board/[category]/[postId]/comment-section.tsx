'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Comment = {
  cmnt_id: string
  cmnt_cont: string
  rgst_usr_id: string
  rgst_usr_nm: string
  acpt_yn: string
  reg_dtm: string
}

type Props = {
  category: string
  postId: string
  initialComments: Comment[]
  isQna: boolean
  postOwnerId: string
  acptCmntId: string | null
  currentUserId: string | null
  currentUserName: string | null
  currentUserRole: string | null
  canComment: boolean
}

export function CommentSection({
  category,
  postId,
  initialComments,
  isQna,
  postOwnerId,
  acptCmntId,
  currentUserId,
  currentUserName,
  currentUserRole,
  canComment,
}: Props) {
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [acptId, setAcptId] = useState(acptCmntId)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isPostOwner = !!currentUserId && currentUserId === postOwnerId
  const isModerator = currentUserRole === 'ADMIN' || currentUserRole === 'MASTER'

  const handleSubmit = async () => {
    if (!content.trim()) return
    setSubmitting(true)
    const res = await fetch(`/api/board/${category}/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmnt_cont: content.trim() }),
    })
    if (res.ok) {
      const { cmnt_id } = await res.json()
      setComments((prev) => [
        ...prev,
        {
          cmnt_id,
          cmnt_cont: content.trim(),
          rgst_usr_id: currentUserId!,
          rgst_usr_nm: currentUserName ?? '',
          acpt_yn: 'N',
          reg_dtm: new Date().toISOString(),
        },
      ])
      setContent('')
      toast.success('댓글이 등록됐습니다')
    } else {
      const { error } = await res.json()
      toast.error(error ?? '댓글 등록 실패')
    }
    setSubmitting(false)
  }

  const handleDelete = async (cmntId: string) => {
    if (!confirm('댓글을 삭제할까요?')) return
    const res = await fetch(`/api/board/${category}/${postId}/comments/${cmntId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      setComments((prev) => prev.filter((c) => c.cmnt_id !== cmntId))
      if (acptId === cmntId) setAcptId(null)
      toast.success('댓글이 삭제됐습니다')
    } else {
      const { error } = await res.json()
      toast.error(error ?? '삭제 실패')
    }
  }

  const handleAccept = async (cmntId: string | null) => {
    const res = await fetch(`/api/board/${category}/${postId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmnt_id: cmntId }),
    })
    if (res.ok) {
      setAcptId(cmntId)
      setComments((prev) =>
        prev.map((c) => ({ ...c, acpt_yn: c.cmnt_id === cmntId ? 'Y' : 'N' }))
      )
      toast.success(cmntId ? '답변이 채택됐습니다' : '채택이 취소됐습니다')
    } else {
      const { error } = await res.json()
      toast.error(error ?? '처리 실패')
    }
  }

  return (
    <div className='mt-8 border-t pt-6'>
      <h2 className='mb-4 text-lg font-semibold'>댓글 {comments.length > 0 ? `${comments.length}개` : ''}</h2>

      <div className='space-y-3'>
        {comments.length === 0 && (
          <p className='py-6 text-center text-sm text-muted-foreground'>아직 댓글이 없습니다.</p>
        )}
        {comments.map((comment) => {
          const isMyComment = currentUserId === comment.rgst_usr_id
          const isAccepted = comment.cmnt_id === acptId

          return (
            <div
              key={comment.cmnt_id}
              className={cn(
                'rounded-lg border p-4',
                isAccepted &&
                  'border-green-300 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10'
              )}
            >
              <div className='mb-2 flex items-center justify-between gap-2'>
                <div className='flex items-center gap-2'>
                  <span className='text-sm font-medium'>{comment.rgst_usr_nm}</span>
                  {isAccepted && (
                    <span className='rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400'>
                      채택된 답변
                    </span>
                  )}
                </div>
                <div className='flex items-center gap-1'>
                  <time className='text-xs text-muted-foreground'>
                    {new Date(comment.reg_dtm).toLocaleDateString('ko-KR')}
                  </time>
                  {isQna && isPostOwner && (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-6 px-2 text-xs'
                      onClick={() => handleAccept(isAccepted ? null : comment.cmnt_id)}
                    >
                      {isAccepted ? '채택 취소' : '채택'}
                    </Button>
                  )}
                  {(isMyComment || isModerator) && (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-6 px-2 text-xs text-destructive hover:text-destructive'
                      onClick={() => handleDelete(comment.cmnt_id)}
                    >
                      삭제
                    </Button>
                  )}
                </div>
              </div>
              <p className='whitespace-pre-wrap text-sm'>{comment.cmnt_cont}</p>
            </div>
          )
        })}
      </div>

      {canComment && (
        <div className='mt-6'>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit()
            }}
            placeholder='댓글을 입력하세요 (Ctrl+Enter로 등록)'
            rows={3}
            className='mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          />
          <Button onClick={handleSubmit} disabled={submitting || !content.trim()} size='sm'>
            {submitting ? '등록 중…' : '댓글 등록'}
          </Button>
        </div>
      )}

      {!canComment && (
        <p className='mt-6 text-center text-sm text-muted-foreground'>
          댓글을 작성하려면 로그인하세요.
        </p>
      )}
    </div>
  )
}
