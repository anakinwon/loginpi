import { getTranslations } from 'next-intl/server'
import { ClientEventTabs } from './client-event-tabs'

export async function generateMetadata() {
  const t = await getTranslations('event')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  }
}

export default function EventPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <ClientEventTabs />
    </main>
  )
}
