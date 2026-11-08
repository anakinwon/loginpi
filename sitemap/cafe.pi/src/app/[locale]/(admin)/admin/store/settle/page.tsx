import { getTranslations } from 'next-intl/server'
import { PendingSettleRunner } from '@/components/admin/pending-settle-runner'

export async function generateMetadata() {
  const t = await getTranslations('admin.batch')
  return { title: `${t('settleTitle')} — Admin` }
}

// 미정산 판매자 정산 — 카페 관리 전용 화면 (배치 페이지에서 분리)
export default async function SettlePage() {
  const t = await getTranslations('admin.batch')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('settleTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('settleDesc')}</p>
      </div>
      <PendingSettleRunner />
    </div>
  )
}
