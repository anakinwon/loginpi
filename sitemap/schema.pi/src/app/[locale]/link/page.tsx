// 계정 연동 — /link. Pi Browser(Pi 세션)는 연동 코드 발급, 일반 브라우저(Google 세션·미연동)는 코드 입력, 연동 완료면 상태 표시.
// 서버는 세션을 보지 않는다(redirect 금지) — 분기는 클라이언트 LinkPanel(useAppUser)
import { ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SiteHeader } from '@/components/site-header'
import { PageHead } from '@/components/page-head'
import { Link } from '@/i18n/navigation'
import { LinkPanel } from '../google-auth'

export default function LinkPage() {
  const t = useTranslations()
  return (
    <>
      <SiteHeader />
      <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
        {/* 뒤로 = 홈(번역 문구) — PageHead 기본 뒤로 링크는 '분류체계 목록' 고정 한국어라 back={false} 로 끄고 여기서 표시 */}
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-ink-3 transition-colors hover:text-ink">
          <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" strokeWidth={1.5} aria-hidden />
          {t('common.home')}
        </Link>
        <PageHead back={false} title={t('link.title')} info={t('link.desc')} />
        <LinkPanel />
      </main>
    </>
  )
}
