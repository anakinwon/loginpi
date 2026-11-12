// 표준용어 화면 — 조회(검색명)·등록(용어명 분해 후보 → 단어 조합 선택 → 용어명 자동 생성 → 도메인 지정)
import { PageHead } from '@/components/page-head'
import TermBoard from './term-board'

export default async function TermsPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await params
  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead title="표준용어" />
      <TermBoard areaId={areaId} />
    </main>
  )
}
