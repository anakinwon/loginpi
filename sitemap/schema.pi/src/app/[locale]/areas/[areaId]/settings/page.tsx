'use client'
// 설정 화면 — 분류체계 설정(이름·설명·구분자·사용여부)·도메인그룹·약어. 변경은 분류체계 관리자만, 그 외 역할은 조회
//  AI 분석 모델 탭(2026-10-21) = schema.pi 전역 설정(전역 관리자만, 그 외는 안내 문구)
import { use, useState } from 'react'
import { PageHead } from '@/components/page-head'
import AiMdlForm from './ai-mdl-form'
import AreaForm from './area-form'
import ItemTable, { GRP_CFG as GRP, type ItemCfg } from './item-table'
import LinkTokenPanel from './link-token-panel'

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
  ['ai', 'AI 분석 모델'],
  ['link', '사이트 연결'],
] as const

export default function SettingsPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('area')
  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead title="설정" />
      <div className="seg" role="tablist">
        {TABS.map(([v, n]) => (
          <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className="seg-item">
            {n}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === 'area' && <AreaForm areaId={areaId} />}
        {tab === 'grp' && <ItemTable areaId={areaId} cfg={GRP} />}
        {tab === 'abbr' && <ItemTable areaId={areaId} cfg={ABBR} />}
        {tab === 'ai' && <AiMdlForm />}
        {tab === 'link' && <LinkTokenPanel areaId={areaId} />}
      </div>
    </main>
  )
}
