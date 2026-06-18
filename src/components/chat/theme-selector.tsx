'use client'
import { useEffect, useState } from 'react'

export interface ThemeRow {
  theme_cd: string
  theme_nm: string
  theme_emoji: string
  theme_desc: string | null
  theme_tp_cd: 'BASIC' | 'PREMIUM'
  sort_ord: number
}

interface ThemeSelectorProps {
  selectedThemeCode: string | null
  onSelect: (theme: ThemeRow) => void
  // 미사용 — 프리미엄 테마는 구독 강요 없이 누구나 선택 가능(생성 시 Bean 요금 부과)
  hasPremiumAccess?: boolean
}

export function ThemeSelector({
  selectedThemeCode,
  onSelect,
}: ThemeSelectorProps) {
  const [themes, setThemes] = useState<ThemeRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/chat/themes')
      .then((r) => r.json())
      .then(({ themes: t }: { themes: ThemeRow[] }) => setThemes(t ?? []))
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center py-12 text-sm">
        <div className="border-muted-foreground mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
        테마 불러오는 중...
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
      {themes.map((theme) => {
        const isSelected = theme.theme_cd === selectedThemeCode
        const isPremium = theme.theme_tp_cd === 'PREMIUM'

        return (
          <button
            key={theme.theme_cd}
            onClick={() => onSelect(theme)}
            className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
              isSelected
                ? 'border-primary bg-primary/10'
                : 'hover:border-muted-foreground/40 hover:bg-muted/40'
            }`}
          >
            <span className="text-2xl leading-none">{theme.theme_emoji}</span>
            <span className="text-xs leading-tight font-medium">
              {theme.theme_nm}
            </span>
            {isPremium && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                PREMIUM
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
