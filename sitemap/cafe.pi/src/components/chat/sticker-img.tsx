'use client'

// 저장 방지 스티커 이미지 — 유료 콘텐츠 유출 억제 (캐주얼 복제 차단)
//  - draggable=false + onDragStart 차단: 드래그&드롭으로 PC 저장 방지
//  - onContextMenu 차단: 우클릭 '이미지를 다른 이름으로 저장' 방지
//  - user-drag/touch-callout/select none: 모바일 길게 누르기 저장·선택 방지
//  - pointer-events 유지 (부모 버튼 클릭은 정상 동작)
// ※ 한계: 화면 캡처·개발자도구를 통한 접근은 브라우저 구조상 차단 불가
export function StickerImg({
  src,
  alt,
  className = '',
}: {
  src: string
  alt: string
  className?: string
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      className={`select-none [-webkit-touch-callout:none] [-webkit-user-drag:none] ${className}`}
    />
  )
}
