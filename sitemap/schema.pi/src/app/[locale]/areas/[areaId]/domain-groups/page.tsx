'use client'
// 도메인그룹 화면(마스터 지시 2026-10-18) — 하단 메뉴 표준도메인 › 도메인그룹. 설정 화면 도메인그룹 탭과 같은 표·API(/domain-groups)
// 조회는 전원, 등록·수정·삭제는 설정 권한(시스템담당자·데이터아키텍트, API 확인). 도메인에서 쓰는 그룹은 삭제 불가
import { Link } from '@/i18n/navigation'
import { use } from 'react'
import ItemTable, { GRP_CFG } from '../settings/item-table'

export default function DomainGroupsPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">도메인그룹</h1>
      <p className="mt-1 text-sm text-gray-600">표준도메인을 묶는 그룹(예 : 번호·코드·명·일시). 도메인 등록 화면의 그룹 선택 목록이 됩니다. 등록·수정·삭제는 시스템담당자·데이터아키텍트만, 도메인에서 쓰는 그룹은 삭제할 수 없습니다.</p>
      <div className="mt-6">
        <ItemTable areaId={areaId} cfg={GRP_CFG} />
      </div>
    </main>
  )
}
