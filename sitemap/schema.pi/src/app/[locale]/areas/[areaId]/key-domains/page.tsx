// 대표도메인 관리 화면 — 지정·해제 신청(단어 수정 승인 절차), 지정 목록·사용 도메인 수
import { Link } from '@/i18n/navigation'
import KeyDomainBoard from './key-domain-board'

export default async function KeyDomainsPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = await params
  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">대표도메인 관리</h1>
      <KeyDomainBoard areaId={areaId} />
    </main>
  )
}
