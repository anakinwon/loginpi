import Link from 'next/link'
import { ThemeToggle } from '@/components/theme-toggle'

export function Header() {
  return (
    <header className='bg-background/80 sticky top-0 z-50 border-b backdrop-blur-sm'>
      <div className='mx-auto flex h-14 max-w-5xl items-center justify-between px-4'>
        <Link href='/' className='text-foreground font-semibold tracking-tight'>
          Next.js Starter Kit
        </Link>
        <nav className='flex items-center gap-2'>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
