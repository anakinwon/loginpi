'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { piFetch } from '@/lib/pi-fetch'
import {
  ADMIN_NAV_CATALOG,
  ADMIN_NAV_BY_HREF,
  ADMIN_NAV_SECTION_KEYS,
} from '@/lib/admin-nav-catalog'

export default function QuickMenuAdminPage() {
  const t = useTranslations('admin.quickMenuPage')
  const tNav = useTranslations('admin.nav')
  const tc = useTranslations('common')
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const labelOf = useCallback(
    (href: string) => {
      const key = ADMIN_NAV_BY_HREF.get(href)?.labelKey
      return key ? tNav(key) : href
    },
    [tNav],
  )
  const secLabel = (sec: string) => {
    const key = ADMIN_NAV_SECTION_KEYS[sec]
    return key ? tNav(key) : sec
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await piFetch('/api/admin/quick-menu')
      if (!res.ok) throw new Error()
      const d = (await res.json()) as { hrefs: string[] }
      // 카탈로그에 남아있는 것만
      setSelected((d.hrefs ?? []).filter((h) => ADMIN_NAV_BY_HREF.has(h)))
    } catch {
      toast.error(t('loadFail'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  // 추가 가능한(미선택) 항목을 섹션별로 그룹
  const availableBySection = useMemo(() => {
    const sel = new Set(selected)
    const groups = new Map<string, typeof ADMIN_NAV_CATALOG>()
    for (const it of ADMIN_NAV_CATALOG) {
      if (sel.has(it.href)) continue
      const arr = groups.get(it.section) ?? []
      arr.push(it)
      groups.set(it.section, arr)
    }
    return [...groups.entries()]
  }, [selected])

  const add = (href: string) => setSelected((s) => [...s, href])
  const remove = (href: string) =>
    setSelected((s) => s.filter((h) => h !== href))
  const move = (i: number, dir: -1 | 1) =>
    setSelected((s) => {
      const j = i + dir
      if (j < 0 || j >= s.length) return s
      const next = [...s]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  async function save() {
    setSaving(true)
    try {
      const res = await piFetch('/api/admin/quick-menu', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hrefs: selected }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('saveFail'))
      }
      toast.success(t('saved'))
      router.refresh() // 레이아웃의 팝업 즉시 반영
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('saveFail'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">🧭 {t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('desc')}</p>
        </div>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? tc('saving') : tc('save')}
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {tc('loading')}
        </p>
      ) : (
        <>
          {/* 선택된 항목 — 순서 조정 */}
          <section className="space-y-2 rounded-xl border p-4">
            <p className="text-sm font-semibold">
              {t('selectedItems')}{' '}
              <span className="text-muted-foreground">({selected.length})</span>
            </p>
            {selected.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-xs">
                {t('emptySelected')}
              </p>
            ) : (
              <ul className="space-y-1">
                {selected.map((href, i) => (
                  <li
                    key={href}
                    className="bg-muted/40 flex items-center gap-2 rounded-lg px-3 py-2"
                  >
                    <span className="text-muted-foreground w-6 text-right text-xs">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate text-sm">
                      {labelOf(href)}
                    </span>
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label={t('moveUp')}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === selected.length - 1}
                      aria-label={t('moveDown')}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                    <button
                      onClick={() => remove(href)}
                      aria-label={t('remove')}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 추가 가능한 메뉴 — 섹션별 */}
          <section className="space-y-4 rounded-xl border p-4">
            <p className="text-sm font-semibold">{t('available')}</p>
            {availableBySection.length === 0 ? (
              <p className="text-muted-foreground py-2 text-center text-xs">
                {t('allAdded')}
              </p>
            ) : (
              availableBySection.map(([section, items]) => (
                <div key={section} className="space-y-1.5">
                  <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    {secLabel(section)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((it) => (
                      <button
                        key={it.href}
                        onClick={() => add(it.href)}
                        className="border-border hover:bg-muted flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors"
                      >
                        <Plus className="size-3" />
                        {labelOf(it.href)}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  )
}
