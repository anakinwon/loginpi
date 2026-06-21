import { cn } from '@/lib/utils'

// Bean Token 아이콘 — 모든 "Bean/빈/카페빈" 시각 표현의 단일 출처(public/bean.png, 512×512 정사각).
// ⚠️ 🫘(콩 이모지) 등 다른 표기 절대 사용 금지 — Bean은 이 이미지로만 표시한다.
// 크기는 className의 h-*/w-*로 지정한다. 예: <BeanIcon className="h-7 w-7" />
// (정사각 이미지라 cover로 박스를 꽉 채운다)
export function BeanIcon({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Bean Token"
      className={cn(
        'inline-block bg-center bg-no-repeat align-text-bottom',
        className,
      )}
      style={{
        backgroundImage: 'url(/bean.png)',
        backgroundSize: 'cover',
      }}
    />
  )
}
