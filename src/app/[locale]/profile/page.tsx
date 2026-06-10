import { getLocale } from 'next-intl/server'
import { getSessionUser } from '@/lib/auth-check'
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

  return (
    <div className='mx-auto max-w-2xl px-4 py-8'>
      <h1 className='mb-6 text-2xl font-bold'>내 프로필</h1>
      <ProfileTabs initialUser={user} localeOptions={localeOptions} />
    </div>
  )
}
