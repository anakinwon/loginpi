'use client'

import { StarRating } from './StarRating'

export interface FeedbackCardData {
  fbck_id: string
  display_name: string
  fbck_scr: number
  fbck_cn: string
  fbck_img: string[]
  reg_dtm: string
}

interface FeedbackCardProps {
  feedback: FeedbackCardData
  onDelete?: (fbckId: string) => void
  isOwner?: boolean
}

export function FeedbackCard({
  feedback,
  onDelete,
  isOwner,
}: FeedbackCardProps) {
  const dateStr = new Date(feedback.reg_dtm).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="border-border flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{feedback.display_name}</span>
          <StarRating value={feedback.fbck_scr} readonly size="sm" />
        </div>
        <span className="text-muted-foreground text-xs">{dateStr}</span>
      </div>

      <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
        {feedback.fbck_cn}
      </p>

      {feedback.fbck_img.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {feedback.fbck_img.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt={`후기 이미지 ${i + 1}`}
              className="h-20 w-20 rounded-md object-cover"
            />
          ))}
        </div>
      )}

      {isOwner && onDelete && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onDelete(feedback.fbck_id)}
            className="text-destructive text-xs hover:underline"
          >
            삭제
          </button>
        </div>
      )}
    </div>
  )
}
