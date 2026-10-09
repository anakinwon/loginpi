'use client'

// 공개 사이트 목록 — 뷰포트 진입 직전 지연 조회(LazySection) + 페이지 단위 조회·반응형 페이지네이션.
// 공개 API(로그인 불필요·CDN 캐시)라 piFetch 대신 fetch 사용
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { LazySection } from './lazy-section'
import { Pagination } from './pagination'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import type { Paged, PublicSite } from '@/lib/site'

export function SiteCard({ site }: { site: PublicSite }) {
  const tc = useTranslations('siteCtgr')
  return (
    <Link
      href={`/s/${site.site_dom_nm}`}
      className="card flex gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
    >
      {site.site_img_url ? (
        <img
          src={site.site_img_url}
          alt=""
          className="size-14 shrink-0 rounded-md object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-lg font-bold uppercase dark:bg-neutral-800">
          {site.site_dom_nm[0]}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold">{site.site_nm}</p>
        <p className="text-muted-foreground truncate text-sm">
          {site.site_dom_nm}
        </p>
        <p className="text-muted-foreground text-xs">{tc(site.site_ctgr_cd)}</p>
      </div>
    </Link>
  )
}

export function SiteList({ ctgr, q }: { ctgr?: string; q?: string }) {
  const t = useTranslations('siteList')
  const errText = useApiErrorText()
  const [visible, setVisible] = useState(false)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Paged<PublicSite> | null>(null)
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async (p: number) => {
      setLoading(true)
      setError(null)
      const sp = new URLSearchParams({ page: String(p) })
      if (ctgr) sp.set('ctgr', ctgr)
      if (q) sp.set('q', q)
      const r = await readApi<Paged<PublicSite>>(fetch(`/api/sites?${sp}`))
      if (r.ok) setData(r.data)
      else setError(r.body)
      setLoading(false)
    },
    [ctgr, q],
  )

  // 비동기 조회 — 렌더를 막지 않고 로딩 상태로 처리
  useEffect(() => {
    if (visible) void load(page)
  }, [visible, page, load])

  return (
    <LazySection onVisible={() => setVisible(true)}>
      {error ? (
        <div className="card text-destructive text-sm" role="alert">
          {errText(error)}
          <button className="btn ml-2" onClick={() => void load(page)}>
            {t('retry')}
          </button>
        </div>
      ) : !data ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <div aria-busy={loading}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((s) => (
              <li key={s.site_id}>
                <SiteCard site={s} />
              </li>
            ))}
          </ul>
          <Pagination
            page={data.page}
            total={data.total}
            pageSize={data.pageSize}
            onChange={setPage}
          />
        </div>
      )}
    </LazySection>
  )
}
