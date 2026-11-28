// 관리 — PC 도구(Agent·Skill·Plugin·Hook·MCP) 설치·사용 현황. 서버 redirect 없이 클라이언트 게이트, 권한은 API(isAdmin)가 401/403 으로 판정. 화면 본체 = src/tools
import { setRequestLocale } from 'next-intl/server'
import { ToolsDashboard } from '@/tools/tools-dashboard'

export default async function AdminToolsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  return <ToolsDashboard />
}
