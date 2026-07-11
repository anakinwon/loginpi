import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

// 전 페이지 공통 푸터 — 고객지원·공지사항·이용약관·개인정보처리방침 (2026-07-11 마스터 지시)
// layout.tsx의 <main> 하단에 1회 배치. 홈 전용 푸터를 공용으로 승격한 것.
export async function SiteFooter() {
  const t = await getTranslations('faq')
  return (
    <footer className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t px-4 py-4 text-xs">
      {/* 공지사항 최좌측 배치 (2026-07-11 마스터 지시) */}
      <Link href="/board/notice" className="hover:underline">
        {t('notice')}
      </Link>
      <span>·</span>
      <Link href="/support" className="hover:underline">
        {t('supportTitle')}
      </Link>
      <span>·</span>
      <Link href="/docs/legal/terms" className="hover:underline">
        {t('terms')}
      </Link>
      <span>·</span>
      <Link href="/docs/legal/privacy" className="hover:underline">
        {t('privacy')}
      </Link>
    </footer>
  )
}
