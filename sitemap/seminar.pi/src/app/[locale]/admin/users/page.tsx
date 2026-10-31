// 사용자관리(/admin/users, 관리자 메뉴 2026-10-31) — ADMIN 전용 화면(남은 시간·연장·축소). 서버는 세션을 보지 않고(redirect 금지 — Pi Browser) 클라이언트 게이트·API 가 판정
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'
import { AdminUsers } from '@/components/admin-users'

export default function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale)
  const t = useTranslations('adminUsers')
  return (
    <div className="space-y-6 py-2">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <AdminUsers />
    </div>
  )
}
