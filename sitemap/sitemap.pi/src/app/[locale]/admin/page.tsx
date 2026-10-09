// 관리 — 심사 대기열·신고 처리. 서버 redirect 없이 클라이언트 게이트, 권한은 API(isAdmin)가 401/403 으로 판정
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { AdminPanel } from '@/components/admin-panel'

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('admin')
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <AdminPanel />
    </div>
  )
}
