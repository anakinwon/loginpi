import { NearbyExplorer } from '@/components/lbs/nearby-explorer'

export const metadata = { title: '주변 탐색' }

// 주변 매장·채팅방 탐색 (Phase 15 LBS P1).
// 인증/동의 게이트는 NearbyExplorer(클라이언트)가 담당 — Pi Browser redirect 금지 패턴.
export default function NearbyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">📍 주변 탐색</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          내 주변의 매장과 채팅방을 거리순으로 찾아보세요
        </p>
      </div>
      <NearbyExplorer />
    </div>
  )
}
