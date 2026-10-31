// locale 인식 내비게이션(Link·useRouter·usePathname) — 'as-needed' 접두사를 자동 처리(ko 는 접두사 없음)
import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, usePathname, useRouter } = createNavigation(routing)
