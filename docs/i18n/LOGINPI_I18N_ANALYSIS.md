# loginpi(cafe.pi) 다국어 기능 분석 — 다국어 표준(@pi/i18n) 설계 입력

> 작성 2026-10-31 · 대상 = 루트 앱 cafe.pi(https://loginpi.vercel.app/) + sitemap/{seminar,sitemap,schema}.pi 현황
> 용도 : `packages/pi-i18n` 표준 설계(D1~D8)의 근거 자료. 수치는 이 날짜 저장소 실측.

## 1. 아키텍처 요약

| 층 | 파일 | 역할 |
|---|---|---|
| 라우팅 | `src/i18n/routing.ts` | `defineRouting({ locales: [...], defaultLocale: 'ko', localePrefix: 'as-needed' })` — **locale 약 190개 빌드 시점 고정**(국가코드 위주 + 충돌 파생 `ar-AR`·`en-ZA`·`xx-XX`) |
| 미들웨어 | `src/middleware.ts` | 공격 UA 차단 → rate limit → 미등록 locale 형태 세그먼트(`/^[a-z]{2,3}(-…)?$/`, 예외 `map`)는 `/en/...` 로 리다이렉트 → `_pit` 쿼리를 `x-pit-ticket` 헤더로 변환 → `createMiddleware(routing)`. matcher 는 api·_next·정적 파일 제외 |
| 메시지 로딩 | `src/i18n/request.ts` | ko 는 `import`, 나머지는 `readFile(process.cwd()/messages/<lc>.json)`. **ko → en → locale 3단 deepMerge**(배열은 통째 교체). 읽기 실패 파일은 `{}` 로 무시 |
| 내비게이션 | `src/i18n/navigation.ts` | `createNavigation(routing)` → `Link, redirect, usePathname, useRouter` |
| 레이아웃 | `src/app/[locale]/layout.tsx` | `getMessages()` → `<NextIntlClientProvider messages={messages}>` 로 **번들 전체 직렬화**, `<html lang={locale}>` (**dir 미설정 — RTL 미지원**) |
| 스위처 | `src/components/layout/language-switcher.tsx`(493줄) | 검색형 드롭다운 + localStorage 선호 언어 + DB·통화·환율 결합 |
| 매핑 | `src/lib/locale-currency.ts`·`locale-country.ts` | locale → 통화(ISO 4217)·국가(alpha-2). 결제 가격칩 환산용 — **카페 전용** |
| 검증 | `scripts/validate-locales.mjs` | `pnpm build` 선행 게이트 |

## 2. 데이터 흐름 (DB i18n_message ↔ json)

```
ko.json(정본, 개발자 편집)
   └─ i18n-increment-translate.mjs ─ Gemini ─▶ DB i18n_message(locale_cd, msg_key, msg_val, is_auto)
                                                  │  (관리자 화면 /admin/i18n 에서 수정 가능)
                                                  └─ 전 locale json 재생성(DB 정본) ─▶ messages/<lc>.json ─ git ─▶ 배포
런타임 = json 만 읽음(DB 조회 없음).  /api/admin/i18n/sync = DB → json 재기록(로컬 개발용, writeFile)
```

- DB 테이블 : `i18n_locale`(189, 활성·국기·정렬) · `i18n_lang_mst`(언어마스터, cntry FK 대상) · `i18n_cntry_mst`(187국·통화) · `i18n_message`(운영 약 74만 행).
- 운영 반영 = json 커밋·배포 + 운영 DB 델타(psql \copy, 5만 행 청크). **이중 정본(DB·json)이 운영 부담의 근원** — 표준에서는 DB 를 빼고 파일 기반으로 단순화(D4)하는 것이 타당.
- `i18n_message` 는 del_yn 없음 + sync 무필터 → 폐기 키는 **물리 DELETE 만 정본**(sql/182). 안 지우면 다음 동기화에 부활.

## 3. locale 목록과 언어 그룹

- 실측 : `messages/*.json` 189개(+`listing/` 오버레이 폴더), ko 키 **3,921개**. ko·en 100%, 나머지 187개 파일 전부 98%(누락 키는 en 폴백).
- locale 은 **국가코드**다(예: `ke`=케냐 → 영어 복사). 실제 언어는 `scripts/i18n-lang-map.mjs` LANG_MAP(`{lang, copy|group}`) + `i18n-increment-translate.mjs` ORIGINAL_LANGS 로만 알 수 있다.
- 서로 다른 번역을 가진 **언어 = 67개**(한국어 포함, 4절 표). 공유 언어 국가는 같은 내용의 복사본(영어 48·스페인어 20·아랍어 20·프랑스어 20·포르투갈어 8 파일 등).

### 3.1 함정 — 국가코드 ≠ 언어코드 (표준 이행 시 파일 복사 주의)

loginpi 파일명을 그대로 언어코드로 쓰면 **틀린 언어가 들어간다**. 대표 충돌:

| loginpi 파일 | 실제 내용 | 같은 이름의 BCP-47 언어 | 그 언어의 실제 소스 파일 |
|---|---|---|---|
| `am.json` | 아르메니아어 | am = 암하라어 | `et.json` |
| `et.json` | 암하라어(2026-07 재번역) | et = 에스토니아어 | `ee.json` |
| `si.json` | 슬로베니아어 | si = 싱할라어 | `lk.json` |
| `bn.json` | 말레이어(브루나이) | bn = 벵골어 | `bd.json` |
| `ca.json` | 영어(캐나다) | ca = 카탈루냐어 | `ad.json` |
| `sr.json` | 네덜란드어(수리남) | sr = 세르비아어 | `rs.json` |
| `bs.json` | 영어(바하마) | bs = 보스니아어 | `ba.json` |
| `dz.json` | 아랍어(알제리) | dz = 종카어 | `bt.json` |
| `km.json` | 아랍어(코모로) | km = 크메르어 | `kh.json` |
| `ne.json`·`tg.json` | 프랑스어(니제르·토고) | ne = 네팔어 / tg = 타지크어 | `np.json` / `tj.json` |
| `sl.json`·`sv.json` | 영어(시에라리온)·스페인어(엘살바도르) | sl = 슬로베니아어 / sv = 스웨덴어 | `si.json` / `se.json` |

→ 표준 패키지는 **언어코드 → loginpi 소스 파일** 대응표(4절 '소스' 열)로 1회 이행하고, 이후 국가코드는 쓰지 않는다(D2).

## 4. 표준 카탈로그 제안 (언어코드 67개 — loginpi 완역 언어 전수)

| 코드 | nativeName | englishName | 국기 | dir | loginpi 소스 |
|---|---|---|---|---|---|
| ko | 한국어 | Korean | 🇰🇷 | ltr | ko |
| en | English | English | 🇺🇸 | ltr | en |
| zh | 简体中文 | Chinese (Simplified) | 🇨🇳 | ltr | zh |
| zh-TW | 繁體中文 | Chinese (Traditional) | 🇹🇼 | ltr | tw |
| ja | 日本語 | Japanese | 🇯🇵 | ltr | ja |
| vi | Tiếng Việt | Vietnamese | 🇻🇳 | ltr | vi |
| hi | हिन्दी | Hindi | 🇮🇳 | ltr | hi |
| id | Bahasa Indonesia | Indonesian | 🇮🇩 | ltr | id |
| fil | Filipino | Filipino | 🇵🇭 | ltr | fil |
| th | ไทย | Thai | 🇹🇭 | ltr | th |
| ms | Bahasa Melayu | Malay | 🇲🇾 | ltr | ms |
| de | Deutsch | German | 🇩🇪 | ltr | de |
| es | Español | Spanish | 🇪🇸 | ltr | es |
| fr | Français | French | 🇫🇷 | ltr | fr |
| it | Italiano | Italian | 🇮🇹 | ltr | it |
| pt | Português | Portuguese | 🇵🇹 | ltr | pt |
| ru | Русский | Russian | 🇷🇺 | ltr | ru |
| ar | العربية | Arabic | 🇸🇦 | **rtl** | ar |
| af | Afrikaans | Afrikaans | 🇿🇦 | ltr | af |
| am | አማርኛ | Amharic | 🇪🇹 | ltr | et |
| sq | Shqip | Albanian | 🇦🇱 | ltr | sq |
| hy | Հայերեն | Armenian | 🇦🇲 | ltr | am |
| az | Azərbaycan dili | Azerbaijani | 🇦🇿 | ltr | az |
| bn | বাংলা | Bengali | 🇧🇩 | ltr | bd |
| bs | Bosanski | Bosnian | 🇧🇦 | ltr | ba |
| bg | Български | Bulgarian | 🇧🇬 | ltr | bg |
| my | မြန်မာ | Burmese | 🇲🇲 | ltr | mm |
| ca | Català | Catalan | 🇦🇩 | ltr | ad |
| hr | Hrvatski | Croatian | 🇭🇷 | ltr | hr |
| cs | Čeština | Czech | 🇨🇿 | ltr | cz |
| da | Dansk | Danish | 🇩🇰 | ltr | dk |
| dv | ދިވެހި | Dhivehi | 🇲🇻 | **rtl** | mv |
| nl | Nederlands | Dutch | 🇳🇱 | ltr | nl |
| dz | རྫོང་ཁ | Dzongkha | 🇧🇹 | ltr | bt |
| et | Eesti | Estonian | 🇪🇪 | ltr | ee |
| fi | Suomi | Finnish | 🇫🇮 | ltr | fi |
| ka | ქართული | Georgian | 🇬🇪 | ltr | ge |
| el | Ελληνικά | Greek | 🇬🇷 | ltr | gr |
| he | עברית | Hebrew | 🇮🇱 | **rtl** | il |
| hu | Magyar | Hungarian | 🇭🇺 | ltr | hu |
| is | Íslenska | Icelandic | 🇮🇸 | ltr | is |
| kk | Қазақ тілі | Kazakh | 🇰🇿 | ltr | kz |
| km | ខ្មែរ | Khmer | 🇰🇭 | ltr | kh |
| ky | Кыргызча | Kyrgyz | 🇰🇬 | ltr | kg |
| lo | ລາວ | Lao | 🇱🇦 | ltr | la |
| lv | Latviešu | Latvian | 🇱🇻 | ltr | lv |
| lt | Lietuvių | Lithuanian | 🇱🇹 | ltr | lt |
| mn | Монгол | Mongolian | 🇲🇳 | ltr | mn |
| ne | नेपाली | Nepali | 🇳🇵 | ltr | np |
| nb | Norsk bokmål | Norwegian Bokmål | 🇳🇴 | ltr | no |
| ps | پښتو | Pashto | 🇦🇫 | **rtl** | ps |
| fa | فارسی | Persian | 🇮🇷 | **rtl** | ir |
| pl | Polski | Polish | 🇵🇱 | ltr | pl |
| ro | Română | Romanian | 🇷🇴 | ltr | ro |
| sr | Srpski | Serbian (Latin) | 🇷🇸 | ltr | rs |
| si | සිංහල | Sinhala | 🇱🇰 | ltr | lk |
| sk | Slovenčina | Slovak | 🇸🇰 | ltr | sk |
| sl | Slovenščina | Slovenian | 🇸🇮 | ltr | si |
| so | Soomaali | Somali | 🇸🇴 | ltr | so |
| sw | Kiswahili | Swahili | 🇹🇿 | ltr | tz |
| sv | Svenska | Swedish | 🇸🇪 | ltr | se |
| tg | Тоҷикӣ | Tajik | 🇹🇯 | ltr | tj |
| tr | Türkçe | Turkish | 🇹🇷 | ltr | tr |
| tk | Türkmençe | Turkmen | 🇹🇲 | ltr | tm |
| uk | Українська | Ukrainian | 🇺🇦 | ltr | ua |
| ur | اردو | Urdu | 🇵🇰 | **rtl** | pk |
| uz | Oʻzbekcha | Uzbek | 🇺🇿 | ltr | uz |

- RTL 은 D2 의 ar·he·fa·ur 에 **dv(타나 문자)·ps(아랍 문자)** 를 추가해야 한다(실측 내용이 우→좌 문자).
- 세르비아어는 loginpi 내용이 **라틴 문자**(`Nema prikupljenih…`)라 `sr` + nativeName `Srpski` 로 둔다(키릴은 sr-Cyrl 별도 — 현재 없음).
- 노르웨이어는 BCP-47 권장 `nb`(loginpi 파일 `no`). 중국어 번체는 `zh-TW`(next-intl 은 하이픈 locale 지원, loginpi `en-ZA` 선례).
- 국기는 언어 대표국 이모지(언어 ≠ 국가라 표시용일 뿐). loginpi 는 flag-icons CSS(`fi fi-xx`)를 쓰지만 표준은 의존성 없는 **이모지**가 적합(국기 이모지 베이스 U+1F1E6 — 과거 0x1F1E0 오계산 사고).
- 순서 제안 : loginpi 콤보 우선순위(한·미·중·일·베트남·인도·인니·필리핀·독일·태국·말련 — sql/168)를 반영해 상위 고정, 나머지는 englishName 알파벳순.

## 5. 폴백

- `request.ts` : ko 기반 → en 덮어쓰기 → locale 덮어쓰기. 키 누락 시 영어, 영어도 없으면 한국어 표시(키 이름 노출 방지).
- `deepMerge` 는 **배열 재귀 금지**(재귀하면 `{0:…}` 객체가 되어 `.map` 이 깨진 사고 — adminStats.manual.topics).
- ko 만 `import`(번들 포함), 나머지는 `readFile`(Node 모듈 캐시가 동기화 결과를 반영하지 않는 문제 회피). 없는 파일은 조용히 `{}`.
  - 주의 : `readFile(process.cwd()/messages)` 는 Vercel 서버리스에서 파일 추적(output file tracing)에 잡혀야 한다 — loginpi 는 루트 앱이라 문제없었지만, 모노레포 하위 앱은 `outputFileTracingIncludes` 또는 정적 import 가 필요할 수 있음(표준 설계 시 확인 항목).
- 미들웨어 : 미등록 locale 형태 세그먼트를 `/en` 으로 보냄 — 2~3글자 앱 경로(`map`)는 예외 목록 필요. 표준에서는 next-intl 기본 동작으로 충분하고 예외 목록 관리 부담은 피하는 게 낫다.
- seminar.pi·sitemap.pi 의 `request.ts` 는 **ko → locale 2단 + 동적 import**(en 폴백 없음, readFile 아님) — 표준(D3)과 차이.

## 6. 스위처 UX 와 Pi Browser 제약

- 버튼(`aria-haspopup="listbox"`, `aria-expanded`, `aria-label`) → 드롭다운 안 `type="search"` 입력 + 활성 locale 목록(`aria-selected`) + 비활성 국가 목록(관리자 활성화 유도). 검색은 `src/lib/combo-search.ts` `comboMatch(query, ...fields)`(대소문자 무시 부분일치, 영문명·현지명·코드 다중 필드) — 10줄짜리, 그대로 재사용 가능.
- 데이터 : `/api/i18n/countries`(DB) + `/api/exchange-rates` 를 idle 시점 프리페치, 모듈 메모리 + sessionStorage 10분 TTL 캐시. 통화·환율은 `showPiValuation`(운영 숨김) — **표준은 이 결합 전부 제거**(카탈로그가 정적이라 네트워크 0).
- **선호 언어 = localStorage `preferred_locale`**(쿠키 금지 — Pi Browser 는 Set-Cookie 미저장). 마운트 시 1회 : 저장값이 있고 현재와 다르고 routing 에 있으면 자동 전환. 제외 경로 = `/admin`(인증 경합), `/auth/pi/callback`(1회용 state 소거 경합 — 2026-07-08). 저장·읽기는 try/catch(차단 환경이면 기억만 비활성).
- 전환 = `router.replace(pathname, { locale: next })`(next-intl 내비게이션, as-needed 접두사 자동). admin 경로만 `_pit` 티켓 발급 후 `window.location.assign`(Pi Browser 하드 네비게이션 시 세션 유실 회피) — 카페 전용.
- next-intl 미들웨어의 `NEXT_LOCALE` 쿠키·Accept-Language 감지는 Pi Browser 에서 쿠키가 안 남아 매 방문 Accept-Language 로 다시 판정된다 → localStorage 1회 적용이 실질적 기억 수단.
- 미흡점 : 목록 키보드 이동(화살표·Esc·Home/End) 처리가 약하다 → 표준 스위처에서 보강(D5).

## 7. 번역 파이프라인 (Gemini)

| 스크립트 | 역할 |
|---|---|
| `i18n-lang-map.mjs` | 국가 locale → `{lang(Gemini 지시 언어명), copy(복사 소스) / group(번역 그룹), force, doneRe}` 단일 소스 |
| `i18n-bulk-translate.mjs` | 1단계 COPY(공유 언어 국가 = 소스 locale 복사, API 0) → 2단계 그룹별 Gemini 번역 → DB upsert. 재개 = DB 에 있는 키 건너뜀 |
| `i18n-increment-translate.mjs` | ko 신규 키만 : en 먼저 채움 → 그룹별(언어별 1회) 누락 키 번역 → 그룹 내 모든 locale upsert → 전 json 재생성(ko 에 없는 키 제외 가드) |
| `i18n-lang-master-seed.mjs`·`i18n-bulk-activate.mjs` | 언어마스터·locale 활성화(DB) — 카페 전용 |

- 모델 `gemini-2.5-flash`, `temperature 0.2`, REST `generateContent?key=`(키는 `.env.local` 을 스크립트 내부에서 파싱, `process.env` 우선).
- 프롬프트 규칙 : `{count}` 류 중괄호 **원형 보존(식별자 번역·개명 금지)** · 브랜드(Pi, Bean, π, PyCafé™, PyShop™, PyTranslate™, A2U, txid) 및 기술 약어(DDL, API, JSON, DB, SQL, HTML, ICU) 불변 · 영어 기원 한국어 외래어는 자연어 또는 영어 원어 · 키 유지·값만 번역 · **마크다운 없이 JSON 객체만 반환**.
- 응답 파싱 : 본문에서 `/\{[\s\S]*\}/` 추출 후 `JSON.parse`(Gemini `responseMimeType: 'application/json'` 은 미사용 — 표준에서 쓰면 파싱 실패 감소).
- 배치 **250키**(단일 초대형 요청은 타임아웃·소켓 끊김·출력 truncate 3종 사고), 병렬 `I18N_WORKERS`(기본 6, 429 빈발 시 1).
- 재시도 : 429 는 60초 단위 장기 대기 최대 5회, 기타 10초 백오프 3회. `AbortSignal.timeout(420_000)`(Node fetch 무한 대기 hang 사고).
- 검증(키 단위) : 비어 있지 않음 + **한글 미혼입**(`/[가-힣ㄱ-ㆎ]/`) + ICU 변수 집합 일치(`/\{(\w+)[,}]/g` 정렬 비교). 탈락 키는 en 값으로 대체.
- 한계 : ① 원문 변경 감지 없음(키 존재만 봄 → ko 문구를 고쳐도 재번역 안 됨) ② ICU 검사는 변수명만(plural/select 분기 키워드·`#`·태그 미검사) ③ 용어집이 프롬프트 하드코딩 ④ DB 의존 ⑤ 언어명 지시가 국가 매핑 경유. → 표준(D4)은 **키별 원문 해시 기록**으로 ①, 태그·plural 구조 비교로 ②, 앱별 glossary 로 ③, 파일 기반으로 ④, 카탈로그 englishName 직접 사용으로 ⑤ 해결.

## 8. 검증

- `validate-locales.mjs`(빌드 게이트, `"build": "node scripts/validate-locales.mjs && next build --turbopack"`) : messages 파일 ↔ 통화 ↔ 국가 ↔ routing 교차 등재 + **ko 에 없는 키(extra) 차단**. missing 은 정상(폴백)이라 검사 안 함.
- ICU 불일치는 번역 시점에만 검사(빌드 게이트에 없음) → 표준 validate CLI 에서 **ICU 플레이스홀더 불일치 = 오류, 누락 = 경고**(D4)로 보강. extra 키 차단도 승계 권장.
- 하드코딩 감사 : `docs/I18N_HARDCODED_AUDIT.md`(2026-07-09 종결) — 일회성 `hangul-scan.json` 산출물 기반, 상시 도구 없음 → 표준 audit CLI 필요(D4). 교훈 : 프론트가 API `error` 문자열을 그대로 표시하므로 API 에러는 `apiError(code)` + 클라이언트 `t(code)`(`src/lib/api-errors/`, `useApiErrorMessage`). 정당 잔존 = Pi 결제 memo·AI 프롬프트·DB 저장값·보안 폴백.

## 9. 이미 기록된 함정 (표준에 반영할 것)

1. **번들 직렬화 노출** : `NextIntlClientProvider` 가 메시지 **전체**를 모든 페이지 HTML 에 직렬화 → 죽은 키·`_comment` 도 소스에 노출(2026-07-16 베팅 키 4,512행 사고, 메인넷 등재 심사 스캔 대상). 표준 : 폐기 키는 즉시 삭제, `_comment` 류 메타키 금지(또는 로드 후 제거), 대형 앱은 클라이언트에 필요한 네임스페이스만 전달 검토.
2. **폐기 키는 삭제** — 빈 값 `""` 금지(통계 99% 사고). DB 가 있으면 json+DB 동시 삭제.
3. **국가코드 ≠ 언어코드** — et 에스토니아어/암하라어 사고, 3.1 표의 충돌들. 표준은 언어코드만.
4. **locale 은 빌드 시점 고정** — routing 에 없으면 런타임 활성화 불가(재배포 필요).
5. **배열 deepMerge 금지**, ko 원문 빈 문자열 키는 번역 대상 제외.
6. **ko 에 먼저 키 추가** — 타 locale 에만 있는 키 = 빌드 차단.
7. `<html dir>` 미설정 — RTL 언어(ar·he·fa·ur·dv·ps) 레이아웃 미반영.
8. 오버레이(listing 모드)는 ko→en→locale 과 같은 폴백 체인을 따라야 원문 노출이 없다.
9. 브랜드 표기(PyCafé™ 등)는 번역 금지, Pi 결제 memo 에는 ™ 금지.

## 10. 재사용 vs 카페 전용

| 재사용(표준 패키지로) | 카페 전용(가져가지 않음) |
|---|---|
| `defineRouting`(ko·as-needed) 패턴, `createNavigation` | 국가코드 locale·충돌 파생 `xx-XX` |
| 3단 deepMerge 폴백(배열 교체)·readFile 로딩 | `locale-currency.ts`·`locale-country.ts`·통화/환율 표시 |
| localStorage `preferred_locale` 1회 적용 + 제외 경로 | `/api/i18n/countries`·sessionStorage 캐시·비활성 국가 목록 |
| `comboMatch` 검색, 검색형 listbox UX | admin `_pit` 티켓 하드 네비게이션 |
| Gemini 프롬프트 규칙·250 배치·병렬·429 백오프·timeout·한글/ICU 검증 | DB `i18n_*` 4테이블·관리 화면·sync API·운영 DB 델타 |
| validate 의 extra 키 차단 + ICU 검사 추가 | listing 오버레이(메인넷 등재 절제문) |
| 언어 67개 번역 자산(3.1 대응표로 1회 이행 — 단, 키는 카페 도메인이라 하위 앱엔 문구가 아닌 **언어 목록**만 승계) | `themes.<theme_cd>`·`apiErrors` 등 카페 도메인 키 |

## 11. 하위 앱 현황 (sitemap/)

| 앱 | next-intl | locale | 메시지 | 전환 UI | 비고 |
|---|---|---|---|---|---|
| seminar.pi | ^4.13.0 | ko·en | ko/en 859키(동수) | `site-header.tsx` ko↔en 토글 Link | `src/i18n` 3파일, `proxy.ts` 에 intl 미들웨어, `<html lang>` |
| sitemap.pi | ^4.13.0 | ko·en | ko/en 350키(동수) | `site-header.tsx` ko↔en 토글 | seminar.pi 와 i18n 파일 사실상 동일(주석만 차이) |
| schema.pi | 없음 | — | ko/en 5키 | 없음 | `[locale]` 세그먼트 없음, `<html lang="ko">` 고정, 하드코딩 한국어 다수 |

→ 세 앱 모두 같은 3파일을 복붙 중 — 패키지(D1)로 묶으면 앱당 얇은 3파일만 남는다. 공용 패키지 모양은 `packages/pi-mon/package.json`(`"type": "module"`, `exports` 로 `./src/*.ts` 직접 노출, peer next/react) 선례를 따른다.
