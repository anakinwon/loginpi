'use client'
// 분류체계 하단 고정 메뉴 — 모든 분류체계 화면 공통(layout). 현재 화면 강조, 메뉴 묶음·설정·일괄등록은 권한자만(GET /api/areas/[areaId] 의 perms = 역할 ∩ 요금제)
//  메뉴 체계(마스터 정의 2026-10-17) :
//   · 표준사전 묶음 = 표준단어·표준도메인·표준용어·표준코드(2026-10-20 표준용어 오른쪽 독립 메뉴) — 가장 기본 기능이라 한 묶음, 일괄등록 = 단어·도메인·용어 각각의 서브 기능(같은 화면 ?tab=words|domains|terms, 마스터 지시 2026-10-17)
//   · 묶음 4개(SQL 편집기·표준사전·모델·설정, 2026-10-18)는 모두 테두리 박스 — 1개짜리 묶음(설정·SQL 편집기)도 박스
//   · 모델 묶음 = 개념 모델·논리 모델·물리 모델(마스터 지시 2026-10-17 — 표준사전 묶음처럼 한 묶음)
//   · 대표도메인 = 표준도메인의 서브 기능 / 개념 모델 = 프로젝트·주제영역·핵심엔터티(같은 화면 ?tab=)·엔터티 분류어(엔터티 등록의 서브 기능)
//   · ERD = 물리 모델의 서브 기능(마스터 지시 2026-10-17)
//   · 설정 묶음 = 멤버·설정·이력·표준 점검·리버스·금칙어·승인(서브 메뉴, 리버스·금칙어·승인은 마스터 지시 2026-10-17 로 이동). 설정 화면은 SETTINGS 권한자만 → 상위 버튼은 볼 수 있는 첫 서브 화면으로 이동
//   · 서브 기능은 상위 메뉴 화면에서만 바 위 서브 탭으로 노출, 서브 화면에 있어도 상위 메뉴를 강조
//   · 2026-10-18 메뉴 정리(마스터 지시) : 순서 = SQL 편집기 · 표준사전 · 모델 · 설정 — SQL 편집기는 물리 모델 서브에서 빼 독립 묶음(맨 왼쪽), 설정은 맨 오른쪽(같은 날 두 번째 지시로 서로 바꿈),
//     메인 메뉴는 아이콘(lucide) + 작은 글씨, 서브 탭은 글자 그대로. 아이콘 = 가는 선 기하 기호 + 회색 계열 네이비 1색 타일(2026-10-20 마스터 지시로 메뉴별 파스텔 3D 타일 폐기), 현재 메뉴 = 진한 네이비 타일
//     메인·서브 배경 = 같은 네이비 계열 연한 바탕, 메인 메뉴 = 화면 전체 폭 가운데(좁으면 가로 스크롤)
//     서브 메뉴 = 메인 메뉴 바로 위, 묶음 기준 정렬(마스터 지시 2026-10-18) : 표준사전 = 묶음 왼쪽 끝에 맞춤, 모델·설정 = 묶음 오른쪽 끝에 맞춤(화면 끝 안쪽으로)
//   · 요금제 = 설정 오른쪽 독립 메인 메뉴, 권한 무관(멤버면 항상 — 결제 전에도 들어가야 함, 마스터 지시 2026-10-19)
//  좁은 화면은 가로 스크롤(줄바꿈 없이 한 줄 유지)
import { piFetch } from '@pi/auth/client'
import Link from 'next/link'
import { useParams, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Binary,
  ChevronDown,
  ChevronUp,
  CodeXml,
  DatabaseZap,
  Hexagon,
  Layers,
  Orbit,
  ScanText,
  Settings2,
  Wallet,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'
import type { Perm } from '@/lib/roles'

interface Item {
  seg: string
  nm: string
  icon: LucideIcon
  perm?: Perm
  subs?: { seg: string; nm: string; perm?: Perm; tab?: string }[]
}

const CORE: Item[] = [
  {
    seg: 'words',
    nm: '표준단어',
    icon: ScanText,
    subs: [
      { seg: 'words', nm: '표준단어' },
      { seg: 'bulk', nm: '일괄등록', perm: 'BULK', tab: 'words' },
    ],
  },
  {
    seg: 'domains',
    nm: '표준도메인',
    icon: Hexagon,
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
    icon: Layers,
    subs: [
      { seg: 'terms', nm: '표준용어' },
      { seg: 'bulk', nm: '일괄등록', perm: 'BULK', tab: 'terms' },
    ],
  },
  // 표준코드(공통코드) = 표준용어 오른쪽 독립 메인 메뉴, 서브 = 표준코드·일괄등록(마스터 지시 2026-10-20)
  {
    seg: 'codes',
    nm: '표준코드',
    icon: Binary,
    subs: [
      { seg: 'codes', nm: '표준코드' },
      { seg: 'bulk', nm: '일괄등록', perm: 'BULK', tab: 'codes' },
    ],
  },
]

// 모델 묶음 — 개념 → 논리 → 물리 순서
const MODEL: Item[] = [
  {
    seg: 'model',
    nm: '개념 모델',
    icon: Orbit,
    subs: [
      { seg: 'model', nm: '프로젝트', tab: 'prj' },
      { seg: 'model', nm: '주제영역', tab: 'subj' },
      { seg: 'model', nm: '핵심엔터티', tab: 'ent' },
      { seg: 'entity-classes', nm: '엔터티 분류어' },
    ],
  },
  { seg: 'logical', nm: '논리 모델', icon: Waypoints },
  {
    seg: 'physical',
    nm: '물리 모델',
    icon: DatabaseZap,
    subs: [
      { seg: 'physical', nm: '물리 모델' },
      { seg: 'erd', nm: 'ERD' },
      { seg: 'ddl', nm: 'DDL 생성' },
    ],
  },
]

// SQL 편집기 — 물리 모델 서브에서 독립(마스터 지시 2026-10-18), 메뉴1 권한(SQL_QUERY)만
const SQLED: Item[] = [
  {
    seg: 'sql',
    nm: 'SQL 편집기',
    icon: CodeXml,
    perm: 'SQL_QUERY',
  },
]

const REST: Item[] = [
  {
    seg: 'settings',
    nm: '설정',
    icon: Settings2,
    subs: [
      // 설정 서브메뉴 × 요금제(마스터 표 2026-10-19) : 개발자 설정·이력 / 표준담당자 + 금칙어·일괄 / 모델러 + 표준 점검·리버스 / DA + 멤버·승인
      { seg: 'settings', nm: '설정', perm: 'SET_VIEW' },
      { seg: 'history', nm: '이력', perm: 'SET_VIEW' },
      { seg: 'forbidden', nm: '금칙어', perm: 'BAN_VIEW' },
      {
        seg: 'bulk',
        nm: '금칙어 일괄등록',
        perm: 'BAN_EDIT',
        tab: 'forbidden',
      },
      { seg: 'check', nm: '표준 점검', perm: 'CHK_VIEW' },
      { seg: 'reverse', nm: '리버스', perm: 'CHK_VIEW' },
      { seg: 'members', nm: '멤버', perm: 'ADM_VIEW' },
      { seg: 'approvals', nm: '승인', perm: 'ADM_VIEW' },
    ],
  },
]

// 요금제 — 권한 무관 독립 메뉴(설정 오른쪽)
const PLAN_ITEM: Item = { seg: 'plan', nm: '결제', icon: Wallet }

const group =
  'flex shrink-0 gap-1 rounded-md border border-gray-300 bg-gray-50 p-0.5' // 메뉴 묶음 박스
// ?tab= 이 없을 때 화면별 기본 탭
const DEF_TAB: Record<string, string> = { model: 'prj', bulk: 'words' }
// 색 = 회색 계열 네이비 1색(마스터 지시 2026-10-20 — 메뉴마다 다른 파스텔 3D 타일 폐기), 아이콘 = 가는 선 기하 기호(미래지향)
//  평소 = 흰 바탕 + 가는 네이비 테두리 타일, 현재 메뉴 = 진한 네이비 타일 + 흰 아이콘, 서브 바 = 같은 계열 연한 바탕 · 현재 서브 탭 = 진한 네이비
const NAVY = {
  soft: 'bg-[#eef1f6]', // 현재 메인 버튼·서브 바 바탕
  line: 'border-[#c9d1df] ring-[#c9d1df]', // 테두리
  on: 'bg-[#3b4a66] text-white', // 현재 서브 탭
  hov: 'hover:bg-[#e2e7ef]', // 서브 탭 마우스
}
// 메인 메뉴 = 아이콘 타일 위 + 작은 글씨 아래, 현재 메뉴는 연한 네이비 바탕
const tab = (on: boolean) =>
  `group flex min-w-[3.75rem] flex-col items-center gap-0.5 rounded-lg px-2 py-1 transition ${on ? `${NAVY.soft} font-semibold text-[#2c3850] ring-1 ${NAVY.line}` : 'text-[#5b6578] hover:bg-white hover:text-[#2c3850]'}`
const tile = (on: boolean) =>
  `flex h-7 w-7 items-center justify-center rounded-md border transition ${on ? 'border-[#3b4a66] bg-[#3b4a66] text-white shadow-[0_0_0_3px_rgba(59,74,102,0.14)]' : 'border-[#c9d1df] bg-white text-[#4a5a78] group-hover:border-[#4a5a78] group-hover:text-[#2c3850]'}`

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
  const at = (seg: string) =>
    pathname === `${base}/${seg}` || pathname.startsWith(`${base}/${seg}/`)
  // 서브 탭 : 같은 화면을 ?tab= 으로 나눈 경우(개념 모델·일괄등록) 탭 값까지 비교 — 탭 없음 = 화면별 첫 탭
  const subOn = (x: { seg: string; tab?: string }) =>
    at(x.seg) && (!x.tab || (curTab ?? DEF_TAB[x.seg]) === x.tab)
  const isOn = (m: Item) => (m.subs ? m.subs.some(subOn) : at(m.seg))
  const allowed = (p?: Perm) => !p || perms.includes(p)
  const visible = (list: Item[]) => list.filter((m) => allowed(m.perm))
  const subsOf = (m: Item) => (m.subs ?? []).filter((x) => allowed(x.perm))
  // 상위 버튼 이동처 : 자기 화면을 볼 수 있으면 그대로, 아니면 볼 수 있는 첫 서브 화면
  const hrefOf = (m: Item) =>
    `${base}/${!m.subs || subsOf(m).some((x) => x.seg === m.seg) ? m.seg : (subsOf(m)[0]?.seg ?? m.seg)}`
  const subHref = (x: { seg: string; tab?: string }) =>
    `${base}/${x.seg}${x.tab ? `?tab=${x.tab}` : ''}`
  const active = [...REST, ...CORE, ...MODEL, ...SQLED].find(
    (m) => m.subs && isOn(m),
  )
  // 지금 메뉴(서브 유무 무관 — 접은 줄 표시용)
  const cur = [...REST, ...CORE, ...MODEL, ...SQLED, PLAN_ITEM].find(isOn)
  // 서브 바를 현재 메인 메뉴 묶음 위에 — 묶음 data-sub-align(left·right) 끝에 맞추고 화면 양끝 8px 안쪽으로, 메인 줄 가로 스크롤·창 크기 바뀌면 다시 계산
  const navRef = useRef<HTMLElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  // 하단 메뉴 접기·펼치기(마스터 지시 2026-10-20) — 보는 사람 브라우저에 기억(저장 실패해도 동작), 높이는 아래 --area-nav-h 가 따라감
  const [fold, setFold] = useState(false)
  useEffect(() => {
    try {
      setFold(localStorage.getItem('area-nav-fold') === '1')
    } catch {}
  }, [])
  const toggle = () => {
    const v = !fold
    setFold(v)
    try {
      localStorage.setItem('area-nav-fold', v ? '1' : '0')
    } catch {}
  }
  const subRef = useRef<HTMLUListElement>(null)
  const [subX, setSubX] = useState<number | null>(null)
  useLayoutEffect(() => {
    const row = rowRef.current
    const place = () => {
      const nav = navRef.current,
        sub = subRef.current,
        g = row?.querySelector('a[aria-current="page"]')?.closest('ul')
      if (!nav || !sub || !g) return setSubX(null)
      const n = nav.getBoundingClientRect(),
        r = g.getBoundingClientRect()
      const x =
        g.dataset.subAlign === 'left'
          ? r.left - n.left
          : r.right - n.left - sub.offsetWidth
      setSubX(
        Math.round(Math.max(8, Math.min(x, n.width - sub.offsetWidth - 8))),
      )
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
  }, [pathname, curTab, perms, active?.seg, fold])
  // 메뉴 높이(서브 바 유무·화면 폭에 따라 바뀜) → :root --area-nav-h
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const set = () =>
      document.documentElement.style.setProperty(
        '--area-nav-h',
        `${nav.offsetHeight}px`,
      )
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
      <Link
        href={hrefOf(m)}
        aria-current={isOn(m) ? 'page' : undefined}
        className={tab(isOn(m))}
        title={m.nm}
      >
        <span aria-hidden className={tile(isOn(m))}>
          <m.icon className="h-4 w-4" strokeWidth={1.5} />
        </span>
        <span className="text-[11px] leading-none">{m.nm}</span>
      </Link>
    </li>
  )

  return (
    <nav
      ref={navRef}
      aria-label="분류체계 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur"
    >
      {/* 접기·펼치기 손잡이 — 본문과 하단 메뉴 사이 선 중앙에 화살표만(마스터 지시 2026-10-20), 서브 바를 가리지 않게 선 위에 얹음 */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!fold}
        aria-label={
          fold
            ? `하단 메뉴 펼치기${cur ? ` (${cur.nm})` : ''}`
            : '하단 메뉴 접기'
        }
        title={fold ? '하단 메뉴 펼치기' : '하단 메뉴 접기'}
        className="absolute bottom-full left-1/2 flex h-4 w-12 -translate-x-1/2 items-center justify-center rounded-t-md border border-b-0 bg-white text-gray-500 shadow-[0_-1px_2px_rgba(15,23,42,0.06)] hover:bg-gray-100 hover:text-gray-800"
      >
        {fold ? (
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
      {!fold && active?.subs && (
        <div className="relative h-9">
          <ul
            ref={subRef}
            aria-label={`${active.nm} 하위 기능`}
            style={{
              left: subX ?? 0,
              visibility: subX == null ? 'hidden' : undefined,
            }}
            className={`absolute bottom-0 flex max-w-[calc(100vw-16px)] gap-1 overflow-x-auto rounded-t-lg border border-b-0 px-1.5 py-1 text-xs whitespace-nowrap shadow-[0_-1px_3px_rgba(15,23,42,0.08)] ${NAVY.soft} ${NAVY.line}`}
          >
            {subsOf(active).map((s) => (
              <li key={s.seg + (s.tab ?? '')}>
                <Link
                  href={subHref(s)}
                  aria-current={subOn(s) ? 'page' : undefined}
                  className={`block rounded px-2.5 py-1 ${subOn(s) ? `${NAVY.on} font-semibold` : `text-[#3a4458] ${NAVY.hov}`}`}
                >
                  {s.nm}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!fold && (
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
      )}
    </nav>
  )
}
