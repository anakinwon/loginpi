// 표준단어 화면 — 조회(검색명)·등록(입력 중 중복 검사)
import { PageHead } from '@/components/page-head'
import WordBoard from './word-board'

export default async function WordsPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await params
  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead title="표준단어" />
      <WordBoard areaId={areaId} />
    </main>
  )
}
