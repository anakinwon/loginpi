import 'server-only'

// Supabase Realtime REST broadcast API — WebSocket 연결 없이 서버에서 직접 채널에 브로드캐스트.
// 클라이언트가 channel.send()로 직접 브로드캐스트하면 snd_usr_id 등 신원 필드가 스푸핑 가능.
// 서버에서 서비스 롤 키로 브로드캐스트하면 신원이 API 레이어에서 검증된 후 전달됨.
async function broadcastToTopic(
  topic: string,
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
      messages: [{ topic, event, payload }],
    }),
  })

  if (!res.ok) {
    console.error(`[realtime] broadcast 실패 ${topic}`, await res.text())
  }
}

// 채팅 메시지·번역·배지 등 — useChatRoom이 구독하는 기본 룸 토픽
export async function broadcastToRoom(
  roomId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  return broadcastToTopic(`room:${roomId}`, event, payload)
}

// 판매자 주문 알림 전용 토픽 — 결제완료(에스크로) 시 사장님에게 보이스 알림 push.
// 클라이언트는 seller:{내 user.userId}를 구독 (OrderAlertListener)
export async function broadcastToSeller(
  sellerId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  return broadcastToTopic(`seller:${sellerId}`, event, payload)
}

// PyVoice 통화 시그널링 전용 토픽 — useChatRoom의 `room:{id}`와 반드시 분리.
// supabase-js는 같은 토픽의 채널 인스턴스를 재사용하므로, 토픽을 공유하면
// 두 번째 훅이 이미 subscribe된 인스턴스를 받아 presence .on()에서 throw된다.
export async function broadcastToCall(
  roomId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  return broadcastToTopic(`room:${roomId}:call`, event, payload)
}
