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
//     메인 메뉴는 3D 키캡 아이콘(Icon3D sm) + 작은 글씨, 서브 탭은 글자 그대로. 아이콘 = 가장 일반적인 기호(설정 = 톱니바퀴, 2026-10-21 마스터 지시 — src/lib/menu-icons 단일 소스), 현재 메뉴 = 남색 키(2026-11-12 디자인 개편 — 묶음별 색 폐지, 묶음 사이 헤어라인)
//     서브 바 = 세그먼트 탭(seg), 메인 메뉴 = 화면 전체 폭 가운데(좁으면 가로 스크롤)
//     서브 메뉴 = 메인 메뉴 바로 위, 묶음 기준 정렬(마스터 지시 2026-10-18) : 표준사전 = 묶음 왼쪽 끝에 맞춤, 모델·설정 = 묶음 오른쪽 끝에 맞춤(화면 끝 안쪽으로)
//   · 요금제 = 설정 오른쪽 독립 메인 메뉴, 권한 무관(멤버면 항상 — 결제 전에도 들어가야 함, 마스터 지시 2026-10-19)
//  좁은 화면은 가로 스크롤(줄바꿈 없이 한 줄 유지)
//  접기·펼치기 = 화면 아래 가운데 같은 자리의 작은 화살표 탭(마스터 2026-11-12) — 접힘 = 탭만 살짝, 펼침 = nav 윗 테두리 가운데 탭. 접힘 탭은 맨 아래에서 12px 띄움(2026-11-02 Pi Browser 하단 제스처 바 가림 사고)
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { useParams, useSearchParams } from 'next/navigation'
import { usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react'
import { MENU_ICON as I } from '@/lib/menu-icons'
import { Icon3D } from '@/components/icon-3d'
import type { Perm } from '@/lib/roles'

// nm = 화면 이름의 번역 키(messages nav.<nm>)
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
    nm: 'words',
    icon: I.words,
    subs: [
      { seg: 'words', nm: 'words' },
      { seg: 'bulk', nm: 'bulk', perm: 'BULK', tab: 'words' },
    ],
  },
  {
    seg: 'domains',
    nm: 'domains',
    icon: I.domains,
    subs: [
      { seg: 'domains', nm: 'domains' },
      { seg: 'key-domains', nm: 'keyDomains' },
      { seg: 'domain-groups', nm: 'domainGroups' },
      { seg: 'bulk', nm: 'bulk', perm: 'BULK', tab: 'domains' },
    ],
  },
  {
    seg: 'terms',
    nm: 'terms',
    icon: I.terms,
    subs: [
      { seg: 'terms', nm: 'terms' },
      { seg: 'bulk', nm: 'bulk', perm: 'BULK', tab: 'terms' },
    ],
  },
  // 표준코드(공통코드) = 표준용어 오른쪽 독립 메인 메뉴, 서브 = 표준코드·일괄등록(마스터 지시 2026-10-20)
  {
    seg: 'codes',
    nm: 'codes',
    icon: I.codes,
    subs: [
      { seg: 'codes', nm: 'codes' },
      { seg: 'bulk', nm: 'bulk', perm: 'BULK', tab: 'codes' },
    ],
  },
]

// 모델 묶음 — 개념 → 논리 → 물리 순서
const MODEL: Item[] = [
  {
    seg: 'model',
    nm: 'model',
    icon: I.model,
    subs: [
      { seg: 'model', nm: 'prj', tab: 'prj' },
      { seg: 'model', nm: 'subj', tab: 'subj' },
      { seg: 'model', nm: 'coreEnt', tab: 'ent' },
      { seg: 'entity-classes', nm: 'entityClasses' },
    ],
  },
  { seg: 'logical', nm: 'logical', icon: I.logical },
  {
    seg: 'physical',
    nm: 'physical',
    icon: I.physical,
    subs: [
      { seg: 'physical', nm: 'physical' },
      { seg: 'erd', nm: 'erd' },
      { seg: 'ddl', nm: 'ddl' },
    ],
  },
]

// 기술 메뉴 묶음 = 모니터링 → SQL 편집기(마스터 지시 2026-10-21 위치 교환). SQL 편집기 — 물리 모델 서브에서 독립(2026-10-18), 메뉴1 권한(SQL_QUERY)만
const SQLED: Item[] = [
  // 모니터링(2026-10-21, WhaTap 4종 심플) — 기술 메뉴라 SQL 편집기 옆, 권한 MON_VIEW(요금제1~ SQL 메뉴 보유 역할)
  {
    seg: 'monitor',
    nm: 'monitor',
    icon: I.monitor,
    perm: 'MON_VIEW',
    subs: [
      { seg: 'monitor', nm: 'monApp', perm: 'MON_AI', tab: 'app' },
      { seg: 'monitor', nm: 'monSrv', tab: 'srv' },
      { seg: 'monitor', nm: 'monDb', tab: 'db' },
      { seg: 'monitor', nm: 'monUrl', tab: 'url' },
      { seg: 'monitor', nm: 'monFix', perm: 'MON_AI', tab: 'fix' },
    ],
  },
  {
    seg: 'sql',
    nm: 'sql',
    icon: I.sql,
    perm: 'SQL_QUERY',
  },
]

const REST: Item[] = [
  {
    seg: 'settings',
    nm: 'settings',
    icon: I.settings,
    subs: [
      // 설정 서브메뉴 × 요금제(마스터 표 2026-10-19) : 개발자 설정·이력 / 표준담당자 + 금칙어·일괄 / 모델러 + 표준 점검·리버스 / DA + 멤버·승인
      { seg: 'settings', nm: 'settings', perm: 'SET_VIEW' },
      { seg: 'history', nm: 'history', perm: 'SET_VIEW' },
      { seg: 'pitel', nm: 'pitelCase', perm: 'SET_VIEW' }, // 스키마 생성 사례(Pi통신 과금 8단계 요약, 본문 = SET_VIEW API)
      { seg: 'forbidden', nm: 'forbidden', perm: 'BAN_VIEW' },
      {
        seg: 'bulk',
        nm: 'banBulk',
        perm: 'BAN_EDIT',
        tab: 'forbidden',
      },
      { seg: 'check', nm: 'check', perm: 'CHK_VIEW' },
      { seg: 'reverse', nm: 'reverse', perm: 'CHK_VIEW' },
      { seg: 'members', nm: 'members', perm: 'ADM_VIEW' },
      { seg: 'approvals', nm: 'approvals', perm: 'ADM_VIEW' },
    ],
  },
]

// 요금제 — 권한 무관 독립 메뉴(설정 오른쪽)
const PLAN_ITEM: Item = { seg: 'plan', nm: 'plan', icon: I.plan }

// 메뉴 묶음 — 박스 없이 묶음 사이 헤어라인만(2026-11-12 디자인 개편)
const group = 'flex shrink-0 gap-0.5 [&+&]:border-s [&+&]:border-line [&+&]:ps-2'
// ?tab= 이 없을 때 화면별 기본 탭
const DEF_TAB: Record<string, string> = {
  model: 'prj',
  bulk: 'words',
  monitor: 'app',
}
// 메인 메뉴 = 3D 키캡 아이콘 위 + 작은 글씨 아래, 현재 메뉴 = 남색 키 + 진한 글자
const tab = (on: boolean) =>
  `group flex min-w-14 flex-col items-center gap-1 rounded-control px-1.5 pt-1.5 pb-1 text-xs transition-colors ${on ? 'font-medium text-ink' : 'text-ink-2 hover:text-ink'}`
// 접기·펼치기 탭 눌림 높이(px) = 단추 h-8(32, Pi Browser 터치 최소) — 보이는 탭은 아래 20px, 위 12px 는 투명 눌림 영역
const TAB_HIT = 32

export default function AreaNav() {
  const { areaId } = useParams<{ areaId: string }>()
  const pathname = usePathname()
  const curTab = useSearchParams().get('tab')
  const [perms, setPerms] = useState<Perm[]>([])
  const t = useTranslations('nav')

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
        a = row?.querySelector('a[aria-current="page"]'),
        g = a?.closest('ul')
      if (!nav || !sub || !a || !g) return setSubX(null)
      const n = nav.getBoundingClientRect(),
        r = g.getBoundingClientRect()
      // left = 묶음 왼쪽 / item = 현재 메뉴 왼쪽(모니터링 서브 바, 2026-10-21) / 그 외 = 묶음 오른쪽 끝
      const x =
        g.dataset.subAlign === 'item'
          ? a.getBoundingClientRect().left - n.left
          : g.dataset.subAlign === 'left'
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
  // 메뉴 높이(서브 바 유무·화면 폭에 따라 바뀜) → :root --area-nav-h. 펼침 = nav 위로 튀어나온 가운데 탭(눌림 영역 TAB_HIT)까지 더해 본문(페이지네이션)이 탭에 가리지 않게, 접힘 = 0(본문이 화면 맨 아래까지 — 탭만 본문 위에 뜸, 마스터 2026-11-12)
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const set = () =>
      document.documentElement.style.setProperty(
        '--area-nav-h',
        `${fold ? 0 : nav.offsetHeight + TAB_HIT}px`,
      )
    set()
    const ro = new ResizeObserver(set)
    ro.observe(nav, { box: 'border-box' }) // 아래 여백(safe-area) 만 바뀌어도 다시 잼
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--area-nav-h')
    }
  }, [fold])

  const item = (m: Item) => (
    <li key={m.seg}>
      <Link
        href={hrefOf(m)}
        aria-current={isOn(m) ? 'page' : undefined}
        className={tab(isOn(m))}
        title={t(m.nm)}
      >
        <Icon3D icon={m.icon} size="sm" on={isOn(m)} />
        <span className="max-w-20 truncate">{t(m.nm)}</span>
      </Link>
    </li>
  )

  return (
    <nav
      ref={navRef}
      aria-label={t('label')}
      className={`fixed inset-x-0 bottom-0 z-40 ${fold ? 'pointer-events-none flex justify-center pb-[max(12px,env(safe-area-inset-bottom))]' : 'touch-manipulation border-t border-line bg-surface pb-[max(4px,env(safe-area-inset-bottom))]'}`}
    >
      {/* 접기·펼치기 탭 = 화면 아래 가운데 같은 자리(마스터 2026-11-12) — 접힘 = 탭만 본문 위에 뜸(nav 는 투명·클릭 통과·본문 예약 0, 탭 바탕 85% 불투명, 맨 아래에서 12px 띄워 Pi Browser 하단 제스처 바에 가리지 않게 — 2026-11-02), 펼침 = nav 윗 테두리 가운데에 붙은 탭(-mb-px 로 테두리와 이음). 단추 = 56×32 눌림 영역, 보이는 탭 = 아래 56×20 */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!fold}
        aria-label={fold ? (cur ? t('expandWith', { menu: t(cur.nm) }) : t('expand')) : t('collapse')}
        title={fold ? t('expand') : t('collapse')}
        className={`group pointer-events-auto flex h-8 w-14 touch-manipulation items-end justify-center ${fold ? '' : 'absolute bottom-full left-1/2 -mb-px -translate-x-1/2'}`}
      >
        <span className={`flex h-5 w-14 items-center justify-center border border-line text-ink-2 transition-colors group-hover:bg-raised group-hover:text-ink ${fold ? 'rounded-lg bg-surface/85 shadow-1' : 'rounded-t-lg border-b-0 bg-surface'}`}>
          {fold ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </span>
      </button>
      {!fold && active?.subs && (
        <div className="relative h-10">
          <ul
            ref={subRef}
            aria-label={t('subOf', { menu: t(active.nm) })}
            style={{
              left: subX ?? 0,
              visibility: subX == null ? 'hidden' : undefined,
            }}
            className="seg absolute bottom-1 max-w-[calc(100vw-16px)]"
          >
            {subsOf(active).map((s) => (
              <li key={s.seg + (s.tab ?? '')}>
                <Link
                  href={subHref(s)}
                  aria-current={subOn(s) ? 'page' : undefined}
                  className="seg-item"
                >
                  {t(s.nm)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!fold && (
        <div className="flex items-center">
          {/* 스크롤 영역 = 줄 전체 폭, 오른쪽 끝 24px 페이드 = 뒤에 메뉴가 더 있음 표시(pe-6 여백이라 끝까지 밀면 메뉴는 안 흐려짐) */}
          <div ref={rowRef} className="min-w-0 flex-1 overflow-x-auto px-2 pt-1 pb-1 pe-6 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%_-_24px),transparent)] rtl:[mask-image:linear-gradient(to_left,black_calc(100%_-_24px),transparent)]">
            <div className="mx-auto flex w-max items-stretch gap-2 whitespace-nowrap">
              {visible(SQLED).length > 0 && (
                <ul aria-label={t('groupTech')} data-sub-align="item" className={group}>
                  {visible(SQLED).map(item)}
                </ul>
              )}
              {/* 메뉴 묶음 = 메뉴 권한(2 표준·3 모델링·4 설정)이 있을 때만 — 역할 ∩ 요금제 */}
              {allowed('STD_VIEW') && (
                <ul aria-label={t('groupStd')} data-sub-align="left" className={group}>
                  {visible(CORE).map(item)}
                </ul>
              )}
              {allowed('MODEL_VIEW') && (
                <ul aria-label={t('groupModel')} data-sub-align="right" className={group}>
                  {visible(MODEL).map(item)}
                </ul>
              )}
              {allowed('SET_VIEW') && (
                <ul aria-label={t('groupSet')} data-sub-align="right" className={group}>
                  {visible(REST).map(item)}
                </ul>
              )}
              <ul aria-label={t('groupPlan')} className={group}>
                {item(PLAN_ITEM)}
              </ul>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
