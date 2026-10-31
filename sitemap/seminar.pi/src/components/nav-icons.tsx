// 하단 메뉴 아이콘 — 정적 인라인 SVG(선 아이콘, currentColor). 애니메이션 없음(Pi Browser WebView 는 SVG CSS transform 애니메이션 금지)
import type { SVGProps } from 'react'

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
})

export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </svg>
)
export const IconCard = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="M2.5 10h19M6.5 15h4" />
  </svg>
)
export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3 4 6v5.5c0 4.8 3.4 8.3 8 9.5 4.6-1.2 8-4.7 8-9.5V6z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)
export const IconSliders = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="17" r="2" />
  </svg>
)
export const IconActivity = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </svg>
)
export const IconVideo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="7" width="12" height="10" rx="2" />
    <path d="m15 10.5 6-3v9l-6-3" />
  </svg>
)
export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="9.5" r="2.5" />
    <path d="M3 20a6 6 0 0 1 12 0M15 20a4 4 0 0 1 7 0" />
  </svg>
)
export const IconNotebook = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 3v18M13 8h3M13 12h3" />
  </svg>
)
export const IconChevronDown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)
export const IconChevronUp = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m6 15 6-6 6 6" />
  </svg>
)
export const IconMenu = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)
