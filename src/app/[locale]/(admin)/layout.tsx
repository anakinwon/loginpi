import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { ClientAdminGate } from '@/components/admin/client-admin-gate'
import { PitUrlCleaner } from '@/components/admin/pit-url-cleaner'
import { getSessionUser, isAdmin } from '@/lib/auth-check'

export const metadata = { title: 'Admin — Next.js Starter Kit' }

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, locale] = await Promise.all([getSessionUser(), getLocale()])

  // 쿠키로 신원을 못 찾으면(Pi Browser는 Set-Cookie 미저장) redirect 대신 클라이언트 게이트로 위임.
  // ClientAdminGate가 _pit 파라미터로 재내비게이션하면 미들웨어가 X-Pi-Token 헤더로 변환해
  // 다음 요청에서 이 분기를 벗어나 정상 admin UI를 렌더한다.
  if (!user) {
    return <ClientAdminGate />
  }

  // 로그인했으나 관리자 권한 없음 → 홈으로
  if (!isAdmin(user)) {
    redirect(`/${locale}?error=unauthorized`)
  }

  return (
    <div className="flex flex-1">
      {/* _pit 파라미터가 URL에 남아있으면 제거 (Pi Browser 인증 성공 후 cleanup) */}
      <PitUrlCleaner />
      <AdminSidebar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
