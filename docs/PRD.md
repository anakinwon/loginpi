# PRD: Pi Network 기반 풀스택 앱 플랫폼

> **버전**: v2.0
> **작성일**: 2026-06-05
> **최종 업데이트**: 2026-06-05
> **작성자**: anakin
> **배포 URL**: https://loginpi.vercel.app
> **저장소**: https://github.com/anakinwon/loginpi

---

## 1. 프로젝트 개요

Pi Network 생태계 위에서 동작하는 풀스택 웹 앱 플랫폼.
Pi 계정 인증·결제를 핵심으로, Google 소셜 로그인·계정 연동·관리자 시스템을 구현 완료했으며,
게시판·다국어까지 단계적으로 확장한다.

| 항목 | 내용 |
|---|---|
| 프레임워크 | Next.js 15 App Router |
| 배포 | Vercel (프로덕션: loginpi.vercel.app) |
| 인증 1 | Pi Network (Pi SDK 2.0) |
| 인증 2 | Google OAuth (NextAuth.js / Auth.js) |
| DB | Supabase PostgreSQL |
| 결제 | Pi Coin (U2A) |
| 대상 환경 | Pi Browser + 일반 브라우저 |

---

## 2. 🛠️ 기술 스택 (최신 버전)

### 🎨 프론트엔드 프레임워크

- **Next.js 15** (App Router) - React 풀스택 프레임워크, SSR/CSR 최적화
- **React 19** - UI 라이브러리 (최신 동시성 기능)
- **TypeScript 5.6+** - 타입 안전성 보장

### 🎨 스타일링 & UI

- **Tailwind CSS v4** - 유틸리티 CSS 프레임워크 (설정 파일 없는 새로운 엔진)
- **shadcn/ui** - 고품질 React 컴포넌트 라이브러리
- **Lucide React** - 아이콘 라이브러리

### 📝 폼 & 검증

- **React Hook Form 7.x** - 폼 상태 관리
- **Zod** - 스키마 검증 라이브러리

### 🗄️ 백엔드 & 데이터베이스

- **Supabase** - BaaS (인증 with Auth, PostgreSQL 데이터베이스)
- **PostgreSQL** - 관계형 데이터베이스 (Supabase 호스팅)

### 🚀 배포 & 호스팅

- **Vercel** - Next.js 최적화 배포 플랫폼

### 📦 패키지 관리

- **npm** - 의존성 관리

---

## 3. 전체 기능 현황

| # | 기능 | 상태 | Phase |
|---|---|---|---|
| 1 | 스타터킷 현행화 (Next.js 15 + Tailwind v4 + shadcn/ui base-nova) | ✅ **완료** | Phase 0 |
| 2 | Pi 계정 로그인 | ✅ **완료** | Phase 1 |
| 3 | Google 계정 로그인 | ✅ **완료** | Phase 1 |
| 4 | Pi + Google 계정 연동 | ✅ **완료** | Phase 1 |
| 5 | Pi Coin 결제 | ✅ **완료** | Phase 2 |
| 6 | 관리자 기능 (대시보드 + 사용자 관리) | 🔄 **진행 중** | Phase 3 |
| 7 | 통합 게시판 | ⏳ 미완성 | Phase 4 |
| 8 | 데이터 표준 시스템 | ⏳ 미완성 | Phase 5 |
| 9 | 다국어 처리 | ⏳ 미완성 | Phase 6 |

---

## 4. Phase 0 — 스타터킷 현행화 ✅ (완료)

### 완료된 항목
- [x] Next.js 15 App Router + React 19 + TypeScript strict
- [x] Tailwind CSS v4 (CSS-first, `tailwind.config` 없음)
- [x] shadcn/ui base-nova (`@base-ui/react` 기반, `asChild` 없음)
- [x] next-themes 다크모드 연동 (`@custom-variant dark`)
- [x] t3-env + Zod 빌드 시점 환경변수 검증
- [x] pnpm 11 빌드 스크립트 허용 (`pnpm-workspace.yaml allowBuilds`)
- [x] Vercel 배포 파이프라인

### 핵심 아키텍처 사항
- `asChild` prop 미지원 → `className={cn(buttonVariants({...}))}` 패턴 사용
- Tailwind v4 테마는 `globals.css` `@theme inline {}` 블록으로 관리
- `src/app/globals.css`의 `@custom-variant dark (&:where(.dark, .dark *))` 한 줄이 다크모드 핵심

---

## 5. Phase 1 — Pi Network 인증 + 결제 ✅ (완료)

### 5-1. Pi 계정 로그인

**구현 파일**
```
types/pi-network.d.ts              # window.Pi 전역 타입 + PaymentDTO
src/types/pi-session.ts            # PiSessionUser 공유 타입
src/app/api/auth/pi/route.ts       # GET(세션복원) POST(검증) DELETE(로그아웃)
src/app/api/auth/dev/route.ts      # 개발 환경 mock 로그인 (prod: 404)
src/components/pi-auth-provider.tsx    # React Context + Pi Browser 감지 + 인증
src/components/pi-login-button.tsx     # 헤더용 간결 버튼
src/components/pi-user-card.tsx        # 전체 사용자 정보 카드
```

**Pi Browser 감지 방식 (핵심)**

UA 패턴 감지는 신뢰도 낮음 → **`Pi.authenticate()` 성공 여부**로 판단:

```typescript
// 일반 브라우저에서 Pi.authenticate()가 pending으로 멈추는 문제 해결
const auth = await Promise.race([
  window.Pi.authenticate(['username', 'wallet_address', 'payments'], onIncompletePayment),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 5000)
  ),
])
// 성공 → isInPiBrowser = true
// 실패/타임아웃 → isInPiBrowser = false
```

**isInPiBrowser 단일 Flag로 모든 UI 제어**

| 브라우저 | 표시 항목 |
|---|---|
| Pi Browser | Pi Network 카드, Pi 로그인 버튼, Pi 결제 섹션 |
| 일반 브라우저 | Google 카드, Google 로그인 버튼 |
| 공통 | 계정 연동 카드 |

**세션 보안**
- HMAC-SHA256 서명 쿠키 (`pi_session`)
- `httpOnly`, `sameSite: 'strict'`, `tokenValidUntil` 기반 maxAge

### 5-2. Pi Coin 결제

**구현 파일**
```
src/app/api/payments/approve/route.ts  # Phase 1 서버 승인
src/app/api/payments/complete/route.ts # Phase 3 서버 완료
src/components/pi-pay-button.tsx       # 수량 입력 + 결제 버튼
src/components/pi-product-card.tsx     # 상품명/수량/단가 결제 카드
```

**결제 3단계 흐름**
```
createPayment() → onReadyForServerApproval → POST /approve
                → [Pi 지갑 사용자 확인]
                → onReadyForServerCompletion → POST /complete
```

**환경변수**
```env
PI_API_KEY=<Pi Developer Portal 발급>   # Authorization: Key (Bearer 아님)
```

---

## 6. Phase 2 — Google 계정 로그인 + Pi·Google 연동 ✅ (완료)

### 6-1. Google 계정 로그인

**구현 방식**: NextAuth.js (Auth.js) v5 + Google OAuth Provider

**구현 파일**
```
src/auth.ts                              # NextAuth 설정 + Supabase 어댑터 연동
src/app/api/auth/[...nextauth]/route.ts  # NextAuth 핸들러
src/components/google-login-button.tsx   # Google 로그인 버튼
src/components/google-user-card.tsx      # Google 사용자 정보 카드
src/types/next-auth.d.ts                 # NextAuth 타입 확장 (sub, id 포함)
```

**DB 스키마 (Supabase users 테이블)**
```
users
├── id (UUID, PK)
├── pi_uid (string, unique, nullable)      ← Pi 계정
├── pi_username (string, nullable)
├── google_id (string, unique, nullable)   ← Google 계정 (OAuth sub)
├── google_email (string, nullable)
├── google_name (string, nullable)
├── display_name (string)
├── role (enum: ADMIN | MASTER | MANAGER | USER)
├── created_at, updated_at
```

### 6-2. Pi + Google 계정 연동

**연동 방식**: 6자리 일회성 코드 기반 크로스 브라우저 연동

**구현 파일**
```
src/app/api/auth/link-start/route.ts   # Pi 세션으로 6자리 코드 생성 (10분 유효)
src/app/api/auth/link-complete/route.ts # Google 세션으로 코드 검증 + DB 연동
src/app/api/auth/link-status/route.ts  # 연동 상태 조회 (google_id + google_email fallback)
src/app/api/auth/link/route.ts         # 연동 처리 API
src/app/link/page.tsx                  # 코드 생성(Pi Browser) / 코드 입력(일반 브라우저)
src/app/link/complete/page.tsx         # 연동 완료 처리
src/components/account-link-card.tsx   # 연동 상태 카드 + 코드 생성/입력 UI
src/lib/supabase-admin.ts              # Supabase admin 클라이언트 (lazy init)
src/lib/users.ts                       # users 테이블 CRUD 헬퍼
src/lib/auth-check.ts                  # Pi + Google 세션 통합 확인 (server-only)
```

**연동 흐름**
```
[Pi Browser]
  → 계정 연동 카드에서 "연동 코드 생성" 버튼
  → 6자리 코드 표시 + "연동하러가기 → (URL 복사)" 버튼
  → URL 클립보드 복사 (Pi Browser WebView → 일반 브라우저 전달 유일한 방법)

[일반 브라우저]
  → /link?code=XXXXXX 접속 (코드 자동 채워짐)
  → Google 로그인 후 "Google 연동" 버튼
  → 코드 검증 → DB users.google_id + google_email 업데이트
```

**link-status API 중요 사항**
- `google_id` 형식 불일치(UUID vs OAuth sub) 대비 `google_email` fallback 조회 구현
- Pi Browser WebView 쿠키 미전송 시 `X-Pi-Token` 헤더 fallback 인증

---

## 7. Phase 3 — 관리자 기능 🔄 (진행 중)

### 구현 완료

**구현 파일**
```
src/app/(admin)/layout.tsx              # 관리자 전용 레이아웃 + ADMIN/MASTER 역할 접근 제어
src/app/(admin)/admin/page.tsx          # /admin — 대시보드 (사용자 통계 카드)
src/app/(admin)/admin/users/page.tsx    # /admin/users — 사용자 목록 + 역할 변경
src/app/api/admin/users/route.ts        # GET 전체 사용자 목록
src/app/api/admin/users/[id]/route.ts   # PATCH 역할 변경
src/components/admin/admin-sidebar.tsx  # 관리자 사이드바 네비게이션
```

**라우팅 구조 주의사항**
- `(admin)` route group은 URL에 영향 없음
- 올바른 위치: `src/app/(admin)/admin/page.tsx` → URL: `/admin`
- 잘못된 위치: `src/app/(admin)/page.tsx` → URL: `/` (홈과 충돌!)

**RBAC 구조**
```
ADMIN   — 전체 관리 권한 (역할 변경, 시스템 설정)
MASTER  — 사용자 관리, 게시판 관리
MANAGER — 게시글 승인/삭제
USER    — 일반 사용자
```

### 미구현 항목

- [ ] 결제 내역 관리 (`/admin/payments`)
- [ ] 계정 연동 현황 조회 (`/admin/links`)

---

## 8. Phase 4 — 통합 게시판 ⏳ (미완성)

### 게시판 카테고리
| 카테고리 | 글쓰기 권한 | 설명 |
|---|---|---|
| NOTICE (공지) | MASTER 이상 | 공지사항 |
| ARCHIVE (자료실) | MANAGER 이상 | 자료 공유 |
| FREE (자유) | USER 이상 | 자유 게시판 |
| QNA (질문) | USER 이상 | 질문/답변, 채택 기능 |

### 요구사항
- 게시글 CRUD (작성/조회/수정/삭제)
- 댓글 (작성/삭제, QNA 채택)
- 첨부파일 (업로드/다운로드, 20MB/5개 제한)
- 검색 (제목+내용), 페이지네이션
- 조회수 카운트
- 관리자 핀 고정, 강제 삭제

**DB 테이블** (Supabase)
```
brd_ctgr  — 게시판 카테고리
brd_post  — 게시글 (논리삭제: del_yn)
brd_cmnt  — 댓글 (논리삭제: del_yn)
brd_attch — 첨부파일 (Supabase Storage 연동)
```

---

## 9. Phase 5 — 데이터 표준 시스템 ⏳ (미완성)

### 요구사항
- **표준단어** (STD_DIC): 논리명·물리명·약어·도메인 연결 CRUD
- **표준도메인** (STD_DOM): 데이터타입·길이·소수점 CRUD
- **표준용어** (DA_TERM): 단어 조합으로 물리명 자동 생성
- 중복 체크 API
- DDL Export (표준용어 → PostgreSQL DDL 스크립트)
- Audit Trail (변경 이력 추적)
- 승인 워크플로우 (MASTER 결재)

---

## 10. Phase 6 — 다국어 처리 ⏳ (미완성)

### 요구사항
- **지원 언어**: 최소 한국어(ko) · 영어(en) · 중국어(zh) · 일본어(ja)
- **라이브러리**: `next-intl` v4
- **라우팅**: `[locale]` 디렉토리 (`/ko/`, `/en/` — as-needed prefix)
- **번역 파일**: `messages/{locale}.json`
- **DB 번역 관리**: Supabase `i18n_msg` 테이블

---

## 11. 환경변수 전체 목록

| 변수명 | Phase | 용도 | 상태 |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | 0 | 앱 URL | ✅ 설정 완료 |
| `PI_SESSION_SECRET` | 1 | HMAC 세션 서명 (32자+) | ✅ 설정 완료 |
| `NEXT_PUBLIC_PI_SANDBOX` | 1 | Pi 샌드박스 모드 | ✅ 설정 완료 |
| `PI_API_KEY` | 1 | Pi 결제 API 키 | ✅ 설정 완료 |
| `AUTH_SECRET` | 2 | NextAuth.js 서명 시크릿 | ✅ 설정 완료 |
| `GOOGLE_CLIENT_ID` | 2 | Google OAuth Client ID | ✅ 설정 완료 |
| `GOOGLE_CLIENT_SECRET` | 2 | Google OAuth Client Secret | ✅ 설정 완료 |
| `NEXT_PUBLIC_SUPABASE_URL` | 2 | Supabase 프로젝트 URL | ✅ 설정 완료 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 2 | Supabase Anon Key | ✅ 설정 완료 |
| `SUPABASE_SERVICE_ROLE_KEY` | 2 | Supabase Service Role (서버 전용) | ✅ 설정 완료 |

---

## 12. 디렉토리 구조

```
src/
├── app/
│   ├── (admin)/                    # 관리자 route group
│   │   ├── layout.tsx              # RBAC 접근 제어 레이아웃
│   │   └── admin/
│   │       ├── page.tsx            # /admin 대시보드
│   │       └── users/
│   │           └── page.tsx        # /admin/users 사용자 관리
│   ├── api/
│   │   ├── admin/users/            # 관리자 API
│   │   ├── auth/
│   │   │   ├── [...nextauth]/      # NextAuth 핸들러
│   │   │   ├── pi/                 # Pi 인증 API
│   │   │   ├── dev/                # 개발용 mock 로그인
│   │   │   ├── link/               # 연동 처리
│   │   │   ├── link-start/         # 코드 생성
│   │   │   ├── link-complete/      # 코드 검증 + 연동
│   │   │   └── link-status/        # 연동 상태 조회
│   │   └── payments/               # Pi 결제 API
│   ├── link/
│   │   ├── page.tsx                # 코드 생성/입력 페이지
│   │   └── complete/               # 연동 완료
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                    # 홈 (로그인 + 기술 스택 쇼케이스)
├── components/
│   ├── admin/admin-sidebar.tsx
│   ├── layout/                     # Header, Footer
│   ├── ui/                         # shadcn/ui 컴포넌트
│   ├── account-link-card.tsx       # Pi+Google 연동 카드
│   ├── google-login-button.tsx
│   ├── google-user-card.tsx
│   ├── pi-auth-provider.tsx        # Pi 인증 Context
│   ├── pi-login-button.tsx
│   ├── pi-pay-button.tsx
│   ├── pi-payment-demo.tsx
│   ├── pi-product-card.tsx
│   └── pi-user-card.tsx
├── lib/
│   ├── auth-check.ts               # Pi + Google 세션 통합 (server-only)
│   ├── pi-session-crypto.ts        # HMAC-SHA256 서명/검증
│   ├── supabase-admin.ts           # Supabase admin 클라이언트 (lazy init)
│   ├── users.ts                    # users 테이블 헬퍼
│   └── utils.ts                    # cn() 유틸
├── types/
│   ├── next-auth.d.ts              # NextAuth 타입 확장
│   └── pi-session.ts               # PiSessionUser 타입
├── auth.ts                         # NextAuth 설정 파일
└── env.ts                          # t3-env 환경변수 스키마
```

---

## 13. 로드맵 타임라인

```
Phase 0  ── 스타터킷 현행화 ──────────────────── ✅ 완료
Phase 1  ── Pi 인증 + Pi 결제 ─────────────────── ✅ 완료
Phase 2  ── Google 로그인 + Pi·Google 연동 ────── ✅ 완료
Phase 3  ── 관리자 기능 ─────────────────────────────── 🔄 진행 중
Phase 4  ── 통합 게시판 ───────────────────────────────────── ⏳
Phase 5  ── 데이터 표준 시스템 ──────────────────────────────────── ⏳
Phase 6  ── 다국어 처리 ─────────────────────────────────────────────── ⏳
```

---

## 14. 참고 문서

| 문서 | 위치 | 내용 |
|---|---|---|
| Pi 인증 스킬 | `.claude/skills/pi_auth/SKILL.md` | Pi 인증 구현 전체 가이드 (현행 코드 기준) |
| Pi 결제 스킬 | `.claude/skills/pi_pay/SKILL.md` | Pi 결제 구현 전체 가이드 |
| 다국어 PRD | `docs/PRD_MUL_LAN.md` | 다국어 상세 요구사항 |
| 보안 PRD | `docs/PRD_SECURITY.md` | OWASP 기반 보안 점검 항목 |

---

## 15. 변경 이력

| 버전 | 날짜 | 내용 | 작성자 |
|---|---|---|---|
| v1.0 | 2026-06-05 | 초안 작성 — Pi Network 플랫폼 기준 전면 작성 | anakin |
| v2.0 | 2026-06-05 | Phase 0~2 완료 반영. Phase 3 진행 상황 반영. NextAuth.js + Supabase 기술 스택 추가. Pi Browser 감지 방식 업데이트 (UA → authenticate() 성공 여부). admin 404 라우팅 수정 반영. | anakin |
