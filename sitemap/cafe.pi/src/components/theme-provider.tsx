'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { useServerInsertedHTML } from 'next/navigation'
import { useRef, type ComponentProps } from 'react'

// next-themes의 FOUC 방지 인라인 <script>는 React 19.2부터
// "Encountered a script tag while rendering React component" 경고를 유발한다.
// → patches/next-themes@0.4.6.patch 로 내부 script 렌더를 제거하고,
//   동일한 초기화 스크립트를 useServerInsertedHTML로 React 트리 밖(스트리밍 HTML)에 주입한다.
// ※ layout.tsx의 ThemeProvider props(attribute='class', defaultTheme='system',
//   enableSystem, storageKey 기본값 'theme')와 반드시 동기화 유지할 것.
const THEME_INIT_SCRIPT = `(function(){try{var e=localStorage.getItem('theme')||'system';var t=e==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):e;var c=document.documentElement.classList;c.remove('light','dark');c.add(t)}catch(n){}})()`

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  const inserted = useRef(false)
  useServerInsertedHTML(() => {
    if (inserted.current) return
    inserted.current = true
    return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
  })
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
