// 3D 키캡 아이콘(하단 메뉴·바로가기 키패드·단계 흐름·빈 상태 전용) — 무광 키 + 음각 글리프(같은 lucide 아이콘 두 겹), 이미지·filter 없음. 훅 없음 → 서버·클라이언트 공용
//  사용 : <Icon3D icon={MENU_ICON.words} size='sm' on /> — 재질·크기는 globals.css .key3d, 누름·호버는 감싼 a·button·summary 가 처리
import type { LucideIcon } from 'lucide-react'

export function Icon3D({ icon: Icon, size = 'md', on = false, className = '' }: { icon: LucideIcon; size?: 'sm' | 'md' | 'lg'; on?: boolean; className?: string }) {
  return (
    <span aria-hidden className={`key3d ${className}`} data-size={size} data-on={on || undefined}>
      <Icon className='key3d-hl' />
      <Icon />
    </span>
  )
}
