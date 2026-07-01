import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AdminQuickMenu } from '@/components/admin/admin-quick-menu'
import { ClientAdminGate } from '@/components/admin/client-admin-gate'
import { PitUrlCleaner } from '@/components/admin/pit-url-cleaner'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getActiveUiTheme, buildThemeStyleCss } from '@/lib/ui-theme'
import { getQuickMenuItems } from '@/lib/quick-menu'

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

  // 활성 UI 테마가 'ADMIN' 범위일 때만 [data-admin-theme] 스코프 주입.
  // 'GLOBAL'이면 루트 레이아웃이 :root에 전역 주입하므로 여기선 생략(중복 방지).
  const activeTheme = await getActiveUiTheme()
  const themeCss =
    activeTheme?.apply_scope_cd === 'GLOBAL'
      ? ''
      : buildThemeStyleCss(activeTheme?.theme_tokens, 'ADMIN')

  // 효과(fx) 레이어 — 색상과 별개로 질감(유리/클레이)을 관리자 화면에만 적용.
  // globals.css의 [data-admin-fx="glass"|"clay"] 스코프 CSS와 소문자로 매핑.
  const adminFx = activeTheme?.theme_fx_cd?.toLowerCase() || undefined

  // 하단 플로팅 팝업에 노출할 관리자 메뉴 (/admin/quick-menu에서 선별)
  const quickMenuItems = await getQuickMenuItems()

  return (
    <div data-admin-theme data-admin-fx={adminFx} className="flex flex-1">
      {/* 활성 테마 색상 변수 주입 (관리자 영역 스코프) */}
      {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
      {/* _pit 파라미터가 URL에 남아있으면 제거 (Pi Browser 인증 성공 후 cleanup) */}
      <PitUrlCleaner />
      <AdminSidebar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
      {/* 하단 네비(Admin 탭) 위 플로팅 팝업 — 사이드바가 md:hidden인 Pi Browser 접근성 */}
      {quickMenuItems.length > 0 && <AdminQuickMenu items={quickMenuItems} />}
    </div>
  )
}
