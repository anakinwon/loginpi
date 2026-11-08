'use client'

import { Link } from '@/i18n/navigation'

interface Props {
  orderId: string
}

export function WriteFeedbackButton({ orderId }: Props) {
  return (
    <Link
      href={`/store/my/orders/${orderId}/feedback`}
      className="inline-flex items-center gap-1 rounded-full border border-amber-400 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-500 dark:text-amber-400 dark:hover:bg-amber-950/30"
    >
      ⭐ 후기 작성
    </Link>
  )
}
