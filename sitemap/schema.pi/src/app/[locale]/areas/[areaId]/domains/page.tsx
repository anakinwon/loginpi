// 표준도메인 화면 — 조회(검색명)·등록(도메인명 자동생성 미리보기·중복 표시)
import { Link } from '@/i18n/navigation'
import DomainBoard from './domain-board'

export default async function DomainsPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await params
  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">표준도메인</h1>
      <DomainBoard areaId={areaId} />
    </main>
  )
}
