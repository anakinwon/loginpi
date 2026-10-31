# @pi/i18n

Pi 앱 공용 다국어 표준 패키지입니다. **정본 문서는 `docs/I18N_STANDARD.md`** 이고, 새 앱 적용은 그 문서 8절 '새 프로젝트 적용 5단계'를 따릅니다.

| 진입점 | 내용 |
|---|---|
| `@pi/i18n` | 언어 카탈로그 67개(`src/catalog.json`)·`createRouting`·`getDir`·`deepMerge`·`PreferredLocaleScript`(재방문 언어 적용, layout body 맨 앞) — fs·훅 없음(proxy 에서도 사용) |
| `@pi/i18n/server` | `createRequestConfig`·`getMessages` — ko → en → locale 깊은 병합, en·locale 은 readFile |
| `@pi/i18n/client` | `LocaleSwitcher` — 검색형, 국기 + 원어 이름, 선택을 localStorage `preferred_locale` 에 기억 |
| `pi-i18n` (bin) | `translate`(Gemini 증분) · `validate`(빌드 게이트) · `audit`(하드코딩 한글) |

```bash
# 앱 폴더에서
pnpm i18n:translate --dry-run      # 대상 키 수만
pnpm i18n:translate                # 바뀐 키만 번역 (중단돼도 다시 실행하면 이어서)
pnpm i18n:validate [--verbose]     # 오류 = 종료코드 1, --verbose 는 경고 상세
pnpm i18n:audit --md docs/I18N_BACKLOG.md
```

- 앱 설정 : 앱 루트 `i18n.config.json` (`locales` · `glossary` · `numericArgs` · `audit.exclude`)
- 번역 상태 : `messages/.i18n-state.json` (git 커밋). 상태가 없는 기존 번역은 덮어쓰지 않고 채택합니다
- 공용 컴포넌트라 앱 `globals.css` 에 `@source '<packages 경로>/pi-i18n/src';` 가 있어야 스위처 스타일이 생성됩니다
- 시험 : `pnpm --filter @pi/i18n test`
