'use client'

// @pi/i18n/client — loginpi 동일 상단 헤더 우측 2종 : 언어 콤보(국기 + 통화·환율, createLanguageSwitcher) · 1 π 시세칩(PiPriceChip).
// 배치 규칙(표준 4.6절) : 상단 헤더 맨 끝에 <LanguageSwitcher/> → <PiPriceChip/> 순서. 하단 메뉴·푸터 금지
export {
  createLanguageSwitcher,
  type LanguageSwitcherNavigation,
  type LanguageSwitcherProps,
} from './language-switcher'
export { PiPriceChip } from './pi-price-chip'
/** @deprecated 0.1 스위처 — 앱 이행(표준 8.2절) 뒤 삭제 */
export { LocaleSwitcher, type LocaleSwitcherProps } from './locale-switcher'
