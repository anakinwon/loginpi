// 데이터 이행 PiMig — /migration. PRD 12 §6-1 이행 계획·§6-3 검증 쿼리 생성(계획·점검만, 실행 엔진은 D6 범위 밖).
// 서버는 세션을 보지 않는다(redirect 금지) — LoginGate(클라이언트)가 로그인 유도, 본체는 MigrationPanel
import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { LoginGated } from '@/components/login-gate'
import { MigrationPanel } from '@/components/migration/migration-panel'

export default async function MigrationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('migration')
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm break-keep">{t('intro')}</p>
      {/* useSearchParams(?link=) 는 Suspense 경계 필요 */}
      <Suspense>
        <LoginGated><MigrationPanel /></LoginGated>
      </Suspense>
    </div>
  )
}
