// @pi/i18n PreferredLocaleScript — 저장된 preferred_locale 을 하이드레이션 전에 적용하는 인라인 스크립트(서버 컴포넌트, 훅 없음).
// [locale]/layout.tsx 의 <body> 맨 앞에 둔다. 규칙 정본 : docs/I18N_STANDARD.md 4.3·6절
import { createElement } from 'react'

import { countryLocaleMap } from './geo'

export interface PreferredLocaleScriptProps {
  locales: readonly string[]
  defaultLocale?: string
  /** 자동 적용 제외 경로 접두사 — locale 접두사 제거 후 비교 */
  exclude?: readonly string[]
  storageKey?: string
  /** 접속 국가 조회 API(앱의 /api/i18n/geo) — null 이면 IP 국가 자동 선택 끔 */
  geoUrl?: string | null
}

// 언어 자동 선택(마스터 2026-11-01 "하루 첫 접속시 IP 로 접속국가 확인 → 그 국가 언어, 다음 접속은 마지막 접속 언어") — HTML 파싱 중 1회 실행.
//  ① 저장 언어가 수동 선택(src≠geo, 예전 저장값 포함)이면 그 언어 — 마지막 접속 언어 유지
//  ② 아니면(처음 오거나 IP 로 정한 언어인데 날짜가 바뀜) 하루 1번 IP 국가 조회 → 그 나라 언어로 저장(src=geo)·이동. 오늘 이미 정했으면 그 값
//  IP 조회는 주소에 locale 접두사가 없을 때만(첫 화면·도메인 직접 입력) — /en 처럼 언어를 지정한 링크는 존중. 조회 실패·대응 없는 나라 = 현재 언어 유지, 오늘 다시 안 물음
// 하이드레이션 전에 끝나는 동기 경로(①)가 대부분이고, ②의 이동은 하루 최대 1번이다. React 마운트 뒤 router.replace 는 인증 이중 실행이라 쓰지 않는다(2026-10-31 검토).
// 현재 = 목표면 아무것도 안 함 → 루프 없음. localePrefix 'as-needed' 전제. 저장소 차단이면 조용히 끔
const APPLY_JS = `(function(c){try{var L=localStorage,p=location.pathname,a=p.split('/'),h=c.l.indexOf(a[1])>=0,cur=h?a[1]:c.d,r=h?'/'+a.slice(2).join('/'):p;for(var i=0;i<c.x.length;i++){var e=c.x[i];if(r===e||r.indexOf(e+'/')===0)return}function go(s){if(!s||c.l.indexOf(s)<0||s===cur)return;var t=(s===c.d?'':'/'+s)+(r==='/'?'':r);location.replace((t||'/')+location.search+location.hash)}var s=L.getItem(c.k),src=L.getItem(c.k+'_src'),d=new Date(),day=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(),ok=s&&c.l.indexOf(s)>=0;if(ok&&(src!=='geo'||!c.g||L.getItem(c.k+'_day')===day)){go(s);return}if(!c.g||h){if(ok)go(s);return}L.setItem(c.k+'_day',day);fetch(c.g,{cache:'no-store'}).then(function(x){return x.json()}).then(function(j){var t=c.m[String(j&&j.country||'').toLowerCase()];if(!t){if(ok)go(s);return}L.setItem(c.k,t);L.setItem(c.k+'_src','geo');go(t)}).catch(function(){if(ok)go(s)})}catch(_){}})`

export function PreferredLocaleScript({
  locales,
  defaultLocale = 'ko',
  exclude = ['/admin', '/auth/pi/callback'],
  storageKey = 'preferred_locale',
  geoUrl = '/api/i18n/geo',
}: PreferredLocaleScriptProps) {
  // JSON 안의 '<' 는 이스케이프 — </script> 조기 종료 방지
  const cfg = JSON.stringify({
    l: locales,
    d: defaultLocale,
    x: exclude,
    k: storageKey,
    g: geoUrl,
    m: geoUrl ? countryLocaleMap(locales) : {},
  }).replace(/</g, '\\u003c')
  return createElement('script', { dangerouslySetInnerHTML: { __html: `${APPLY_JS}(${cfg})` } })
}
