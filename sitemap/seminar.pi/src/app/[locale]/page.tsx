// seminar.pi 홈 = 소개(화려한 첫 화면, 마스터 2026-10-30) + 세미나 달력(지난 이력 포함) + S1 세미나 목록(PRD F-03, UI 설계서 5절).
//  제작 진행 현황은 /progress 로 옮김(아소카 결정(마스터 위임 2026-10-26)). 소개는 서버 렌더(조회 없음), 달력·목록은 클라이언트 비동기
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'
import { Link } from '@/i18n/navigation'
import { HomeCalendar } from '@/components/seminar/home-calendar'
import { SeminarList } from '@/components/seminar/seminar-list'

const FEATURES = [
  { k: 'video', icon: '🎥' },
  { k: 'caption', icon: '🌐' },
  { k: 'notes', icon: '📝' },
  { k: 'pay', icon: 'π' },
] as const

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale)
  const t = useTranslations('home')
  return (
    <div className="space-y-8 py-2">
      {/* 첫 화면 — 보라·하늘·초록 빛 번짐 + 그라데이션 제목. 움직임 줄이기 설정이면 빛 번짐 깜빡임 없음 */}
      <section className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a1540] via-[#111827] to-[#0b1a24] px-5 py-10 sm:px-10 sm:py-14">
        <div aria-hidden className="bg-accent/40 absolute -top-20 -left-16 -z-10 size-72 rounded-full blur-3xl motion-safe:animate-pulse" />
        <div aria-hidden className="absolute -right-10 -bottom-24 -z-10 size-72 rounded-full bg-sky-500/25 blur-3xl" />
        <div aria-hidden className="absolute top-1/3 left-1/2 -z-10 size-40 rounded-full bg-emerald-400/15 blur-3xl" />
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-violet-200">
          <span aria-hidden>🏝️</span>
          {t('badge')}
        </p>
        <h1 className="max-w-2xl text-3xl leading-tight font-extrabold break-keep sm:text-5xl">
          <span className="bg-gradient-to-r from-white via-violet-200 to-sky-300 bg-clip-text text-transparent">{t('headline')}</span>
        </h1>
        <p className="text-muted-foreground mt-4 max-w-xl text-sm break-keep sm:text-base">{t('description')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#seminars" className="bg-accent shadow-accent/30 inline-grid h-11 place-items-center rounded-full px-6 font-semibold text-white shadow-lg hover:brightness-110">
            {t('ctaBrowse')}
          </a>
          <Link href="/plan" className="inline-grid h-11 place-items-center rounded-full border border-white/20 bg-white/5 px-6 font-semibold hover:bg-white/10">
            {t('ctaPlan')}
          </Link>
        </div>
        <ul className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FEATURES.map((f) => (
            <li key={f.k} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs backdrop-blur-sm sm:text-sm">
              <span aria-hidden className="text-lg">
                {f.icon}
              </span>
              {t(`features.${f.k}`)}
            </li>
          ))}
        </ul>
      </section>
      <HomeCalendar />
      <section id="seminars" aria-labelledby="home-list-title" className="scroll-mt-4 space-y-3">
        <h2 id="home-list-title" className="text-lg font-bold">
          <span aria-hidden>✨ </span>
          {t('listTitle')}
        </h2>
        <SeminarList />
      </section>
    </div>
  )
}
