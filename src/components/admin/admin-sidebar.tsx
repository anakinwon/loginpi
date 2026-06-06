'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/users', label: '사용자 관리' },
  { href: '/admin/payments', label: '결제 내역' },
  { href: '/admin/links', label: '계정 연동 현황' },
  { href: '/admin/board', label: '게시판 관리' },
]

const STD_NAV = [
  { href: '/admin/std/words', label: '표준단어' },
  { href: '/admin/std/domains', label: '표준도메인' },
  { href: '/admin/std/terms', label: '표준용어' },
  { href: '/admin/std/ddl', label: 'DDL Export' },
  { href: '/admin/std/audit', label: '변경 이력' },
  { href: '/admin/std/approvals', label: '승인 워크플로우' },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className='bg-muted/40 border-r w-48 shrink-0 flex flex-col'>
      <div className='border-b px-4 py-3'>
        <p className='font-semibold text-sm'>Admin</p>
      </div>
      <nav className='flex flex-col gap-1 p-2 flex-1'>
        {NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'rounded-md px-3 py-2 text-sm transition-colors',
              pathname === href
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {label}
          </Link>
        ))}
        <p className='text-muted-foreground px-3 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase'>
          데이터 표준
        </p>
        {STD_NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'rounded-md px-3 py-2 text-sm transition-colors',
              pathname === href
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className='border-t p-3'>
        <Link href='/' className='text-muted-foreground text-xs hover:underline'>
          ← 홈으로
        </Link>
      </div>
    </aside>
  )
}
