'use client'
// 분류체계 하단 고정 메뉴 — 모든 분류체계 화면 공통(layout). 현재 화면 강조, 메뉴 묶음·설정·일괄등록은 권한자만(GET /api/areas/[areaId] 의 perms = 역할 ∩ 요금제)
//  메뉴 체계(마스터 정의 2026-10-17) :
//   · 표준사전 묶음 = 표준단어·표준도메인·표준용어 — 가장 기본 기능이라 한 묶음, 일괄등록 = 단어·도메인·용어 각각의 서브 기능(같은 화면 ?tab=words|domains|terms, 마스터 지시 2026-10-17)
//   · 묶음 4개(SQL 편집기·표준사전·모델·설정, 2026-10-18)는 모두 테두리 박스 — 1개짜리 묶음(설정·SQL 편집기)도 박스
//   · 모델 묶음 = 개념 모델·논리 모델·물리 모델(마스터 지시 2026-10-17 — 표준사전 묶음처럼 한 묶음)
//   · 대표도메인 = 표준도메인의 서브 기능 / 개념 모델 = 프로젝트·주제영역·핵심엔터티(같은 화면 ?tab=)·엔터티 분류어(엔터티 등록의 서브 기능)
//   · ERD = 물리 모델의 서브 기능(마스터 지시 2026-10-17)
//   · 설정 묶음 = 멤버·설정·이력·표준 점검·리버스·금칙어·승인(서브 메뉴, 리버스·금칙어·승인은 마스터 지시 2026-10-17 로 이동). 설정 화면은 SETTINGS 권한자만 → 상위 버튼은 볼 수 있는 첫 서브 화면으로 이동
//   · 서브 기능은 상위 메뉴 화면에서만 바 위 서브 탭으로 노출, 서브 화면에 있어도 상위 메뉴를 강조
//   · 2026-10-18 메뉴 정리(마스터 지시) : 순서 = SQL 편집기 · 표준사전 · 모델 · 설정 — SQL 편집기는 물리 모델 서브에서 빼 독립 묶음(맨 왼쪽), 설정은 맨 오른쪽(같은 날 두 번째 지시로 서로 바꿈),
//     메인 메뉴는 아이콘(lucide) + 작은 글씨, 서브 탭은 글자 그대로. 아이콘 = 연한 색 3D 타일(위 밝은 테두리·아래 그림자·메뉴마다 색), 현재 메뉴 = 떠 있는 버튼 + 타일 테두리
//     메인·서브 배경 = 그 메뉴 색의 연한 같은 계열, 메인 메뉴 = 화면 전체 폭 가운데(좁으면 가로 스크롤)
//     서브 메뉴 = 메인 메뉴 바로 위, 묶음 기준 정렬(마스터 지시 2026-10-18) : 표준사전 = 묶음 왼쪽 끝에 맞춤, 모델·설정 = 묶음 오른쪽 끝에 맞춤(화면 끝 안쪽으로)
//   · 요금제 = 설정 오른쪽 독립 메인 메뉴, 권한 무관(멤버면 항상 — 결제 전에도 들어가야 함, 마스터 지시 2026-10-19)
//  좁은 화면은 가로 스크롤(줄바꿈 없이 한 줄 유지)
import { piFetch } from '@pi/auth/client'
import Link from 'next/link'
import { useParams, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BookA, BookOpenText, Database, Gem, Lightbulb, Settings, Shapes, SquareTerminal, Workflow, type LucideIcon } from 'lucide-react'
import type { Perm } from '@/lib/roles'

interface Item {
  seg: string
  nm: string
  icon: LucideIcon
  tone: Tone // 아이콘 타일 색
  perm?: Perm
  subs?: { seg: string; nm: string; perm?: Perm; tab?: string }[]
}

const CORE: Item[] = [
  {
    seg: 'words',
    nm: '표준단어',
    icon: BookA,
    tone: 'sky',
    subs: [
      { seg: 'words', nm: '표준단어' },
      { seg: 'bulk', nm: '일괄등록', perm: 'BULK', tab: 'words' },
    ],
  },
  {
    seg: 'domains',
    nm: '표준도메인',
    icon: Shapes,
    tone: 'violet',
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
    icon: BookOpenText,
    tone: 'teal',
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
    icon: Lightbulb,
    tone: 'amber',
    subs: [
      { seg: 'model', nm: '프로젝트', tab: 'prj' },
      { seg: 'model', nm: '주제영역', tab: 'subj' },
      { seg: 'model', nm: '핵심엔터티', tab: 'ent' },
      { seg: 'entity-classes', nm: '엔터티 분류어' },
    ],
  },
  { seg: 'logical', nm: '논리 모델', icon: Workflow, tone: 'emerald' },
  {
    seg: 'physical',
    nm: '물리 모델',
    icon: Database,
    tone: 'blue',
    subs: [
      { seg: 'physical', nm: '물리 모델' },
      { seg: 'erd', nm: 'ERD' },
      { seg: 'ddl', nm: 'DDL 생성' },
    ],
  },
]

// SQL 편집기 — 물리 모델 서브에서 독립(마스터 지시 2026-10-18), 메뉴1 권한(SQL_QUERY)만
const SQLED: Item[] = [{ seg: 'sql', nm: 'SQL 편집기', icon: SquareTerminal, tone: 'rose', perm: 'SQL_QUERY' }]

const REST: Item[] = [
  {
    seg: 'settings',
    nm: '설정',
    icon: Settings,
    tone: 'slate',
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

// 요금제 — 권한 무관 독립 메뉴(설정 오른쪽)
const PLAN_ITEM: Item = { seg: 'plan', nm: '결제', icon: Gem, tone: 'amber' }

const group = 'flex shrink-0 gap-1 rounded-md border border-gray-300 bg-gray-50 p-0.5' // 메뉴 묶음 박스
// ?tab= 이 없을 때 화면별 기본 탭
const DEF_TAB: Record<string, string> = { model: 'prj', bulk: 'words' }
// 아이콘 타일 색(연한 그라데이션 바탕 · 진한 같은 계열 아이콘 · 현재 메뉴 테두리) — Tailwind 가 찾도록 글자 그대로
type Tone = 'slate' | 'sky' | 'violet' | 'teal' | 'amber' | 'emerald' | 'blue' | 'rose'
// soft = 현재 메인 버튼·서브 바 바탕, line = 테두리, on = 현재 서브 탭, hov = 서브 탭 마우스
const TONE: Record<Tone, { bg: string; fg: string; ring: string; soft: string; line: string; on: string; hov: string }> = {
  slate: { bg: 'from-slate-50 to-slate-200', fg: 'text-slate-600', ring: 'ring-slate-400', soft: 'bg-slate-100', line: 'border-slate-300 ring-slate-300', on: 'bg-slate-300 text-slate-900', hov: 'hover:bg-slate-200' },
  sky: { bg: 'from-sky-50 to-sky-200', fg: 'text-sky-600', ring: 'ring-sky-400', soft: 'bg-sky-50', line: 'border-sky-200 ring-sky-200', on: 'bg-sky-200 text-sky-900', hov: 'hover:bg-sky-100' },
  violet: { bg: 'from-violet-50 to-violet-200', fg: 'text-violet-600', ring: 'ring-violet-400', soft: 'bg-violet-50', line: 'border-violet-200 ring-violet-200', on: 'bg-violet-200 text-violet-900', hov: 'hover:bg-violet-100' },
  teal: { bg: 'from-teal-50 to-teal-200', fg: 'text-teal-600', ring: 'ring-teal-400', soft: 'bg-teal-50', line: 'border-teal-200 ring-teal-200', on: 'bg-teal-200 text-teal-900', hov: 'hover:bg-teal-100' },
  amber: { bg: 'from-amber-50 to-amber-200', fg: 'text-amber-600', ring: 'ring-amber-400', soft: 'bg-amber-50', line: 'border-amber-200 ring-amber-200', on: 'bg-amber-200 text-amber-900', hov: 'hover:bg-amber-100' },
  emerald: { bg: 'from-emerald-50 to-emerald-200', fg: 'text-emerald-600', ring: 'ring-emerald-400', soft: 'bg-emerald-50', line: 'border-emerald-200 ring-emerald-200', on: 'bg-emerald-200 text-emerald-900', hov: 'hover:bg-emerald-100' },
  blue: { bg: 'from-blue-50 to-blue-200', fg: 'text-blue-600', ring: 'ring-blue-400', soft: 'bg-blue-50', line: 'border-blue-200 ring-blue-200', on: 'bg-blue-200 text-blue-900', hov: 'hover:bg-blue-100' },
  rose: { bg: 'from-rose-50 to-rose-200', fg: 'text-rose-600', ring: 'ring-rose-400', soft: 'bg-rose-50', line: 'border-rose-200 ring-rose-200', on: 'bg-rose-200 text-rose-900', hov: 'hover:bg-rose-100' },
}
// 메인 메뉴 = 3D 아이콘 타일 위 + 작은 글씨 아래, 현재 메뉴는 떠 있는 흰 버튼
const tab = (on: boolean, t: Tone) =>
  `group flex min-w-[3.75rem] flex-col items-center gap-0.5 rounded-lg px-2 py-1 transition ${on ? `-translate-y-px ${TONE[t].soft} font-semibold text-gray-900 shadow-md ring-1 ${TONE[t].line}` : 'text-gray-600 hover:-translate-y-px hover:bg-white hover:text-gray-900 hover:shadow-sm'}`
// 타일 : 위 밝은 안쪽 테두리 + 아래 어두운 안쪽 테두리 + 바깥 그림자 = 살짝 도드라진 입체
const tile = (t: Tone, on: boolean) =>
  `flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${TONE[t].bg} shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(0,0,0,0.08),0_1px_2px_rgba(15,23,42,0.18)] transition group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(0,0,0,0.08),0_2px_4px_rgba(15,23,42,0.22)] ${on ? `ring-2 ${TONE[t].ring}` : ''}`

export default function AreaNav() {
  const { areaId } = useParams<{ areaId: string }>()
  const pathname = usePathname()
  const curTab = useSearchParams().get('tab')
  const [perms, setPerms] = useState<Perm[]>([])

  useEffect(() => {
    let alive = true
    piFetch(`/api/areas/${areaId}`)
      .then((r) => r.json())
      .then((j) => alive && setPerms(j.ok ? (j.perms ?? []) : []))
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
  const allowed = (p?: Perm) => !p || perms.includes(p)
  const visible = (list: Item[]) => list.filter((m) => allowed(m.perm))
  const subsOf = (m: Item) => (m.subs ?? []).filter((x) => allowed(x.perm))
  // 상위 버튼 이동처 : 자기 화면을 볼 수 있으면 그대로, 아니면 볼 수 있는 첫 서브 화면
  const hrefOf = (m: Item) => `${base}/${!m.subs || subsOf(m).some((x) => x.seg === m.seg) ? m.seg : (subsOf(m)[0]?.seg ?? m.seg)}`
  const subHref = (x: { seg: string; tab?: string }) => `${base}/${x.seg}${x.tab ? `?tab=${x.tab}` : ''}`
  const active = [...REST, ...CORE, ...MODEL, ...SQLED].find((m) => m.subs && isOn(m))
  // 서브 바를 현재 메인 메뉴 묶음 위에 — 묶음 data-sub-align(left·right) 끝에 맞추고 화면 양끝 8px 안쪽으로, 메인 줄 가로 스크롤·창 크기 바뀌면 다시 계산
  const navRef = useRef<HTMLElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLUListElement>(null)
  const [subX, setSubX] = useState<number | null>(null)
  useLayoutEffect(() => {
    const row = rowRef.current
    const place = () => {
      const nav = navRef.current, sub = subRef.current, g = row?.querySelector('a[aria-current="page"]')?.closest('ul')
      if (!nav || !sub || !g) return setSubX(null)
      const n = nav.getBoundingClientRect(), r = g.getBoundingClientRect()
      const x = g.dataset.subAlign === 'left' ? r.left - n.left : r.right - n.left - sub.offsetWidth
      setSubX(Math.round(Math.max(8, Math.min(x, n.width - sub.offsetWidth - 8))))
    }
    place()
    window.addEventListener('resize', place)
    row?.addEventListener('scroll', place)
    const ro = new ResizeObserver(place) // 글꼴 로딩 등으로 메뉴·서브 바 너비가 바뀌어도 다시 맞춤
    if (row?.firstElementChild) ro.observe(row.firstElementChild)
    if (subRef.current) ro.observe(subRef.current)
    return () => {
      window.removeEventListener('resize', place)
      row?.removeEventListener('scroll', place)
      ro.disconnect()
    }
  }, [pathname, curTab, perms, active?.seg])
  // 메뉴 높이(서브 바 유무·화면 폭에 따라 바뀜) → :root --area-nav-h
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const set = () => document.documentElement.style.setProperty('--area-nav-h', `${nav.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(nav)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--area-nav-h')
    }
  }, [])

  const item = (m: Item) => (
    <li key={m.seg}>
      <Link href={hrefOf(m)} aria-current={isOn(m) ? 'page' : undefined} className={tab(isOn(m), m.tone)} title={m.nm}>
        <span aria-hidden className={tile(m.tone, isOn(m))}>
          <m.icon className={`h-[17px] w-[17px] ${TONE[m.tone].fg} drop-shadow-[0_1px_0_rgba(255,255,255,0.9)]`} strokeWidth={1.9} />
        </span>
        <span className="text-[11px] leading-none">{m.nm}</span>
      </Link>
    </li>
  )

  return (
    <nav ref={navRef} aria-label="분류체계 메뉴" className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur">
      {active?.subs && (
        <div className="relative h-9">
          <ul
            ref={subRef}
            aria-label={`${active.nm} 하위 기능`}
            style={{ left: subX ?? 0, visibility: subX == null ? 'hidden' : undefined }}
            className={`absolute bottom-0 flex max-w-[calc(100vw-16px)] gap-1 overflow-x-auto rounded-t-lg border border-b-0 px-1.5 py-1 text-xs whitespace-nowrap shadow-[0_-1px_3px_rgba(15,23,42,0.08)] ${TONE[active.tone].soft} ${TONE[active.tone].line}`}
          >
            {subsOf(active).map((s) => (
              <li key={s.seg + (s.tab ?? '')}>
                <Link
                  href={subHref(s)}
                  aria-current={subOn(s) ? 'page' : undefined}
                  className={`block rounded px-2.5 py-1 ${subOn(s) ? `${TONE[active.tone].on} font-semibold` : `text-gray-700 ${TONE[active.tone].hov}`}`}
                >
                  {s.nm}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div ref={rowRef} className="w-full overflow-x-auto px-2 py-1.5">
        <div className="mx-auto flex w-max items-center gap-2 whitespace-nowrap">
          {visible(SQLED).length > 0 && (
            <ul aria-label="SQL 편집기" className={group}>
              {visible(SQLED).map(item)}
            </ul>
          )}
          {/* 메뉴 묶음 = 메뉴 권한(2 표준·3 모델링·4 설정)이 있을 때만 — 역할 ∩ 요금제 */}
          {allowed('STD_VIEW') && (
            <ul aria-label="표준사전" data-sub-align="left" className={group}>
              {visible(CORE).map(item)}
            </ul>
          )}
          {allowed('MODEL_VIEW') && (
            <ul aria-label="모델" data-sub-align="right" className={group}>
              {visible(MODEL).map(item)}
            </ul>
          )}
          {allowed('SET_VIEW') && (
            <ul aria-label="설정" data-sub-align="right" className={group}>
              {visible(REST).map(item)}
            </ul>
          )}
          <ul aria-label="결제" className={group}>
            {item(PLAN_ITEM)}
          </ul>
        </div>
      </div>
    </nav>
  )
}
