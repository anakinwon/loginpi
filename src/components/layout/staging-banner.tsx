import { getTranslations } from 'next-intl/server'
import { resolveDbConfig } from '@/lib/db-env'

/**
 * Staging 환경 표시 배너 (server-only).
 * tier === 'staging'일 때만 화면 최상단에 줄무늬 바로 환경·DB를 노출.
 * Pi Testnet의 흑황 줄무늬처럼 "여긴 실서비스가 아니다"를 한눈에 알린다.
 * prod에선 null → 운영 화면엔 절대 노출 안 됨.
 */
export async function StagingBanner() {
  const { tier, readOnly } = resolveDbConfig()
  if (tier !== 'staging') return null

  const t = await getTranslations('common')
  const label = readOnly ? t('stagingBannerReadOnly') : t('stagingBanner')

  return (
    <div
      role="status"
      aria-label={label}
      className="w-full border-b-2 border-dashed border-amber-700 bg-amber-300 py-1 text-center text-xs font-bold tracking-wide text-amber-950 dark:border-amber-500 dark:bg-amber-400"
    >
      {label}
    </div>
  )
}
