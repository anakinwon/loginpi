import { Metadata } from 'next'
import { ClientEventTabs } from './client-event-tabs'

export const metadata: Metadata = {
  title: '이벤트',
  description: '미션 이벤트와 매장 선착순 온보딩 이벤트에 참여하세요',
}

export default function EventPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <ClientEventTabs />
    </main>
  )
}
