// 표준도메인 화면 — 조회(검색명)·등록(도메인명 자동생성 미리보기·중복 표시)
import { PageHead } from '@/components/page-head'
import DomainBoard from './domain-board'

export default async function DomainsPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await params
  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead title="표준도메인" />
      <DomainBoard areaId={areaId} />
    </main>
  )
}
