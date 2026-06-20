import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { CategoryRow } from '@/lib/board'
import { BoardSearch } from './board-search'

export default async function BoardIndexPage() {
  const [{ data: categories }, t] = await Promise.all([
    getSupabaseAdmin()
      .from('brd_ctgr')
      .select('*')
      .eq('use_yn', 'Y')
      .order('sort_ord', { ascending: true }),
    getTranslations('board'),
  ])

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>

      {/* 통합검색 — 전 게시판 가로질러 검색, 결과는 해당 게시글로 연결 */}
      <BoardSearch />

      {!categories || categories.length === 0 ? (
        <p className="text-muted-foreground">{t('noBoards')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(categories as CategoryRow[]).map((ctgr) => (
            <Link
              key={ctgr.ctgr_cd}
              href={`/board/${ctgr.ctgr_cd.toLowerCase()}`}
              className="group hover:bg-muted/50 rounded-lg border p-6 transition-colors"
            >
              <h2 className="group-hover:text-primary mb-1 font-semibold">
                {ctgr.ctgr_nm}
              </h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ctgr.cmnt_yn === 'Y' && (
                  <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                    {t('featureComment')}
                  </span>
                )}
                {ctgr.attch_yn === 'Y' && (
                  <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                    {t('featureAttachment')}
                  </span>
                )}
                {ctgr.gallery_yn === 'Y' && (
                  <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                    {t('featureGallery')}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
