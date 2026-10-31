'use client'
// 표준 언어 스위처(@pi/i18n/client)를 seminar.pi next-intl 내비게이션에 연결 — 쿼리 문자열 보존, 클라이언트 전환(하드 이동 없음)
import { useLocale, useTranslations } from 'next-intl'
import { LocaleSwitcher } from '@pi/i18n/client'
import { routing } from '@/i18n/routing'
import { usePathname, useRouter } from '@/i18n/navigation'

export function AppLocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('common.localeSwitcher')
  return (
    <LocaleSwitcher
      locale={locale}
      locales={routing.locales}
      onChange={(l) => router.replace(`${pathname}${window.location.search}`, { locale: l })}
      labels={{ button: t('button'), search: t('search'), empty: t('empty') }}
      className={className}
    />
  )
}
