// 3D 키캡 아이콘(하단 메뉴·바로가기 키패드·단계 흐름·빈 상태 전용) — 무광 키 + 글리프 1장(묶음 tone 색), 이미지·filter 없음. 훅 없음 → 서버·클라이언트 공용
//  사용 : <Icon3D icon={MENU_ICON.words} size='sm' on /> — 재질·크기·색은 globals.css .key3d(data-tone), 누름·호버는 감싼 a·button·summary 가 처리
//  글리프 두 겹(1px 오프셋 음각)은 비정수 배율(DPR 1.25 등)에서 획 경계가 번져 2026-11-12 제거 — 입체감은 키캡 box-shadow 만
import type { LucideIcon } from 'lucide-react'
import { toneOf, type Tone } from '@/lib/menu-icons'

export function Icon3D({ icon: Icon, size = 'md', on = false, tone, className = '' }: { icon: LucideIcon; size?: 'sm' | 'md' | 'lg'; on?: boolean; tone?: Tone; className?: string }) {
  return (
    <span aria-hidden className={`key3d ${className}`} data-size={size} data-tone={tone ?? toneOf(Icon) ?? 'std'} data-on={on || undefined}>
      <Icon />
    </span>
  )
}
