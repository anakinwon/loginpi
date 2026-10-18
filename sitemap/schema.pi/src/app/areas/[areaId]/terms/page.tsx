// 표준용어 화면 — 조회(검색명)·등록(용어명 분해 후보 → 단어 조합 선택 → 용어명 자동 생성 → 도메인 지정)
import Link from 'next/link'
import TermBoard from './term-board'

export default async function TermsPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await params
  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">표준용어</h1>
      <TermBoard areaId={areaId} />
    </main>
  )
}
