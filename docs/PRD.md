# PRD: Pi Network 기반 풀스택 앱 플랫폼

> **버전**: v3.0
> **작성일**: 2026-06-05
> **최종 업데이트**: 2026-06-07
> **작성자**: anakin
> **배포 URL**: https://loginpi.vercel.app
> **저장소**: https://github.com/anakinwon/loginpi

---

## 1. 프로젝트 개요

Pi Network 생태계 위에서 동작하는 풀스택 웹 앱 플랫폼.
Pi 계정 인증·결제, Google 소셜 로그인, 계정 연동, 관리자 시스템, 게시판, 다국어를 모두 구현 완료.

| 항목 | 내용 |
|---|---|
| 프레임워크 | Next.js 15 App Router |
| 배포 | Vercel (loginpi.vercel.app) |
| 인증 1 | Pi Network (Pi SDK 2.0) |
| 인증 2 | Google OAuth (NextAuth.js v5) |
| DB | Supabase PostgreSQL |
| 결제 | Pi Coin (U2A) |
| 다국어 | next-intl v4 (18개 언어 + AI 자동번역) |
| 대상 환경 | Pi Browser + 일반 브라우저 |

---

## 2. 기술 스택

| 분류 | 기술 |
|---|---|
| 프레임워크 | Next.js 15 App Router + React 19 + TypeScript strict |
| 스타일 | Tailwind CSS v4 (CSS-first) + shadcn/ui base-nova (`@base-ui/react`) |
| 인증 | Pi SDK 2.0 + NextAuth.js v5 (Google OAuth) |
| DB | Supabase PostgreSQL (RLS 비활성화, 서버 전용 service_role 사용) |
| 다국어 | next-intl v4 + Gemini 2.5 Flash AI 번역 |
| 배포 | Vercel + pnpm 11 |
| 환경변수 검증 | t3-env + Zod (빌드 시점 실패) |

---

## 3. 전체 기능 현황

| # | 기능 | 상태 | Phase |
|---|---|---|---|
| 1 | 스타터킷 현행화 (Next.js 15 + Tailwind v4 + shadcn/ui base-nova) | ✅ 완료 | Phase 0 |
| 2 | Pi 계정 로그인 + HMAC 세션 | ✅ 완료 | Phase 1 |
| 3 | Pi Coin 결제 (U2A 3단계) | ✅ 완료 | Phase 1 |
| 4 | Google 계정 로그인 (NextAuth.js) | ✅ 완료 | Phase 2 |
| 5 | Pi + Google 계정 연동 (6자리 OTP) | ✅ 완료 | Phase 2 |
| 6 | 관리자 시스템 (대시보드·사용자·결제·연동현황) | ✅ 완료 | Phase 3 |
| 7 | 통합 게시판 (4종 + 댓글·첨부·채택) | ✅ 완료 | Phase 4 |
| 8 | 데이터 표준 시스템 (표준단어·도메인·용어·DDL·감사) | ✅ 완료 | Phase 5 |
| 9 | 다국어 처리 (next-intl v4 + Gemini AI 번역) | ✅ 완료 | Phase 6 |

---

## 4. Phase 0 — 스타터킷 현행화 ✅

- Next.js 15 App Router + React 19 + TypeScript strict
- Tailwind CSS v4 (`tailwind.config` 없음, `globals.css` CSS-first)
- shadcn/ui base-nova (`@base-ui/react`, `asChild` prop 없음)
- next-themes 다크모드 (`@custom-variant dark (&:where(.dark, .dark *))`)
- t3-env 빌드 시점 환경변수 검증
- pnpm 11 + `pnpm-workspace.yaml allowBuilds`

---

## 5. Phase 1 — Pi 인증 + Pi 결제 ✅

### Pi 계정 로그인
- `Pi.authenticate()` 성공 여부로 Pi Browser 감지 (UA 패턴은 신뢰도 낮음)
- HMAC-SHA256 서명 세션 쿠키 (`httpOnly`, `sameSite: strict`)
- `pi_session` 쿠키 검증 + `X-Pi-Token` 헤더 fallback

### Pi Coin 결제 (U2A)
```
createPayment() → onReadyForServerApproval → POST /api/payments/approve
               → [Pi 지갑 사용자 확인]
               → onReadyForServerCompletion → POST /api/payments/complete
```
- `/complete` 미구현 시 해당 사용자의 모든 미래 결제 영구 차단 (치명적 트랩)
- `onIncompletePayment` 핸들러로 미완료 결제 자동 복구 필수

---

## 6. Phase 2 — Google 로그인 + 계정 연동 ✅

### Google 로그인
- NextAuth.js v5 + Google OAuth Provider + Supabase 어댑터

### Pi·Google 계정 연동 (6자리 OTP 방식)
Pi Browser WebView는 `target='_blank'`가 WebView 내에서 열림 → 외부 브라우저 강제 불가
→ **URL 클립보드 복사**로 일반 브라우저에 코드 전달

```
Pi Browser → "코드 생성" (6자리, 10분 유효) → "연동 URL 복사"
일반 브라우저 → Google 로그인 → 코드 입력 → 계정 연동 완료
```

---

## 7. Phase 3 — 관리자 기능 ✅

**RBAC**: `ADMIN` / `MASTER` / `MANAGER` / `USER`

| 관리자 페이지 | URL | 기능 |
|---|---|---|
| 대시보드 | `/admin` | 사용자 통계 4종 |
| 사용자 관리 | `/admin/users` | 목록 + 역할 변경 |
| 결제 내역 | `/admin/payments` | 상태 필터 5종 + π 합계 |
| 계정 연동 현황 | `/admin/links` | 연동/Pi전용/Google전용 분류 |
| 게시판 관리 | `/admin/board` | 핀 토글 + 강제 삭제 |

---

## 8. Phase 4 — 통합 게시판 ✅

| 카테고리 | 코드 | 최소 작성 역할 |
|---|---|---|
| 공지 | NOTICE | MASTER |
| 자료실 | ARCHIVE | MANAGER |
| 자유 | FREE | USER |
| 질문 | QNA | USER |

- 게시글 CRUD (논리삭제 `del_yn`)
- 댓글, 채택 (QNA), 첨부파일 (20MB × 5개, Supabase Storage)
- 검색 + 페이지네이션 (PostgREST 인젝션 방지 처리 포함)

---

## 9. Phase 5 — 데이터 표준 시스템 ✅

- 표준단어(`std_dic`) / 표준도메인(`std_dom`) / 표준용어(`std_term`) CRUD
- DDL Export (PostgreSQL / MySQL, 도메인 약어 기반 타입 자동 추론)
- Audit Trail (`std_audit_log`, JSONB old/new 값 저장)
- 승인 워크플로우 (`approval_queue`, MASTER 전용)
- DA 품질 표준화: Migration 003~010, 전 테이블 `regr_id/reg_dtm/modr_id/mod_dtm NOT NULL DEFAULT`

---

## 10. Phase 6 — 다국어 처리 ✅

- **라이브러리**: next-intl v4 (`[locale]` App Router 라우팅)
- **지원 언어**: 18개 (ko/en/zh/ja/hi/vi/af/fil/th/id/ms/es/fr/de/it/ru/pt/ar) + il(이스라엘)/au(호주) 등
- **라우팅**: `as-needed` prefix (기본언어 ko는 `/`, 나머지는 `/en/`, `/zh/` 등)
- **번역 파일**: `messages/{locale}.json` — `ko.json`이 source of truth
- **fallback**: locale → en → ko (키 노출 방지)
- **AI 번역**: Gemini 2.5 Flash, 배치 50건 + 4.5초 rate-limit 대기
- **routing.ts**: 203개 국가 코드 선점 등록 (Admin 활성화 시 재배포 불필요)
- **단일 소스**: `src/lib/locale-currency.ts` / `src/lib/locale-country.ts`로 중복 제거

**핵심 아키텍처**:
- `routing.ts`는 빌드 시점 정적 — Vercel 프로덕션에서는 런타임 수정 불가
- Admin 활성화 시 `addLocaleToRouting()` 로컬 자동 수정 시도 (프로덕션은 무시)
- locale_cd 형식 검증: `/^[a-z]{2,3}(-[A-Z]{2,3})?$/` (보안 인젝션 방지)

---

## 11. 환경변수 전체 목록

| 변수명 | Phase | 용도 |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | 0 | 앱 URL |
| `PI_SESSION_SECRET` | 1 | HMAC 세션 서명 (32자+) |
| `NEXT_PUBLIC_PI_SANDBOX` | 1 | Pi 샌드박스 모드 |
| `PI_API_KEY` | 1 | Pi 결제 API 키 |
| `AUTH_SECRET` | 2 | NextAuth.js 서명 시크릿 |
| `GOOGLE_CLIENT_ID` | 2 | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | 2 | Google OAuth Client Secret |
| `NEXT_PUBLIC_SUPABASE_URL` | 2 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 2 | Supabase Anon Key |
| `SUPABASE_SERVICE_ROLE_KEY` | 2 | Supabase Service Role (서버 전용) |
| `GEMINI_API_KEY` | 6 | Gemini AI 번역 (aistudio.google.com 무료 발급) |
| `RESEND_API_KEY` | 6 | 결제 영수증 이메일 발송 |

---

## 12. 디렉토리 구조

```
src/
├── app/
│   ├── [locale]/               # next-intl 다국어 라우팅
│   │   ├── (admin)/            # 관리자 route group
│   │   │   └── admin/
│   │   │       ├── page.tsx            # /admin 대시보드
│   │   │       ├── users/              # 사용자 관리
│   │   │       ├── payments/           # 결제 내역
│   │   │       ├── links/              # 연동 현황
│   │   │       ├── board/              # 게시판 관리
│   │   │       ├── std/                # 데이터 표준 (words/domains/terms/ddl/audit/approvals)
│   │   │       └── i18n/               # 다국어 관리
│   │   ├── board/              # 게시판
│   │   ├── link/               # Pi·Google 계정 연동
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── api/
│   │   ├── admin/              # 관리자 API (users/payments/links/board/std/i18n)
│   │   ├── auth/               # 인증 (pi/dev/link-start/link-complete/link-status/[...nextauth])
│   │   ├── board/              # 게시판 API
│   │   └── payments/           # Pi 결제 (approve/complete)
│   ├── globals.css             # Tailwind v4 + @custom-variant dark
│   └── layout.tsx              # 루트 레이아웃 (next-intl 없음)
├── components/
│   ├── admin/                  # 관리자 UI 컴포넌트
│   ├── layout/                 # Header, Footer, pi-price-chip, language-switcher
│   └── ui/                     # shadcn/ui 컴포넌트 (@base-ui/react)
├── i18n/
│   ├── routing.ts              # next-intl defineRouting (203개 locale 선점 등록)
│   └── request.ts              # getRequestConfig (3단계 fallback)
├── lib/
│   ├── auth-check.ts           # Pi + Google 세션 통합 (server-only)
│   ├── board.ts                # 게시판 헬퍼
│   ├── locale-currency.ts      # LOCALE_CURRENCY 단일 소스
│   ├── locale-country.ts       # LOCALE_COUNTRY + getAlpha2 단일 소스
│   ├── supabase-admin.ts       # Supabase admin 클라이언트 (lazy init)
│   ├── users.ts                # sys_user 테이블 CRUD
│   └── utils.ts                # cn() 유틸
├── messages/                   # 번역 파일 ({locale}.json)
│   ├── ko.json                 # source of truth (409개 키)
│   └── en/zh/ja/...            # 18개+ 언어
├── types/
│   ├── next-auth.d.ts          # NextAuth 타입 확장
│   └── pi-session.ts           # PiSessionUser 타입
├── auth.ts                     # NextAuth 설정
└── env.ts                      # t3-env 환경변수 스키마
```

---

## 13. DB 테이블 현황

| 스키마 | 테이블 | 설명 |
|---|---|---|
| public | sys_user | 사용자 (Pi + Google 통합) |
| public | pi_pymnt | Pi 결제 내역 |
| public | auth_link_cd | Pi·Google 연동 OTP 코드 |
| public | brd_ctgr/post/cmnt/attch | 게시판 |
| public | std_dic/dom/term | 데이터 표준 |
| public | std_audit_log | 변경 이력 |
| public | approval_queue | 승인 워크플로우 |
| public | i18n_locale | 활성 언어 목록 |
| public | i18n_message | DB 번역 관리 |
| public | i18n_cntry_mst | 국가 마스터 |

---

## 14. 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v1.0 | 2026-06-05 | 초안 작성 — Pi Network 플랫폼 기준 |
| v2.0 | 2026-06-05 | Phase 0~3 진행 상황 반영 |
| v3.0 | 2026-06-07 | Phase 4~6 완료 반영. 다국어 아키텍처 상세화. 환경변수 전체 목록 갱신. 디렉토리 구조 전면 업데이트 |
