// dbms.pi 홈 — 한 줄 소개(PRD §1) + 로그인 게이트 + schema.pi 연결 자리(준비 중, PRD §5). DB 조회 없음(서버 렌더 + 클라이언트 게이트)
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'
import { HomeGate } from '@/components/home-gate'

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale)
  const t = useTranslations('home')
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-2">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0f1a2e] via-[#111827] to-[#0b1a24] px-5 py-10 sm:px-10 sm:py-14">
        <p className="text-accent mb-3 font-mono text-xs font-semibold tracking-widest">{t('badge')}</p>
        <h1 className="max-w-2xl text-3xl leading-tight font-extrabold break-keep sm:text-4xl">{t('headline')}</h1>
        <p className="text-muted-foreground mt-4 max-w-xl text-sm break-keep sm:text-base">{t('description')}</p>
      </section>
      <HomeGate />
      <section aria-labelledby="home-conn-title" className="bg-surface rounded-2xl border border-dashed border-white/15 p-5">
        <h2 id="home-conn-title" className="flex items-center gap-2 font-bold">
          {t('connTitle')}
          <span className="bg-surface-raised text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">{t('connBadge')}</span>
        </h2>
        <p className="text-muted-foreground mt-2 text-sm break-keep">{t('connBody')}</p>
      </section>
    </div>
  )
}
