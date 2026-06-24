import { getSessionUser } from '@/lib/auth-check'
import { Link } from '@/i18n/navigation'
import { StoreNav } from '@/components/store/store-nav'
import { ClientFeedbackPage } from '@/components/feedback/ClientFeedbackPage'

export async function generateMetadata() {
  return { title: '이용후기 작성' }
}

// 이용후기 작성 페이지 — Pi Browser redirect 금지, 클라이언트 게이트 위임
export default async function OrderFeedbackPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params
  const user = await getSessionUser()

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 md:p-6">
      <StoreNav active="orders" />
      <Link
        href="/store/my/orders"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← 구매 내역으로
      </Link>
      <h1 className="text-lg font-bold">⭐ 이용후기 작성</h1>
      <ClientFeedbackPage orderId={orderId} serverAuthed={!!user} />
    </div>
  )
}
