// locale 인식 내비게이션(Link·useRouter 등) — 'as-needed' 접두사를 자동 처리
import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, usePathname, useRouter } = createNavigation(routing)
