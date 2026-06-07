import { PiAdminLink } from '@/components/layout/pi-admin-link'

export function Footer() {
  return (
    <footer className='border-t py-6'>
      <div className='mx-auto max-w-5xl px-4'>
        <div className='flex flex-col items-center gap-3 sm:flex-row sm:justify-between'>
          <p className='text-muted-foreground text-center text-sm sm:text-left'>
            © {new Date().getFullYear()} Next.js Starter Kit. Built with Next.js
            15, Tailwind CSS v4, shadcn/ui.
          </p>
          <PiAdminLink />
        </div>
      </div>
    </footer>
  )
}
