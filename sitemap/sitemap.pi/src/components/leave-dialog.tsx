'use client'

// "외부 사이트로 이동" 안내 레이어 — 워프 점프 연출(마스터 지시 2026-10-14, 구 아이보리 3D 카드 대체) :
//  뒤에는 <canvas> 스타필드(warp-field), 앞에는 우주선 실루엣 카드(.ship-* : 뾰족한 선수 목적지 · 본체 좌표·항해 로그 · 워프 나셀).
//  "점프" 클릭 → 우주선이 진동하며 음속 돌파(소닉붐 링 + 플래시) → 화면 정중앙에 블랙홀(.ship-hole)이 열리고 그 점을 향해 작아지며 음속으로 날아가 소멸(회전 없음)(FLY_MS, 흡입 지점은 --jx/--jy) → 그 뒤에 window.open(마스터 지시 "실제 이동 전에 사라지는 효과").
//  외부 이동은 사용자 클릭 + 안내 후에만(MAINNET A-6) — 점프 버튼이 유일한 이동 경로. 열기는 클릭 뒤 ~1.7s(일시적 사용자 활성화 5s 안)지만
//  구형 WebKit 처럼 비동기 open 을 막는 환경은 null 을 돌려주므로 "차단됨" 안내 + 직접 링크로 폴백(링크 클릭도 사용자 클릭).
//  floating 이면 화면 하단 고정 + 뷰포트 전체 별(메인 버블), 아니면 인라인 + 카드 안 별(상세)
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { WarpField } from './warp-field'

// 점프 연출 길이(ms) — 래퍼 인라인 --fly 로 CSS(.ship-jump / .ship-boom / .ship-hole / .hud-flash)에 전달하는 단일 소스. 1.0s → 1.4s(마스터 2026-10-16 "조금 늦춰")
const FLY_MS = 1400
// 소멸 뒤 정지 시간(ms) — 우주선이 블랙홀에 완전히 사라진 다음에 창을 연다(마스터 2026-10-16). 합계 1.7s 는 사용자 활성화 5s 안
const HOLD_MS = 300
// 움직임 줄이기 설정이어도 연출을 건너뛰지 않는다 — 모바일 단말의 "애니메이션 제거" 설정이 reduce 로 잡혀 Pi Browser 에서 우주선 모션이 통째로 빠졌던 문제(마스터 지시 2026-10-16 "모바일도 동일")

export function LeaveDialog({
  url,
  name,
  desc,
  floating = false,
  onConfirm,
  onCancel,
}: {
  url: string
  name?: string | null
  desc?: string | null // undefined = 조회 중, null·'' = 설명 없음(안내 문구 폴백)
  floating?: boolean
  onConfirm?: () => void // 열기 직전 부수효과(예: 클릭 통계) — 열기(window.open)·닫기(onCancel)는 이 컴포넌트가 맡는다
  onCancel: () => void
}) {
  const t = useTranslations('detail')
  const [jumping, setJumping] = useState(false)
  const [blocked, setBlocked] = useState(false) // 비동기 open 이 차단된 환경 → 직접 링크 폴백
  const timer = useRef<number>(0)
  const shipRef = useRef<HTMLDivElement>(null)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // 실제 열기 — noopener 옵션은 반환값이 항상 null 이라 차단 여부를 알 수 없어, 창을 받은 뒤 opener 를 끊는다(referrer 는 전달됨: 차단 판별과 맞교환)
  const go = () => {
    onConfirm?.()
    const w = window.open(url, '_blank')
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
    // 소멸 지점 — floating 이면 카드 중심에서 뷰포트 정중앙까지 거리(CSS 키프레임 100% 의 translate). 인라인은 overflow-hidden 래퍼 안이라 카드 중심(0)
    const el = shipRef.current
    if (floating && el) {
      const r = el.getBoundingClientRect()
      el.style.setProperty(
        '--jx',
        `${innerWidth / 2 - (r.left + r.right) / 2}px`,
      )
      el.style.setProperty(
        '--jy',
        `${innerHeight / 2 - (r.top + r.bottom) / 2}px`,
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
        floating ? 'contents' : 'relative overflow-hidden rounded-xl pt-2'
      }
      style={{ '--fly': `${FLY_MS}ms` } as CSSProperties}
    >
      <WarpField mode={jumping ? 'warp' : 'idle'} fixed={floating} />
      {jumping && (
        <div className="hud-flash pointer-events-none fixed inset-0 z-30" />
      )}
      {/* 블랙홀 — 흡입 지점(floating = 뷰포트 정중앙, 인라인 = 카드 중심)에 소닉붐 직후 열림. 우주선(z-20) 아래 */}
      {jumping && (
        <div
          className={`ship-hole pointer-events-none top-1/2 left-1/2 ${floating ? 'fixed z-[15]' : 'absolute'}`}
          aria-hidden
        />
      )}
      {/* 우주선 실루엣(톱뷰, 마스터 지시 2026-10-14) — 화살촉 선수(목적지) → 본체(좌표·항해 로그·버튼) + 좌우 워프 나셀(앞끝 붉은 버사드 콜렉터, 점프 때 더 밝게). 전부 CSS(globals.css .ship-*) */}
      <div
        ref={shipRef}
        role="dialog"
        aria-modal="false"
        aria-label={t('leaveTitle')}
        className={`ship ${jumping ? 'ship-jump' : ''} ${
          floating
            ? 'fixed bottom-14 left-1/2 z-20 w-[min(94vw,27rem)] -translate-x-1/2'
            : 'relative w-full'
        }`}
      >
        <div className="ship-nacelle ship-nacelle-l" aria-hidden />
        <div className="ship-nacelle ship-nacelle-r" aria-hidden />
        <div className="ship-pylon ship-pylon-l" aria-hidden />
        <div className="ship-pylon ship-pylon-r" aria-hidden />
        {/* 소닉붐 — 음속 돌파 순간 선수 뒤(카드 40% 높이)에서 퍼지는 링 */}
        {jumping && <div className="ship-boom" aria-hidden />}
        {/* 선수(prow) — 뾰족한 화살촉 윤곽(clip-path) + 조종석 창. 제목 문구는 aria-label 로만(마스터 지시 2026-10-14 "코멘트 제거") */}
        <div className="ship-head">
          <div className="ship-prow">
            <div className="ship-prow-in">
              <p className="hud-label">{t('hudDest')}</p>
              <p className="truncate text-lg font-bold text-white">
                {name || url}
              </p>
            </div>
          </div>
        </div>
        <div className="ship-hull flex flex-col gap-2">
          <p className="hud-label">{t('hudCoord')}</p>
          <p className="hud-coord font-mono text-xs break-all">{url}</p>
          <p className="hud-label">{t('hudLog')}</p>
          {/* 설명 최대 500자 — 작은 화면에서 카드가 화면 밖으로 밀리지 않게 높이 상한 + 내부 스크롤 */}
          <p className="max-h-[30vh] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-white/80">
            {desc === undefined ? '…' : desc || t('leaveBody')}
          </p>
          {blocked && (
            <p className="rounded-md border border-amber-300/40 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
              {t('popupBlocked')}{' '}
              <a
                className="font-semibold underline"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onCancel}
              >
                {t('popupBlockedLink')}
              </a>
            </p>
          )}
          <div className="mt-1 flex justify-center gap-2">
            <button
              type="button"
              className="btn-hud btn-hud-primary"
              onClick={jump}
              disabled={jumping}
            >
              ⚡ {t('leaveConfirm')}
            </button>
            <button
              type="button"
              className="btn-hud"
              onClick={onCancel}
              disabled={jumping}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
