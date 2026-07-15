import { getLocale, getTranslations } from 'next-intl/server'
import { getSessionUser } from '@/lib/auth-check'
import { getActiveFeeMode } from '@/lib/fee-resolver'
import { hasAnyShop } from '@/lib/mps-shop'
import { getLocaleOptions } from '@/lib/locale-options'
import { ClientProfileGate } from './_components/client-profile-gate'
import { ProfileTabs } from './_components/profile-tabs'

export default async function ProfilePage() {
  const user = await getSessionUser()

  // Pi Browser는 쿠키 미저장 → null → redirect 절대 금지
  // ClientProfileGate가 localStorage pi_token → piFetch X-Pi-Token 헤더로 인증 이어받음
  if (!user) return <ClientProfileGate />

  const locale = await getLocale()
  // Intl.DisplayNames는 Node.js와 브라우저 ICU 데이터가 달라 hydration mismatch 유발 →
  // 서버에서만 계산하고 직렬화된 string[]로 내려보냄
  const localeOptions = getLocaleOptions(locale)
  // PI 요금제에선 Bean 지갑 탭 숨김 + 매장 보유자는 내 PyShop™ 기본 포커싱 —
  // 둘 다 첫 렌더부터 확정값(깜빡임 방지), 병렬 조회
  const [feeMode, hasShop] = await Promise.all([
    getActiveFeeMode(),
    hasAnyShop(user.id),
  ])
  const t = await getTranslations('profile')

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
      <ProfileTabs
        initialUser={user}
        localeOptions={localeOptions}
        feeMode={feeMode}
        hasShop={hasShop}
      />
    </div>
  )
}
