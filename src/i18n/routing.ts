import { defineRouting } from 'next-intl/routing'

// ─────────────────────────────────────────────────────────────────────────────
// 주요 국가 코드가 선점 등록되어 있으므로 Admin에서 활성화 시 재배포 불필요.
// 새 locale 추가 흐름:
//   1. Admin 활성화 버튼 클릭 → DB 업데이트 + 이 파일 자동 수정 시도 (로컬)
//   2. 이 파일에 이미 등록되어 있으면 즉시 동작 (재배포 불필요)
//   3. 등록되지 않은 극히 희귀한 코드만 수동 추가 필요
// ─────────────────────────────────────────────────────────────────────────────

export const routing = defineRouting({
  locales: [
    // ── 언어 기반 locale (번역 파일 보유) ────────────────────────────────
    'ko', 'en', 'zh', 'ja', 'hi', 'vi', 'af', 'fil',
    'th', 'id', 'ms', 'es', 'fr', 'de', 'it', 'ru', 'pt', 'ar',

    // ── 아프리카 ─────────────────────────────────────────────────────────
    'dz', 'ao', 'bj', 'bw', 'bf', 'bi', 'cv', 'cm', 'cf', 'td',
    'km', 'cg', 'cd', 'dj', 'eg', 'gq', 'er', 'et', 'ga', 'gm',
    'gh', 'gn', 'gw', 'ci', 'ke', 'ls', 'lr', 'ly', 'mg', 'mw',
    'ml', 'mr', 'mu', 'ma', 'mz', 'na', 'ne', 'ng', 'rw', 'st',
    'sn', 'sc', 'sl', 'so', 'za', 'ss', 'sd', 'sz', 'tz', 'tg',
    'tn', 'ug', 'zm', 'zw',

    // ── 아시아 ───────────────────────────────────────────────────────────
    'am', 'az', 'bn', 'bt', 'cn', 'ge', 'hk', 'in', 'iq', 'ir',
    'jp', 'jo', 'kz', 'kh', 'kr', 'kg', 'la', 'lb', 'mo', 'mv',
    'mn', 'mm', 'np', 'om', 'pk', 'ps', 'ph', 'qa', 'sa', 'sg',
    'lk', 'sy', 'tw', 'tj', 'tl', 'tm', 'ae', 'uz', 'vn', 'ye',

    // ── 유럽 ─────────────────────────────────────────────────────────────
    'al', 'ad', 'at', 'by', 'be', 'ba', 'bg', 'hr', 'cy', 'cz',
    'dk', 'ee', 'fi', 'gr', 'hu', 'is', 'ie', 'li', 'lt', 'lu',
    'mt', 'md', 'mc', 'me', 'nl', 'mk', 'no', 'pl', 'ro', 'rs',
    'sk', 'si', 'se', 'ch', 'tr', 'ua', 'gb', 'va', 'xk',

    // ── 아메리카 ─────────────────────────────────────────────────────────
    'ag', 'ar', 'bs', 'bb', 'bz', 'bo', 'br', 'ca', 'cl', 'co',
    'cr', 'cu', 'dm', 'do', 'ec', 'sv', 'gd', 'gt', 'gy', 'ht',
    'hn', 'jm', 'mx', 'ni', 'pa', 'py', 'pe', 'kn', 'lc', 'vc',
    'sr', 'tt', 'us', 'uy', 've',

    // ── 오세아니아 ───────────────────────────────────────────────────────
    'au', 'fj', 'fm', 'ki', 'mh', 'nr', 'nz', 'pw', 'pg', 'ws',
    'sb', 'to', 'tv', 'vu',

    // ── 이스라엘 (국가코드 기반 특수 locale) ─────────────────────────────
    'il',

    // ── 충돌 변형: 국가코드 = 기존 언어코드일 때 생성되는 xx-XX 형태 ─────
    // (Admin 활성화 로직이 activeLocaleCds에 이미 있는 코드를 감지해 생성)
    'af-AF', 'ar-AR', 'id-ID', 'ms-MS',
    'th-TH', 'vi-VI', 'es-ES', 'fr-FR',
    'de-DE', 'it-IT', 'ru-RU', 'pt-PT',
  ],
  defaultLocale: 'ko',
  localePrefix: 'as-needed',
})
