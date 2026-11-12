// 대표도메인 관리 화면 — 지정·해제 신청(단어 수정 승인 절차), 지정 목록·사용 도메인 수
import { PageHead } from '@/components/page-head'
import KeyDomainBoard from './key-domain-board'

export default async function KeyDomainsPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await params
  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead title="대표도메인 관리" />
      <KeyDomainBoard areaId={areaId} />
    </main>
  )
}
