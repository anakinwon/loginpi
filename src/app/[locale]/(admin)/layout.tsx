import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { getSessionUser, isAdmin } from '@/lib/auth-check'

export const metadata = { title: 'Admin — Next.js Starter Kit' }

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, locale] = await Promise.all([getSessionUser(), getLocale()])

  if (!isAdmin(user)) {
    redirect(`/${locale}?error=unauthorized&next=${encodeURIComponent(`/${locale}/admin`)}`)
  }

  return (
    <div className='flex flex-1'>
      <AdminSidebar />
      <main className='flex-1 overflow-auto p-6'>{children}</main>
    </div>
  )
}
