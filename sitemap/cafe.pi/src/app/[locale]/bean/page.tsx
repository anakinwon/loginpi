import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { getActiveFeeMode } from '@/lib/fee-resolver'
import { StoreNav } from '@/components/store/store-nav'
import { ClientBeanWallet } from '@/components/store/client-bean-wallet'
import { BeanIcon } from '@/components/ui/bean-icon'

export async function generateMetadata() {
  const t = await getTranslations('bean')
  return { title: t('title') }
}

// Bean 지갑 — redirect 금지 (Pi Browser 무한 루프 방지)
// 서버 세션 확인 결과를 클라이언트에 전달 → Pi 로그인과 OR 게이트
export default async function BeanWalletPage() {
  const t = await getTranslations('bean')
  const ts = await getTranslations('sysUi')
  const user = await getSessionUser()
  // PI 요금제에선 Bean 지갑 비노출 — 진입점(네비) 숨김과 동일 정책, 직접 URL 접근도 차단.
  //   redirect 금지(Pi Browser 무한루프) → 안내 문구로 조건부 렌더.
  const feeMode = await getActiveFeeMode()

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <StoreNav active="bean" />
      <Link
        href="/store"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t('backToStore')}
      </Link>
      {feeMode === 'PI' ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          {ts('menuUnavailable')}
        </p>
      ) : (
        <>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <BeanIcon className="inline-block h-6 w-6" /> {t('title')}
          </h1>
          <ClientBeanWallet serverAuthed={!!user} />
        </>
      )}
    </div>
  )
}
