// 표준단어 화면 — 조회(검색명)·등록(입력 중 중복 검사)
import Link from 'next/link'
import WordBoard from './word-board'

export default async function WordsPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await params
  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">표준단어</h1>
      <WordBoard areaId={areaId} />
    </main>
  )
}
