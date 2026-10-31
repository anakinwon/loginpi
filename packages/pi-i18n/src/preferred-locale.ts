// @pi/i18n PreferredLocaleScript — 저장된 preferred_locale 을 하이드레이션 전에 적용하는 인라인 스크립트(서버 컴포넌트, 훅 없음).
// [locale]/layout.tsx 의 <body> 맨 앞에 둔다. 규칙 정본 : docs/I18N_STANDARD.md 4.3·6절
import { createElement } from 'react'

export interface PreferredLocaleScriptProps {
  locales: readonly string[]
  defaultLocale?: string
  /** 자동 적용 제외 경로 접두사 — locale 접두사 제거 후 비교 */
  exclude?: readonly string[]
  storageKey?: string
}

// 저장된 preferred_locale 적용 — 하이드레이션·Pi SDK(afterInteractive) 로드 전에 HTML 파싱 중 1회 실행.
// React 마운트 뒤 router.replace 로 바꾸면 [locale] 트리가 다시 마운트돼 진행 중인 Pi authenticate·미완료 결제 복구가 두 번 돈다(2026-10-31 검토) — 그래서 인증 시작 전에 끝낸다.
// 현재 = 저장값이면 아무것도 안 함 → 루프 없음. localePrefix 'as-needed' 전제(기본 locale 은 접두사 없음). 저장소 차단이면 조용히 끔
const APPLY_JS = `(function(c){try{var s=localStorage.getItem(c.k);if(!s||c.l.indexOf(s)<0)return;var p=location.pathname,a=p.split('/'),h=c.l.indexOf(a[1])>=0,cur=h?a[1]:c.d;if(s===cur)return;var r=h?'/'+a.slice(2).join('/'):p;for(var i=0;i<c.x.length;i++){var e=c.x[i];if(r===e||r.indexOf(e+'/')===0)return}var t=(s===c.d?'':'/'+s)+(r==='/'?'':r);location.replace((t||'/')+location.search+location.hash)}catch(_){}})`

export function PreferredLocaleScript({
  locales,
  defaultLocale = 'ko',
  exclude = ['/admin', '/auth/pi/callback'],
  storageKey = 'preferred_locale',
}: PreferredLocaleScriptProps) {
  // JSON 안의 '<' 는 이스케이프 — </script> 조기 종료 방지
  const cfg = JSON.stringify({ l: locales, d: defaultLocale, x: exclude, k: storageKey }).replace(/</g, '\\u003c')
  return createElement('script', { dangerouslySetInnerHTML: { __html: `${APPLY_JS}(${cfg})` } })
}
