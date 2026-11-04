'use client'

// "외부 사이트로 이동" 안내 레이어 — 워프 점프 연출(마스터 지시 2026-10-14, 구 아이보리 3D 카드 대체) :
//  뒤에는 <canvas> 스타필드(warp-field), 앞에는 우주선 카드(ships/ : 기체 6종 — 기본 SAUCER + 유료 BRIDGE·TWIN·DAGGER·CROSS·HAULER, ship prop 2026-11-03).
//  "점프" 클릭 → 우주선이 진동하며 음속 돌파(플래시) → 화면 정중앙에 블랙홀(.ship-hole)이 열리고 그 점을 향해 작아지며 음속으로 날아가 소멸(회전 없음)(FLY_MS, 흡입 지점은 --jx/--jy) → 블랙홀이 화면 전체로 줌인(2026-11-01) → 그 뒤에 window.open(마스터 지시 "실제 이동 전에 사라지는 효과").
//  외부 이동은 사용자 클릭 + 안내 후에만(MAINNET A-6) — 점프 버튼이 유일한 이동 경로. 열기는 클릭 뒤 ~1.7s(일시적 사용자 활성화 5s 안)지만
//  구형 WebKit 처럼 비동기 open 을 막는 환경은 null 을 돌려주므로 "차단됨" 안내 + 직접 링크로 폴백(링크 클릭도 사용자 클릭).
//  floating 이면 화면 하단 고정 + 뷰포트 전체 별(메인 버블), 아니면 인라인 + 카드 안 별(상세)
import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useTranslations } from 'next-intl'
import { markWarp } from '@pi/warp'
import { WarpField } from './warp-field'
import { Ship } from './ships'
import { SHIP_DEFAULT, isShipCd } from '@/lib/ship'

// 점프 연출 길이(ms) — 래퍼 인라인 --fly 로 CSS(.ship-jump / .ship-hole / .hud-flash)에 전달하는 단일 소스. 1.0s → 1.4s(마스터 2026-10-16 "조금 늦춰")
const FLY_MS = 1400
// 소멸 뒤 정지 시간(ms) — 우주선이 블랙홀에 완전히 사라진 다음에 창을 연다(마스터 2026-10-16). 합계 1.7s 는 사용자 활성화 5s 안
const HOLD_MS = 300
// floating 맞춤 문턱 — 이 배율(글자 가독성 : SAUCER 항해 로그 13px → 9.75px)보다 더 줄여야 들어가면 항해 로그 높이부터 줄이고(최저 LOG_MIN_PX ≈ 1줄, 내부 스크롤),
// 그래도 넘치는 극단(가로 모드 높이 390px 이하·폭 320px)만 문턱 아래로 줄인다 — 잘리는 것보다 작은 편이 낫다
const MIN_SCALE = 0.75
const LOG_MIN_PX = 24
const EDGE_PX = 8 // 화면 위·좌우 여백

// 기체 전체 실루엣 — 카드 박스 + 넘쳐 그리는 자손(나셀·날개·포신·불꽃 SVG overflow: visible)의 합집합(뷰포트 좌표, scale 반영).
// 지금 투명한 자손(점프 때만 켜지는 BRIDGE 워프 줄무늬 등)은 제외 — 점프 중엔 어차피 기체가 날아간다
function silhouette(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  let [l, t, rt, b] = [r.left, r.top, r.right, r.bottom]
  for (const e of el.querySelectorAll('*')) {
    const q = e.getBoundingClientRect()
    if ((!q.width && !q.height) || getComputedStyle(e).opacity === '0') continue
    l = Math.min(l, q.left)
    t = Math.min(t, q.top)
    rt = Math.max(rt, q.right)
    b = Math.max(b, q.bottom)
  }
  return { l, t, r: rt, b }
}

// floating 기체를 화면(innerHeight = 주소창 변화 반영) 안, 하단 범례 위(기준선 gap)에 맞춘다 — 기체 높이는 글자 줄바꿈에 따라 달라 비율 상수 대신 실측.
// scale(독립 속성)로 줄여 글자·SVG 가 같은 비율, 원점은 중심(.ship-jump transform-origin 과 같아 점프 시작에 튐 없음) → 줄어든 만큼 bottom 을 내려 실루엣 아래를 기준선에 붙인다.
// 반환 = 배율(점프 --jx/--jy 를 나눠 쓴다 : transform 은 scale 뒤에 적용돼 이동량도 배율만큼 줄기 때문)
function fitShip(el: HTMLElement) {
  const log = el.querySelector<HTMLElement>('.ship-log')
  el.style.scale = ''
  el.style.bottom = ''
  if (log) log.style.maxHeight = ''
  // 기준선 = max(CSS 기본(safe-area + 여백), 화면 아래쪽 절반에 보이는 하단 바[data-ship-floor] 위 + 여백) — 범례는 언어·폭에 따라 1~4줄(실측 390px 81px)
  const floor = document
    .querySelector('[data-ship-floor]')
    ?.getBoundingClientRect()
  const base = parseFloat(getComputedStyle(el).bottom) || 0
  const gap = Math.max(
    base,
    floor && floor.top > innerHeight / 2 && floor.top < innerHeight
      ? innerHeight - floor.top + EDGE_PX
      : 0,
  )
  const availH = innerHeight - gap - EDGE_PX
  const availW = innerWidth - EDGE_PX * 2
  let s = silhouette(el)
  let h = s.b - s.t
  // 배율 하한에서도 넘치면 항해 로그(내부 스크롤)부터 줄인다
  const over = h - availH / MIN_SCALE
  if (over > 0 && log) {
    log.style.maxHeight = `${Math.max(LOG_MIN_PX, log.offsetHeight - over)}px`
    s = silhouette(el)
    h = s.b - s.t
  }
  // 하한(MIN_SCALE)은 로그를 줄일지 정하는 문턱일 뿐 배율에 강제하지 않는다 — 로그 최저에서도 높거나 폭이 좁은(320px 등) 화면은 잘리는 것보다 작은 편이 낫다
  const k = Math.min(1, availH / h, availW / (s.r - s.l))
  const r = el.getBoundingClientRect()
  // 중심 원점 축소 → 실루엣 아래 = 박스 중심 + (s.b − 박스 중심) × k. 이 값을 기준선(화면 아래 − gap)에 맞추도록 bottom 을 옮긴다
  // (축소면 내려가고, 박스 밖으로 넘친 나셀·불꽃이 있으면 그만큼 올라간다)
  const midY = (r.top + r.bottom) / 2
  const below = midY + (s.b - midY) * k - (innerHeight - gap)
  if (k < 1) el.style.scale = String(k)
  if (Math.abs(below) > 0.5) el.style.bottom = `${base + below}px`
  return k
}

// 움직임 줄이기 설정이어도 연출을 건너뛰지 않는다 — 모바일 단말의 "애니메이션 제거" 설정이 reduce 로 잡혀 Pi Browser 에서 우주선 모션이 통째로 빠졌던 문제(마스터 지시 2026-10-16 "모바일도 동일")

export function LeaveDialog({
  url,
  name,
  desc,
  floating = false,
  ship,
  onConfirm,
  onCancel,
}: {
  url: string
  name?: string | null
  desc?: string | null // undefined = 조회 중, null·'' = 설명 없음(안내 문구 폴백)
  floating?: boolean
  ship?: string | null // 기체 코드(lib/ship.ts) — 모르는 값·null 이면 기본 SAUCER
  onConfirm?: () => void // 열기 직전 부수효과(예: 클릭 통계) — 열기(window.open)·닫기(onCancel)는 이 컴포넌트가 맡는다
  onCancel: () => void
}) {
  const t = useTranslations('detail')
  const [jumping, setJumping] = useState(false)
  const [blocked, setBlocked] = useState(false) // 비동기 open 이 차단된 환경 → 직접 링크 폴백
  const timer = useRef<number>(0)
  const shipRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(1)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // floating 맞춤 — 처음·화면 크기(주소창·가로 전환)·내용(설명 도착·기체 청크 로드) 변화마다. 점프 중엔 고정(이동 계산이 쓰는 위치)
  const jumpingRef = useRef(false)
  useEffect(() => {
    jumpingRef.current = jumping
  }, [jumping])
  useLayoutEffect(() => {
    const el = shipRef.current
    if (!floating || !el) return
    const fit = () => {
      if (!jumpingRef.current) scaleRef.current = fitShip(el)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    // 범례는 흐름 요소라 페이지를 스크롤하면 움직인다 → 스크롤에도 다시 맞춤(passive)
    addEventListener('resize', fit)
    addEventListener('scroll', fit, { passive: true })
    return () => {
      ro.disconnect()
      removeEventListener('resize', fit)
      removeEventListener('scroll', fit)
    }
  }, [floating])

  // 실제 열기 — noopener 옵션은 반환값이 항상 null 이라 차단 여부를 알 수 없어, 창을 받은 뒤 opener 를 끊는다(referrer 는 전달됨: 차단 판별과 맞교환)
  const go = () => {
    onConfirm?.()
    const w = window.open(markWarp(url), '_blank') // 출발 표시(utm_source=sitemap.pi) — 도착 사이트가 '음속에서 감속해 멈추는' 반대 연출(@pi/warp WarpArrival)
    if (w) {
      w.opener = null
      onCancel()
    } else {
      setJumping(false)
      setBlocked(true)
    }
  }
  const jump = () => {
    if (jumping) return
    setBlocked(false)
    // 소멸 지점 — floating 이면 카드 중심(점프 transform-origin)에서 뷰포트 정중앙까지 거리(CSS 키프레임 100% 의 translate). 인라인은 overflow-hidden 래퍼 안이라 카드 중심(0).
    // 화면 맞춤 scale(fitShip) 뒤의 transform 이동은 배율만큼 줄어 보이므로 배율로 나눈다(rect 는 축소 반영 = 실제 보이는 중심)
    const el = shipRef.current
    if (floating && el) {
      const r = el.getBoundingClientRect()
      const k = scaleRef.current
      el.style.setProperty(
        '--jx',
        `${(innerWidth / 2 - (r.left + r.right) / 2) / k}px`,
      )
      el.style.setProperty(
        '--jy',
        `${(innerHeight / 2 - (r.top + r.bottom) / 2) / k}px`,
      )
    }
    setJumping(true)
    timer.current = window.setTimeout(go, FLY_MS + HOLD_MS)
  }

  // 인라인(상세)이면 별 canvas 의 absolute 기준이 되도록 relative 래퍼, floating 이면 래퍼 없이(display: contents) fixed 요소만.
  // --fly 는 display: contents 여도 자식에 상속된다(커스텀 속성은 박스가 아니라 요소 트리로 상속)
  return (
    <div
      className={
        floating ? 'contents' : 'relative overflow-hidden rounded-xl p-2'
      }
      style={{ '--fly': `${FLY_MS}ms` } as CSSProperties}
    >
      <WarpField mode={jumping ? 'warp' : 'idle'} fixed={floating} />
      {jumping && (
        <div className="hud-flash pointer-events-none fixed inset-0 z-30" />
      )}
      {/* 블랙홀 — 흡입 지점(floating = 뷰포트 정중앙, 인라인 = 카드 중심)에 음속 돌파 직후 열림 → 우주선을 삼킨 뒤 화면 전체로 줌인. 우주선(z-20) 아래 */}
      {jumping && (
        <div
          className={`ship-hole pointer-events-none top-1/2 left-1/2 ${floating ? 'fixed z-[15]' : 'absolute'}`}
          aria-hidden
        />
      )}
      {/* 우주선 — 기체별 껍데기(ships/) + 공통 콘텐츠. 제목 문구는 aria-label 로만(마스터 지시 2026-10-14 "코멘트 제거") */}
      <Ship
        ref={shipRef}
        cd={isShipCd(ship) ? ship : SHIP_DEFAULT}
        role="dialog"
        aria-modal="false"
        aria-label={t('leaveTitle')}
        className={`${jumping ? 'ship-jump' : ''} ${
          floating
            ? 'ship-float fixed left-1/2 z-20 w-[min(94vw,27rem)] -translate-x-1/2'
            : 'relative mx-auto w-full max-w-[27rem]'
        }`}
        name={name || url}
        url={url}
        log={desc === undefined ? '…' : desc || t('leaveBody')}
        notice={
          blocked && (
            <p className="rounded-md border border-amber-300/40 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
              {t('popupBlocked')}{' '}
              <a
                className="font-semibold underline"
                href={markWarp(url)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onCancel}
              >
                {t('popupBlockedLink')}
              </a>
            </p>
          )
        }
        busy={jumping}
        onJump={jump}
        onCancel={onCancel}
      />
    </div>
  )
}
