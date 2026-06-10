import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { ClientAdminGate } from '@/components/admin/client-admin-gate'
import { getSessionUser, isAdmin } from '@/lib/auth-check'

export const metadata = { title: 'Admin — Next.js Starter Kit' }

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, locale] = await Promise.all([getSessionUser(), getLocale()])

  // 쿠키로 신원을 못 찾으면(Pi Browser는 Set-Cookie 미저장) redirect 대신 클라이언트 게이트로 위임.
  // → admin 경유 무한 리다이렉트 루프 차단. (admin 페이지 데이터는 쿠키 기반이라 PC 브라우저 권장)
  if (!user) {
    return <ClientAdminGate>{children}</ClientAdminGate>
  }

  // 로그인했으나 관리자 권한 없음 → 홈으로
  if (!isAdmin(user)) {
    redirect(`/${locale}?error=unauthorized`)
  }

  return (
    <div className='flex flex-1'>
      <AdminSidebar />
      <main className='flex-1 overflow-auto p-6'>{children}</main>
    </div>
  )
}
