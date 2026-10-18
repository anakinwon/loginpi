// 승인 화면 — 대기·승인·반려·취소 요청 목록, 승인권자(DA·STD)의 건별·선택 승인·반려, 신청자의 취소
import Link from 'next/link'
import ApprovalBoard from './approval-board'

// 첫 진입 필터 : ?sts=REQ|APV|RJCT|CNCL&tp=DIC|DOM|TERM(목록 화면의 "사유 보기" 링크), 그 외 값은 무시
const pick = (v: string | string[] | undefined, ok: string[]) => (typeof v === 'string' && ok.includes(v) ? v : '')

export default async function ApprovalsPage({ params, searchParams }: { params: Promise<{ areaId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { areaId } = await params
  const sp = await searchParams
  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">승인 요청</h1>
      <ApprovalBoard areaId={areaId} sts={pick(sp.sts, ['REQ', 'APV', 'RJCT', 'CNCL']) || 'REQ'} tp={pick(sp.tp, ['DIC', 'DOM', 'TERM'])} />
    </main>
  )
}
