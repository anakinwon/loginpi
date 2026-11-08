import { RoomAnalytics } from '@/components/chat/room-analytics'

// TASK-073: 카페 분석 대시보드 (Business 전용)
// 인증·권한 검증은 API(/api/chat/rooms/[roomId]/analytics)가 담당.
// 서버에서 redirect하지 않음 — Pi Browser 쿠키 미저장 → 클라이언트 piFetch 경로로 위임 (무한 루프 방지)
export default async function RoomAnalyticsPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params
  return <RoomAnalytics roomId={roomId} />
}
