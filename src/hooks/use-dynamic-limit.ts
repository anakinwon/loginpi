import { useEffect, useState } from 'react'

const ROW_HEIGHT_PX = 44 // 관리자 테이블 행: py-3(24px) + 텍스트(20px)

function calcLimit(chromeHeight: number): number {
  if (typeof window === 'undefined') return 15
  const headerH =
    (document.querySelector('header') as HTMLElement | null)?.offsetHeight ?? 56
  const footerH =
    (document.querySelector('footer') as HTMLElement | null)?.offsetHeight ?? 68
  // 관리자 하단 플로팅 퀵메뉴(AdminQuickMenu, data-admin-quick-menu)는 footer(BottomNav)
  // 보다 더 위까지 차지한다(safe-area+5.25rem~). footerH만 빼면 마지막 행(페이지네이션)이
  // 정확히 이 플로팅 버튼과 같은 화면 좌표에 배치돼 클릭이 가로채인다 — 렌더돼 있으면
  // (모바일, md 미만) 그 상단 경계(뷰포트 바닥까지의 실측 거리)까지 여백을 예약한다.
  // offsetParent는 position:fixed 요소면 실제로 보여도 항상 null이라(잘 알려진 함정)
  // 가시성 판정에 쓸 수 없다 — getComputedStyle(display)로 md:hidden 여부를 직접 확인한다.
  const quickMenuEl = document.querySelector(
    '[data-admin-quick-menu]',
  ) as HTMLElement | null
  const quickMenuReserve =
    quickMenuEl && getComputedStyle(quickMenuEl).display !== 'none'
      ? window.innerHeight - quickMenuEl.getBoundingClientRect().top
      : 0
  const available =
    window.innerHeight -
    headerH -
    Math.max(footerH, quickMenuReserve) -
    chromeHeight
  return Math.max(5, Math.min(50, Math.floor(available / ROW_HEIGHT_PX)))
}

// chromeHeight: 해당 페이지에서 목록 행을 제외한 고정 영역 합계 (px)
// resize 이벤트는 150ms 디바운스로 묶어 불필요한 재조회를 방지
export function useDynamicLimit(chromeHeight: number): number {
  const [limit, setLimit] = useState(15)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const update = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setLimit(calcLimit(chromeHeight)), 150)
    }
    update()
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      clearTimeout(timer)
    }
  }, [chromeHeight])
  return limit
}
