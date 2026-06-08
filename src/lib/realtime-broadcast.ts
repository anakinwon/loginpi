import 'server-only'

// Supabase Realtime REST broadcast API — WebSocket 연결 없이 서버에서 직접 채널에 브로드캐스트.
// 클라이언트가 channel.send()로 직접 브로드캐스트하면 snd_usr_id 등 신원 필드가 스푸핑 가능.
// 서버에서 서비스 롤 키로 브로드캐스트하면 신원이 API 레이어에서 검증된 후 전달됨.
export async function broadcastToRoom(
  roomId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !serviceKey) return

  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey ?? serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      messages: [{ topic: `room:${roomId}`, event, payload }],
    }),
  })

  if (!res.ok) {
    console.error(`[realtime] broadcast 실패 room:${roomId}`, await res.text())
  }
}
