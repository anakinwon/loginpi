import { Metadata } from 'next'
import { ClientEventGate } from '@/components/event/client-event-gate'

export const metadata: Metadata = {
  title: '미션 이벤트',
  description: '10가지 미션을 완료하고 화이트리스트에 입성하세요',
}

export default function EventPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <ClientEventGate />
    </main>
  )
}
