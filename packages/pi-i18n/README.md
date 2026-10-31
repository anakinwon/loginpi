# @pi/i18n

Pi 앱 공용 다국어 표준 패키지 — **loginpi(cafe.pi)와 완전히 같은** 다국어(routing locale 219개·locale → 언어 매핑·상단 헤더 언어 콤보(국기·통화·환율)·π 시세칩·API 3종). **정본 문서는 `docs/I18N_STANDARD.md`** (새 앱 8.1절, 0.1 앱 이행 8.2절).

| 진입점 | 내용 |
|---|---|
| `@pi/i18n` | `ROUTING_LOCALES`(loginpi 219개)·`LOCALE_LANG`/`getLanguage`·언어 카탈로그 67개·`createRouting`·`getDir`·`LOCALE_CURRENCY`·`LOCALE_COUNTRY`/`getAlpha2`/`ACTIVE_COUNTRY_CODES`·`comboMatch`·`deepMerge`·`PreferredLocaleScript` — fs·훅 없음(proxy 에서도 사용) |
| `@pi/i18n/server` | `createRequestConfig`·`getMessages` — 스위처 문구(loginpi 원문) ⊕ ko → en → locale 깊은 병합 |
| `@pi/i18n/client` | `createLanguageSwitcher({ usePathname, useRouter, fetcher?, adminTicketUrl? })`·`PiPriceChip` — loginpi 컴포넌트 이식(상단 헤더 맨 끝 2항목, 하단 금지) |
| `@pi/i18n/routes` | `countriesGET`(loginpi DB 스냅숏)·`exchangeRatesGET`·`piPriceGET` — 앱 route.ts 가 재수출 + `revalidate` 600/900/300 |
| `pi-i18n` (bin) | `translate`(언어 단위 Gemini 증분 → expand 자동) · `expand`(언어 → routing locale 파일) · `validate`(빌드 게이트) · `audit` · `snapshot`(loginpi DB·routing·문구 복제) |

```bash
# 앱 폴더에서
pnpm i18n:translate --dry-run      # 언어별 대상 키 수
pnpm i18n:translate                # 바뀐 키만 번역 → messages/en.json · messages/lang/<언어>.json → expand
pnpm i18n:expand                   # messages/<locale>.json 다시 펼침 (언어 파일 손질 뒤)
pnpm i18n:validate [--verbose]     # 오류 = 종료코드 1
pnpm i18n:audit --md docs/I18N_BACKLOG.md

# 저장소 루트에서 (패키지 관리자) — loginpi 데이터가 바뀌었을 때
node packages/pi-i18n/bin/pi-i18n.mjs snapshot && pnpm --filter @pi/i18n test
```

- 앱 설정 : 앱 루트 `i18n.config.json` (`locales` = routing · `languages` = 번역 · `glossary` · `numericArgs` · `audit.exclude`)
- 데이터 : `src/data/{locales,countries,locale-lang,switcher-messages}.json` — snapshot 생성물, 손으로 고치지 않음. `src/locale-*.ts`·`combo-search.ts` 는 loginpi `src/lib/` 원문 복제(시험이 비교)
- loginpi 와 다른 동작은 하나 : 재방문 자동 전환을 스위처 마운트 effect 대신 `<PreferredLocaleScript>`(하이드레이션 전)가 함 — Pi 인증·결제 복구 이중 실행 방지(표준 4.7절)
- 앱 `globals.css` 에 `@source '<packages 경로>/pi-i18n/src';` 와 shadcn 색 토큰이 있어야 콤보 스타일이 loginpi 와 같습니다. flag-icons CSS 는 스위처가 직접 불러옵니다
- 시험 : `pnpm --filter @pi/i18n test`
