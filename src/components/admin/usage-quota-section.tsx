'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import UsageDonut from './usage-donut'
import { piFetch } from '@/lib/pi-fetch'

// 인프라 사용량 할당 도넛 섹션 (self-contained) — /api/admin/usage 조회.
//   Vercel 3종(수동: 한도·사용량) + Supabase DB(자동 사용량, 한도만 수동).
//   각 카드: 도넛 + 한도/사용량 + 인라인 편집(PUT).

interface Quota {
  resource_cd: string
  resource_nm: string
  limit_amt: number
  used_amt: number
  unit_nm: string
  auto_yn: 'Y' | 'N'
  sort_ord: number
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
}

export default function UsageQuotaSection() {
  const t = useTranslations('admin.logs.quota')
  const tc = useTranslations('common')

  const [quotas, setQuotas] = useState<Quota[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editCd, setEditCd] = useState<string | null>(null)
  const [editLimit, setEditLimit] = useState(0)
  const [editUsed, setEditUsed] = useState(0)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    piFetch('/api/admin/usage')
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.detail || d.error || `HTTP ${r.status}`)
        return d as { quotas?: Quota[] }
      })
      .then((d) => {
        setQuotas(d.quotas ?? [])
        setError(null)
      })
      .catch((e: unknown) => {
        setQuotas([])
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function startEdit(q: Quota) {
    setEditCd(q.resource_cd)
    setEditLimit(q.limit_amt)
    setEditUsed(q.used_amt)
  }

  async function save(q: Quota) {
    setSaving(true)
    try {
      const res = await piFetch('/api/admin/usage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_cd: q.resource_cd,
          limit_amt: editLimit,
          // 자동 측정 리소스(DB)는 사용량 입력 무시 — 기존값 전달
          used_amt: q.auto_yn === 'Y' ? q.used_amt : editUsed,
        }),
      })
      if (res.ok) {
        setEditCd(null)
        load()
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="bg-muted h-48 animate-pulse rounded-lg" />
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-900/40 dark:bg-red-900/20">
        <p className="font-medium text-red-700 dark:text-red-400">
          {t('loadFail')}
        </p>
        <p className="mt-1 font-mono text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {t('loadFailHint')}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium">{t('title')}</p>
        <p className="text-muted-foreground text-xs">{t('hint')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quotas.map((q) => {
          const editing = editCd === q.resource_cd
          return (
            <div key={q.resource_cd} className="rounded-lg border p-3">
              <div className="mb-1 flex items-center justify-between gap-1">
                <p
                  className="truncate text-xs font-medium"
                  title={q.resource_nm}
                >
                  {q.resource_nm}
                </p>
                {q.auto_yn === 'Y' && (
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    {t('auto')}
                  </span>
                )}
              </div>

              <UsageDonut
                used={q.used_amt}
                limit={q.limit_amt}
                unit={q.unit_nm}
              />

              {editing ? (
                <div className="mt-2 space-y-1.5">
                  <label className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{t('limit')}</span>
                    <input
                      type="number"
                      min={0}
                      value={editLimit}
                      onChange={(e) => setEditLimit(Number(e.target.value))}
                      className="border-input bg-background h-7 w-24 rounded border px-2 text-right tabular-nums"
                    />
                  </label>
                  {q.auto_yn !== 'Y' && (
                    <label className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{t('used')}</span>
                      <input
                        type="number"
                        min={0}
                        value={editUsed}
                        onChange={(e) => setEditUsed(Number(e.target.value))}
                        className="border-input bg-background h-7 w-24 rounded border px-2 text-right tabular-nums"
                      />
                    </label>
                  )}
                  <div className="flex gap-2 pt-0.5">
                    <button
                      disabled={saving}
                      onClick={() => save(q)}
                      className="bg-primary text-primary-foreground flex-1 rounded px-2 py-1 text-xs font-medium disabled:opacity-50"
                    >
                      {saving ? tc('fetching') : tc('save')}
                    </button>
                    <button
                      onClick={() => setEditCd(null)}
                      className="border-border hover:bg-muted flex-1 rounded border px-2 py-1 text-xs"
                    >
                      {tc('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-center">
                  <p className="text-xs tabular-nums">
                    {fmt(q.used_amt)} / {fmt(q.limit_amt)} {q.unit_nm}
                  </p>
                  <button
                    onClick={() => startEdit(q)}
                    className="text-muted-foreground hover:text-foreground mt-1 text-xs underline"
                  >
                    {t('edit')}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
