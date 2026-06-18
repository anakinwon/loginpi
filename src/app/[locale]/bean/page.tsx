import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { StoreNav } from '@/components/store/store-nav'
import { ClientBeanWallet } from '@/components/store/client-bean-wallet'

export async function generateMetadata() {
  const t = await getTranslations('bean')
  return { title: t('title') }
}

// Bean 지갑 — redirect 금지 (Pi Browser 무한 루프 방지)
// 서버 세션 확인 결과를 클라이언트에 전달 → Pi 로그인과 OR 게이트
export default async function BeanWalletPage() {
  const t = await getTranslations('bean')
  const user = await getSessionUser()

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <StoreNav active="bean" />
      <Link
        href="/store"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t('backToStore')}
      </Link>
      <h1 className="text-xl font-bold">☕ {t('title')}</h1>
      <ClientBeanWallet serverAuthed={!!user} />
    </div>
  )
}
