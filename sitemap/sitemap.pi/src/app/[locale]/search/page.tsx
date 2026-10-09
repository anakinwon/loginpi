// 검색 — GET 폼(?q=, JS 불필요) → 사이트명·도메인 부분일치(최소 2자) 결과를 페이지네이션 목록으로
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SiteList } from '@/components/site-list'
import { LIMITS } from '@/lib/site'

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('search')
  const q = ((await searchParams).q ?? '').trim().slice(0, 50)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <form className="flex gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          minLength={LIMITS.searchMin}
          maxLength={50}
          required
          className="input"
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
        />
        <button className="btn btn-primary">{t('submit')}</button>
      </form>
      {q.length >= LIMITS.searchMin ? (
        <SiteList key={q} q={q} />
      ) : (
        <p className="text-muted-foreground text-sm">
          {t('hint', { min: LIMITS.searchMin })}
        </p>
      )}
    </div>
  )
}
