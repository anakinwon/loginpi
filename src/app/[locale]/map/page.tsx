import { getTranslations } from 'next-intl/server'
import { NearbyExplorer } from '@/components/lbs/nearby-explorer'

export async function generateMetadata() {
  const t = await getTranslations('lbs')
  return { title: t('nearbyTitle') }
}

// 주변 매장·채팅방 탐색 (Phase 15 LBS P1).
// 인증/동의 게이트는 NearbyExplorer(클라이언트)가 담당 — Pi Browser redirect 금지 패턴.
export default async function MapPage() {
  const t = await getTranslations('lbs')

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">{t('nearbyTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('nearbySubtitle')}
        </p>
      </div>
      <NearbyExplorer />
    </div>
  )
}
