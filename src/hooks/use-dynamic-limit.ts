import { useEffect, useState } from 'react'

const ROW_HEIGHT_PX = 44  // 관리자 테이블 행: py-3(24px) + 텍스트(20px)

function calcLimit(chromeHeight: number): number {
  if (typeof window === 'undefined') return 15
  const headerH = (document.querySelector('header') as HTMLElement | null)?.offsetHeight ?? 56
  const footerH = (document.querySelector('footer') as HTMLElement | null)?.offsetHeight ?? 68
  const available = window.innerHeight - headerH - footerH - chromeHeight
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
