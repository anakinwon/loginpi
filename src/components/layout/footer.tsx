export function Footer() {
  return (
    <footer className='border-t py-6'>
      <div className='mx-auto max-w-5xl px-4 text-center'>
        <p className='text-muted-foreground text-sm'>
          © {new Date().getFullYear()} Next.js Starter Kit. Built with Next.js
          15, Tailwind CSS v4, shadcn/ui.
        </p>
      </div>
    </footer>
  )
}
