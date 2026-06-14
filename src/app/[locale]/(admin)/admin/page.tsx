import { redirect } from 'next/navigation'

// 구 관리자 대시보드는 사용자 관리(/admin/users)로 통합됨.
// 사용자 연동 통계 카드는 users 페이지 상단으로 이동, 대시보드 메뉴는 제거.
// /admin 직접 진입 시 users로 이동 (경로 redirect — 인증 무관, 무한루프 없음).
export default async function AdminIndex({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  redirect(`/${locale}/admin/users`)
}
