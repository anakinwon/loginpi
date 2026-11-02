'use client'

// dbms.pi 하단 고정 2단 폴더블 메뉴 — schema.pi area-nav 와 같은 구조(마스터 지시 2026-11-02)
//  1단(아래) = 묶음 4개(모니터링·GAP분석·레이크·관리) 타일 — 아이콘 타일 위 + 작은 글씨 아래, 누르면 그 묶음의 첫 기능으로
//  2단(위) = 현재 묶음의 하위 기능 서브 바 — 현재 묶음 타일 위에 맞춰 띄움 — 모니터링·GAP분석은 타일 시작 끝, 레이크·관리는 타일 끝 쪽 끝(ALIGN_END, RTL 반전), 화면 양끝 8px 안쪽, 묶음 색 연한 바탕
//  접기 = 위 경계선 가운데 손잡이 / 펼치기 = 접힘 바(전체 폭 44px, 현재 묶음·기능 이름) — localStorage 기억, 메뉴 높이 → :root --dbms-nav-h(본문 아래 여백이 따라감)
//   접힘 바 사유 : 손잡이만 남으면 화면 맨 아래 16px 띠라 Pi Browser(Android WebView, safe-area 0)의 하단 제스처 바에 가려 펼칠 수 없었음(마스터 2026-11-02 Pi Browser 접힘 손잡이 가림)
//  잠긴 기능 = 서브 탭에 'D2부터' 배지(지금 URL ?link= 연결의 요금제, 모르면 표시 안 함 — 서버 검사는 requireLink)
//  페이지마다 로그인 게이트가 있어 로그인 여부와 무관하게 노출. 좁은 화면은 가로 스크롤(줄바꿈 없음)
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { FEATURE_GROUPS, isActive } from '@/lib/features'
import { planRank, type PlanCd } from '@/lib/plan-rules'
import { usePlanInfo } from './plan/use-plan'
import {
  IconChevronDown,
  IconChevronUp,
  IconCompare,
  IconLayers,
  IconPulse,
  IconSliders,
} from './nav-icons'

const FOLD_KEY = 'dbms-nav-fold'
type GroupKey = (typeof FEATURE_GROUPS)[number]['key']
// 서브 바를 타일 끝 쪽(LTR 오른쪽)에 맞출 묶음 — 메뉴 뒤쪽이라 서브 바가 안쪽(앞쪽)으로 펼쳐지게
const ALIGN_END: ReadonlySet<GroupKey> = new Set(['lake', 'admin'])

// 묶음 색(다크 테마 무채색 + 옅은 색조) — box = 묶음 박스, on = 현재 묶음 타일·서브 탭, soft = 서브 바 바탕, text = 현재 글자
const TONE: Record<
  GroupKey,
  { box: string; on: string; soft: string; text: string }
> = {
  monitor: {
    box: 'border-[#3b4a63]',
    on: 'bg-[#3d5a86] border-[#5b7db0]',
    soft: 'bg-[#1b2433] border-[#3b4a63]',
    text: 'text-[#9cc0f0]',
  },
  drift: {
    box: 'border-[#3f5547]',
    on: 'bg-[#3f6a4f] border-[#5f8f6f]',
    soft: 'bg-[#18241d] border-[#3f5547]',
    text: 'text-[#a3d4b3]',
  },
  lake: {
    box: 'border-[#56493b]',
    on: 'bg-[#6e5a42] border-[#94795a]',
    soft: 'bg-[#251f18] border-[#56493b]',
    text: 'text-[#e0c9a8]',
  },
  admin: {
    box: 'border-[#45454f]',
    on: 'bg-[#55555f] border-[#77777f]',
    soft: 'bg-[#1f1f24] border-[#45454f]',
    text: 'text-[#d4d4dc]',
  },
}
const ICON: Record<GroupKey, ReactNode> = {
  monitor: <IconPulse width={16} height={16} />,
  drift: <IconCompare width={16} height={16} />,
  lake: <IconLayers width={16} height={16} />,
  admin: <IconSliders width={16} height={16} />,
}

export function FeatureNav() {
  const t = useTranslations('nav')
  // 첫 화면(/) = 모니터링 보드(마스터 2026-11-02) — 메뉴에서는 /monitor 로 본다
  const raw = usePathname()
  const path = raw === '/' ? '/monitor' : raw
  const grp = FEATURE_GROUPS.find((g) =>
    g.items.some((i) => isActive(path, i.href)),
  )
  const curKey = grp?.key
  // 접힘 바에 보일 이름 = 현재 묶음 · 현재 기능
  const feat = grp?.items.find((i) => isActive(path, i.href))
  const here = grp
    ? [t(`groups.${grp.key}`), feat && t(feat.key)] // 묶음·기능 이름이 같으면(모니터링 · 모니터링) 한 번만
        .filter((v, i, a) => v && a.indexOf(v) === i)
        .join(' · ')
    : ''
  const navRef = useRef<HTMLElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLUListElement>(null)
  const [fold, setFold] = useState(false)
  const [subX, setSubX] = useState<number | null>(null)
  const tp = useTranslations('plan')
  // 지금 연결 = URL ?link=(LinkPicker 가 맞춤) — LinkWatch(Suspense 안 useSearchParams)가 알려 준다
  const [linkId, setLinkId] = useState<string | null>(null)
  const cur = usePlanInfo(linkId).info?.cur.plan ?? null
  const locked = (min: PlanCd) => cur !== null && planRank(cur) < planRank(min)

  useEffect(() => {
    try {
      setFold(localStorage.getItem(FOLD_KEY) === '1')
    } catch {
      /* 저장소 차단 — 펼침 기본 */
    }
  }, [])
  const toggle = () => {
    const v = !fold
    setFold(v)
    try {
      localStorage.setItem(FOLD_KEY, v ? '1' : '0')
    } catch {
      /* 무시 */
    }
  }

  // 서브 바 = 현재 묶음 타일 시작 쪽 끝에 맞춤, 뒤쪽 묶음(레이크·관리)은 끝 쪽 끝에 맞춤(마스터 2026-11-02) — RTL 은 좌우 반전.
  //  화면 끝을 넘치면 안쪽으로. 가로 스크롤·창 크기·글꼴 로딩 때 다시 계산
  useLayoutEffect(() => {
    const row = rowRef.current
    const place = () => {
      const nav = navRef.current,
        sub = subRef.current,
        a = row?.querySelector('[aria-current="true"]')
      if (!nav || !sub || !a || !curKey) return setSubX(null)
      const box = a.getBoundingClientRect()
      const right =
        ALIGN_END.has(curKey) !== (getComputedStyle(nav).direction === 'rtl')
      const x =
        (right ? box.right - sub.offsetWidth : box.left) -
        nav.getBoundingClientRect().left
      setSubX(
        Math.round(
          Math.max(8, Math.min(x, nav.offsetWidth - sub.offsetWidth - 8)),
        ),
      )
    }
    place()
    window.addEventListener('resize', place)
    row?.addEventListener('scroll', place)
    const ro = new ResizeObserver(place)
    if (row) ro.observe(row) // 데스크톱 스크롤바 생김·사라짐으로 nav 폭이 바뀌어 가운데 타일이 움직일 때
    if (row?.firstElementChild) ro.observe(row.firstElementChild)
    if (subRef.current) ro.observe(subRef.current)
    return () => {
      window.removeEventListener('resize', place)
      row?.removeEventListener('scroll', place)
      ro.disconnect()
    }
  }, [path, curKey, fold])

  // 메뉴 높이(서브 바 유무·접힘에 따라 바뀜) → :root --dbms-nav-h
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const set = () =>
      document.documentElement.style.setProperty(
        '--dbms-nav-h',
        `${nav.offsetHeight}px`,
      )
    set()
    const ro = new ResizeObserver(set)
    ro.observe(nav, { box: 'border-box' }) // 아래 여백(safe-area) 만 바뀌어도 다시 잼
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--dbms-nav-h')
    }
  }, [])

  // 아래 여백 = 화면 맨 아래(하단 제스처 바·브라우저 UI)에서 띄움 — Pi Browser 는 safe-area 가 0 이라 max 로 최소값 보장
  return (
    <nav
      ref={navRef}
      aria-label={t('label')}
      className={`bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t border-white/10 backdrop-blur ${fold ? 'pb-[max(12px,env(safe-area-inset-bottom))]' : 'pb-[max(4px,env(safe-area-inset-bottom))]'}`}
    >
      {fold ? (
        // 접힘 바 — 전체 폭이 눌림 영역(높이 44px), 이미 접힌 채 저장된 사용자도 여기서 펼침
        <button
          type="button"
          onClick={toggle}
          aria-expanded={false}
          aria-label={here ? `${t('unfold')} · ${here}` : t('unfold')}
          title={t('unfold')}
          className={`flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 px-4 text-xs hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none focus-visible:ring-inset ${grp ? TONE[grp.key].text : 'text-muted-foreground'}`}
        >
          <IconChevronUp width={14} height={14} />
          {grp && ICON[grp.key]}
          <span className="truncate">{here || t('unfold')}</span>
        </button>
      ) : (
        // 접기 손잡이 — 위 경계선 가운데, 서브 바를 가리지 않게 선 위에 얹음. 모양 16×48 그대로, 눌림 영역만 투명 의사요소로 32×64
        <button
          type="button"
          onClick={toggle}
          aria-expanded
          aria-label={t('fold')}
          title={t('fold')}
          className="bg-background text-muted-foreground hover:text-foreground absolute bottom-full left-1/2 z-10 flex h-4 w-12 -translate-x-1/2 touch-manipulation items-center justify-center rounded-t-md border border-b-0 border-white/10 before:absolute before:-inset-x-2 before:-top-3 before:-bottom-1"
        >
          <IconChevronDown width={14} height={14} />
        </button>
      )}
      <Suspense fallback={null}>
        <LinkWatch onLink={setLinkId} />
      </Suspense>
      {!fold && grp && (
        <div className="relative h-9">
          <ul
            ref={subRef}
            aria-label={t(`groups.${grp.key}`)}
            style={{
              left: subX ?? 0,
              visibility: subX == null ? 'hidden' : undefined,
            }}
            className={`absolute bottom-0 flex max-w-[calc(100vw-16px)] [scrollbar-width:none] gap-1 overflow-x-auto rounded-t-lg border border-b-0 px-1.5 py-1 text-xs whitespace-nowrap ${TONE[grp.key].soft}`}
          >
            {grp.items.map((f) => {
              const on = isActive(path, f.href)
              return (
                <li key={f.key}>
                  <Link
                    href={f.href}
                    aria-current={on ? 'page' : undefined}
                    className={`block rounded px-2.5 py-1 ${on ? `${TONE[grp.key].on} border font-semibold text-white` : `${TONE[grp.key].text} hover:bg-white/10`}`}
                  >
                    {t(f.key)}
                    {locked(f.min) && (
                      <span className="ms-1 rounded bg-amber-400/20 px-1 text-[10px] text-amber-200">
                        {tp('from', { plan: f.min })}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {!fold && (
        <div
          ref={rowRef}
          className="w-full [scrollbar-width:none] overflow-x-auto px-2 py-1.5"
        >
          <ul className="mx-auto flex w-max items-center gap-2 whitespace-nowrap">
            {FEATURE_GROUPS.map((g) => {
              const on = g.key === grp?.key
              const tone = TONE[g.key]
              return (
                <li
                  key={g.key}
                  className={`rounded-md border p-0.5 ${tone.box}`}
                >
                  <Link
                    href={g.items[0].href}
                    aria-current={on ? 'true' : undefined}
                    title={t(`groups.${g.key}`)}
                    className={`flex min-w-[3.75rem] flex-col items-center gap-0.5 rounded-lg px-2 py-1 ${on ? `${tone.text} bg-white/5 font-semibold` : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-7 w-7 items-center justify-center rounded-md border ${on ? `${tone.on} text-white` : 'bg-surface border-white/10'}`}
                    >
                      {ICON[g.key]}
                    </span>
                    <span className="text-[11px] leading-none">
                      {t(`groups.${g.key}`)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </nav>
  )
}

// URL ?link= 감시 — useSearchParams 는 Suspense 경계 안에서만(정적 렌더 빌드 오류 방지)
function LinkWatch({ onLink }: { onLink: (v: string | null) => void }) {
  const v = useSearchParams().get('link')
  useEffect(() => onLink(v), [v, onLink])
  return null
}
