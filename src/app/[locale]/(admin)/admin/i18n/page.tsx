'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

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
    setTranslating(locale)
    try {
      const res = await fetch('/api/admin/i18n/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      })
      const d = (await res.json()) as { translated?: number; error?: string; message?: string }
      if (!res.ok) throw new Error(d.error ?? '번역 실패')
      if (d.message) {
        toast.info(d.message)
      } else {
        toast.success(`${d.translated ?? 0}개 번역 완료`)
      }

      // 번역 후 자동 동기화
      setSyncing(locale)
      await fetch('/api/admin/i18n/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      })
      toast.success(`${locale} JSON 동기화 완료`)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
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
      const d = (await res.json()) as { synced: string[]; errors: string[] }
      if (d.errors.length > 0) {
        toast.error(`일부 실패: ${d.errors.join(', ')}`)
      } else {
        toast.success(`전체 ${d.synced.length}개 언어 동기화 완료`)
      }
      load()
    } catch {
      toast.error('동기화 실패')
    } finally {
      setSyncing(null)
    }
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>다국어 관리</h1>
          <p className='text-muted-foreground mt-1 text-sm'>번역 현황 대시보드</p>
        </div>
        <Button
          variant='outline'
          size='sm'
          disabled={syncing === 'all'}
          onClick={syncAll}
        >
          {syncing === 'all' ? '동기화 중…' : 'DB→JSON 동기화'}
        </Button>
      </div>

      {/* 통계 카드 */}
      {stats && (
        <div className='grid grid-cols-3 gap-4'>
          <div className='rounded-lg border p-4'>
            <p className='text-muted-foreground text-xs font-medium'>지원 언어</p>
            <p className='mt-1 text-3xl font-bold'>{stats.locales.length}</p>
          </div>
          <div className='rounded-lg border p-4'>
            <p className='text-muted-foreground text-xs font-medium'>전체 번역 키</p>
            <p className='mt-1 text-3xl font-bold'>{stats.totalKeys}</p>
          </div>
          <div className='rounded-lg border p-4'>
            <p className='text-muted-foreground text-xs font-medium'>100% 완료</p>
            <p className='mt-1 text-3xl font-bold'>{stats.completed}</p>
            <p className='text-muted-foreground text-xs'>{stats.locales.length}개 언어 중</p>
          </div>
        </div>
      )}

      {/* 언어별 번역 현황 */}
      {loading ? (
        <p className='text-muted-foreground text-sm'>로딩 중…</p>
      ) : (
        <div className='rounded-lg border overflow-hidden'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>언어</th>
                <th className='text-left px-4 py-2 font-medium'>진행률</th>
                <th className='text-right px-4 py-2 font-medium'>번역 키</th>
                <th className='px-4 py-2'></th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {(stats?.locales ?? []).map((loc) => (
                <tr key={loc.locale_cd} className='hover:bg-muted/20'>
                  <td className='px-4 py-3'>
                    <div className='flex items-center gap-2'>
                      <span className='text-xl'>{loc.flag_emoji}</span>
                      <div>
                        <p className='font-medium'>{loc.locale_nm}</p>
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
                            ? '번역 중…'
                            : syncing === loc.locale_cd
                              ? '동기화 중…'
                              : '번역 + 동기화'}
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
        * &quot;번역 + 동기화&quot;: Claude AI로 미번역 키를 자동 번역 후 messages/*.json 갱신
        <br />
        * &quot;DB→JSON 동기화&quot;: DB에 저장된 번역 데이터를 JSON 파일에 반영만 합니다
      </p>
    </div>
  )
}
