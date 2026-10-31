# Pi 앱 다국어 표준 (`@pi/i18n`) v1.0

> 정본. loginpi(cafe.pi)의 다국어 방식을 다른 Pi 앱에서도 그대로 쓸 수 있게 공용 패키지로 묶은 표준입니다.
> 입력 자료 : `docs/i18n/LOGINPI_I18N_ANALYSIS.md`(loginpi 분석, 2026-10-31) · 마스터 결정 D1~D8.
> 1차 구축 seminar.pi, 2차 구축 sitemap.pi(전면 적용)·schema.pi(기반 + 공통 화면 문구). 짧은 안내는 `packages/pi-i18n/README.md` 에 있습니다.

---

## 0. 한눈에 보기

```
ko.json(정본) ──키 추가──▶ pnpm i18n:translate (Gemini, 바뀐 키만) ──▶ messages/<locale>.json
                                                            │
                                pnpm i18n:validate (ICU 일치 = 오류) ◀┘
                                                            │
                                pnpm build (validate 포함) ──▶ 배포
런타임 : 요청 locale → ko ⊕ en ⊕ locale 깊은 병합 → NextIntlClientProvider
화면   : <LocaleSwitcher> → router.replace(path, { locale }) + localStorage 'preferred_locale'
재방문 : <PreferredLocaleScript>(layout body 맨 앞) → 하이드레이션·Pi 인증 전에 저장 locale 로 1회 이동
```

- **DB 를 쓰지 않습니다.** 정본은 저장소의 `messages/ko.json` 하나뿐이고 번역 결과도 파일로 git 에 들어갑니다. loginpi 의 `i18n_message` 테이블처럼 정본이 두 곳으로 나뉘어 생기던 운영 부담이 없습니다.
- 앱 쪽 코드는 `src/i18n/` 아래 짧은 파일 3개와 스위처 래퍼 1개입니다. 나머지는 패키지가 맡습니다.

---

## 1. 원칙

| # | 원칙 | 근거 |
|---|---|---|
| P1 | **locale = 언어코드**(BCP-47 language, 필요할 때만 지역 접미 `zh-TW`). 국가코드는 쓰지 않습니다 | loginpi 국가코드 파일을 언어로 오인한 사고(et=암하라어, am=아르메니아어 등, 분석 3.1절) |
| P2 | **ko.json 이 유일한 정본.** 키는 반드시 ko 에 먼저 추가합니다. ko 에 없는 키가 다른 locale 에 있으면 빌드가 막힙니다 | loginpi validate 의 extra 차단을 이어받음 |
| P3 | **실행 중 폴백은 ko → en → locale 3단계 깊은 병합**이고 배열은 병합하지 않고 통째로 바꿉니다 | loginpi `src/i18n/request.ts` 와 같음. 키 이름이 화면에 그대로 보이는 일을 막음 |
| P4 | **locale 목록은 빌드할 때 고정됩니다.** 실행 중에는 켤 수 없고, 추가하려면 재배포해야 합니다 | next-intl `defineRouting` 의 제약 |
| P5 | **Pi Browser 는 쿠키를 저장하지 않습니다.** 사용자가 고른 언어는 localStorage 에만 기억하고, 미들웨어의 쿠키·Accept-Language 감지는 끕니다 | CLAUDE.md 치명적 제약. 6절 |
| P6 | **번역은 파일 기반으로 바뀐 것만 합니다.** ko 문구가 바뀌면 해시로 감지해 다시 번역합니다 | loginpi 한계 ①(원문 변경 감지 없음) 해소 |
| P7 | **브랜드명·코드 식별자·ICU 문법은 번역하지 않습니다**(용어집 + 검증) | 브랜드 표기 규칙(PyCafé™ 등) |
| P8 | **폐기 키는 삭제합니다.** 빈 값 `""` 은 금지하고, `_` 로 시작하는 메타 키는 쓰지 않습니다(로드할 때 지워 둠) | 번들 직렬화 노출 사고(2026-07-16), 통계 99% 사고 |
| P9 | **RTL 6개 언어(ar·he·fa·ur·dv·ps)는 `<html dir="rtl">`** 로 표시합니다 | loginpi 는 dir 이 없었음(분석 9-7) |
| P10 | 앱은 카탈로그에서 **일부만 골라 쓸 수 있습니다.** 표준 기본값은 카탈로그 전체(67개)입니다 | D2 |

---

## 2. locale 카탈로그 (67개 — loginpi 완역 언어 전수)

- D2 지시에는 '66'이 있었지만 **실측은 ko 를 포함해 67개**입니다(분석 4절). 정본은 `packages/pi-i18n/src/catalog.json` 하나이고 TS 와 CLI 가 함께 읽습니다.
- 순서 : 상위 11개를 고정한 뒤(loginpi 콤보 우선순위, sql/168) 나머지는 `englishName` 알파벳순입니다. 스위처도 이 순서로 보여 줍니다.
- 국기는 **이모지**입니다(의존성 없음). 언어 ≠ 국가이므로 국기는 표시용으로만 씁니다.
- 'loginpi 소스'는 2차 이관 때 참고하는 열입니다. **카탈로그에는 넣지 않습니다.** 하위 앱은 카페 도메인 키를 가져가지 않으므로 이 열은 언어 판정을 확인하는 근거로만 남깁니다.

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

---

## 3. 파일 구성

### 3.1 패키지 `packages/pi-i18n` (`@pi/i18n`)

```
packages/pi-i18n/
├── package.json        name @pi/i18n · type module · bin pi-i18n · 의존 @formatjs/icu-messageformat-parser(이미 설치된 next-intl 의 하위 의존)
├── README.md           짧은 안내 → 이 문서로 연결
├── src/
│   ├── catalog.json    67개 언어 정본 (TS·CLI 가 함께 읽음)
│   ├── index.ts        '.'        : 카탈로그·createRouting·deepMerge  — fs/React 없음 (proxy/edge 에서도 import 가능)
│   ├── server.ts       './server' : createRequestConfig·getMessages  — fs 사용 (서버 전용)
│   └── client.tsx      './client' : LocaleSwitcher ('use client')
└── bin/pi-i18n.mjs     CLI 진입 (translate | validate | audit) — 순수 Node ESM, TS 런타임 불필요
    cli/*.mjs           하위 명령 구현 + 공용 lib(flatten·hash·ICU 비교·env 읽기)
```

`package.json` exports 는 `packages/pi-mon` 과 같은 모양입니다(TS 소스를 직접 내보내고 workspace 앱이 컴파일합니다).

```json
"exports": { ".": "./src/index.ts", "./server": "./src/server.ts", "./client": "./src/client.tsx" },
"bin": { "pi-i18n": "./bin/pi-i18n.mjs" },
"peerDependencies": { "next": "^16", "next-intl": "^4", "react": "^19" }
```

### 3.2 앱 (예 : `sitemap/<app>/`)

```
<app>/
├── i18n.config.json          앱 다국어 설정 (routing·CLI 가 함께 읽는 단일 소스)
├── messages/
│   ├── ko.json               정본 (사람이 편집)
│   ├── <locale>.json         CLI 생성 (사람이 직접 고쳐도 됨 — 해시가 같으면 덮어쓰지 않음)
│   └── .i18n-state.json      CLI 상태 : locale × 키 → ko 원문 해시 (git 커밋)
└── src/
    ├── i18n/routing.ts       createRouting(config)
    ├── i18n/request.ts       createRequestConfig(...)
    ├── i18n/navigation.ts    createNavigation(routing)  ← next-intl 그대로
    └── components/locale-switcher.tsx   LocaleSwitcher 래퍼 (앱 navigation 연결)
```

`i18n.config.json` 의 형식은 아래와 같습니다. 파일이 없으면 기본값을 씁니다.

```json
{
  "locales": "all",
  "glossary": ["seminar.pi"],
  "audit": { "exclude": ["src/app/api/**", "**/*.test.ts"] }
}
```

| 필드 | 형식 | 기본 | 의미 |
|---|---|---|---|
| `locales` | `"all"` 또는 `string[]` | `"all"` | 카탈로그 전체 또는 일부. 배열이면 `ko`·`en` 이 반드시 들어 있어야 함 |
| `glossary` | `string[]` | `[]` | 앱 전용 불변어(공용 용어집 5.2절에 더함) |
| `audit.exclude` | `string[]`(glob) | `[]` | audit 제외 경로 |

---

## 4. 패키지 API (정확한 시그니처)

### 4.1 `@pi/i18n` — 카탈로그·라우팅 (edge 안전)

> fs·React 훅은 없습니다(`PreferredLocaleScript` 서버 컴포넌트만 `react` 를 씀) — proxy/edge 에서 import 해도 안전합니다.

```ts
export type LocaleDir = 'ltr' | 'rtl'

export interface LocaleInfo {
  code: string          // BCP-47 언어코드 ('ko', 'zh-TW' …)
  nativeName: string    // 그 언어로 쓴 이름 (스위처 표시)
  englishName: string   // 영어 이름 (검색·Gemini 지시)
  flag: string          // 국기 이모지 (표시용)
  dir: LocaleDir
}

export type MessageRecord = Record<string, unknown>

/** 카탈로그 전체 (2절 순서) */
export const LOCALE_CATALOG: readonly LocaleInfo[]
/** 카탈로그 전체 코드 목록 = 표준 기본 locales */
export const ALL_LOCALES: readonly string[]
export const DEFAULT_LOCALE = 'ko'
/** 폴백 체인 앞부분 (ko → en → locale) */
export const FALLBACK_CHAIN: readonly ['ko', 'en']

export function getLocaleInfo(code: string): LocaleInfo | undefined
/** 카탈로그에 없으면 'ltr' */
export function getDir(code: string): LocaleDir

export interface CreateRoutingOptions {
  /** 'all' = 카탈로그 전체 (기본). 배열이면 카탈로그에 없는 코드 · ko/en 누락 시 throw (빌드 시점 실패) */
  locales?: 'all' | readonly string[]
  /** 기본 'ko' */
  defaultLocale?: string
}

/**
 * next-intl defineRouting 래퍼. 고정값 :
 *   localePrefix 'as-needed' · localeDetection false · localeCookie false  (6절 Pi Browser)
 */
export function createRouting(
  options?: CreateRoutingOptions,
): ReturnType<typeof import('next-intl/routing').defineRouting>

/** 깊은 병합 — 객체만 재귀, 배열·원시값은 override 가 통째로 교체 */
export function deepMerge(base: MessageRecord, override: MessageRecord): MessageRecord

/** 재방문 적용 — layout <body> 맨 앞. 하이드레이션 전에 저장 locale 로 1회 location.replace (4.3절) */
export function PreferredLocaleScript(props: {
  locales: readonly string[]
  defaultLocale?: string          // 기본 'ko'
  exclude?: readonly string[]     // 기본 ['/admin', '/auth/pi/callback']
  storageKey?: string             // 기본 'preferred_locale'
}): React.JSX.Element
```

### 4.2 `@pi/i18n/server` — 메시지 로딩

```ts
import type { MessageRecord } from '@pi/i18n'

export interface GetMessagesOptions {
  /** ko.json 로더 — 앱이 정적 import 로 넘김 (번들 포함 · 항상 존재) */
  loadSource: () => Promise<MessageRecord | { default: MessageRecord }>
  /** 기본 join(process.cwd(), 'messages') */
  messagesDir?: string
}

/**
 * ko → en → locale 깊은 병합 결과.
 *  - ko : 소스 그대로 / en : ko⊕en / 기타 : (ko⊕en)⊕locale
 *  - en·locale 파일은 readFile (없거나 깨지면 {} — 폴백이 메움)
 *  - 최상위 '_' 로 시작하는 키 제거 (번들 직렬화 노출 방지)
 *  - 운영(NODE_ENV=production)에선 locale 별 결과를 모듈 메모리에 캐시 (R-P2), 개발은 매번 읽음
 */
export function getMessages(locale: string, options: GetMessagesOptions): Promise<MessageRecord>

export interface CreateRequestConfigOptions extends GetMessagesOptions {
  routing: { locales: readonly string[]; defaultLocale: string }
}

/** next-intl getRequestConfig 래퍼 — 요청 locale 이 routing 에 없으면 defaultLocale */
export function createRequestConfig(
  options: CreateRequestConfigOptions,
): ReturnType<typeof import('next-intl/server').getRequestConfig>
```

### 4.3 `@pi/i18n/client` — 스위처

```ts
export interface LocaleSwitcherProps {
  /** 현재 locale — useLocale() */
  locale: string
  /** 표시할 locale — routing.locales (카탈로그 순서로 정렬해 표시) */
  locales: readonly string[]
  /** 전환 실행 — 앱이 next-intl navigation 으로 구현: (l) => router.replace(pathname, { locale: l }) */
  onChange: (next: string) => void
  /** UI 문구 — 앱이 t() 값을 넘김 (기본 영어) */
  labels?: {
    button?: string        // 버튼 aria-label  (기본 'Change language')
    search?: string        // 검색 placeholder (기본 'Search language')
    empty?: string         // 결과 없음        (기본 'No results')
  }
  /** 기본 'preferred_locale' */
  storageKey?: string
  className?: string
}

export function LocaleSwitcher(props: LocaleSwitcherProps): React.JSX.Element
```

동작 규칙은 다음과 같습니다.

- 버튼에는 `국기 + nativeName`(좁은 화면에서는 국기 + 코드)을 보여 주고 `aria-haspopup="listbox"`·`aria-expanded`·`aria-controls` 를 붙입니다.
- 펼침 패널은 `<input type="search">` + `role="listbox"` + `role="option" aria-selected` 로 구성합니다. 검색은 code·nativeName·englishName 부분일치이고 대소문자를 구분하지 않습니다(loginpi `comboMatch` 와 같음).
- 키보드 : ↑/↓ 로 이동, Home/End, Enter 로 선택, Esc 로 닫고 버튼에 포커스를 돌려줍니다. 바깥을 누르면 닫힙니다. 활성 항목은 `aria-activedescendant` 로 알립니다.
- 모바일·Pi Browser : 터치 영역은 44px 이상, 목록 높이는 `max-h` 로 묶고 그 안에서만 스크롤합니다. 열려도 body 스크롤은 잠그지 않습니다(WebView 튐 방지). 항목마다 `dir` 을 붙여 RTL 이름을 바르게 표시합니다.
- 선택하면 `localStorage[storageKey] = next` 를 저장한 뒤(try/catch) `onChange(next)` 를 부릅니다.
- 스위처는 **저장된 값을 자동 적용하지 않습니다.** 재방문 적용은 아래 `PreferredLocaleScript` 가 맡습니다(스위처를 숨기는 화면에서도 적용되도록, 그리고 인증보다 먼저 끝나도록).
- 네트워크 호출은 하지 않습니다(카탈로그가 정적). DB·통화·환율은 다루지 않습니다.

#### `PreferredLocaleScript` (`@pi/i18n`, 서버 컴포넌트) — 재방문 적용

```tsx
// [locale]/layout.tsx — <body> 맨 앞(PiSdkScript 보다 앞)
<PreferredLocaleScript locales={routing.locales} /* exclude 기본 ['/admin', '/auth/pi/callback'] · storageKey 기본 'preferred_locale' · defaultLocale 기본 'ko' */ />
```

- HTML 파싱 중 인라인 스크립트로 **한 번** 실행됩니다. 저장값이 있고, `locales` 에 있고, 현재 URL 의 locale 과 다르고, 제외 경로가 아니면 `location.replace` 로 그 locale 경로(`as-needed` — ko 는 접두사 없음)로 옮깁니다. 쿼리·해시는 보존합니다.
- **왜 스위처 마운트 effect 가 아닌가** (2026-10-31 검토) : ① `[locale]` 세그먼트가 바뀌면 `[locale]/layout.tsx` 아래가 전부 다시 마운트되어, 이미 시작된 `PiAuthProvider` 의 `Pi.authenticate`·미완료 결제 복구(complete/cancel)·`/api/auth/pi` POST 가 **두 번** 돕니다(핵심 가치 1 위험). 스크립트는 하이드레이션·Pi SDK(afterInteractive) 로드 전에 끝나므로 인증은 바뀐 locale 에서 한 번만 시작됩니다. ② 스위처를 숨기는 화면(seminar.pi `/s/*` 방·참가 화면)에서도 적용됩니다.
- 현재 locale = 저장값이면 아무것도 하지 않으므로 루프가 생기지 않습니다. 저장소가 막힌 환경이면 조용히 꺼집니다.

앱 래퍼 예시(`src/components/locale-switcher.tsx`) :

```tsx
'use client'
// 표준 스위처를 이 앱의 next-intl 내비게이션에 연결
import { useLocale, useTranslations } from 'next-intl'
import { LocaleSwitcher } from '@pi/i18n/client'
import { routing } from '@/i18n/routing'
import { usePathname, useRouter } from '@/i18n/navigation'

export function AppLocaleSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('common.localeSwitcher')
  return (
    <LocaleSwitcher
      locale={locale}
      locales={routing.locales}
      onChange={(l) => router.replace(`${pathname}${window.location.search}`, { locale: l })}
      labels={{ button: t('button'), search: t('search'), empty: t('empty') }}
    />
  )
}
```

### 4.4 CLI `pi-i18n`

앱 디렉터리에서 실행합니다(`cwd` = 앱 루트). 앱 `package.json` 에 등록하는 scripts 는 다음과 같습니다.

```json
"i18n:translate": "pi-i18n translate",
"i18n:validate": "pi-i18n validate",
"i18n:audit": "pi-i18n audit",
"build": "pi-i18n validate && next build --turbopack"
```

```
pi-i18n translate [--locales <a,b,...>] [--force] [--dry-run]
                  [--batch <n=250>] [--concurrency <n=6>] [--model <id=gemini-2.5-flash>]
  --locales       대상 locale (기본 : i18n.config 의 전체 − ko)
  --force         해시를 무시하고 전부 다시 번역
  --dry-run       Gemini 를 부르지 않고 locale 별 대상 키 수만 출력
  --batch         요청 1회당 키 수 (기본 250)
  --concurrency   동시 요청 수 (기본 6, 429 가 잦으면 1)
  --model         Gemini 모델

pi-i18n validate [--locales <a,b,...>] [--strict] [--verbose]
  --strict        누락 키도 오류로 (기본은 경고)
  --verbose       경고 상세도 출력 (기본은 오류만 펼치고 경고는 표의 숫자로)
  종료코드 : 오류 0건 = 0, 오류 1건 이상 = 1

pi-i18n audit [--src <dir=src>] [--md <file>] [--json]
  --src           검사 루트 (기본 src)
  --md            결과를 마크다운 표로 저장 (예 : docs/I18N_BACKLOG.md)
  --json          JSON 출력
  종료코드 : 항상 0 (보고 도구)
```

---

## 5. 번역 규칙 (translate CLI)

### 5.1 처리 절차

1. `messages/ko.json` 을 점 경로로 펼칩니다(`a.b.c`). 배열은 원소마다 `a.list.0` 처럼 펼치고, 다시 조립할 때 ko 의 모양을 따라 배열로 되돌립니다. 빈 문자열 키는 대상에서 뺍니다.
2. locale 마다 **대상 키 = locale 파일에 없는 키 ∪ 상태 해시(sha1 앞 12자)가 현재 ko 값과 다른 키**입니다(`--force` 이면 전부). 파일에 값은 있는데 상태가 없는 키(사람이 먼저 쓴 번역, 예 : seminar.pi 의 기존 en.json)는 다시 번역하지 않고 현재 ko 해시로 **채택**합니다.
3. **ko 에 없는 키는 locale 파일과 상태에서 지웁니다**(폐기 키 자동 정리).
4. 대상 키를 250개씩 묶어 Gemini 에 보냅니다. 동시 요청은 6개입니다. 응답을 받을 때마다 **배치 단위로 locale 파일과 상태를 바로 저장**하므로, 도중에 중단되어도 다시 실행하면 이어서 진행합니다.
5. 키마다 검증합니다(5.4절). 통과한 키만 씁니다. **탈락한 키는 쓰지 않고**(loginpi 처럼 en 값을 대신 넣지 않습니다) 로그에 남깁니다. 실행 중에는 폴백이 화면을 메우고, 다시 실행하면 재시도합니다.
6. 마지막에 locale 별 `번역 N · 탈락 N · 삭제 N` 을 출력합니다.

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
| plural 범주 | `other` 있음 + 각 범주가 `Intl.PluralRules(locale)` 범주이거나 `=N` | 탈락 | **오류** |
| 태그 짝 | 태그 이름 다중집합이 ko 와 같음 | 탈락 | **오류** |
| ko 에 없는 키(extra) | 키 집합 비교 | (자동 삭제) | **오류** |
| 빈 값 `""` | — | 탈락 | **오류** |
| 용어집 보존 | ko 에 있는 용어가 번역에도 그대로 있음 | 탈락 | 경고 |
| 한글 혼입 | `/[가-힣ㄱ-ㆎ]/` (ko 가 아닌 파일) | 탈락 | 경고 |
| 누락 키 | ko 에는 있는데 locale 에 없음 | (대상) | 경고 (`--strict` 이면 오류) |
| 카탈로그 밖 파일 | `messages/xx.json` 이 카탈로그·config 에 없음 | — | **오류** |
| 메타 키 | `_` 로 시작하는 키 | — | 경고 |

validate 는 오류를 locale·키별로 한 줄씩 출력하고, 마지막에 locale 별 `누락 N · 오류 N · 경고 N` 표를 보여 줍니다. 빌드 게이트이므로 실행이 빨라야 합니다. 네트워크는 쓰지 않습니다.

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
2. **기억은 localStorage `preferred_locale` 하나만** 쓰고, 다음 방문 때 `PreferredLocaleScript` 가 하이드레이션 전에 한 번 적용합니다(4.3절). sessionStorage·쿠키는 쓰지 않습니다. 접근은 모두 try/catch 로 감쌉니다(막힌 환경이면 기억 기능만 꺼짐).
3. **자동 적용 제외 경로** : `/admin`(인증 경합), `/auth/pi/callback`(1회용 OAuth state 경합, 2026-07-08 사고)입니다. 앱에 경합하는 경로가 더 있으면 `PreferredLocaleScript` 의 `exclude` 에 더합니다.
4. **사용자 전환은 클라이언트 내비게이션**(`router.replace`)으로 합니다. 유일한 예외는 재방문 적용(`PreferredLocaleScript`)의 `location.replace` 로, 인증이 시작되기 전(하이드레이션 전)이라 안전합니다. 마운트 뒤 자동 `router.replace` 는 금지합니다(인증 이중 실행). localStorage 의 `pi_token` 은 그대로이므로 `piFetch`(X-Pi-Token)는 영향을 받지 않습니다.
5. **세션이 null 이어도 locale 때문에 redirect 하지 않습니다.** locale 처리는 미들웨어/proxy 의 next-intl 접두사 처리 하나뿐이고 인증 게이트와 섞지 않습니다.
6. **`app/api` 는 locale 밖에 둡니다.** proxy matcher 에서 `api` 를 빼고, API 라우트는 `[locale]` 아래로 옮기지 않습니다(schema.pi 이관 규칙).
7. Pi Browser 판정에 UA 를 쓰지 않습니다(CLAUDE.md). 스위처는 UA 로 분기하지 않습니다.

---

## 7. 앱 연결 규칙

- **proxy(미들웨어) matcher** 는 Next 가 정적 리터럴을 요구하므로 locale 목록을 직접 쓰지 않습니다. 기본은 `'/((?!api|_next|_vercel|.*\\..*).*)'` 입니다. 점이 들어간 동적 경로는 `'/:locale/s/:path*'` 처럼 이름 있는 세그먼트로 받습니다(`'/(ko|en)/…'` 하드코딩 금지 — locale 을 늘리면 놓칩니다).
- **`[locale]/layout.tsx`** : `<html lang={locale} dir={getDir(locale)}>` 로 쓰고(next-themes 등 테마를 쓰는 앱만 `suppressHydrationWarning` 추가), 알 수 없는 locale 은 `notFound()` 로 처리합니다(redirect 금지).
- **정적 생성** : `generateStaticParams` 는 `[{ locale: 'ko' }, { locale: 'en' }]` 만 반환합니다. 나머지 65개는 첫 요청 때 렌더하고 캐시합니다. 67개 × 전 페이지 사전 렌더로 빌드 시간이 폭증하는 것을 막기 위해서입니다.
- **파일 트레이싱** : readFile 로 읽으므로 `next.config.ts` 에 `outputFileTracingIncludes: { '/**/*': ['./messages/*.json'] }` 을 넣습니다(앱의 기존 항목과 합침). 넣은 뒤에는 `pnpm build` 후 `.next` 트레이스에 messages 가 들어갔는지 확인합니다.
- **RTL 레이아웃** : 새 코드는 `ml-*`/`mr-*`·`left-*`/`right-*` 대신 논리 속성 `ms-*`/`me-*`·`start-*`/`end-*` 를 씁니다(Tailwind v4 기본 지원). 방향 아이콘(화살표)은 `rtl:rotate-180` 으로 뒤집습니다.
- **번들 크기** : `NextIntlClientProvider` 는 현재 locale 의 메시지 전체를 직렬화합니다. 키가 수천 개가 넘는 앱은 클라이언트 컴포넌트가 쓰는 네임스페이스만 `messages={pick(...)}` 으로 넘기는 것을 검토합니다(sitemap.pi 350키·seminar.pi 859키 규모에서는 불필요).
- **API 오류 문구** : 서버는 사람이 읽는 문장 대신 `code` 를 돌려주고, 화면이 `t('apiErrors.<code>')` 로 표시합니다(loginpi `apiError(code)` 패턴). 기존 API 를 한꺼번에 바꾸지는 않고, 새 API 부터 적용합니다.
- **숫자·날짜** : `useFormatter()`(next-intl)를 씁니다. 원화는 표시용 환산이고 결제는 Pi 금액입니다(메모리 규칙).

---

## 8. 새 프로젝트 적용 5단계 (체크리스트)

> 대상 : pnpm workspace 안의 Next.js 16 App Router 앱. 처음 적용할 때 한 번 하는 작업입니다.

**1단계 — 의존성**
- [ ] 앱 `package.json` dependencies 에 `"@pi/i18n": "workspace:*"`, `"next-intl": "^4.13.0"` 을 추가하고 `pnpm install` 을 실행합니다.
- [ ] scripts 에 `i18n:translate`·`i18n:validate`·`i18n:audit` 를 넣고 `build` 앞에 `pi-i18n validate &&` 를 붙입니다(4.4절).

**2단계 — 설정·i18n 파일 3개**
- [ ] 앱 루트에 `i18n.config.json` 을 만듭니다(`locales`·`glossary`, 3.2절).
- [ ] `src/i18n/routing.ts` → `export const routing = createRouting({ locales: config.locales as CreateRoutingOptions['locales'] })` (JSON import 는 `string | string[]` 로 추론되므로 단언 필요, `import { createRouting, type CreateRoutingOptions } from '@pi/i18n'`)
- [ ] `src/i18n/request.ts` → `export default createRequestConfig({ routing, loadSource: () => import('../../messages/ko.json') })`
- [ ] `src/i18n/navigation.ts` → `export const { Link, redirect, usePathname, useRouter } = createNavigation(routing)`
- [ ] `next.config.ts` 에 `createNextIntlPlugin('./src/i18n/request.ts')` 와 messages 트레이싱(7절)을 넣습니다.
- [ ] `globals.css` 에 `@source '<앱에서 packages 까지 상대경로>/pi-i18n/src';` 를 넣습니다(Tailwind v4 는 앱 밖 패키지를 자동 탐지하지 않아 스위처 스타일이 빠짐).

**3단계 — 라우팅·레이아웃**
- [ ] 페이지를 `src/app/[locale]/` 아래로 옮깁니다(`app/api` 는 그대로).
- [ ] 루트 `src/app/layout.tsx` 는 `return children` 만 하고(`<html>` 은 `[locale]/layout` 이 그림), 루트 `src/app/not-found.tsx` 를 `<html><body>` 포함으로 만듭니다(없으면 `[locale]` 밖 404 가 html 없이 깨짐).
- [ ] 화면 코드의 `next/link` `Link`·`next/navigation` `useRouter`/`usePathname`/`redirect` 를 `@/i18n/navigation` 것으로 바꿉니다(그대로 두면 이동할 때 locale 접두사가 빠져 ko 로 돌아감). `grep -rn "from 'next/link'|from 'next/navigation'" src` 로 남은 곳을 확인합니다.
- [ ] `[locale]/layout.tsx` 에 `<html lang dir>`·`setRequestLocale`·`NextIntlClientProvider`·`generateStaticParams`(ko·en)를 넣습니다.
- [ ] `<body>` 맨 앞(PiSdkScript·인증 Provider 보다 앞)에 `<PreferredLocaleScript locales={routing.locales} />` 를 둡니다. 스위처를 숨기는 경로가 있어도 저장 언어가 적용되고, Pi 인증이 두 번 돌지 않습니다(4.3절).
- [ ] `src/proxy.ts` 에 `createMiddleware(routing)` 을 연결합니다. 기존 보안 처리(@pi/guard)가 있으면 그 뒤에 호출하고, matcher 는 7절 규칙을 따릅니다.

**4단계 — 문구 외부화·스위처**
- [ ] `pnpm i18n:audit` 로 하드코딩 한글 목록을 뽑습니다.
- [ ] 공통 화면(레이아웃·헤더·내비·로그인·첫 화면)부터 `ko.json` 키로 옮기고 `useTranslations`/`getTranslations` 로 바꿉니다. 나머지는 백로그 문서로 남깁니다.
- [ ] `ko.json` 에 `common.localeSwitcher.{button,search,empty}` 를 넣고 앱 래퍼(4.3절)를 헤더에 둡니다.

**5단계 — 번역·검증·실기기**
- [ ] `pnpm i18n:translate --dry-run` 으로 대상 키 수를 확인한 뒤 `pnpm i18n:translate` 를 실행합니다.
- [ ] `pnpm i18n:validate` 오류 0, `pnpm exec tsc --noEmit`(pnpm 11 은 `pnpm tsc` 가 tsc 를 돌리지 않음), `pnpm build` 가 통과해야 합니다.
- [ ] `messages/*.json`·`.i18n-state.json`·`i18n.config.json` 을 커밋합니다.
- [ ] **Pi Browser 실기기**에서 로그인·결제·언어 전환(ko↔en↔ar RTL)·재방문 시 기억 여부를 확인합니다. 확인하기 전에는 완료로 보지 않습니다.

---

## 9. 운영 흐름 (평소)

| 상황 | 할 일 |
|---|---|
| 문구 추가 | ① `ko.json` 에 키를 추가하고 코드에서 `t('…')` 를 씁니다 → ② `pnpm i18n:translate` → ③ `pnpm i18n:validate` → ④ `pnpm build` → 커밋 |
| 문구 수정 | `ko.json` 의 값만 고칩니다. translate 가 해시 차이를 보고 모든 locale 을 다시 번역합니다 |
| 문구 폐기 | `ko.json` 에서 키를 **삭제**합니다(빈 값 금지). translate 를 실행하면 다른 locale 에서도 지워집니다 |
| 번역 손질 | `<locale>.json` 을 직접 고칩니다. ko 원문이 그대로면 translate 가 덮어쓰지 않습니다(해시 기준) |
| 언어 추가 | 카탈로그에 있으면 `i18n.config.json` `locales` 에 넣고 translate → 재배포합니다. 카탈로그에 없으면 `catalog.json` 에 행을 추가합니다(code·이름·국기·dir) → 패키지 공용 변경으로 리뷰 |
| 언어 빼기 | config 에서 빼고 해당 `messages/<locale>.json` 을 삭제합니다(validate 가 카탈로그 밖 파일을 오류로 잡음) |
| 하드코딩 점검 | `pnpm i18n:audit --md docs/I18N_BACKLOG.md` 로 백로그를 갱신합니다 |

---

## 10. loginpi(cafe.pi) 와의 관계

- **같게 둔 것** : `defineRouting`(ko·as-needed), 3단 깊은 병합(배열 교체)·readFile 로딩, 검색형 스위처, localStorage `preferred_locale` 1회 적용과 제외 경로, Gemini 규칙(2.5-flash·0.2·250키·병렬 6·429 대기·420초 타임아웃·한글/ICU 검증), extra 키 차단.
- **바꾼 것** : 국가코드 → 언어코드, DB `i18n_message` → 파일·해시 상태, en 대체 쓰기 → 탈락 키는 쓰지 않음, 변수명만 보던 ICU 검사 → plural·select·태그 구조 검사, 하드코딩 용어집 → 공용과 앱 용어집, 일회성 하드코딩 감사 → 상시 audit, `dir` 없음 → RTL 6개, 감지·쿠키 켜짐 → 끔. **화면 차이(REA 운영 분석 2026-10-31)** : 헤더의 Pi 시세 칩(`π 104.4 KRW`) 없음, 스위처가 `/api/i18n/countries`·`/api/exchange-rates`·`/api/pi-price` 를 부르지 않음(DB·통화 결합 제거 — 통화는 각 앱 몫), 표시는 `KO ▾` 대신 모바일 = 코드·데스크톱 = 원어 이름, locale 189개(국가) → 67개(언어).
- **loginpi 자체는 이번에 바꾸지 않습니다.** 국가코드 189개·DB·통화 결합이 운영 중이라, cafe.pi 이행은 별도 결정이 필요한 후속 과제입니다.

---

## 11. 한계·후속

- `@pi/i18n` 은 `private: true` 워크스페이스 패키지 — 이 모노레포 밖 저장소는 `packages/pi-i18n` 을 복사하거나 사설 레지스트리 배포가 필요합니다.

| # | 한계 | 영향 | 후속 |
|---|---|---|---|
| L1 | locale 은 빌드할 때 고정됩니다(P4) | 언어를 추가하려면 재배포해야 함 | 없음(next-intl 구조) |
| L2 | 감지를 껐으므로 첫 방문자는 접두사가 없으면 늘 ko 를 봅니다 | 외국어 사용자는 첫 방문에 한 번 직접 골라야 함 | 필요하면 스위처에 '저장값이 없을 때 `navigator.languages` 로 한 번 제안' 옵션 추가(쿠키 없이 클라이언트에서만) |
| L3 | 기계번역 품질 | 어색한 표현이 있을 수 있음 | 사람이 locale 파일을 손질(해시가 보존해 줌), 상위 언어부터 검수 |
| L4 | plural 범주가 언어마다 달라서 ko 와 같은지만 볼 수 없음 | CLDR 범주 적합성만 검사(5.4절) | — |
| L5 | audit 은 한글만 셉니다 | 영어 하드코딩은 놓침 | 필요 시 패턴 옵션 |
| L6 | 메시지 전체를 직렬화합니다 | 수천 키 앱은 HTML 이 커짐 | 네임스페이스 선택 전달(7절) |
| L7 | 카페 도메인 번역 자산은 하위 앱으로 옮겨지지 않습니다 | 하위 앱은 자기 키를 새로 번역(비용 : 350키 × 66 ≈ 2.3만 문자열, flash 기준 소액) | — |
| L8 | Gemini 장애·할당량 | translate 가 늦어지거나 멈춤 | 재실행하면 이어서 진행. 빌드·런타임은 Gemini 와 무관(폴백) |
| L9 | messages 트레이싱 설정을 빠뜨리면 운영에서 en·locale 이 `{}` 가 됩니다(ko 로만 보임) | 조용한 실패 | 5단계에서 빌드 산출물을 확인. 오류를 내지 않는 설계(폴백)라서 실기기·운영 URL 로 `/en` 표시를 확인 |

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-31 | v1.0.3 최종 검토 반영 — 8절 3단계에 루트 not-found·내비게이션 교체 추가, routing 예시 타입 단언, `pnpm exec tsc`, 4.1 react import·`PreferredLocaleScript` 시그니처, 10절 loginpi 화면 차이(REA), 11절 저장소 밖 적용 한계 |
| 2026-10-31 | v1.0.2 검토 반영 — 재방문 적용을 스위처 effect 에서 `PreferredLocaleScript`(하이드레이션 전)로 이동(인증 이중 실행·`/s/*` 미적용 해소, 4.3·6·8절), 일반 인자 → number·plural 은 `numericArgs` 만(5.4), 바뀐 ko 키 번역 때 옛 en 참조 제외(5.3) |
| 2026-10-31 | v1.0.1 1차 구축(seminar.pi) 반영 — 기존 번역 채택 규칙(5.1), 숫자형 인자 동일 취급(5.4), validate `--verbose`, 8절 2단계 `@source` |
| 2026-10-31 | v1.0 최초 작성 — 마스터 결정 D1~D8 + loginpi 분석 반영(카탈로그 67개, RTL 6개, 감지·쿠키 끔, 해시 증분 번역, ICU 구조 검증, audit) |
