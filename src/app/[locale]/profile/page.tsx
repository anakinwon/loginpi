import { getSessionUser } from '@/lib/auth-check'
import { ClientProfileGate } from './_components/client-profile-gate'
import { ProfileTabs } from './_components/profile-tabs'

export default async function ProfilePage() {
  const user = await getSessionUser()

  // Pi Browser는 쿠키 미저장 → null → redirect 절대 금지
  // ClientProfileGate가 localStorage pi_token → piFetch X-Pi-Token 헤더로 인증 이어받음
  if (!user) return <ClientProfileGate />

  return (
    <div className='mx-auto max-w-2xl px-4 py-8'>
      <h1 className='mb-6 text-2xl font-bold'>내 프로필</h1>
      <ProfileTabs initialUser={user} />
    </div>
  )
}
