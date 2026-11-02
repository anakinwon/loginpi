// 사용료 결제 — /pay/<siteId>[?kind=spk|efct|ship 반짝임·버블 이펙트·워프 우주선 단독 결제]. 서버는 세션·사이트를 보지 않는다(redirect 금지) — 조회·분기는 클라이언트 PayPanel(LoginGate + piFetch)
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { PayPanel } from '@/components/pay-panel'

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; siteId: string }>
  searchParams: Promise<{ kind?: string }>
}) {
  const { locale, siteId } = await params
  const { kind } = await searchParams
  setRequestLocale(locale)
  const t = await getTranslations('pay')
  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <PayPanel
        siteId={siteId}
        kind={
          kind === 'spk'
            ? 'SPK'
            : kind === 'efct'
              ? 'EFCT'
              : kind === 'ship'
                ? 'SHIP'
                : 'REG'
        }
      />
    </div>
  )
}
