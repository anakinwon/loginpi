import { getTranslations } from 'next-intl/server'
import { getSessionUser } from '@/lib/auth-check'
import { getActiveFeeMode } from '@/lib/fee-resolver'
import { Link } from '@/i18n/navigation'
import { StoreNav } from '@/components/store/store-nav'
import { ClientFeedbackPage } from '@/components/feedback/ClientFeedbackPage'

export async function generateMetadata() {
  const t = await getTranslations('sysUi')
  return { title: t('feedbackWriteTitle') }
}

// 이용후기 작성 페이지 — Pi Browser redirect 금지, 클라이언트 게이트 위임
export default async function OrderFeedbackPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const t = await getTranslations('sysUi')
  const { orderId } = await params
  const user = await getSessionUser()
  // BEAN 모드에선 후기(Bean 보상) 기능 비활성 — 버튼 숨김과 동일 정책, 직접 URL 접근도 차단.
  //   redirect 금지(Pi Browser 무한루프) → 안내 문구로 조건부 렌더.
  const feeMode = await getActiveFeeMode()

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 md:p-6">
      <StoreNav active="orders" />
      <Link
        href="/store/my/orders"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t('backToOrders')}
      </Link>
      <h1 className="text-lg font-bold">⭐ {t('feedbackWriteTitle')}</h1>
      {feeMode === 'PI' ? (
        <ClientFeedbackPage orderId={orderId} serverAuthed={!!user} />
      ) : (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          {t('feedbackPaused')}
        </p>
      )}
    </div>
  )
}
