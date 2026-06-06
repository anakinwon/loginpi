import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

async function getStats() {
  const db = getSupabaseAdmin()
  const [{ count: total }, { count: piOnly }, { count: googleOnly }, { count: linked }] =
    await Promise.all([
      db.from('sys_user').select('*', { count: 'exact', head: true }),
      db.from('sys_user').select('*', { count: 'exact', head: true })
        .not('pi_uid', 'is', null).is('google_id', null),
      db.from('sys_user').select('*', { count: 'exact', head: true })
        .is('pi_uid', null).not('google_id', 'is', null),
      db.from('sys_user').select('*', { count: 'exact', head: true })
        .not('pi_uid', 'is', null).not('google_id', 'is', null),
    ])
  return { total: total ?? 0, piOnly: piOnly ?? 0, googleOnly: googleOnly ?? 0, linked: linked ?? 0 }
}

export default async function AdminDashboard() {
  const [user, stats] = await Promise.all([getSessionUser(), getStats()])

  const STAT_CARDS = [
    { label: '전체 사용자', value: stats.total, desc: '가입된 전체 계정 수' },
    { label: 'Pi 전용', value: stats.piOnly, desc: 'Pi 계정만 있는 사용자' },
    { label: 'Google 전용', value: stats.googleOnly, desc: 'Google 계정만 있는 사용자' },
    { label: '계정 연동', value: stats.linked, desc: 'Pi + Google 연동 완료' },
  ]

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold'>대시보드</h1>
        <p className='text-muted-foreground text-sm mt-1'>
          안녕하세요, {user?.display_name}님 ({user?.role})
        </p>
      </div>

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {STAT_CARDS.map(({ label, value, desc }) => (
          <Card key={label}>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm text-muted-foreground font-medium'>
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-3xl font-bold'>{value}</p>
              <p className='text-muted-foreground text-xs mt-1'>{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
