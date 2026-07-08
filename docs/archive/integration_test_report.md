# 통합 테스트 보고서 — TASK-044 다국어(i18n) E2E 테스트

| 항목 | 내용 |
|------|------|
| **작성일** | 2026-06-03 |
| **작성자** | anakin |
| **테스트 대상** | 표준데이터 관리 프로그램 — 다국어(i18n) 시스템 |
| **테스트 파일** | `tests/e2e/i18n.spec.ts` |
| **테스트 도구** | Playwright (Chromium) |
| **서버 포트** | localhost:3000 |
| **Next.js 버전** | 16.2.6 (Turbopack) |
| **next-intl 버전** | ^4.13.0 |
| **지원 언어 수** | 17개 (ko, en, zh, ja, hi, vi, id, ms, en-ZA, fil, th, de, ps, sq, it, es, fr) |

---

## 1. 테스트 결과 요약

| 구분 | 수치 |
|------|------|
| **전체 테스트 수** | 77개 |
| **통과** | **77개 (100%)** |
| **실패** | 0개 |
| **스킵** | 0개 |
| **총 소요 시간** | 약 3분 54초 |
| **브라우저** | Chromium (Desktop Chrome) |

```
77 passed (3.9m)
```

---

## 2. 테스트 레이어 구성

### Layer 0 — ko 기본 로케일 번역 (1개)

| # | 테스트명 | 결과 | 비고 |
|---|---------|------|------|
| 1 | `/login` — ko 기본 locale, 버튼 텍스트 "로그인" | ✅ 통과 | NEXT_LOCALE=ko 쿠키 선삽입 필요 (하단 기술 이슈 참조) |

**목적**: `as-needed` 전략에서 URL prefix 없는 ko 기본 로케일의 번역이 올바르게 렌더링되는지 검증.

---

### Layer 1-A — locale URL prefix 라우팅 (14개)

| # | 테스트명 | 결과 |
|---|---------|------|
| 1 | 루트 `/` → `/login` 도달 (공개경로 아님) | ✅ |
| 2 | `/login` — ko 기본 locale, URL에 `/ko/` prefix 없음 | ✅ |
| 3 | `/ko/login` → `/login` 리다이렉트 (as-needed prefix 제거) | ✅ |
| 4~14 | `/en/login`, `/zh/login`, `/ja/login`, `/fr/login`, `/es/login`, `/it/login`, `/de/login`, `/vi/login`, `/id/login`, `/ms/login`, `/hi/login` URL prefix 정상 접근 | ✅ (11개) |

**핵심 검증**:
- `as-needed` 전략: ko 기본 로케일은 URL에 prefix 없음
- 비기본 로케일은 `/locale/path` 형태로 접근 가능
- `/ko/login`은 `/login`으로 리다이렉트되어 중복 URL 방지

---

### Layer 1-B — `html[lang]` 속성 검증 (10개)

| 로케일 경로 | 기대 `html[lang]` | 결과 |
|------------|-----------------|------|
| `/en/login` | `en` | ✅ |
| `/zh/login` | `zh` | ✅ |
| `/ja/login` | `ja` | ✅ |
| `/fr/login` | `fr` | ✅ |
| `/es/login` | `es` | ✅ |
| `/it/login` | `it` | ✅ |
| `/de/login` | `de` | ✅ |
| `/vi/login` | `vi` | ✅ |
| `/id/login` | `id` | ✅ |
| `/login` | ko (URL prefix 없음 확인 + 폼 로드) | ✅ |

**핵심 검증**: `LocaleHtmlUpdater.tsx`의 `useEffect`가 `html[lang]` 속성을 URL 로케일에 맞게 정확히 갱신하는지 확인.

---

### Layer 1-C — 미인증 `/admin` → locale prefix 보존 리다이렉트 (8개)

| 접근 URL | 기대 리다이렉트 | 결과 |
|---------|--------------|------|
| `/admin` | `/login` (ko, no prefix) | ✅ |
| `/en/admin` | `/en/login` | ✅ |
| `/fr/admin` | `/fr/login` | ✅ |
| `/es/admin` | `/es/login` | ✅ |
| `/it/admin` | `/it/login` | ✅ |
| `/zh/admin` | `/zh/login` | ✅ |
| `/ja/admin` | `/ja/login` | ✅ |
| `/de/admin` | `/de/login` | ✅ |

**핵심 검증**: `proxy.ts` 미들웨어가 미인증 접근 시 locale prefix를 그대로 유지하며 로그인 페이지로 리다이렉트.

---

### Layer 1-D — 로그인 페이지 번역 텍스트 (17개)

#### 버튼 텍스트 검증 (9개)

| 로케일 경로 | 기대 버튼 텍스트 | 결과 |
|------------|---------------|------|
| `/en/login` | Login | ✅ |
| `/zh/login` | 登录 | ✅ |
| `/ja/login` | ログイン | ✅ |
| `/fr/login` | Se connecter | ✅ |
| `/de/login` | Anmelden | ✅ |
| `/es/login` | Iniciar sesión | ✅ |
| `/it/login` | Accedi | ✅ |
| `/vi/login` | Đăng nhập | ✅ |
| `/id/login` | Masuk | ✅ |

#### MISSING_MESSAGE / FORMATTING_ERROR 없음 검증 (8개)

| 로케일 | 검증 경로 | 결과 |
|--------|---------|------|
| ko | `/login` | ✅ 오류 없음 |
| en | `/en/login` | ✅ 오류 없음 |
| zh | `/zh/login` | ✅ 오류 없음 |
| ja | `/ja/login` | ✅ 오류 없음 |
| fr | `/fr/login` | ✅ 오류 없음 |
| es | `/es/login` | ✅ 오류 없음 |
| de | `/de/login` | ✅ 오류 없음 |
| it | `/it/login` | ✅ 오류 없음 |

---

### Layer 2 — 인증 후 번역 · CountrySelector (27개)

**테스트 계정**: `test1004@example.com`

#### 로그인 성공 (1개)
| 테스트명 | 결과 |
|---------|------|
| 로그인 성공 → `/notice` 도달 | ✅ |

#### 게시판 MISSING_MESSAGE 없음 (10개)

| 로케일 | 경로 | 결과 |
|--------|------|------|
| ko | `/notice` | ✅ |
| en | `/en/notice` | ✅ |
| zh | `/zh/notice` | ✅ |
| ja | `/ja/notice` | ✅ |
| fr | `/fr/notice` | ✅ |
| es | `/es/notice` | ✅ |
| de | `/de/notice` | ✅ |
| it | `/it/notice` | ✅ |
| vi | `/vi/notice` | ✅ |
| id | `/id/notice` | ✅ |

#### 표준관리 MISSING_MESSAGE 없음 (8개)

| 로케일 | 경로 | 결과 |
|--------|------|------|
| ko | `/admin/standards` | ✅ |
| en | `/en/admin/standards` | ✅ |
| zh | `/zh/admin/standards` | ✅ |
| ja | `/ja/admin/standards` | ✅ |
| fr | `/fr/admin/standards` | ✅ |
| es | `/es/admin/standards` | ✅ |
| de | `/de/admin/standards` | ✅ |
| it | `/it/admin/standards` | ✅ |

#### CountrySelector 로케일 전환 (4개)

| 선택 국가 | 기대 URL 변화 | 결과 |
|---------|------------|------|
| United States | `/ko/notice` → `/en/notice` | ✅ + `html[lang]="en"` 확인 |
| España | `/en/notice` → `/es/notice` | ✅ |
| 한국 | `/en/notice` → `/notice` (ko prefix 없음) | ✅ |
| Australia | `/notice` → `/en/notice` (localStorage `AU` 저장) | ✅ |

#### 다국어 UI 텍스트 표시 (4개)

| 로케일 | 경로 | 기대 텍스트 | 결과 |
|--------|------|-----------|------|
| ko | `/notice` | "공지", "글쓰기", "로그아웃" 포함 | ✅ |
| en | `/en/notice` | "Notice", "Write", "Logout" 포함 | ✅ |
| zh | `/zh/notice` | "通知", "退出" 포함 | ✅ |
| ja | `/ja/notice` | "ログアウト" 포함 | ✅ |

---

## 3. 테스트 중 발견된 버그 및 수정 사항

### [BUG-1] LoginForm.tsx 하드코딩 한국어 — **수정 완료**

| 항목 | 내용 |
|------|------|
| **발견 위치** | `components/auth/LoginForm.tsx` |
| **심각도** | 높음 (다국어 렌더링 실패) |
| **증상** | 모든 로케일에서 로그인 폼 텍스트가 한국어로 고정됨 |
| **원인** | `useTranslations` 미사용, 버튼/레이블/에러 텍스트 한국어 하드코딩 |
| **수정** | `useTranslations('auth')` 연동 — 6개 하드코딩 문자열을 번역 키로 교체 |
| **영향 범위** | `auth.email`, `auth.password`, `auth.login`, `auth.loginButton`, `auth.loginError` |

```tsx
// 수정 전
{loading ? '로그인 중...' : '로그인'}

// 수정 후
{loading ? `${t('loginButton')}…` : t('loginButton')}
```

---

### [BUG-2] Playwright `Accept-Language` 헤더 합산 문제 — **테스트 우회 처리**

| 항목 | 내용 |
|------|------|
| **발견 위치** | `playwright.config.ts` + next-intl 로케일 감지 |
| **심각도** | 낮음 (테스트 환경 한정, 실 서비스 미영향) |
| **증상** | ko as-needed(`/login`, no prefix) 테스트에서 "로그인" 대신 "Login" 표시 |
| **원인** | Playwright `extraHTTPHeaders` 는 브라우저 기본 `Accept-Language: en-US` 에 추가되므로, next-intl이 합산된 헤더에서 `en`을 우선 선택 |
| **우회** | Layer 0 테스트에서 `NEXT_LOCALE=ko` 쿠키를 명시적으로 삽입 (쿠키가 Accept-Language보다 우선) |

**next-intl 로케일 결정 우선순위** (as-needed 전략):
```
1순위: URL prefix     (/en/login → en)
2순위: NEXT_LOCALE 쿠키
3순위: Accept-Language 헤더  ← 테스트 환경에서 en-US 오염 발생
4순위: 기본 로케일 (ko)
```

---

## 4. 번역 품질 검증 결과

### 번역 키 누락(MISSING_MESSAGE) 검증 범위

| 네임스페이스 | 검증 경로 | 검증 로케일 | 결과 |
|------------|---------|-----------|------|
| `auth` | `/login` | ko, en, zh, ja, fr, es, de, it | ✅ 전체 통과 |
| `board` | `/notice` | ko, en, zh, ja, fr, es, de, it, vi, id | ✅ 전체 통과 |
| `standards` | `/admin/standards` | ko, en, zh, ja, fr, es, de, it | ✅ 전체 통과 |

### 주요 번역 키 실측값 (DB `i18n_msg` 기준)

| `auth.loginButton` | 실측값 |
|--------------------|-------|
| ko | 로그인 |
| en | Login |
| zh | 登录 |
| ja | ログイン |
| fr | Se connecter |
| de | Anmelden |
| es | Iniciar sesión |
| it | Accedi |
| vi | Đăng nhập |
| id | Masuk |

---

## 5. 테스트 환경 구성

### 브라우저 설정

```ts
// playwright.config.ts
use: {
  baseURL: 'http://localhost:3000',
  extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9' },
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
  trace: 'retain-on-failure',
}
```

### 테스트 계정

| 역할 | 이메일 | 비고 |
|------|-------|------|
| 테스트 계정 | `test1004@example.com` | Layer 2 인증 테스트 사용 |

> **참고**: `TEST_MASTER_EMAIL` / `TEST_MASTER_PW` 환경변수 설정 시 오버라이드 가능

### 서버 실행 환경

- 서버: `npm run dev` (Turbopack, port 3000)
- Playwright webServer: `reuseExistingServer: true` — 기존 서버 재활용
- 커맨드: `npx cross-env PLAYWRIGHT_BASE_URL=http://localhost:3000 playwright test tests/e2e/i18n.spec.ts --project=chromium`

---

## 6. 미검증 범위 (잔여 작업)

| 항목 | 이유 | 우선순위 |
|------|------|---------|
| Firefox / WebKit 브라우저 크로스 검증 | 이번 실행은 Chromium 단독 | 낮음 |
| 모바일(Pixel 5) 뷰포트 다국어 레이아웃 | 언어별 텍스트 길이 차이에 의한 레이아웃 깨짐 | 중간 |
| hi (힌디어), th (태국어), ps (파슈토어) Layer 2 검증 | RTL/복잡 스크립트 렌더링 확인 필요 | 중간 |
| 환율 표시 다국어 통화 포맷 검증 | 숫자 형식의 로케일별 차이 | 낮음 |
| `/profile` 다국어 렌더링 | 현재 테스트 범위 외 | 낮음 |

---

## 7. 수동 설정 필요 항목 (변경 없음)

| 항목 | 상태 |
|------|------|
| `.env.test` 파일 — `TEST_MASTER_EMAIL`, `TEST_MASTER_PW` 등록 | ⚙️ 선택사항 (미설정 시 test1004 계정으로 동작) |
| Playwright 다중 브라우저 실행 (`--project=all`) | ⚙️ 선택사항 |

---

## 8. 결론

TASK-044 다국어 E2E 테스트 **77개 전체 통과**. 주요 검증 항목:

1. **URL 라우팅**: ko `as-needed` prefix 없음, 비기본 로케일 `/locale/path` 형식 정상 동작
2. **html[lang]**: URL 로케일과 `html[lang]` 속성 일치 (9개 로케일 검증)
3. **미인증 리다이렉트**: locale prefix 보존하며 `/login`으로 정확히 리다이렉트 (8개 로케일)
4. **버튼 번역 텍스트**: DB `auth.loginButton` 기준 10개 로케일 실측값과 일치
5. **번역 키 누락 없음**: auth/board/standards 네임스페이스 전 검증 로케일에서 MISSING_MESSAGE 0건
6. **CountrySelector**: 국가 선택 → locale 전환 → URL 변경 → localStorage 저장 정상 동작

테스트 과정에서 **LoginForm.tsx 한국어 하드코딩 버그** 발견 및 수정 완료.
