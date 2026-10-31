'use client'
// 상단 헤더 언어 콤보(loginpi 동일, @pi/i18n/client) — schema.pi next-intl 내비게이션·piFetch(Pi Browser X-Pi-Token) 연결
import { createLanguageSwitcher } from '@pi/i18n/client'
import { piFetch } from '@pi/auth/client'
import { usePathname, useRouter } from '@/i18n/navigation'

export const LanguageSwitcher = createLanguageSwitcher({ usePathname, useRouter, fetcher: piFetch })
