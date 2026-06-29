'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
        aria-label={`${label} 색상 선택`}
      />
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#a78bfa 또는 oklch(...)"
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
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      {THEME_TOKEN_META.map((m) => (
        <ColorRow
          key={m.key}
          label={m.label}
          value={set[m.key]}
          onChange={(v) => onChange(m.key, v)}
        />
      ))}
    </div>
  )
}

// 미리보기 — KPI 카드 5개 + primary 버튼 (편집 중인 라이트 세트 기준)
function Preview({ set }: { set: ThemeColorSet }) {
  const kpis: ThemeTokenKey[] = ['kpi1', 'kpi2', 'kpi3', 'kpi4', 'kpi5']
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">미리보기</p>
      <div className="grid grid-cols-3 gap-2">
        {kpis.map((k, i) => (
          <div
            key={k}
            className="rounded-xl p-3 shadow-sm"
            style={{ background: set[k] ?? 'var(--muted)' }}
          >
            <p className="text-xs text-slate-600">지표 {i + 1}</p>
            <p className="text-xl font-bold text-slate-900">1,234</p>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="rounded-lg px-4 py-2 text-sm font-medium text-white"
        style={{ background: set.primary ?? 'var(--primary)' }}
      >
        주색 버튼
      </button>
    </div>
  )
}

export default function UiThemesPage() {
  const router = useRouter()
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
      toast.error('테마 목록을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [])

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
      theme_nm: `${t.theme_nm} 복사본`,
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
      toast.error('테마명을 입력해주세요')
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
      toast.success(isNew ? '테마가 생성되었습니다' : '테마가 수정되었습니다')
      setEditing(null)
      await load()
      router.refresh() // 활성 테마를 편집했을 수 있으니 레이아웃 재반영
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  async function activate(t: UiTheme, scope: 'ADMIN' | 'GLOBAL') {
    if (
      scope === 'GLOBAL' &&
      !confirm(
        `'${t.theme_nm}' 테마를 전체 페이지에 적용합니다.\n일반 사용자 화면의 포인트 색(버튼 등)도 바뀝니다.\n배경·글자색은 유지되어 가독성·기능에는 영향이 없습니다. 계속할까요?`,
      )
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
        `'${t.theme_nm}' 테마를 ${scope === 'GLOBAL' ? '전체' : '관리자'} 적용했습니다`,
      )
      await load()
      router.refresh() // 서버 레이아웃이 새 활성 테마/범위로 색상 주입
    } catch {
      toast.error('적용 실패')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(t: UiTheme) {
    if (!confirm(`'${t.theme_nm}' 테마를 삭제하시겠습니까?`)) return
    setBusyId(t.theme_id)
    try {
      const res = await piFetch(`/api/admin/ui-themes/${t.theme_id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '삭제 실패')
      }
      toast.success('삭제되었습니다')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">🎨 UI 테마 관리</h1>
          <p className="text-muted-foreground text-sm">
            관리자 대시보드 색상 테마를 저장·전환합니다 (일반 사용자 화면은 영향
            없음)
          </p>
        </div>
        {!editing && <Button onClick={startNew}>+ 새 테마</Button>}
      </div>

      {/* 편집/생성 폼 */}
      {editing && (
        <div className="space-y-4 rounded-xl border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">테마명 *</label>
              <Input
                value={form.theme_nm}
                onChange={(e) =>
                  setForm((f) => ({ ...f, theme_nm: e.target.value }))
                }
                placeholder="예: 파스텔 대시보드"
                maxLength={50}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">설명</label>
              <Input
                value={form.theme_desc}
                onChange={(e) =>
                  setForm((f) => ({ ...f, theme_desc: e.target.value }))
                }
                placeholder="테마 설명 (선택)"
              />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <ColorSetEditor
              title="☀️ 라이트 모드"
              set={form.theme_tokens.light}
              onChange={(k, v) => setColor('light', k, v)}
            />
            <ColorSetEditor
              title="🌙 다크 모드"
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
              취소
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? '저장 중…' : '저장'}
            </Button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          로딩 중…
        </p>
      ) : themes.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          테마가 없습니다.
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
                  <p className="flex items-center gap-2 font-semibold">
                    <span className="truncate">{t.theme_nm}</span>
                    {t.actv_yn === 'Y' && (
                      <span className="bg-primary text-primary-foreground shrink-0 rounded-full px-2 py-0.5 text-xs">
                        ✓{' '}
                        {t.apply_scope_cd === 'GLOBAL'
                          ? '전체 적용중'
                          : '관리자 적용중'}
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
                      관리자만 적용
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => activate(t, 'GLOBAL')}
                      disabled={busyId === t.theme_id}
                    >
                      전체 적용
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
                      ? '관리자만으로 전환'
                      : '전체로 전환'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startEdit(t)}
                >
                  편집
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startDuplicate(t)}
                >
                  복제
                </Button>
                {t.actv_yn !== 'Y' && t.lock_yn !== 'Y' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => remove(t)}
                    disabled={busyId === t.theme_id}
                  >
                    삭제
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
