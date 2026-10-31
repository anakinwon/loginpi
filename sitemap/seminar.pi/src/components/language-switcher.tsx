'use client'
// 상단 헤더 언어 콤보 — @pi/i18n(loginpi 동일 국기·환율·검색) 을 seminar.pi next-intl 내비게이션·piFetch 에 연결
import { createLanguageSwitcher } from '@pi/i18n/client'
import { piFetch } from '@pi/auth/client'
import { usePathname, useRouter } from '@/i18n/navigation'

export const LanguageSwitcher = createLanguageSwitcher({ usePathname, useRouter, fetcher: piFetch })
