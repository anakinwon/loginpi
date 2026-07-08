'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { piFetch } from '@/lib/pi-fetch'
import {
  THEME_TOKEN_META,
  THEME_TOKEN_KEYS,
  type ThemeColorSet,
  type ThemeTokens,
  type ThemeTokenKey,
  type UiTheme,
} from '@/lib/ui-theme-tokens'

const EMPTY_TOKENS: ThemeTokens = { light: {}, dark: {} }

// 색상 미리보기 점 (목록 카드용)
function ColorDots({ set }: { set: ThemeColorSet }) {
  const keys: ThemeTokenKey[] = [
    'primary',
    'kpi1',
    'kpi2',
    'kpi3',
    'kpi4',
    'kpi5',
  ]
  return (
    <div className="flex gap-1">
      {keys.map((k) => (
        <span
          key={k}
          className="border-border/50 size-4 rounded-full border"
          style={{ background: set[k] ?? 'transparent' }}
          title={k}
        />
      ))}
    </div>
  )
}

// 색상 입력 한 줄 (color 피커 + 텍스트 병행 — oklch도 텍스트로 입력 가능)
function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
}) {
  const t = useTranslations('adminOps')
  const isHex = /^#[0-9a-fA-F]{6}$/.test(value ?? '')
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-24 shrink-0 text-xs">
        {label}
      </span>
      <input
        type="color"
        value={isHex ? (value as string) : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 shrink-0 cursor-pointer rounded border bg-transparent"
        aria-label={t('uiThemes.colorPickAria', { label })}
      />
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('uiThemes.colorInputPlaceholder')}
        className="border-input min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 text-xs"
      />
    </div>
  )
}

// 라이트/다크 한쪽 색상 세트 편집기
function ColorSetEditor({
  title,
  set,
  onChange,
}: {
  title: string
  set: ThemeColorSet
  onChange: (key: ThemeTokenKey, v: string) => void
}) {
  const t = useTranslations('adminOps')
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      {THEME_TOKEN_META.map((m) => (
        <ColorRow
          key={m.key}
          label={t(m.labelKey)}
          value={set[m.key]}
          onChange={(v) => onChange(m.key, v)}
        />
      ))}
    </div>
  )
}

// 미리보기 — KPI 카드 5개 + primary 버튼 (편집 중인 라이트 세트 기준)
function Preview({ set }: { set: ThemeColorSet }) {
  const t = useTranslations('adminOps')
  const kpis: ThemeTokenKey[] = ['kpi1', 'kpi2', 'kpi3', 'kpi4', 'kpi5']
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{t('uiThemes.preview')}</p>
      <div className="grid grid-cols-3 gap-2">
        {kpis.map((k, i) => (
          <div
            key={k}
            className="rounded-xl p-3 shadow-sm"
            style={{ background: set[k] ?? 'var(--muted)' }}
          >
            <p className="text-xs text-slate-600">
              {t('uiThemes.metricN', { n: i + 1 })}
            </p>
            <p className="text-xl font-bold text-slate-900">1,234</p>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="rounded-lg px-4 py-2 text-sm font-medium text-white"
        style={{ background: set.primary ?? 'var(--primary)' }}
      >
        {t('uiThemes.primaryButton')}
      </button>
    </div>
  )
}

export default function UiThemesPage() {
  const router = useRouter()
  const tr = useTranslations('adminOps')
  const tc = useTranslations('common')
  const [themes, setThemes] = useState<UiTheme[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<UiTheme | 'new' | null>(null)
  const [form, setForm] = useState<{
    theme_nm: string
    theme_desc: string
    theme_tokens: ThemeTokens
  }>({ theme_nm: '', theme_desc: '', theme_tokens: EMPTY_TOKENS })
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await piFetch('/api/admin/ui-themes')
      if (!res.ok) throw new Error()
      const d = (await res.json()) as { themes: UiTheme[] }
      setThemes(d.themes ?? [])
    } catch {
      toast.error(tr('uiThemes.listLoadFail'))
    } finally {
      setLoading(false)
    }
  }, [tr])

  useEffect(() => {
    void load()
  }, [load])

  function startNew() {
    setForm({
      theme_nm: '',
      theme_desc: '',
      theme_tokens: { light: {}, dark: {} },
    })
    setEditing('new')
  }

  function startEdit(t: UiTheme) {
    setForm({
      theme_nm: t.theme_nm,
      theme_desc: t.theme_desc ?? '',
      theme_tokens: {
        light: { ...t.theme_tokens?.light },
        dark: { ...t.theme_tokens?.dark },
      },
    })
    setEditing(t)
  }

  function startDuplicate(t: UiTheme) {
    setForm({
      theme_nm: tr('uiThemes.duplicateName', { name: t.theme_nm }),
      theme_desc: t.theme_desc ?? '',
      theme_tokens: {
        light: { ...t.theme_tokens?.light },
        dark: { ...t.theme_tokens?.dark },
      },
    })
    setEditing('new')
  }

  function setColor(mode: 'light' | 'dark', key: ThemeTokenKey, v: string) {
    setForm((f) => ({
      ...f,
      theme_tokens: {
        ...f.theme_tokens,
        [mode]: { ...f.theme_tokens[mode], [key]: v },
      },
    }))
  }

  async function save() {
    if (!form.theme_nm.trim()) {
      toast.error(tr('uiThemes.nameRequired'))
      return
    }
    setSaving(true)
    try {
      const isNew = editing === 'new'
      const url = isNew
        ? '/api/admin/ui-themes'
        : `/api/admin/ui-themes/${(editing as UiTheme).theme_id}`
      const res = await piFetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '저장 실패')
      }
      toast.success(isNew ? tr('uiThemes.created') : tr('uiThemes.updated'))
      setEditing(null)
      await load()
      router.refresh() // 활성 테마를 편집했을 수 있으니 레이아웃 재반영
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr('uiThemes.saveFail'))
    } finally {
      setSaving(false)
    }
  }

  async function activate(t: UiTheme, scope: 'ADMIN' | 'GLOBAL') {
    if (
      scope === 'GLOBAL' &&
      !confirm(tr('uiThemes.confirmGlobal', { name: t.theme_nm }))
    ) {
      return
    }
    setBusyId(t.theme_id)
    try {
      const res = await piFetch(`/api/admin/ui-themes/${t.theme_id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      })
      if (!res.ok) throw new Error()
      toast.success(
        tr('uiThemes.activated', {
          name: t.theme_nm,
          scope:
            scope === 'GLOBAL'
              ? tr('uiThemes.scopeAll')
              : tr('uiThemes.scopeAdmin'),
        }),
      )
      await load()
      router.refresh() // 서버 레이아웃이 새 활성 테마/범위로 색상 주입
    } catch {
      toast.error(tr('uiThemes.activateFail'))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(t: UiTheme) {
    if (!confirm(tr('uiThemes.confirmDelete', { name: t.theme_nm }))) return
    setBusyId(t.theme_id)
    try {
      const res = await piFetch(`/api/admin/ui-themes/${t.theme_id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? tr('uiThemes.deleteFail'))
      }
      toast.success(tr('uiThemes.deleted'))
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr('uiThemes.deleteFail'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{tr('uiThemes.title')}</h1>
          <p className="text-muted-foreground text-sm">
            {tr('uiThemes.subtitle')}
          </p>
        </div>
        {!editing && (
          <Button onClick={startNew}>{tr('uiThemes.newTheme')}</Button>
        )}
      </div>

      {/* 편집/생성 폼 */}
      {editing && (
        <div className="space-y-4 rounded-xl border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">
                {tr('uiThemes.nameLabel')}
              </label>
              <Input
                value={form.theme_nm}
                onChange={(e) =>
                  setForm((f) => ({ ...f, theme_nm: e.target.value }))
                }
                placeholder={tr('uiThemes.namePlaceholder')}
                maxLength={50}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">
                {tr('uiThemes.descLabel')}
              </label>
              <Input
                value={form.theme_desc}
                onChange={(e) =>
                  setForm((f) => ({ ...f, theme_desc: e.target.value }))
                }
                placeholder={tr('uiThemes.descPlaceholder')}
              />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <ColorSetEditor
              title={tr('uiThemes.lightMode')}
              set={form.theme_tokens.light}
              onChange={(k, v) => setColor('light', k, v)}
            />
            <ColorSetEditor
              title={tr('uiThemes.darkMode')}
              set={form.theme_tokens.dark}
              onChange={(k, v) => setColor('dark', k, v)}
            />
            <Preview set={form.theme_tokens.light} />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              {tc('cancel')}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? tc('saving') : tc('save')}
            </Button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {tc('loading')}
        </p>
      ) : themes.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {tr('uiThemes.empty')}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((t) => (
            <div
              key={t.theme_id}
              className={`space-y-3 rounded-xl border p-4 ${t.actv_yn === 'Y' ? 'ring-primary ring-2' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className="truncate">{t.theme_nm}</span>
                    {t.theme_fx_cd && (
                      <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-xs">
                        {t.theme_fx_cd === 'GLASS'
                          ? tr('uiThemes.fxGlass')
                          : tr('uiThemes.fxClay')}
                      </span>
                    )}
                    {t.actv_yn === 'Y' && (
                      <span className="bg-primary text-primary-foreground shrink-0 rounded-full px-2 py-0.5 text-xs">
                        ✓{' '}
                        {t.apply_scope_cd === 'GLOBAL'
                          ? tr('uiThemes.appliedGlobal')
                          : tr('uiThemes.appliedAdmin')}
                      </span>
                    )}
                  </p>
                  {t.theme_desc && (
                    <p className="text-muted-foreground truncate text-xs">
                      {t.theme_desc}
                    </p>
                  )}
                </div>
              </div>

              <ColorDots set={t.theme_tokens?.light ?? {}} />

              <div className="flex flex-wrap gap-1.5">
                {t.actv_yn !== 'Y' ? (
                  <>
                    {/* 비활성 테마 — 범위를 골라 적용 */}
                    <Button
                      size="sm"
                      onClick={() => activate(t, 'ADMIN')}
                      disabled={busyId === t.theme_id}
                    >
                      {tr('uiThemes.applyAdmin')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => activate(t, 'GLOBAL')}
                      disabled={busyId === t.theme_id}
                    >
                      {tr('uiThemes.applyGlobal')}
                    </Button>
                  </>
                ) : (
                  /* 활성 테마 — 반대 범위로 전환 */
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      activate(
                        t,
                        t.apply_scope_cd === 'GLOBAL' ? 'ADMIN' : 'GLOBAL',
                      )
                    }
                    disabled={busyId === t.theme_id}
                  >
                    {t.apply_scope_cd === 'GLOBAL'
                      ? tr('uiThemes.switchToAdmin')
                      : tr('uiThemes.switchToGlobal')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startEdit(t)}
                >
                  {tr('uiThemes.editBtn')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startDuplicate(t)}
                >
                  {tr('uiThemes.duplicateBtn')}
                </Button>
                {t.actv_yn !== 'Y' && t.lock_yn !== 'Y' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => remove(t)}
                    disabled={busyId === t.theme_id}
                  >
                    {tc('delete')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
