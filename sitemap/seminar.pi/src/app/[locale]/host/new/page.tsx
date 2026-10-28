// S5 세미나 개설(/host/new) — Pi 로그인 사용자(요금제, PRD D-1 개정). 권한 판정은 클라이언트 게이트 + 서버 POST(403), redirect 없음
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'
import { HostForm } from '@/components/seminar/host-form'

export default function HostNewPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale)
  const t = useTranslations('host')
  return (
    <div className="space-y-6 py-2">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <HostForm />
    </div>
  )
}
