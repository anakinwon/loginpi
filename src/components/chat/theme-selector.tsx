'use client'
import { useCallback, useEffect, useState } from 'react'
import { useSubscribePlan } from '@/hooks/use-subscribe-plan'
import { InlinePurchasePrompt } from './inline-purchase-prompt'

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
}

export function ThemeSelector({ selectedThemeCode, onSelect }: ThemeSelectorProps) {
  const [themes, setThemes] = useState<ThemeRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [promptTheme, setPromptTheme] = useState<ThemeRow | null>(null)

  const { subscribe, paying } = useSubscribePlan({
    onSuccess: useCallback(() => {
      if (promptTheme) onSelect(promptTheme)
      setPromptTheme(null)
    }, [promptTheme, onSelect]),
  })

  useEffect(() => {
    fetch('/api/chat/themes')
      .then(r => r.json())
      .then(({ themes: t }: { themes: ThemeRow[] }) => setThemes(t ?? []))
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className='flex items-center justify-center py-12 text-sm text-muted-foreground'>
        <div className='mr-2 h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent' />
        테마 불러오는 중...
      </div>
    )
  }

  return (
    <>
      <div className='grid grid-cols-3 gap-2.5 sm:grid-cols-4'>
        {themes.map(theme => {
          const isSelected = theme.theme_cd === selectedThemeCode
          const isPremium = theme.theme_tp_cd === 'PREMIUM'

          return (
            <button
              key={theme.theme_cd}
              onClick={() => isPremium ? setPromptTheme(theme) : onSelect(theme)}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'hover:border-muted-foreground/40 hover:bg-muted/40'
              }`}
            >
              {isPremium && (
                <span className='absolute right-1.5 top-1.5 text-[10px]'>🔒</span>
              )}
              <span className='text-2xl leading-none'>{theme.theme_emoji}</span>
              <span className='text-xs font-medium leading-tight'>{theme.theme_nm}</span>
              {isPremium && (
                <span className='rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'>
                  PREMIUM
                </span>
              )}
            </button>
          )
        })}
      </div>

      <InlinePurchasePrompt
        isOpen={!!promptTheme}
        featureName={`${promptTheme?.theme_emoji ?? ''} ${promptTheme?.theme_nm ?? ''} 테마`}
        description='PREMIUM 테마는 단건 구매 또는 구독 후 이용할 수 있습니다'
        piAmount={0.2}
        onSinglePurchase={() => {
          if (promptTheme) onSelect(promptTheme)
          setPromptTheme(null)
        }}
        onSubscribe={subscribe}
        subscribing={paying}
        onClose={() => { if (!paying) setPromptTheme(null) }}
      />
    </>
  )
}
