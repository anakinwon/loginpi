'use client'
// 분류체계 하단 고정 메뉴 — 모든 분류체계 화면 공통(layout). 현재 화면 강조, 설정·일괄등록은 권한자만(GET /api/areas/[areaId] 의 role)
//  메뉴 체계(마스터 정의 2026-10-17) :
//   · 표준사전 묶음 = 표준단어·표준도메인·표준용어 — 가장 기본 기능이라 한 묶음, 일괄등록 = 단어·도메인·용어 각각의 서브 기능(같은 화면 ?tab=words|domains|terms, 마스터 지시 2026-10-17)
//   · 묶음 3개(표준사전·모델·설정)는 모두 테두리 박스 — 설정은 1개여도 박스
//   · 모델 묶음 = 개념 모델·논리 모델·물리 모델(마스터 지시 2026-10-17 — 표준사전 묶음처럼 한 묶음)
//   · 대표도메인 = 표준도메인의 서브 기능 / 개념 모델 = 프로젝트·주제영역·핵심엔터티(같은 화면 ?tab=)·엔터티 분류어(엔터티 등록의 서브 기능)
//   · ERD = 물리 모델의 서브 기능(마스터 지시 2026-10-17)
//   · 설정 묶음 = 멤버·설정·이력·표준 점검·리버스·금칙어·승인(서브 메뉴, 리버스·금칙어·승인은 마스터 지시 2026-10-17 로 이동). 설정 화면은 SETTINGS 권한자만 → 상위 버튼은 볼 수 있는 첫 서브 화면으로 이동
//   · 서브 기능은 상위 메뉴 화면에서만 바 위 서브 탭으로 노출, 서브 화면에 있어도 상위 메뉴를 강조
//  좁은 화면은 가로 스크롤(줄바꿈 없이 한 줄 유지)
import { piFetch } from '@pi/auth/client'
import Link from 'next/link'
import { useParams, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { can, type Perm } from '@/lib/roles'

interface Item {
  seg: string
  nm: string
  perm?: Perm
  subs?: { seg: string; nm: string; perm?: Perm; tab?: string }[]
}

const CORE: Item[] = [
  {
    seg: 'words',
    nm: '표준단어',
    subs: [
      { seg: 'words', nm: '표준단어' },
      { seg: 'bulk', nm: '일괄등록', perm: 'BULK', tab: 'words' },
    ],
  },
  {
    seg: 'domains',
    nm: '표준도메인',
    subs: [
      { seg: 'domains', nm: '표준도메인' },
      { seg: 'key-domains', nm: '대표도메인' },
      { seg: 'domain-groups', nm: '도메인그룹' },
      { seg: 'bulk', nm: '일괄등록', perm: 'BULK', tab: 'domains' },
    ],
  },
  {
    seg: 'terms',
    nm: '표준용어',
    subs: [
      { seg: 'terms', nm: '표준용어' },
      { seg: 'bulk', nm: '일괄등록', perm: 'BULK', tab: 'terms' },
    ],
  },
]

// 모델 묶음 — 개념 → 논리 → 물리 순서
const MODEL: Item[] = [
  {
    seg: 'model',
    nm: '개념 모델',
    subs: [
      { seg: 'model', nm: '프로젝트', tab: 'prj' },
      { seg: 'model', nm: '주제영역', tab: 'subj' },
      { seg: 'model', nm: '핵심엔터티', tab: 'ent' },
      { seg: 'entity-classes', nm: '엔터티 분류어' },
    ],
  },
  { seg: 'logical', nm: '논리 모델' },
  {
    seg: 'physical',
    nm: '물리 모델',
    subs: [
      { seg: 'physical', nm: '물리 모델' },
      { seg: 'erd', nm: 'ERD' },
    ],
  },
]

const REST: Item[] = [
  {
    seg: 'settings',
    nm: '설정',
    subs: [
      { seg: 'members', nm: '멤버' },
      { seg: 'settings', nm: '설정', perm: 'SETTINGS' },
      { seg: 'history', nm: '이력' },
      { seg: 'check', nm: '표준 점검' },
      { seg: 'reverse', nm: '리버스' },
      { seg: 'forbidden', nm: '금칙어' },
      { seg: 'bulk', nm: '금칙어 일괄등록', perm: 'BULK', tab: 'forbidden' },
      { seg: 'approvals', nm: '승인' },
    ],
  },
]

const group = 'flex shrink-0 gap-1 rounded-md border border-gray-300 bg-gray-50 p-0.5' // 메뉴 묶음 박스
// ?tab= 이 없을 때 화면별 기본 탭
const DEF_TAB: Record<string, string> = { model: 'prj', bulk: 'words' }
const tab = (on: boolean) => `block rounded px-3 py-1.5 ${on ? 'bg-gray-800 text-white' : 'text-gray-700 hover:bg-gray-100'}`

export default function AreaNav() {
  const { areaId } = useParams<{ areaId: string }>()
  const pathname = usePathname()
  const curTab = useSearchParams().get('tab')
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    piFetch(`/api/areas/${areaId}`)
      .then((r) => r.json())
      .then((j) => alive && setRole(j.ok ? j.role : null))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [areaId])

  const base = `/areas/${areaId}`
  const at = (seg: string) => pathname === `${base}/${seg}` || pathname.startsWith(`${base}/${seg}/`)
  // 서브 탭 : 같은 화면을 ?tab= 으로 나눈 경우(개념 모델·일괄등록) 탭 값까지 비교 — 탭 없음 = 화면별 첫 탭
  const subOn = (x: { seg: string; tab?: string }) => at(x.seg) && (!x.tab || (curTab ?? DEF_TAB[x.seg]) === x.tab)
  const isOn = (m: Item) => (m.subs ? m.subs.some(subOn) : at(m.seg))
  const allowed = (p?: Perm) => !p || can(role, p)
  const visible = (list: Item[]) => list.filter((m) => allowed(m.perm))
  const subsOf = (m: Item) => (m.subs ?? []).filter((x) => allowed(x.perm))
  // 상위 버튼 이동처 : 자기 화면을 볼 수 있으면 그대로, 아니면 볼 수 있는 첫 서브 화면
  const hrefOf = (m: Item) => `${base}/${!m.subs || subsOf(m).some((x) => x.seg === m.seg) ? m.seg : (subsOf(m)[0]?.seg ?? m.seg)}`
  const subHref = (x: { seg: string; tab?: string }) => `${base}/${x.seg}${x.tab ? `?tab=${x.tab}` : ''}`
  const active = [...CORE, ...MODEL, ...REST].find((m) => m.subs && isOn(m))

  const item = (m: Item) => (
    <li key={m.seg}>
      <Link href={hrefOf(m)} aria-current={isOn(m) ? 'page' : undefined} className={tab(isOn(m))}>
        {m.nm}
      </Link>
    </li>
  )

  return (
    <nav aria-label="분류체계 메뉴" className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur">
      {active?.subs && (
        <ul aria-label={`${active.nm} 하위 기능`} className="mx-auto flex max-w-6xl gap-1 overflow-x-auto border-b px-2 py-1.5 text-xs whitespace-nowrap">
          {subsOf(active).map((s) => (
            <li key={s.seg + (s.tab ?? '')}>
              <Link
                href={subHref(s)}
                aria-current={subOn(s) ? 'page' : undefined}
                className={`block rounded px-2.5 py-1 ${subOn(s) ? 'bg-gray-200 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {s.nm}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-2 py-2 text-sm whitespace-nowrap">
        <ul aria-label="표준사전" className={group}>
          {visible(CORE).map(item)}
        </ul>
        <ul aria-label="모델" className={group}>
          {visible(MODEL).map(item)}
        </ul>
        <ul aria-label="설정" className={group}>
          {visible(REST).map(item)}
        </ul>
      </div>
    </nav>
  )
}
