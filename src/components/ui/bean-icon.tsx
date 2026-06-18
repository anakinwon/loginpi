import { cn } from '@/lib/utils'

// Bean Token 아이콘 — "BEAN TOKEN / Café.pi" 원형 토큰 이미지(public/cafe_bean003.png).
// 원본 여백을 sharp.trim으로 제거한 256×256 정사각이라 박스를 꽉 채운다.
// 크기는 className의 h-*/w-*로 지정한다. 예: <BeanIcon className="h-7 w-7" />
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
        backgroundImage: 'url(/cafe_bean003.png)',
        backgroundSize: 'auto 100%',
      }}
    />
  )
}
