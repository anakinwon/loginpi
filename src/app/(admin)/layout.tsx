import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { getSessionUser, isAdmin } from '@/lib/auth-check'

export const metadata = { title: 'Admin — Next.js Starter Kit' }

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()

  if (!isAdmin(user)) {
    redirect('/?error=unauthorized')
  }

  return (
    <div className='flex flex-1'>
      <AdminSidebar />
      <main className='flex-1 overflow-auto p-6'>{children}</main>
    </div>
  )
}
