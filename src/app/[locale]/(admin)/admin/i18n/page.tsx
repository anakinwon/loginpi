'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

const LOCALE_COUNTRY: Record<string, string> = {
  ko: 'kr', en: 'us', zh: 'cn', ja: 'jp', hi: 'in',
  vi: 'vn', af: 'za', fil: 'ph', th: 'th', id: 'id',
  ms: 'my', es: 'es', fr: 'fr', de: 'de', it: 'it', ru: 'ru',
  pt: 'pt', ar: 'eg',
}

// 언어 고유 명칭 (현지 스크립트)
const NATIVE_NAMES: Record<string, string> = {
  ko: '한국어', en: 'English', zh: '中文', ja: '日本語', hi: 'हिन्दी',
  vi: 'Tiếng Việt', af: 'Afrikaans', fil: 'Filipino', th: 'ภาษาไทย',
  id: 'Bahasa Indonesia', ms: 'Bahasa Melayu', es: 'Español',
  fr: 'Français', de: 'Deutsch', it: 'Italiano', ru: 'Русский',
  pt: 'Português', ar: 'العربية',
}

function Flag({ locale }: { locale: string }) {
  const country = LOCALE_COUNTRY[locale] ?? 'un'
  return <span className={`fi fi-${country} rounded-sm`} style={{ fontSize: '1.25rem' }} />
}

interface LocaleStat {
  locale_cd: string
  locale_nm: string
  flag_emoji: string
  translated: number
  total: number
  pct: number
}

interface StatsData {
  locales: LocaleStat[]
  totalKeys: number
  completed: number
}

export default function I18nPage() {
  const t = useTranslations('admin.i18n')
  const tc = useTranslations('common')
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [translating, setTranslating] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/i18n/stats')
      .then((r) => r.json())
      .then((d: StatsData) => setStats(d))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function translateAndSync(locale: string) {
    const locStat = stats?.locales.find((l) => l.locale_cd === locale)
    const pendingKeys = locStat ? locStat.total - locStat.translated : (stats?.totalKeys ?? 0)

    setTranslating(locale)
    const toastId = toast.loading(
      `${locale.toUpperCase()} ${t('translating')} (${pendingKeys}개 키, 최대 2분 소요)`
    )

    try {
      const res = await fetch('/api/admin/i18n/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      })
      const d = (await res.json()) as { translated?: number; error?: string; message?: string }
      if (!res.ok) throw new Error(d.error ?? t('translateFail'))

      if (d.message) {
        toast.info(d.message, { id: toastId })
      } else {
        toast.success(t('translateSuccess', { count: d.translated ?? 0 }), { id: toastId })
      }

      setSyncing(locale)
      const syncRes = await fetch('/api/admin/i18n/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      })
      if (syncRes.ok) {
        toast.success(`${locale.toUpperCase()} JSON ${t('syncSuccess', { count: 1 })}`)
      }
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc('error'), { id: toastId })
    } finally {
      setTranslating(null)
      setSyncing(null)
    }
  }

  async function syncAll() {
    setSyncing('all')
    try {
      const res = await fetch('/api/admin/i18n/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = (await res.json()) as { synced: string[]; skipped: string[]; errors: string[] }

      if (d.errors.length > 0) {
        toast.error(`${tc('error')}: ${d.errors.join(', ')}`)
      }

      if (d.synced.length > 0) {
        toast.success(t('syncSuccess', { count: d.synced.length }))
      } else if (d.errors.length === 0) {
        toast.info(t('syncNoData'))
      }

      load()
    } catch {
      toast.error(t('syncFail'))
    } finally {
      setSyncing(null)
    }
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>{t('title')}</h1>
          <p className='text-muted-foreground mt-1 text-sm'>{t('desc')}</p>
        </div>
        <Button
          variant='outline'
          size='sm'
          disabled={syncing === 'all'}
          onClick={syncAll}
        >
          {syncing === 'all' ? t('syncing') : t('syncAll')}
        </Button>
      </div>

      {stats && (
        <div className='grid grid-cols-3 gap-4'>
          <div className='rounded-lg border p-4'>
            <p className='text-muted-foreground text-xs font-medium'>{t('stats.supportedLocales')}</p>
            <p className='mt-1 text-3xl font-bold'>{stats.locales.length}</p>
          </div>
          <div className='rounded-lg border p-4'>
            <p className='text-muted-foreground text-xs font-medium'>{t('stats.totalKeys')}</p>
            <p className='mt-1 text-3xl font-bold'>{stats.totalKeys}</p>
          </div>
          <div className='rounded-lg border p-4'>
            <p className='text-muted-foreground text-xs font-medium'>{t('stats.completed')}</p>
            <p className='mt-1 text-3xl font-bold'>{stats.completed}</p>
            <p className='text-muted-foreground text-xs'>{t('stats.completedOf', { count: stats.locales.length })}</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className='text-muted-foreground text-sm'>{tc('loading')}</p>
      ) : (
        <div className='rounded-lg border overflow-hidden'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>{t('col.language')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.progress')}</th>
                <th className='text-right px-4 py-2 font-medium'>{t('col.translatedKeys')}</th>
                <th className='px-4 py-2'></th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {(stats?.locales ?? []).map((loc) => (
                <tr key={loc.locale_cd} className='hover:bg-muted/20'>
                  <td className='px-4 py-3'>
                    <div className='flex items-center gap-2'>
                      <Flag locale={loc.locale_cd} />
                      <div>
                        <p className='font-medium'>{NATIVE_NAMES[loc.locale_cd] ?? loc.locale_nm}</p>
                        <p className='text-muted-foreground text-xs uppercase'>{loc.locale_cd}</p>
                      </div>
                    </div>
                  </td>
                  <td className='px-4 py-3 w-48'>
                    <div className='flex items-center gap-2'>
                      <div className='bg-muted flex-1 rounded-full h-2 overflow-hidden'>
                        <div
                          className={`h-2 rounded-full transition-all ${loc.pct === 100 ? 'bg-green-500' : 'bg-primary'}`}
                          style={{ width: `${loc.pct}%` }}
                        />
                      </div>
                      <span className='text-xs tabular-nums w-9 text-right'>{loc.pct}%</span>
                    </div>
                  </td>
                  <td className='px-4 py-3 text-right tabular-nums text-xs text-muted-foreground'>
                    {loc.translated} / {loc.total}
                  </td>
                  <td className='px-4 py-3'>
                    {loc.locale_cd !== 'ko' && (
                      <div className='flex items-center justify-end gap-1'>
                        <Button
                          size='sm'
                          variant='outline'
                          className='h-7 text-xs'
                          disabled={!!translating || !!syncing}
                          onClick={() => translateAndSync(loc.locale_cd)}
                        >
                          {translating === loc.locale_cd
                            ? t('translating')
                            : syncing === loc.locale_cd
                              ? t('syncingLocale')
                              : t('translate')}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className='text-muted-foreground text-xs'>
        {t('footnote1')}
        <br />
        {t('footnote2')}
      </p>
    </div>
  )
}
