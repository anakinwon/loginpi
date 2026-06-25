import { redirect } from 'next/navigation'

// 관리자 첫 화면 = 실시간 모니터링(/admin/monitor).
// /admin 직접 진입 시 monitor로 이동 (경로 redirect — 인증 무관, 무한루프 없음).
// 인증 게이트는 (admin) 레이아웃의 ClientAdminGate가 담당.
export default async function AdminIndex({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  redirect(`/${locale}/admin/monitor`)
}
