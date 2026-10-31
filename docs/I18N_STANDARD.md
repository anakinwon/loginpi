# Pi 앱 다국어 표준 (`@pi/i18n`) v2.0.1

> 정본. **loginpi(cafe.pi, https://loginpi.vercel.app/)의 다국어를 흉내내지 않고 똑같이** 다른 Pi 앱에 옮기는 표준입니다(마스터 지시 2026-10-31 "loginpi를 흉내내지말고, 완전히 동일하게 구현해줘").
> 같은 것 : routing locale 219개(국가코드 위주, 순서 그대로)·locale → 언어 매핑·DB 활성 locale 189(스냅숏)·국가마스터 188·상단 헤더 언어 콤보(국기·통화·환율)·π 시세칩·API 3종·스위처 문구.
> 입력 자료 : `docs/i18n/LOGINPI_I18N_ANALYSIS.md`(loginpi 분석). 짧은 안내는 `packages/pi-i18n/README.md`.

---

## 0. 한눈에 보기

```
messages/ko.json(정본) ─키 추가─▶ pnpm i18n:translate (언어 67개 단위, 바뀐 키만) ─▶ messages/en.json · messages/lang/<언어>.json
                                                                       │ (translate 끝에 자동)
                                       pnpm i18n:expand ◀──────────────┘  locale → 언어(loginpi 매핑)로 복사
                                                                       ▼
                                                messages/<locale>.json (routing locale 189개분, 30개는 파일 없음 = loginpi 와 같음)
                                       pnpm i18n:validate (언어 소스 ICU 검사 + locale 파일 = 소스 사본인지) ─▶ pnpm build ─▶ 배포
런타임 : 요청 locale → (스위처 문구 ⊕) ko ⊕ en ⊕ locale 깊은 병합 → NextIntlClientProvider
화면   : 상단 헤더 맨 오른쪽 <LanguageSwitcher/>(국기·통화·환율) → <PiPriceChip/>(1 π 시세)
데이터 : /api/i18n/countries(loginpi DB 스냅숏) · /api/exchange-rates · /api/pi-price — 처리기는 @pi/i18n/routes
재방문 : <PreferredLocaleScript>(layout body 맨 앞) → 하이드레이션·Pi 인증 전에 저장 locale 로 1회 이동 (loginpi 와 다른 유일한 동작, 4.7절)
```

- 앱은 DB 를 쓰지 않습니다. loginpi DB(`i18n_locale`·`i18n_cntry_mst`)는 `pi-i18n snapshot` 으로 패키지 `src/data/*.json` 에 복제해 커밋합니다. 번역 정본은 각 앱 `messages/ko.json` 하나입니다.

---

## 1. 원칙

| # | 원칙 | 근거 |
|---|---|---|
| P1 | **routing locale = loginpi `src/i18n/routing.ts` locales 그대로**(219개, 같은 순서 — 국가코드 위주 + `ar-AR`·`en-ZA`·`xx-XX` 파생). 번역은 **언어(67개 카탈로그) 단위**로 하고, locale 파일은 loginpi 와 같은 locale → 언어 매핑으로 펼칩니다 | 마스터 지시(완전 동일) · 국가코드 ≠ 언어코드 함정(et=암하라어, am=아르메니아어 — 분석 3.1절)은 매핑이 해소 |
| P2 | **ko.json 이 유일한 정본.** 키는 반드시 ko 에 먼저 추가합니다. ko 에 없는 키가 언어 파일에 있으면 빌드가 막힙니다 | loginpi validate 의 extra 차단 |
| P3 | **실행 중 폴백은 ko → en → locale 3단계 깊은 병합**이고 배열은 통째로 바꿉니다 | loginpi `src/i18n/request.ts` 와 같음 |
| P4 | **locale 목록은 빌드할 때 고정됩니다** | next-intl `defineRouting` 의 제약 |
| P5 | **Pi Browser 는 쿠키를 저장하지 않습니다.** 고른 언어는 localStorage `preferred_locale` 에만 기억하고, 미들웨어의 쿠키·Accept-Language 감지는 끕니다 | CLAUDE.md 치명적 제약. 6절 |
| P6 | **번역은 파일 기반으로 바뀐 것만 합니다**(ko 해시) | loginpi 한계 ①(원문 변경 감지 없음) 해소 |
| P7 | **브랜드명·코드 식별자·ICU 문법은 번역하지 않습니다**(용어집 + 검증) | 브랜드 표기 규칙 |
| P8 | **폐기 키는 삭제합니다.** 빈 값 `""` 금지, `_` 메타 키 금지(로드할 때 지움) | 번들 직렬화 노출 사고(2026-07-16) |
| P9 | **RTL 은 실제 언어 기준으로 `<html dir="rtl">`**(`getDir(locale)` — `il`→he, `ae`→ar, `ir`→fa, `pk`→ur, `mv`→dv, `ps`) | loginpi 는 dir 없음 — 표시만 더 정확해지는 추가(동작 차이 아님) |
| P10 | **언어 콤보는 상단 헤더 맨 오른쪽**, 국기와 환율을 반드시 표시합니다(4.6절). 하단 메뉴·푸터 배치 금지 | 마스터 지시 2026-10-31 |

---

## 2. 언어·locale·데이터

### 2.1 언어 카탈로그 (67개 — 번역 단위)

- 정본 `packages/pi-i18n/src/catalog.json`. 번역 파일 이름(`messages/lang/<code>.json`, ko·en 은 `messages/ko.json`·`en.json`)과 Gemini 지시 언어명·plural 범주·`dir` 에 씁니다.
- 'loginpi 소스' = 그 언어의 loginpi 원본 locale 파일. `pi-i18n snapshot` 이 locale → 언어 매핑을 판정할 때 기준으로 씁니다(`cli/snapshot.mjs` `LANG_SOURCE`).

| # | code | nativeName | englishName | flag | dir | loginpi 소스 |
|---|---|---|---|---|---|---|
| 1 | ko | 한국어 | Korean | 🇰🇷 | ltr | ko |
| 2 | en | English | English | 🇺🇸 | ltr | en |
| 3 | zh | 简体中文 | Chinese (Simplified) | 🇨🇳 | ltr | zh |
| 4 | ja | 日本語 | Japanese | 🇯🇵 | ltr | ja |
| 5 | vi | Tiếng Việt | Vietnamese | 🇻🇳 | ltr | vi |
| 6 | hi | हिन्दी | Hindi | 🇮🇳 | ltr | hi |
| 7 | id | Bahasa Indonesia | Indonesian | 🇮🇩 | ltr | id |
| 8 | fil | Filipino | Filipino | 🇵🇭 | ltr | fil |
| 9 | de | Deutsch | German | 🇩🇪 | ltr | de |
| 10 | th | ไทย | Thai | 🇹🇭 | ltr | th |
| 11 | ms | Bahasa Melayu | Malay | 🇲🇾 | ltr | ms |
| 12 | af | Afrikaans | Afrikaans | 🇿🇦 | ltr | af |
| 13 | sq | Shqip | Albanian | 🇦🇱 | ltr | sq |
| 14 | am | አማርኛ | Amharic | 🇪🇹 | ltr | et |
| 15 | ar | العربية | Arabic | 🇸🇦 | **rtl** | ar |
| 16 | hy | Հայերեն | Armenian | 🇦🇲 | ltr | am |
| 17 | az | Azərbaycan dili | Azerbaijani | 🇦🇿 | ltr | az |
| 18 | bn | বাংলা | Bengali | 🇧🇩 | ltr | bd |
| 19 | bs | Bosanski | Bosnian | 🇧🇦 | ltr | ba |
| 20 | bg | Български | Bulgarian | 🇧🇬 | ltr | bg |
| 21 | my | မြန်မာ | Burmese | 🇲🇲 | ltr | mm |
| 22 | ca | Català | Catalan | 🇦🇩 | ltr | ad |
| 23 | zh-TW | 繁體中文 | Chinese (Traditional) | 🇹🇼 | ltr | tw |
| 24 | hr | Hrvatski | Croatian | 🇭🇷 | ltr | hr |
| 25 | cs | Čeština | Czech | 🇨🇿 | ltr | cz |
| 26 | da | Dansk | Danish | 🇩🇰 | ltr | dk |
| 27 | dv | ދިވެހި | Dhivehi | 🇲🇻 | **rtl** | mv |
| 28 | nl | Nederlands | Dutch | 🇳🇱 | ltr | nl |
| 29 | dz | རྫོང་ཁ | Dzongkha | 🇧🇹 | ltr | bt |
| 30 | et | Eesti | Estonian | 🇪🇪 | ltr | ee |
| 31 | fi | Suomi | Finnish | 🇫🇮 | ltr | fi |
| 32 | fr | Français | French | 🇫🇷 | ltr | fr |
| 33 | ka | ქართული | Georgian | 🇬🇪 | ltr | ge |
| 34 | el | Ελληνικά | Greek | 🇬🇷 | ltr | gr |
| 35 | he | עברית | Hebrew | 🇮🇱 | **rtl** | il |
| 36 | hu | Magyar | Hungarian | 🇭🇺 | ltr | hu |
| 37 | is | Íslenska | Icelandic | 🇮🇸 | ltr | is |
| 38 | it | Italiano | Italian | 🇮🇹 | ltr | it |
| 39 | kk | Қазақ тілі | Kazakh | 🇰🇿 | ltr | kz |
| 40 | km | ខ្មែរ | Khmer | 🇰🇭 | ltr | kh |
| 41 | ky | Кыргызча | Kyrgyz | 🇰🇬 | ltr | kg |
| 42 | lo | ລາວ | Lao | 🇱🇦 | ltr | la |
| 43 | lv | Latviešu | Latvian | 🇱🇻 | ltr | lv |
| 44 | lt | Lietuvių | Lithuanian | 🇱🇹 | ltr | lt |
| 45 | mn | Монгол | Mongolian | 🇲🇳 | ltr | mn |
| 46 | ne | नेपाली | Nepali | 🇳🇵 | ltr | np |
| 47 | nb | Norsk bokmål | Norwegian Bokmål | 🇳🇴 | ltr | no |
| 48 | ps | پښتو | Pashto | 🇦🇫 | **rtl** | ps |
| 49 | fa | فارسی | Persian | 🇮🇷 | **rtl** | ir |
| 50 | pl | Polski | Polish | 🇵🇱 | ltr | pl |
| 51 | pt | Português | Portuguese | 🇵🇹 | ltr | pt |
| 52 | ro | Română | Romanian | 🇷🇴 | ltr | ro |
| 53 | ru | Русский | Russian | 🇷🇺 | ltr | ru |
| 54 | sr | Srpski | Serbian (Latin) | 🇷🇸 | ltr | rs |
| 55 | si | සිංහල | Sinhala | 🇱🇰 | ltr | lk |
| 56 | sk | Slovenčina | Slovak | 🇸🇰 | ltr | sk |
| 57 | sl | Slovenščina | Slovenian | 🇸🇮 | ltr | si |
| 58 | so | Soomaali | Somali | 🇸🇴 | ltr | so |
| 59 | es | Español | Spanish | 🇪🇸 | ltr | es |
| 60 | sw | Kiswahili | Swahili | 🇹🇿 | ltr | tz |
| 61 | sv | Svenska | Swedish | 🇸🇪 | ltr | se |
| 62 | tg | Тоҷикӣ | Tajik | 🇹🇯 | ltr | tj |
| 63 | tr | Türkçe | Turkish | 🇹🇷 | ltr | tr |
| 64 | tk | Türkmençe | Turkmen | 🇹🇲 | ltr | tm |
| 65 | uk | Українська | Ukrainian | 🇺🇦 | ltr | ua |
| 66 | ur | اردو | Urdu | 🇵🇰 | **rtl** | pk |
| 67 | uz | Oʻzbekcha | Uzbek | 🇺🇿 | ltr | uz |

비고 : 세르비아어는 라틴 문자로 둡니다(키릴은 나중에 `sr-Cyrl`). 노르웨이어는 `nb` 입니다. 중국어 번체는 `zh-TW` 입니다(next-intl 은 하이픈이 들어간 locale 을 지원합니다).

### 2.2 routing locale (219개 — loginpi 와 같음) 와 locale → 언어 매핑

- 정본 `packages/pi-i18n/src/data/locale-lang.json` — 키 순서 = loginpi `routing.locales` 순서, 값 = 언어 코드(위 카탈로그) 또는 `null`.
- 판정 방법(snapshot) : loginpi `messages/<locale>.json` 내용이 어느 언어 소스 파일과 같은 값이 가장 많은지. 공유 언어 국가는 복사본이라 1.0, `au`(영어 0.68)·`mx`(스페인어 0.64)는 loginpi 가 따로 번역한 같은 언어입니다.
- `null` 30개(`ci za sz cn hk in jp kr mo ph vn al mk va xk ag dm gd us` + `af-AF id-ID ms-MS th-TH vi-VI es-ES fr-FR de-DE it-IT ru-RU pt-PT`) = **loginpi 도 번역 파일이 없는 locale** → 화면은 ko → en 폴백(영어). 그대로 둡니다(같은 동작).

| 대표 매핑 | 언어 | 비고 |
|---|---|---|
| `ae` `eg` `sa` … (20) | ar | 아랍어 복사 |
| `am` | **hy** 아르메니아어 | BCP-47 am(암하라어) 아님 |
| `et` | **am** 암하라어 | 에스토니아어는 `ee` → et |
| `si` / `lk` | sl 슬로베니아어 / si 싱할라어 | |
| `bn` / `bd` | ms 말레이어 / bn 벵골어 | |
| `ca` / `ad` | en 영어 / ca 카탈루냐어 | |
| `sr` / `rs` | nl 네덜란드어 / sr 세르비아어 | |
| `tw` · `il` · `ir` · `no` · `ar-AR` · `en-ZA` | zh-TW · he · fa · nb · es · en | |

### 2.3 DB 스냅숏 (loginpi 와 같은 데이터)

| 파일 | loginpi 원천 | 쓰는 곳 |
|---|---|---|
| `src/data/locales.json` | `i18n_locale` `is_active='Y'` → `locale_cd·locale_nm·flag_emoji·sort_ord`(sort_ord 순) — 188행 | `/api/i18n/countries` `locales` → 스위처 '활성 언어' |
| `src/data/countries.json` | `i18n_cntry_mst` → `country_cd·dis_ord_seq·country_eng_nm·country_mot_nm·currency_cd·locale_cd·use_yn`(dis_ord_seq 순) — 188행 | `/api/i18n/countries` `countries` → '전체 국가'·통화 |
| `src/data/switcher-messages.json` | loginpi 각 locale 파일의 `langSwitcher.*`·`common.fetching` 원문 | `@pi/i18n/server` 가 메시지 바탕에 깔아 줌(앱이 키를 추가할 필요 없음, 앱 값이 있으면 앱 값 우선) |
| `src/locale-currency.ts`·`locale-country.ts`·`combo-search.ts` | loginpi `src/lib/` 같은 파일 원문(1행 표시 주석만 추가) | 통화·국기(alpha-2)·검색 — 시험이 루트 파일과 같은지 비교 |

갱신 : 저장소 루트에서 `node packages/pi-i18n/bin/pi-i18n.mjs snapshot` (루트 `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 를 스크립트 안에서만 읽음, 값 출력 없음) → `pnpm --filter @pi/i18n test` → 커밋. loginpi `src/lib/locale-*.ts` 가 바뀌면 같은 내용으로 복제합니다(시험이 어긋남을 잡음).

---

## 3. 파일 구성

### 3.1 패키지 `packages/pi-i18n` (`@pi/i18n` 0.2.0)

```
packages/pi-i18n/
├── package.json        bin pi-i18n · 의존 @formatjs/icu-messageformat-parser · flag-icons ^7.5.0(루트와 같음)
├── src/
│   ├── catalog.json            언어 67개
│   ├── data/*.json             loginpi 스냅숏 4종(2.2·2.3절)
│   ├── locale-currency.ts · locale-country.ts · combo-search.ts   loginpi 원본 복제
│   ├── index.ts        '.'        : routing·매핑·통화/국기·comboMatch·createRouting·deepMerge·PreferredLocaleScript — fs·훅 없음(proxy/edge 가능)
│   ├── server.ts       './server' : createRequestConfig·getMessages — fs(서버 전용)
│   ├── routes.ts       './routes' : countriesGET·exchangeRatesGET·piPriceGET
│   ├── client.tsx      './client' : createLanguageSwitcher·PiPriceChip ('use client')  (+ 0.1 LocaleSwitcher, 이행 뒤 삭제)
│   ├── language-switcher.tsx · pi-price-chip.tsx   loginpi 컴포넌트 이식본
│   └── locale-switcher.tsx     @deprecated 0.1 스위처
└── bin/pi-i18n.mjs     translate | expand | validate | audit | snapshot
    cli/*.mjs
```

### 3.2 앱 (예 : `sitemap/<app>/`)

```
<app>/
├── i18n.config.json            앱 다국어 설정
├── messages/
│   ├── ko.json                 정본 (사람이 편집)
│   ├── en.json                 영어 소스 (translate)
│   ├── lang/<언어>.json         나머지 언어 소스 65개 (translate · 사람 손질 가능)
│   ├── <locale>.json           expand 생성물 — 직접 고치지 않음(validate 가 소스와 다르면 오류)
│   └── .i18n-state.json        translate 상태 : 언어 × 키 → ko 원문 해시 (git 커밋)
└── src/
    ├── i18n/routing.ts · request.ts · navigation.ts
    ├── components/language-switcher.tsx   createLanguageSwitcher(앱 navigation 주입)
    └── app/api/{i18n/countries,exchange-rates,pi-price}/route.ts   처리기 재수출 + revalidate
```

```json
{ "locales": "all", "languages": "all", "glossary": ["seminar.pi"], "audit": { "exclude": ["src/app/api/**"] } }
```

| 필드 | 기본 | 의미 |
|---|---|---|
| `locales` | `"all"` | routing locale(2.2절 219개) 전체 또는 일부 — `expand`·`validate`·`createRouting` 대상. 배열이면 `ko`·`en` 필수 |
| `languages` | `"all"` | 번역 언어(카탈로그 67개) 전체 또는 일부 — `translate` 대상 |
| `glossary` · `numericArgs` · `audit.exclude` | `[]` | 5절 |

---

## 4. 패키지 API

### 4.1 `@pi/i18n` (edge 안전)

```ts
export const ROUTING_LOCALES: readonly string[]                 // loginpi routing.locales (219, 같은 순서)
export const LOCALE_LANG: Readonly<Record<string, string | null>> // locale → 언어
export const LOCALE_CATALOG: readonly LocaleInfo[]               // 언어 67개 { code, nativeName, englishName, flag, dir }
export const ALL_LANGUAGES: readonly string[]
export const ALL_LOCALES = ROUTING_LOCALES                       // @deprecated 0.1 호환
export const DEFAULT_LOCALE = 'ko'; export const FALLBACK_CHAIN: readonly ['ko', 'en']
export function getLanguage(locale: string): string | null      // ae → 'ar', am → 'hy', et → 'am', kr → null
export function getLocaleInfo(lang: string): LocaleInfo | undefined
export function getDir(locale: string): 'ltr' | 'rtl'           // 실제 언어 기준
export function resolveLocales(locales?: 'all' | readonly string[]): string[]  // routing 순서, 모르는 코드·ko/en 누락 throw
export function createRouting(o?: { locales?: 'all' | readonly string[]; defaultLocale?: string })
//   = defineRouting({ locales, defaultLocale 'ko', localePrefix 'as-needed', localeDetection false, localeCookie false })
export const LOCALE_CURRENCY: Record<string, string>             // loginpi 원본
export const LOCALE_COUNTRY: Record<string, string>; export const ACTIVE_COUNTRY_CODES: Set<string>
export function getAlpha2(locale_cd: string): string
export function comboMatch(query: string, ...fields: (string | null | undefined)[]): boolean
export function deepMerge(base, override): MessageRecord
export function PreferredLocaleScript(p: { locales; defaultLocale?; exclude?; storageKey? }): JSX.Element
```

### 4.2 `@pi/i18n/server`

```ts
export function getMessages(locale: string, o: { loadSource: () => Promise<MessageRecord | { default: MessageRecord }>; messagesDir?: string }): Promise<MessageRecord>
export function createRequestConfig(o: GetMessagesOptions & { routing: { locales: readonly string[]; defaultLocale: string } })
```

- 결과 = `(S[ko] ⊕ ko) ⊕ (S[en] ⊕ en) ⊕ (S[locale] ⊕ locale)` — S = 스위처 문구 스냅숏(2.3절). en·locale 은 readFile(없으면 `{}`), 최상위 `_` 키 제거, 운영은 locale 별 메모리 캐시.

### 4.3 `@pi/i18n/client` — 언어 콤보·시세칩 (loginpi 이식)

```ts
export function createLanguageSwitcher(nav: {
  usePathname: () => string
  useRouter: () => { replace: (href: string, o: { locale: string }) => void }
  adminTicketUrl?: string              // loginpi = '/api/admin/pit-ticket'. 없으면 /admin 전환은 티켓 없이 하드 이동
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>   // Pi Browser 는 piFetch(@pi/auth/client)
}): (props: { locale: string; showPiValuation: boolean }) => JSX.Element
export function PiPriceChip(props: { locale: string }): JSX.Element | null
```

loginpi `language-switcher.tsx`·`pi-price-chip.tsx` 와 **같은 JSX·className·문구 키·동작**입니다.

- 버튼 : `fi fi-<alpha2>` 국기(flag-icons CSS — 컴포넌트가 직접 import, 앱 설정 불필요) + 대문자 locale 코드 + ▾. `aria-haspopup="listbox"`·`aria-expanded`·`aria-label=t('label')`.
- 드롭다운 : 모바일 `fixed inset-x-2 top-[3.75rem] … max-h-[70vh] max-w-sm` / `sm:` 이상 `absolute right-0 top-full w-72 max-h-[440px]`. 검색(`🔍 t('searchPlaceholder')`, comboMatch — 이름·코드·국가 영문/현지명·통화) → '활성 언어'(`activeLangs`, 국기·locale_nm·**통화 + 1 USD 환율**·현재 ✓, `role="option"`) → '전체 국가'(`allCountries`, 비활성 국가 영문 + 현지명·통화·환율, 선택 불가).
- 데이터 : idle 시점 프리페치(`requestIdleCallback`, 미지원 300ms) → `/api/i18n/countries` + `/api/exchange-rates`, 모듈 메모리 + sessionStorage `langSwitcher:v2` 10분 캐시. 로딩 중 `t('common.fetching')`.
- 전환 : `localStorage.preferred_locale = next` → `/admin` 이면 (티켓) + `window.location.assign('/<next>/admin…')`, 그 밖은 `router.replace(pathname, { locale: next })`.
- 시세칩 : `/api/pi-price` × `/api/exchange-rates` → `π <가격> <통화>`(LOCALE_CURRENCY, 없으면 USD), 조회 실패면 숨김.

### 4.4 `@pi/i18n/routes` — API 3종 (loginpi 같은 경로·응답)

| 경로 | 처리기 | revalidate | 응답 |
|---|---|---|---|
| `/api/i18n/countries` | `countriesGET` | 600 | `{ locales, countries }` — 스냅숏(loginpi 는 DB 조회) |
| `/api/exchange-rates` | `exchangeRatesGET` | 900 | `{ rates, updated }` · 실패 `{ rates: {}, updated: null }` (open.er-api.com USD) |
| `/api/pi-price` | `piPriceGET` | 300 | `{ usd }` · 실패 `{ usd: null }` (CoinGecko pi-network) |

외부 호출에는 `AbortSignal.timeout(2000)` 을 겁니다(루트 CLAUDE.md R-P4 — loginpi 는 타임아웃 없음, 응답·캐시 값은 같음). Next 세그먼트 설정은 재수출이 안 되므로 `revalidate` 는 앱 route.ts 에 직접 씁니다(8절).

### 4.5 CLI `pi-i18n`

```json
"i18n:translate": "pi-i18n translate",
"i18n:expand": "pi-i18n expand",
"i18n:validate": "pi-i18n validate",
"i18n:audit": "pi-i18n audit",
"build": "pi-i18n validate && next build --turbopack"
```

```
pi-i18n translate [--langs <a,b>] [--force] [--dry-run] [--batch 250] [--concurrency 6] [--model gemini-2.5-flash]
  언어 단위(en → messages/en.json, 그 밖 → messages/lang/<언어>.json). --locales 도 언어 코드로 받음(구 이름). 끝나면 expand 자동 실행
pi-i18n expand
  routing locale 마다 언어 소스를 messages/<locale>.json 으로 복사(내용이 같으면 안 씀). 소스 없는 언어·매핑 null locale 은 만들지 않음(폴백)
pi-i18n validate [--langs <a,b>] [--strict] [--verbose]
  언어 소스 검사(5.4절) + locale 파일이 소스와 바이트 같음(아니면 '… pnpm i18n:expand' 오류) + routing·카탈로그 밖 파일 오류 + `src/app/[locale]/` 경로 세그먼트가 routing locale 코드와 같으면 오류(8.1절). 오류 1건 이상 = 종료코드 1
pi-i18n audit [--src src] [--md <file>] [--json]
pi-i18n snapshot [--root <loginpi 루트>]      (저장소 루트에서, 패키지 관리자만) — 2.3절
```

### 4.6 배치·표시 규칙 (필수 — 마스터 지시 2026-10-31)

1. **언어 콤보는 모든 앱의 상단 헤더(최상단 메뉴) 맨 오른쪽**에 둡니다. 헤더 내비의 **마지막 두 항목 = `<LanguageSwitcher/>` → `<PiPriceChip/>`** (loginpi `header.tsx` 와 같은 순서). 헤더가 있는 모든 화면, 데스크톱·모바일 모두.
2. **하단 메뉴 바·푸터·사이드 메뉴에 두지 않습니다.** (화면 아래쪽 버튼은 드롭다운이 위로 잘림 — loginpi 는 상단 고정)
3. **국기와 환율을 반드시 표시합니다.** 버튼 = 국기 + 코드, 목록 = 국기 + 이름 + 통화 + 1 USD 환율. `showPiValuation` 은 기본 `true` — 앱 헤더가 `process.env.NEXT_PUBLIC_FEATURE_PI_PRICE !== 'false'` 로 넘깁니다(`'false'` = 통화·환율·시세칩 숨김 비상 스위치). loginpi 는 같은 env 를 긴급 override 로 쓰고 기본은 tier(운영 숨김 — 등재 레드라인 A-5)로 판정합니다 — 메인넷 등재 심사 때 같은 판단이 필요하면 env 로 끕니다.
4. 원화 등 법정화폐는 **표시용 환산**이고 결제·청구는 Pi 금액만입니다(메모리 규칙).
5. **헤더는 한 줄 고정**(loginpi `h-14`·줄바꿈 없음). `flex-wrap` 금지 — 줄이 늘면 콤보가 최우상단에서 내려가고, 모바일 드롭다운(`fixed top-[3.75rem]` = 한 줄 헤더 기준)이 헤더 아래 줄을 덮습니다. 폭이 모자라면 가운데 텍스트 메뉴를 줄이거나 가로 스크롤(`min-w-0 flex-1 overflow-x-auto whitespace-nowrap`)로 두고, 콤보·시세칩 묶음은 `shrink-0` 으로 줄이지 않습니다(예 : sitemap.pi `site-header.tsx`). 드롭다운이 잘리므로 콤보를 `overflow` 컨테이너 안에 넣지 않습니다.

### 4.7 loginpi 와 다른 유일한 동작 — 재방문 자동 전환

- loginpi 스위처는 마운트 effect 에서 `preferred_locale` 을 읽어 `router.replace` 로 1회 전환합니다. 표준은 이 effect 를 **빼고** `[locale]/layout.tsx` `<body>` 맨 앞의 `<PreferredLocaleScript locales={routing.locales} />` 가 HTML 파싱 중(하이드레이션·Pi SDK 로드 전) 같은 키·같은 제외 경로(`/admin`·`/auth/pi/callback`)로 `location.replace` 합니다.
- 이유(2026-10-31 검토) : 마운트 뒤 locale 세그먼트가 바뀌면 `[locale]` 트리가 다시 마운트되어 이미 시작된 `Pi.authenticate`·미완료 결제 복구·`/api/auth/pi` POST 가 **두 번** 돕니다(핵심 가치 1·2 위험). 사용자 눈에 보이는 결과(저장한 언어로 열림)는 같습니다.
- 그 밖의 차이는 없습니다 : 내비게이션 훅 주입(패키지 구조), `/admin` 티켓 선택화(앱마다 관리자 인증이 다름), API 타임아웃 2초(R-P4), RTL `dir`(4.1).

---

## 5. 번역 규칙 (translate CLI)

### 5.1 처리 절차

1. `messages/ko.json` 을 점 경로로 펼칩니다(`a.b.c`). 배열은 원소마다 `a.list.0` 처럼 펼치고, 다시 조립할 때 ko 의 모양을 따라 배열로 되돌립니다. 빈 문자열 키는 대상에서 뺍니다.
2. 언어마다(en·lang/<언어>.json) **대상 키 = 언어 파일에 없는 키 ∪ 상태 해시(sha1 앞 12자)가 현재 ko 값과 다른 키**입니다(`--force` 이면 전부). 파일에 값은 있는데 상태가 없는 키(사람이 먼저 쓴 번역, 예 : seminar.pi 의 기존 en.json)는 다시 번역하지 않고 현재 ko 해시로 **채택**합니다.
3. **ko 에 없는 키는 locale 파일과 상태에서 지웁니다**(폐기 키 자동 정리).
4. 대상 키를 250개씩 묶어 Gemini 에 보냅니다. 동시 요청은 6개입니다. 응답을 받을 때마다 **배치 단위로 locale 파일과 상태를 바로 저장**하므로, 도중에 중단되어도 다시 실행하면 이어서 진행합니다.
5. 키마다 검증합니다(5.4절). 통과한 키만 씁니다. **탈락한 키는 쓰지 않고**(loginpi 처럼 en 값을 대신 넣지 않습니다) 로그에 남깁니다. 실행 중에는 폴백이 화면을 메우고, 다시 실행하면 재시도합니다.
6. 마지막에 언어별 `번역 N · 탈락 N · 삭제 N` 을 출력하고 `expand` 로 routing locale 파일을 다시 펼칩니다.

### 5.2 공용 용어집 (번역 금지, 원형 그대로)

`Pi`, `π`, `Pi Network`, `Pi Browser`, `Pi Wallet`, `PyCafé™`, `PyShop™`, `PyTranslate™`, `seminar.pi`, `schema.pi`, `sitemap.pi`, `cafe.pi`, `Galápagos`, `Bean`, `A2U`, `U2A`, `txid`, `KYC`, `Testnet`, `Mainnet`, `Google`, 기술 약어 `API`·`JSON`·`DB`·`SQL`·`DDL`·`ERD`·`HTML`·`URL`·`ICU`

여기에 앱의 `i18n.config.json` `glossary` 를 더합니다. 코드 식별자(`snake_case`·`camelCase`·백틱 안 문자열)·URL·이메일은 용어집에 없어도 그대로 둡니다.

### 5.3 프롬프트 규칙

- 지시 언어명은 카탈로그에서 바로 만듭니다(`${englishName} (${nativeName}, BCP-47 ${code})`). 국가 매핑을 거치지 않습니다.
- 요청 형식은 `generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }` 이고 입력은 `{ "<key>": "<ko 문구>" }` JSON 객체입니다. 출력도 같은 키를 가진 JSON 객체만 받습니다.
- 시스템 지시(요지) :
  1. 값만 번역하고 키는 바꾸지 않습니다.
  2. ICU 문법을 그대로 지킵니다. `{name}` 의 변수명, `plural`·`select`·`selectordinal` 키워드, `#`, `=0` 같은 정확값 선택자, select 의 선택지 키(`male`·`other` 등)는 바꾸지 않습니다. plural 범주는 **대상 언어의 CLDR 범주**에 맞게 바꿔도 되지만 `other` 는 반드시 남깁니다.
  3. `<b>…</b>`, `<link>…</link>` 같은 태그는 이름과 짝을 그대로 두고 안쪽 글만 번역합니다.
  4. 용어집 단어는 원형 그대로 둡니다(™·é 포함).
  5. UI 문구이므로 짧고 자연스럽게 씁니다. 영어에서 온 한국어 외래어는 그 언어의 자연스러운 표현이나 영어 원어로 옮깁니다.
  6. 마크다운 없이 JSON 만 돌려줍니다.
- en 이외 locale 에는 en 값을 뜻 참고용으로 함께 보냅니다. 단 **그 키의 en 이 현재 ko 원문 기준일 때만**(상태 해시 `state.en[k]` = 현재 ko 해시) 넣습니다. 같은 실행에서 en 이 먼저 갱신되면 갱신본을 씁니다. ko 가 바뀐 키에 옛 영어 뜻이 따라가 다른 언어가 틀린 뜻으로 굳는 것(해시가 같아져 재번역도 안 됨)을 막기 위해서입니다.
- 일반 인자 `{x}` 를 number·plural 로 바꾸지 말라고 지시합니다(셈 이름 `numericArgs` 만 예외, 5.4절).
- 키 : 환경변수 `GEMINI_API_KEY` → 앱 `.env.local` → 저장소 루트 `.env.local` 순으로 **스크립트 안에서만** 찾습니다. 값은 절대 출력하지 않습니다.
- 재시도 : 429 는 60초 간격으로 최대 5회, 그 밖의 오류는 10초 간격으로 3회 기다립니다. 요청마다 `AbortSignal.timeout(420_000)` 을 겁니다(Node fetch hang 사고).

### 5.4 키 단위 검증 (translate 와 validate 공통 규칙)

| 검사 | 방법 | translate | validate |
|---|---|---|---|
| JSON 형식 | 파싱 | — | **오류** |
| ICU 파싱 가능 | `@formatjs/icu-messageformat-parser` | 탈락 | **오류** |
| 변수 집합 일치 | 인자 이름이 ko 와 같고 형식이 호환. number·plural 은 같은 숫자형, ko 숫자형 → 번역 일반 인자는 허용. **ko 일반 인자 `{x}` → 번역 number·plural 은 `x` 가 셈 이름(`numericArgs` — 기본 n·count·num·total + `i18n.config.json` `numericArgs`)일 때만 허용**(문자열 값 '3.5 Pi' 가 NaN 으로 찍히는 것 방지). select·date·time 은 엄격 | 탈락 | **오류** |
| select 선택지 | 선택지 키 집합이 ko 와 같음 | 탈락 | **오류** |
| plural 범주 | `other` 있음 + 각 범주가 `Intl.PluralRules(<언어 코드>)` 범주(locale `am` 은 언어 `hy` 기준)이거나 `=N` | 탈락 | **오류** |
| 태그 짝 | 태그 이름 다중집합이 ko 와 같음 | 탈락 | **오류** |
| ko 에 없는 키(extra) | 키 집합 비교 | (자동 삭제) | **오류** |
| 빈 값 `""` | — | 탈락 | **오류** |
| 용어집 보존 | ko 에 있는 용어가 번역에도 그대로 있음 | 탈락 | 경고 |
| 한글 혼입 | `/[가-힣ㄱ-ㆎ]/` (ko 가 아닌 파일) | 탈락 | 경고 |
| 누락 키 | ko 에는 있는데 locale 에 없음 | (대상) | 경고 (`--strict` 이면 오류) |
| 카탈로그·routing 밖 파일 | `messages/lang/xx.json` 이 카탈로그·`languages` 에 없음 / `messages/xx.json` 이 routing 에 없음 | — | **오류** |
| expand 미동기 | `messages/<locale>.json` 이 언어 소스와 바이트가 다름(손으로 고침·expand 안 함) | — | **오류** |
| 메타 키 | `_` 로 시작하는 키 | — | 경고 |

validate 는 오류를 언어(또는 locale)·키별로 한 줄씩 출력하고, 마지막에 언어별 `누락 N · 오류 N · 경고 N` 표와 파일 없는(폴백) locale 목록를 보여 줍니다. 빌드 게이트이므로 실행이 빨라야 합니다. 네트워크는 쓰지 않습니다.

### 5.5 audit CLI (하드코딩 한글 감사)

- 대상은 `--src` 아래 `.ts`·`.tsx` 이고 `audit.exclude` 에 걸린 파일은 뺍니다.
- 앱에 설치된 `typescript` 의 스캐너로 토큰을 나눕니다. **주석은 빼고** 문자열 리터럴·템플릿·JSX 텍스트에 한글이 있으면 1건으로 셉니다.
- 줄 끝에 `// i18n-ignore` 가 있는 줄은 건너뜁니다. 정당하게 남는 한글(Pi 결제 memo·AI 프롬프트·DB 저장값·보안 폴백)에 표시합니다.
- 출력은 파일별 건수(내림차순)·합계입니다. `--md` 는 `| 파일 | 건수 | 첫 예시 |` 표로 저장합니다(schema.pi 백로그 `sitemap/schema.pi/docs/I18N_BACKLOG.md`).

---

## 6. Pi Browser 제약 (위반하면 무한 루프나 인증이 깨짐)

1. **언어 선택에 쿠키를 쓰지 않습니다.** `createRouting` 은 `localeDetection: false`·`localeCookie: false` 로 고정합니다.
   - 이유 : Pi Browser 는 `NEXT_LOCALE` 쿠키를 저장하지 않습니다. 그래서 감지를 켜 두면 방문할 때마다 Accept-Language 로 다시 `/en` 리다이렉트가 나갑니다. 사용자가 ko(접두사 없는 `/`)를 고르면 `/` → `/en` → 스위처가 `/` 로 되돌림 → … 처럼 **왕복 루프**가 생길 수 있습니다.
   - 결과 : URL 접두사(`/en/...`)와 localStorage `preferred_locale` 만 locale 을 정합니다. 접두사가 없으면 늘 ko 입니다.
2. **기억은 localStorage `preferred_locale` 하나만** 쓰고, 다음 방문 때 `PreferredLocaleScript` 가 하이드레이션 전에 한 번 적용합니다(4.7절). sessionStorage·쿠키는 쓰지 않습니다. 접근은 모두 try/catch 로 감쌉니다(막힌 환경이면 기억 기능만 꺼짐).
3. **자동 적용 제외 경로** : `/admin`(인증 경합), `/auth/pi/callback`(1회용 OAuth state 경합, 2026-07-08 사고)입니다. 앱에 경합하는 경로가 더 있으면 `PreferredLocaleScript` 의 `exclude` 에 더합니다.
4. **사용자 전환은 클라이언트 내비게이션**(`router.replace`)으로 합니다. 예외는 둘 : 재방문 적용(`PreferredLocaleScript`)의 `location.replace`(하이드레이션 전이라 안전)와 loginpi 와 같은 `/admin` 전환의 `window.location.assign`(Pi Browser 는 쿠키가 없어 `adminTicketUrl` 로 받은 `_pit` 티켓을 URL 에 실어 첫 요청부터 인증 — 앱이 티켓 경로를 줄 때만). 마운트 뒤 자동 `router.replace` 는 금지합니다(인증 이중 실행). localStorage 의 `pi_token` 은 그대로이므로 `piFetch`(X-Pi-Token)는 영향을 받지 않습니다.
5. **세션이 null 이어도 locale 때문에 redirect 하지 않습니다.** locale 처리는 미들웨어/proxy 의 next-intl 접두사 처리 하나뿐이고 인증 게이트와 섞지 않습니다.
6. **`app/api` 는 locale 밖에 둡니다.** proxy matcher 에서 `api` 를 빼고, API 라우트는 `[locale]` 아래로 옮기지 않습니다(schema.pi 이관 규칙).
7. Pi Browser 판정에 UA 를 쓰지 않습니다(CLAUDE.md). 스위처는 UA 로 분기하지 않습니다.

---

## 7. 앱 연결 규칙

- **proxy(미들웨어) matcher** 는 Next 가 정적 리터럴을 요구하므로 locale 목록을 직접 쓰지 않습니다. 기본은 `'/((?!api|_next|_vercel|.*\\..*).*)'` 입니다. 점이 들어간 동적 경로는 `'/:locale/s/:path*'` 처럼 이름 있는 세그먼트로 받습니다(`'/(ko|en)/…'` 하드코딩 금지 — locale 을 늘리면 놓칩니다).
- **`[locale]/layout.tsx`** : `<html lang={locale} dir={getDir(locale)}>` 로 쓰고(next-themes 등 테마를 쓰는 앱만 `suppressHydrationWarning` 추가), 알 수 없는 locale 은 `notFound()` 로 처리합니다(redirect 금지).
- **정적 생성** : `generateStaticParams` 는 `[{ locale: 'ko' }, { locale: 'en' }]` 만 반환합니다. 나머지 217개 locale 은 첫 요청 때 렌더하고 캐시합니다. 219개 × 전 페이지 사전 렌더로 빌드 시간이 폭증하는 것을 막기 위해서입니다.
- **파일 트레이싱** : readFile 로 읽으므로 `next.config.ts` 에 `outputFileTracingIncludes: { '/**/*': ['./messages/*.json'] }` 을 넣습니다(앱의 기존 항목과 합침, `messages/lang/` 은 넣지 않음 — 런타임은 펼친 locale 파일만 읽음). 넣은 뒤에는 `pnpm build` 후 `.next` 트레이스에 messages 가 들어갔는지 확인합니다.
- **RTL 레이아웃** : 새 코드는 `ml-*`/`mr-*`·`left-*`/`right-*` 대신 논리 속성 `ms-*`/`me-*`·`start-*`/`end-*` 를 씁니다(Tailwind v4 기본 지원). 방향 아이콘(화살표)은 `rtl:rotate-180` 으로 뒤집습니다.
- **번들 크기** : `NextIntlClientProvider` 는 현재 locale 의 메시지 전체를 직렬화합니다. 키가 수천 개가 넘는 앱은 클라이언트 컴포넌트가 쓰는 네임스페이스만 `messages={pick(...)}` 으로 넘기는 것을 검토합니다(sitemap.pi 350키·seminar.pi 859키 규모에서는 불필요).
- **API 오류 문구** : 서버는 사람이 읽는 문장 대신 `code` 를 돌려주고, 화면이 `t('apiErrors.<code>')` 로 표시합니다(loginpi `apiError(code)` 패턴). 기존 API 를 한꺼번에 바꾸지는 않고, 새 API 부터 적용합니다.
- **숫자·날짜** : `useFormatter()`(next-intl)를 씁니다. 원화는 표시용 환산이고 결제는 Pi 금액입니다(메모리 규칙).


---

## 8. 새 프로젝트 적용 (체크리스트)

> 대상 : pnpm workspace 안의 Next.js 16 App Router 앱. 8.2절은 0.1(언어코드 67개) 앱을 2.0 으로 옮기는 순서입니다.

### 8.1 새 앱

**1단계 — 의존성·scripts**
- [ ] dependencies `"@pi/i18n": "workspace:*"`, `"next-intl": "^4.13.0"` → `pnpm install`. scripts 4.5절(`build` 앞 `pi-i18n validate &&`).

**2단계 — 설정·i18n 파일**
- [ ] `i18n.config.json`(3.2절, 보통 `locales`·`languages` 모두 `"all"`).
- [ ] `src/i18n/routing.ts` → `export const routing = createRouting({ locales: config.locales as CreateRoutingOptions['locales'] })`
- [ ] `src/i18n/request.ts` → `export default createRequestConfig({ routing, loadSource: () => import('../../messages/ko.json') })`
- [ ] `src/i18n/navigation.ts` → `export const { Link, redirect, usePathname, useRouter } = createNavigation(routing)`
- [ ] `next.config.ts` : `createNextIntlPlugin('./src/i18n/request.ts')` + `outputFileTracingIncludes: { '/**/*': ['./messages/*.json'] }` (**`messages/*.json` 만** — `lang/` 은 빌드·런타임이 읽지 않으므로 넣지 않음).
- [ ] `globals.css` : `@source '<앱에서 packages 까지>/pi-i18n/src';` + shadcn 토큰(`--background`·`--foreground`·`--muted`·`--muted-foreground`·`--border`·`--primary`)이 정의돼 있어야 콤보가 loginpi 와 같은 색으로 보입니다.

**3단계 — 라우팅·레이아웃·API**
- [ ] **경로 세그먼트 이름이 routing locale 코드(2.2절 219개)와 겹치면 안 됩니다** — `localePrefix: 'as-needed'` 라 `/me`(몬테네그로)·`/ad`(안도라)·`/am`·`/in` 등은 locale 로 해석돼 기본 locale 사용자가 그 언어 홈을 봅니다. `validate` 가 `src/app/[locale]/` 바로 아래(라우트 그룹 `(x)` 안 포함) 이름을 검사해 오류로 막습니다(sitemap.pi `/me`→`/my`, `/ad`→`/slot` 개명 사례).
- [ ] 페이지를 `src/app/[locale]/` 아래로(`app/api` 는 밖). 루트 layout 은 `return children`, 루트 `not-found.tsx` 는 `<html><body>` 포함.
- [ ] 화면 코드의 `next/link`·`next/navigation` 을 `@/i18n/navigation` 으로.
- [ ] `[locale]/layout.tsx` : `<html lang={locale} dir={getDir(locale)}>`·`setRequestLocale`·`NextIntlClientProvider`·`generateStaticParams`(ko·en), `<body>` 맨 앞 `<PreferredLocaleScript locales={routing.locales} />`. (flag-icons CSS 는 스위처가 직접 불러오므로 layout import 불필요 — 넣어도 무해)
- [ ] `src/proxy.ts` `createMiddleware(routing)`(matcher 7절).
- [ ] API 3개 (그대로 복사) :

```ts
// src/app/api/i18n/countries/route.ts — 언어 콤보 활성 locale·국가마스터(loginpi DB 스냅숏)
export { countriesGET as GET } from '@pi/i18n/routes'
export const revalidate = 600
```
```ts
// src/app/api/exchange-rates/route.ts — 1 USD 기준 환율(open.er-api.com, 2초 타임아웃)
export { exchangeRatesGET as GET } from '@pi/i18n/routes'
export const revalidate = 900
```
```ts
// src/app/api/pi-price/route.ts — π USD 시세(CoinGecko, 2초 타임아웃)
export { piPriceGET as GET } from '@pi/i18n/routes'
export const revalidate = 300
```

**4단계 — 헤더 (4.6절 규칙)**

```tsx
// src/components/language-switcher.tsx — 표준 언어 콤보를 이 앱 내비게이션에 연결
'use client'
import { createLanguageSwitcher } from '@pi/i18n/client'
import { piFetch } from '@pi/auth/client' // Pi 인증을 쓰는 앱만 — 없으면 fetcher 생략
import { usePathname, useRouter } from '@/i18n/navigation'

export const LanguageSwitcher = createLanguageSwitcher({ usePathname, useRouter, fetcher: piFetch /* , adminTicketUrl: '/api/admin/pit-ticket' (있는 앱만) */ })
```
```tsx
// 상단 헤더(서버 컴포넌트) — 내비 맨 끝 두 항목
import { getLocale } from 'next-intl/server'
import { PiPriceChip } from '@pi/i18n/client'
import { LanguageSwitcher } from '@/components/language-switcher'

const locale = await getLocale()
const showPiValuation = process.env.NEXT_PUBLIC_FEATURE_PI_PRICE !== 'false' // 기본 표시 · 'false' = 비상 숨김
// …
<nav className="flex items-center gap-3">
  {/* 로그인·테마 등 앱 항목 */}
  <LanguageSwitcher locale={locale} showPiValuation={showPiValuation} />
  {showPiValuation && <PiPriceChip locale={locale} />}
</nav>
```
- [ ] `NEXT_PUBLIC_FEATURE_PI_PRICE` 를 쓰는 앱은 `src/env.ts`·`.env.example` 에 선택 항목(`'true' | 'false'`)으로 추가.
- [ ] 메시지 키 추가 불필요 — `langSwitcher.*`·`common.fetching` 은 `@pi/i18n/server` 가 loginpi 원문으로 넣어 줍니다(앱이 같은 키를 두면 앱 값 우선). 0.1 의 `common.localeSwitcher.*` 는 0.1 스위처를 지운 뒤 삭제.

**5단계 — 번역·검증·실기기**
- [ ] `pnpm i18n:audit` → 공통 화면부터 `ko.json` 키로.
- [ ] `pnpm i18n:translate --dry-run` → `pnpm i18n:translate`(expand 자동) → `pnpm i18n:validate` 오류 0 → `pnpm exec tsc --noEmit` → `pnpm build`.
- [ ] `messages/**`·`.i18n-state.json`·`i18n.config.json` 커밋.
- [ ] **Pi Browser 실기기** : 로그인·결제·헤더 우상단 콤보(국기·환율)·전환(ko↔ae RTL↔am)·재방문 기억·시세칩. 확인 전에는 완료 아님.

### 8.2 0.1 앱 이행 (seminar.pi·sitemap.pi·schema.pi)

1. `messages/` 의 `ko.json`·`en.json`·`.i18n-state.json` 은 그대로, **나머지 `*.json`(언어 65개)를 `messages/lang/` 으로 이동**(`git mv` — 상태 파일 키가 이미 언어 코드라 해시가 그대로 이어짐).
2. `i18n.config.json` : 언어 부분집합을 쓰던 앱은 그 배열을 `languages` 로 옮기고 `locales` 는 `"all"`.
3. `pnpm i18n:expand` → `messages/<locale>.json` 187개 생성 → `pnpm i18n:validate` 오류 0.
4. routing·request·navigation 은 코드 그대로(`createRouting` 기본이 219개로 바뀜). `getDir(locale)` 도 그대로.
5. API 3개 추가(8.1 3단계), 헤더 교체(8.1 4단계) — **하단 메뉴 바에 있던 스위처는 제거**(seminar.pi `site-header.tsx` 하단 바), 0.1 `AppLocaleSwitcher`·`common.localeSwitcher.*` 삭제.
6. `next.config.ts` 트레이싱은 `./messages/*.json` 그대로(lang/ 제외 확인).
7. `pnpm exec tsc --noEmit` → `pnpm build` → 실기기(8.1 5단계).

---

## 9. 운영 흐름 (평소)

| 상황 | 할 일 |
|---|---|
| 문구 추가·수정 | `ko.json` → `pnpm i18n:translate`(expand 자동) → `pnpm i18n:validate` → `pnpm build` → 커밋 |
| 문구 폐기 | `ko.json` 에서 **삭제** → translate(언어 파일에서도 삭제 + expand) |
| 번역 손질 | `messages/en.json`·`messages/lang/<언어>.json` 을 고친 뒤 `pnpm i18n:expand`. **`messages/<locale>.json` 은 고치지 않습니다**(validate 오류) |
| loginpi 데이터 변경(locale 활성·국가·routing·문구) | 패키지 관리자가 `pi-i18n snapshot` → 시험 → 커밋 → 각 앱 `pnpm i18n:expand`(매핑이 바뀐 경우) |
| 하드코딩 점검 | `pnpm i18n:audit --md docs/I18N_BACKLOG.md` |

---

## 10. loginpi(cafe.pi) 와의 관계

- **같은 것** : routing locale 219개·순서·`ko`·`as-needed`, locale → 언어(내용 기준 판정), 활성 locale·국가마스터 데이터, 언어 콤보 UI 전부(국기 flag-icons·통화·환율·검색·두 섹션·캐시·프리페치·모바일 고정 패널·listbox 역할), π 시세칩, API 3종 경로·응답·revalidate, 스위처 문구 원문, `preferred_locale` 키·제외 경로, 3단 병합·readFile, 헤더 맨 끝 배치.
- **다른 것(이유가 있는 것만)** : 재방문 전환 시점(4.7절 — 유일한 동작 차이), 내비게이션 주입·`/admin` 티켓 선택화(구조), 외부 API 2초 타임아웃(R-P4), `dir`(RTL 표시), 감지·쿠키 끔(Pi Browser — loginpi 는 next-intl 기본값), DB 대신 스냅숏·번역은 파일·해시 증분(앱에 DB 없음), `showPiValuation` 기본 표시(마스터 지시, env 로 끔).
- **loginpi 자체는 바꾸지 않습니다.** 표준이 loginpi 를 따라가며, loginpi 가 바뀌면 snapshot 으로 맞춥니다.

---

## 11. 한계·후속

| # | 한계 | 영향 | 후속 |
|---|---|---|---|
| L1 | locale 은 빌드 때 고정(P4) | 추가는 재배포 | — |
| L2 | 감지를 껐으므로 접두사 없는 첫 방문은 ko | 외국어 사용자는 한 번 직접 고름 | 필요 시 `navigator.languages` 제안 옵션 |
| L3 | 기계번역 품질 | 어색한 표현 | 언어 파일 손질(해시가 보존) |
| L4 | 스냅숏은 손으로 갱신 | loginpi 관리자 화면에서 locale 을 켜도 앱엔 다음 snapshot 까지 미반영 | 주기 점검 또는 CI 에서 snapshot diff |
| L5 | 공유 언어 국가는 같은 파일 사본(영어 48·스페인어 20…) | 저장소 용량·diff 증가(내용이 같으면 expand 가 쓰지 않음) | — |
| L6 | `showPiValuation` 기본 표시 | 메인넷 등재 심사(A-5 가치평가 노출)에 걸릴 수 있음 | 심사 때 `NEXT_PUBLIC_FEATURE_PI_PRICE=false` |
| L7 | 매핑 `null` 30개 locale 은 영어로 보임 | loginpi 와 같음 | loginpi 가 파일을 만들면 snapshot 으로 따라감 |
| L8 | messages 트레이싱을 빠뜨리면 운영에서 ko 로만 보임 | 조용한 실패 | 운영 URL `/en` 확인 |
| L9 | `@pi/i18n` 은 private 워크스페이스 패키지 | 모노레포 밖 저장소는 복사 필요 | — |

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-31 | v2.0.1 — validate 에 경로 세그먼트 ↔ routing locale 충돌 검사(8.1절, sitemap.pi `/me`·`/ad` 회귀), 헤더 한 줄 고정 규칙(4.6절 5) |
| 2026-10-31 | **v2.0.0 loginpi 완전 동일화** (마스터 "흉내내지말고, 완전히 동일하게") — routing locale 219개(loginpi 목록·순서) + locale → 언어 매핑(내용 판정), 언어 소스 `messages/lang/` + `expand` CLI, DB 스냅숏(`snapshot` CLI, locales 188·countries 188·스위처 문구), loginpi LanguageSwitcher·PiPriceChip·locale-currency/country·comboMatch 이식, API 처리기 3종(`@pi/i18n/routes`, 2초 타임아웃), 배치·표시 규칙 4.6절(상단 헤더 맨 오른쪽·국기·환율 필수·하단 금지), 유일한 동작 차이 4.7절, 0.1 앱 이행 8.2절. 이전 v1.x 의 'locale = 언어코드(P1)'·'스위처는 네트워크 없음' 규칙은 폐기 |
| 2026-10-31 | v1.0.3 최종 검토 반영 — 루트 not-found·내비게이션 교체, routing 타입 단언, `pnpm exec tsc`, loginpi 화면 차이(REA) |
| 2026-10-31 | v1.0.2 — 재방문 적용을 `PreferredLocaleScript`(하이드레이션 전)로 이동, `numericArgs`, 옛 en 참조 제외 |
| 2026-10-31 | v1.0.1 — 기존 번역 채택 규칙, 숫자형 인자 동일 취급, validate `--verbose`, `@source` |
| 2026-10-31 | v1.0 최초 작성 — 카탈로그 67개, RTL 6개, 감지·쿠키 끔, 해시 증분 번역, ICU 구조 검증, audit |
