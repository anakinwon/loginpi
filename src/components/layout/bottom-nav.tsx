import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { BottomNavClient } from '@/components/layout/bottom-nav-client'

// 서버에서 관리자 여부를 판정해 클라이언트 네비에 전달.
// Pi Browser(쿠키 미저장)는 BottomNavClient가 usePiAuth로 보완 판정한다.
export async function BottomNav() {
  const user = await getSessionUser()
  return <BottomNavClient serverIsAdmin={isAdmin(user)} />
}
