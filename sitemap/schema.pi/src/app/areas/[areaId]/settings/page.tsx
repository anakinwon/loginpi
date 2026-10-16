'use client'
// 설정 화면 — 분류체계 설정(이름·설명·구분자·사용여부)·도메인그룹·약어. 변경은 분류체계 관리자만, 그 외 역할은 조회
import Link from 'next/link'
import { use, useState } from 'react'
import AreaForm from './area-form'
import ItemTable, { type ItemCfg } from './item-table'

const GRP: ItemCfg = {
  path: 'domain-groups',
  pk: 'dom_grp_id',
  title: '도메인그룹',
  fields: [
    { key: 'dom_grp_nm', label: '도메인그룹명', required: true, max: 200 },
    { key: 'dom_grp_desc', label: '설명', max: 4000 },
  ],
}
const ABBR: ItemCfg = {
  path: 'abbreviations',
  pk: 'abbr_id',
  title: '약어',
  fields: [
    { key: 'abbr_log_nm', label: '논리명', required: true, max: 200 },
    { key: 'abbr_phy_nm', label: '물리 약어', required: true, max: 100, pattern: '[A-Za-z][A-Za-z0-9_]*' },
    { key: 'obj_tp_cd', label: '객체유형', max: 20 },
  ],
}
const TABS = [
  ['area', '분류체계'],
  ['grp', '도메인그룹'],
  ['abbr', '약어'],
] as const

export default function SettingsPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('area')
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">설정</h1>
      <div className="mt-4 flex gap-2 text-sm" role="tablist">
        {TABS.map(([v, n]) => (
          <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={`rounded border px-3 py-1 ${tab === v ? 'bg-gray-800 text-white' : ''}`}>
            {n}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'area' && <AreaForm areaId={areaId} />}
        {tab === 'grp' && <ItemTable areaId={areaId} cfg={GRP} />}
        {tab === 'abbr' && <ItemTable areaId={areaId} cfg={ABBR} />}
      </div>
    </main>
  )
}
