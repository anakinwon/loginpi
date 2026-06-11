import { getTranslations } from 'next-intl/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

async function getStats() {
  const db = getSupabaseAdmin()
  const [
    { count: total },
    { count: piOnly },
    { count: googleOnly },
    { count: linked },
  ] = await Promise.all([
    db.from('sys_user').select('*', { count: 'exact', head: true }),
    db
      .from('sys_user')
      .select('*', { count: 'exact', head: true })
      .not('pi_uid', 'is', null)
      .is('google_id', null),
    db
      .from('sys_user')
      .select('*', { count: 'exact', head: true })
      .is('pi_uid', null)
      .not('google_id', 'is', null),
    db
      .from('sys_user')
      .select('*', { count: 'exact', head: true })
      .not('pi_uid', 'is', null)
      .not('google_id', 'is', null),
  ])
  return {
    total: total ?? 0,
    piOnly: piOnly ?? 0,
    googleOnly: googleOnly ?? 0,
    linked: linked ?? 0,
  }
}

export default async function AdminDashboard() {
  // user = null이면 통계 조회 생략 — RSC payload에 미인증 데이터 포함 방지
  const [user, t] = await Promise.all([
    getSessionUser(),
    getTranslations('admin.dashboard'),
  ])
  const stats = user
    ? await getStats()
    : { total: 0, piOnly: 0, googleOnly: 0, linked: 0 }

  const STAT_CARDS = [
    { label: t('totalUsers'), value: stats.total, desc: t('totalUsersDesc') },
    { label: t('piOnly'), value: stats.piOnly, desc: t('piOnlyDesc') },
    {
      label: t('googleOnly'),
      value: stats.googleOnly,
      desc: t('googleOnlyDesc'),
    },
    { label: t('linked'), value: stats.linked, desc: t('linkedDesc') },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('greeting', {
            name: user?.display_name ?? '',
            role: user?.role ?? '',
          })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map(({ label, value, desc }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{value}</p>
              <p className="text-muted-foreground mt-1 text-xs">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
