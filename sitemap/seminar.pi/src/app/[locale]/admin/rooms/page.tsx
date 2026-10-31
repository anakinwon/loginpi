// 방 관리(/admin/rooms, M5) — ADMIN 전용 화면. 서버는 세션을 보지 않고(redirect 금지 — Pi Browser) 클라이언트 게이트·API 가 판정
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'
import { AdminRooms } from '@/components/admin-rooms'

export default function AdminRoomsPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale)
  const t = useTranslations('adminRooms')
  return (
    <div className="space-y-6 py-2">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <AdminRooms />
    </div>
  )
}
