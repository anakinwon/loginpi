'use client'
import { piFetch } from '@pi/auth/client'
// 분류체계 목록·생성(클라이언트) — /api/areas
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { useEffect, useState } from 'react'

interface Area {
  area_id: string
  area_nm: string
  area_desc: string | null
  role: string
}

export default function AreaHome() {
  const [areas, setAreas] = useState<Area[] | null>(null)
  const [msg, setMsg] = useState('')
  const [nm, setNm] = useState('')
  const [desc, setDesc] = useState('')
  const t = useTranslations('areaHome')
  const tc = useTranslations('codes.role')

  const load = async () => {
    const j = await (await piFetch('/api/areas')).json()
    if (!j.ok) {
      setMsg(j.message)
      setAreas([])
      return
    }
    setAreas(j.areas)
  }
  useEffect(() => {
    load()
  }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const r = await piFetch('/api/areas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area_nm: nm, area_desc: desc || undefined }),
    })
    const j = await r.json()
    setMsg(j.ok ? t('created', { name: j.area.area_nm }) : j.message)
    if (j.ok) {
      setNm('')
      setDesc('')
      load()
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">{t('title')}</h2>
        {areas === null ? (
          <p className="text-sm text-ink-3">{t('loading')}</p>
        ) : areas.length === 0 ? (
          <p className="text-sm text-ink-3">{t('empty')}</p>
        ) : (
          // 접기 패널(대시보드) 안이라 패널을 겹치지 않고 테두리 목록 상자
          <ul className="divide-y divide-line rounded-card border border-line">
            {areas.map((a) => (
              <li key={a.area_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{a.area_nm}</p>
                  {a.area_desc && <p className="truncate text-xs text-ink-3">{a.area_desc}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="badge">{tc.has(a.role) ? tc(a.role) : a.role}</span>
                  {/* 화면별 메뉴는 분류체계 안 하단 고정 바(areas/[areaId]/area-nav.tsx) */}
                  <Link href={`/areas/${a.area_id}/words`} className="btn-key btn-sm">
                    {t('open')}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form onSubmit={create} className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">{t('newTitle')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder={t('namePlaceholder')} aria-label={t('namePlaceholder')} className="input" required maxLength={200} />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('descPlaceholder')} aria-label={t('descPlaceholder')} className="input" maxLength={4000} />
        </div>
        <div className="flex justify-end">
          <button className="btn-3d">{t('create')}</button>
        </div>
      </form>
      {msg && (
        <p role="status" className="text-sm text-ink-2">
          {msg}
        </p>
      )}
    </section>
  )
}
