'use client'

// dbms.pi 하단 고정 2단 폴더블 메뉴 — schema.pi area-nav 와 같은 구조(마스터 지시 2026-11-02)
//  1단(아래) = 묶음 4개(모니터링·GAP분석·레이크·관리) 타일 — 아이콘 타일 위 + 작은 글씨 아래, 누르면 그 묶음의 첫 기능으로
//  2단(위) = 현재 묶음의 하위 기능 서브 바 — 현재 묶음 타일 위에 맞춰 띄움(화면 양끝 8px 안쪽), 묶음 색 연한 바탕
//  접기·펼치기 = 위 경계선 가운데 손잡이(localStorage 기억), 메뉴 높이 → :root --dbms-nav-h(본문 아래 여백이 따라감)
//  페이지마다 로그인 게이트가 있어 로그인 여부와 무관하게 노출. 좁은 화면은 가로 스크롤(줄바꿈 없음)
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { FEATURE_GROUPS, isActive } from '@/lib/features'
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
  const cur = FEATURE_GROUPS.find((g) =>
    g.items.some((i) => isActive(path, i.href)),
  )
  const navRef = useRef<HTMLElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLUListElement>(null)
  const [fold, setFold] = useState(false)
  const [subX, setSubX] = useState<number | null>(null)

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

  // 서브 바 = 현재 묶음 타일 왼쪽에 맞춤(화면 끝 넘치면 안쪽으로). 가로 스크롤·창 크기·글꼴 로딩 때 다시 계산
  useLayoutEffect(() => {
    const row = rowRef.current
    const place = () => {
      const nav = navRef.current,
        sub = subRef.current,
        a = row?.querySelector('[aria-current="true"]')
      if (!nav || !sub || !a) return setSubX(null)
      const x =
        a.getBoundingClientRect().left - nav.getBoundingClientRect().left
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
    if (row?.firstElementChild) ro.observe(row.firstElementChild)
    if (subRef.current) ro.observe(subRef.current)
    return () => {
      window.removeEventListener('resize', place)
      row?.removeEventListener('scroll', place)
      ro.disconnect()
    }
  }, [path, cur?.key, fold])

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
    ro.observe(nav)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--dbms-nav-h')
    }
  }, [])

  return (
    <nav
      ref={navRef}
      aria-label={t('label')}
      className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t border-white/10 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      {/* 접기·펼치기 손잡이 — 위 경계선 가운데, 서브 바를 가리지 않게 선 위에 얹음 */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!fold}
        aria-label={fold ? t('unfold') : t('fold')}
        title={fold ? t('unfold') : t('fold')}
        className="bg-background text-muted-foreground hover:text-foreground absolute bottom-full left-1/2 flex h-4 w-12 -translate-x-1/2 items-center justify-center rounded-t-md border border-b-0 border-white/10"
      >
        {fold ? (
          <IconChevronUp width={14} height={14} />
        ) : (
          <IconChevronDown width={14} height={14} />
        )}
      </button>
      {!fold && cur && (
        <div className="relative h-9">
          <ul
            ref={subRef}
            aria-label={t(`groups.${cur.key}`)}
            style={{
              left: subX ?? 0,
              visibility: subX == null ? 'hidden' : undefined,
            }}
            className={`absolute bottom-0 flex max-w-[calc(100vw-16px)] [scrollbar-width:none] gap-1 overflow-x-auto rounded-t-lg border border-b-0 px-1.5 py-1 text-xs whitespace-nowrap ${TONE[cur.key].soft}`}
          >
            {cur.items.map((f) => {
              const on = isActive(path, f.href)
              return (
                <li key={f.key}>
                  <Link
                    href={f.href}
                    aria-current={on ? 'page' : undefined}
                    className={`block rounded px-2.5 py-1 ${on ? `${TONE[cur.key].on} border font-semibold text-white` : `${TONE[cur.key].text} hover:bg-white/10`}`}
                  >
                    {t(f.key)}
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
              const on = g.key === cur?.key
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
