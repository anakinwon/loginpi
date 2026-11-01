// dbms.pi 홈 — 한 줄 소개(PRD §1) + 로그인 게이트 + 기능 대분류 10종 카드(PRD 12절, 각 페이지가 자체 로그인 게이트). DB 조회 없음(서버 렌더 + 클라이언트 게이트)
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'
import { HomeGate } from '@/components/home-gate'
import { Link } from '@/i18n/navigation'
import { FEATURES } from '@/lib/features'

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale)
  const t = useTranslations('home')
  const tn = useTranslations('nav')
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-2">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0f1a2e] via-[#111827] to-[#0b1a24] px-5 py-10 sm:px-10 sm:py-14">
        <p className="text-accent mb-3 font-mono text-xs font-semibold tracking-widest">{t('badge')}</p>
        <h1 className="max-w-2xl text-3xl leading-tight font-extrabold break-keep sm:text-4xl">{t('headline')}</h1>
        <p className="text-muted-foreground mt-4 max-w-xl text-sm break-keep sm:text-base">{t('description')}</p>
      </section>
      <HomeGate />
      <section aria-labelledby="home-feat-title">
        <h2 id="home-feat-title" className="mb-3 font-bold">{t('featTitle')}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <li key={f.key}>
              <Link href={f.href} className="bg-surface hover:border-accent/60 block h-full rounded-2xl border border-white/10 p-4">
                <span className="font-semibold">{tn(f.key)}</span>
                <p className="text-muted-foreground mt-1 text-sm break-keep">{t(`featDesc.${f.key}`)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
