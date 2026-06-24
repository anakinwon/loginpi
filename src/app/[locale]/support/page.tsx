import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { env } from '@/env'
import { FaqAccordion } from '@/components/support/faq-accordion'

const SUPPORT_EMAIL = 'anakin.won@gmail.com'

export async function generateMetadata() {
  const t = await getTranslations('faq')
  return { title: t('title') }
}

// 고객지원 페이지 — FAQ + 지원 채널(이메일·텔레그램) + 약관·정책 링크. (G_FAQ)
export default async function SupportPage() {
  const t = await getTranslations('faq')
  const tgUser = env.TELEGRAM_BOT_USERNAME

  const legal: { key: string; doc: string }[] = [
    { key: 'terms', doc: 'terms' },
    { key: 'privacy', doc: 'privacy' },
    { key: 'refund', doc: 'refund' },
    { key: 'youth', doc: 'youth' },
    { key: 'community', doc: 'community' },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </div>

      <FaqAccordion />

      {/* 고객 지원 채널 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t('supportTitle')}</h2>
        <div className="flex flex-col gap-2">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="hover:bg-muted flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"
          >
            ✉️ {t('email')} <span className="text-muted-foreground">— {SUPPORT_EMAIL}</span>
          </a>
          {tgUser && (
            <a
              href={`https://t.me/${tgUser}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:bg-muted flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"
            >
              💬 {t('telegram')} <span className="text-muted-foreground">— @{tgUser}</span>
            </a>
          )}
        </div>
      </section>

      {/* 약관·정책 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t('legalTitle')}</h2>
        <div className="flex flex-wrap gap-2">
          {legal.map((l) => (
            <Link
              key={l.key}
              href={`/docs/legal/${l.doc}`}
              className="hover:bg-muted rounded-lg border px-3 py-2 text-sm"
            >
              {t(l.key)}
            </Link>
          ))}
          <Link
            href="/docs/agreement/lbs"
            className="hover:bg-muted rounded-lg border px-3 py-2 text-sm"
          >
            {t('lbs')}
          </Link>
        </div>
      </section>
    </div>
  )
}
