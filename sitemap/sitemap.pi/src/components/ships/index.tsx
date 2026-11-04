'use client'

// 워프 이동 안내 우주선 — 기체 코드(lib/ship.ts) → 껍데기(기체별 SVG 장식 + 레이아웃) + 공통 콘텐츠(목적지·좌표·항해 로그·안내·점프/취소) 단일 소스.
// 루트 .ship.ship-<기체> 아래 공통 클래스(.hud-label·.ship-dest·.hud-coord·.ship-log·.ship-actions·.btn-hud·.ship-go)를 기체 CSS(globals.css .ship-<기체>-*)가 꾸민다.
// 점프·열기 기능은 leave-dialog, 축소 정지 미리보기는 ShipPreview(관리자·사이트 신청 화면 기체 고르기용)
import type { ComponentProps, ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { SHIP_DEFAULT, isShipCd, type ShipCd } from '@/lib/ship'

export type ShipSlots = { dest: ReactNode; body: ReactNode }

// 기체 껍데기 6종은 지연 로드 — 화면에 실제로 쓰는 1종 청크만 받는다(첫 번들에서 SVG 6벌 제외).
// ssr 기본값 유지 : LeaveDialog 는 클릭 뒤에만 마운트돼 서버 렌더가 없고, ShipPreview(관리자·내 사이트)는 서버 렌더에 기체가 들어가 수화 직후 깜빡임이 없다
const LOADERS: Record<ShipCd, () => Promise<(s: ShipSlots) => ReactNode>> = {
  SAUCER: () => import('./saucer').then((m) => m.SaucerShip),
  BRIDGE: () => import('./bridge').then((m) => m.BridgeShip),
  TWIN: () => import('./twin').then((m) => m.TwinShip),
  DAGGER: () => import('./dagger').then((m) => m.DaggerShip),
  CROSS: () => import('./cross').then((m) => m.CrossShip),
  HAULER: () => import('./hauler').then((m) => m.HaulerShip),
}
const SHELLS = Object.fromEntries(
  Object.entries(LOADERS).map(([cd, load]) => [
    cd,
    dynamic<ShipSlots>(load, { loading: () => null }),
  ]),
) as Record<ShipCd, (s: ShipSlots) => ReactNode>

// 기체 청크 미리 받기 — 이동 안내를 열기 전(데이터 도착 시점)에 불러 클릭 뒤 빈 자리 깜빡임을 없앤다. 모르는 값·null 이면 기본 기체
export const preloadShip = (ship?: string | null) =>
  void LOADERS[isShipCd(ship) ? ship : SHIP_DEFAULT]()

export function Ship({
  cd,
  name,
  url,
  log,
  notice,
  busy = false,
  onJump,
  onCancel,
  className = '',
  ...rest
}: {
  cd: ShipCd
  name: string
  url: string
  log: ReactNode
  notice?: ReactNode // 새 창 차단 안내 등 — 로그와 버튼 사이
  busy?: boolean // 점프 중·미리보기 — 버튼 비활성
  onJump?: () => void
  onCancel?: () => void
} & Omit<ComponentProps<'div'>, 'children'>) {
  const t = useTranslations('detail')
  const Shell = SHELLS[cd]
  return (
    <div {...rest} className={`ship ship-${cd.toLowerCase()} ${className}`}>
      <Shell
        dest={
          <>
            <p className="hud-label">{t('hudDest')}</p>
            <p className="ship-dest">{name}</p>
          </>
        }
        body={
          <>
            <p className="hud-label">{t('hudCoord')}</p>
            <p className="hud-coord">{url}</p>
            <p className="hud-label">{t('hudLog')}</p>
            {/* 설명 최대 500자 — 작은 화면에서 카드가 화면 밖으로 밀리지 않게 높이 상한(기체별) + 내부 스크롤 */}
            <p className="ship-log">{log}</p>
            {notice}
            <div className="ship-actions">
              {/* 손잡이(⚡)는 BRIDGE 에선 스로틀 레버 손잡이, 나머지는 글자 앞 아이콘 */}
              <button
                type="button"
                className="btn-hud btn-hud-primary ship-go"
                onClick={onJump}
                disabled={busy}
              >
                <span className="ship-go-knob" aria-hidden>
                  ⚡
                </span>
                <span className="ship-go-text">{t('leaveConfirm')}</span>
              </button>
              <button
                type="button"
                className="btn-hud"
                onClick={onCancel}
                disabled={busy}
              >
                {t('cancel')}
              </button>
            </div>
          </>
        }
      />
    </div>
  )
}

// 축소 정지 미리보기 — 점프 없음·버튼 비활성, 보조기술·포커스 제외(inert). zoom 으로 글자까지 같은 비율 축소(배치 폭 = 27rem × scale)
export function ShipPreview({
  ship,
  scale = 0.5,
  className = '',
}: {
  ship?: string | null
  scale?: number
  className?: string
}) {
  const t = useTranslations('detail')
  return (
    <div
      inert
      aria-hidden
      className={className}
      style={{ zoom: scale, width: '27rem' }}
    >
      <Ship
        cd={isShipCd(ship) ? ship : SHIP_DEFAULT}
        name="sitemap.pi"
        url="https://sitemap.pi"
        log={t('leaveBody')}
        busy
        className="relative"
      />
    </div>
  )
}
