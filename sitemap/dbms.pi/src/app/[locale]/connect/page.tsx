// schema.pi 연결 — /connect : 토큰 발급 안내(1-1) · 등록(1-2) · 내 연결(1-3) · 접속 상태판(1-4). 서버는 세션을 보지 않는다(redirect 금지)
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ConnectPanel } from '@/components/link/connect-panel'
import { schemaBaseUrl } from '@/lib/link/client'

export default async function ConnectPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('link2')
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm break-keep">{t('intro')}</p>
      <section className="bg-surface rounded-2xl p-5">
        <h2 className="font-bold">{t('howTitle')}</h2>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5 text-sm break-keep">
          <li>{t('how1')}</li>
          <li>{t('how2')}</li>
          <li>{t('how3')}</li>
          <li>{t('how4')}</li>
        </ol>
        <a
          href={schemaBaseUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent mt-3 inline-block text-sm font-semibold underline"
        >
          {t('openSchema')}
        </a>
      </section>
      <ConnectPanel />
    </div>
  )
}
