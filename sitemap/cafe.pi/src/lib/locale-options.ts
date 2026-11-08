import { routing } from '@/i18n/routing'

// PyTranslate™ 언어 선택 드롭다운 옵션 — routing.ts 203개 locale 단일 소스
// Intl.DisplayNames로 언어명 자동 파생, 미인식 코드는 코드 그대로 표시
// 서버·클라이언트 양쪽에서 사용 가능 (Intl은 양쪽 모두 내장)

export interface LocaleOption {
  value: string
  label: string
}

export function getLocaleOptions(displayLocale = 'ko'): LocaleOption[] {
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames([displayLocale], { type: 'language' })
  } catch {}
  // routing.ts에 'ar'(아랍어/아르헨티나)처럼 언어·국가 코드가 중복 등록된 항목이 있어
  // dedupe 필수 — React key 충돌 방지
  return [...new Set<string>(routing.locales)].map((cd) => {
    let label: string = cd
    try {
      const resolved = names?.of(cd)
      if (resolved && resolved !== cd) label = `${resolved} (${cd})`
    } catch {}
    return { value: cd, label }
  })
}
