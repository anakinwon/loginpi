# Pi Network 기반 풀스택 앱 플랫폼 — 개발 로드맵

Pi Browser + 일반 브라우저를 모두 지원하는 Next.js 15 기반 Pi Network 앱 플랫폼

> **기준일**: 2026-06-05
> **현재 버전**: Phase 4 완료 → Phase 5 대기
> **배포 URL**: https://loginpi.vercel.app
> **기술 스택**: Next.js 15 App Router · React 19 · TypeScript · Tailwind CSS v4 · NextAuth.js · Supabase PostgreSQL

---

## ★ 핵심 기능 — 재사용 구현 가이드

> 이 플랫폼의 가장 중요한 두 기능. 다른 Pi Network 프로젝트 시작 시 이 두 SKILL 파일이 완전한 구현 매뉴얼이 된다.

### ① Pi + Google 계정 연동 ✅ 구현 완료

**위치**: `.claude/skills/pi_google_link/SKILL.md`

Pi Browser는 WebView 안에서 실행되어 외부 브라우저를 열 수 없다.
이 제약을 **6자리 OTP 코드 + URL 클립보드 복사** 방식으로 해결.

```
Pi Browser → "코드 생성" → 6자리 코드
Pi Browser → "연동 URL 복사" → 클립보드 (https://yourapp.com/link?code=123456)
사용자가 직접 일반 브라우저에 붙여넣기
일반 브라우저 → Google 로그인 → "연동 완료" → users 테이블 합쳐짐
```

**핵심 설계 원칙**:
- `users` 테이블 단일화 — Pi row를 원본으로, Google 필드를 덧씌움
- `session.user.sub` = Google OAuth raw sub (google_id 저장용)
- `session.user.id` = users row UUID (연동 후 변경됨 — 조회 불가)
- 브루트포스 방지: 최대 5회 시도 제한 (attempt_count)
- Pi Browser WebView 쿠키 실패 → X-Pi-Token 헤더 fallback

**재사용 시 필요 파일**:
```
src/auth.ts · src/lib/users.ts · src/lib/supabase-admin.ts
src/app/api/auth/link-start/ · link-complete/ · link-status/
src/app/link/page.tsx · src/components/account-link-card.tsx
```

---

### ② Pi 결제 시스템 (U2A) ✅ 구현 완료

**위치**: `.claude/skills/pi_pay/SKILL.md`

Pi Network 공식 SDK U2A(User-to-App) 결제 3단계 흐름 구현.
**`/complete` 미구현 시 해당 사용자의 모든 미래 결제가 영구 차단**되는 치명적 트랩 포함.

```
1. createPayment()           — 클라이언트: 결제 생성
2. onReadyForServerApproval  — 클라이언트 → POST /api/payments/approve
3. [사용자 Pi 지갑에서 승인]
4. onReadyForServerCompletion — 클라이언트 → POST /api/payments/complete  ← 반드시 구현
```

**핵심 설계 원칙**:
- Pi 사용자 정보 API: `Authorization: Bearer <accessToken>`
- Pi 결제 API: `Authorization: Key <PI_API_KEY>` ← 완전히 다름
- `onIncompletePayment` 핸들러로 미완료 결제 자동 복구 필수
- sandbox 모드: `NEXT_PUBLIC_PI_SANDBOX=true` 환경변수로 제어

**재사용 시 필요 파일**:
```
src/app/api/payments/approve/ · complete/
src/components/pi-pay-button.tsx · pi-product-card.tsx
```

---

## 개요

Pi Network 생태계를 위한 풀스택 웹 앱 플랫폼.
Pi Browser와 일반 브라우저를 완전히 분리 감지하여 각 환경에 최적화된 UI를 제공한다.
Pi 인증·결제 구현을 완료했고, Google 계정 연동까지 마쳤다.
관리자 시스템·게시판·다국어를 단계적으로 추가한다.

---

## 개발 워크플로우

1. 기능 구현 후 타입 체크 (`pnpm tsc --noEmit`) 통과 확인
2. 커밋 메시지는 한국어로 작성
3. **커밋·배포는 명시적 요청 시에만 수행** (자동 커밋·푸시 금지)
4. 새 Phase 시작 전 이 파일에 계획 수립

---

## Phase 0: 스타터킷 현행화 ✅ (완료)

> **목표**: 최신 Next.js 15 생태계 기반의 재사용 가능한 스타터킷 구축

- **TASK-001: Next.js 15 + Tailwind v4 + shadcn/ui base-nova 환경 셋업** ✅
  - ✅ Next.js 15 App Router + React 19 + TypeScript strict mode
  - ✅ Tailwind CSS v4 (CSS-first, `tailwind.config` 없음, `@theme inline {}`)
  - ✅ shadcn/ui base-nova (`@base-ui/react` 기반, `asChild` 없음)
  - ✅ next-themes 다크모드 (`@custom-variant dark (&:where(.dark, .dark *))`)
  - ✅ t3-env + Zod 빌드 시점 환경변수 검증
  - ✅ pnpm 11 빌드 스크립트 허용 (`pnpm-workspace.yaml allowBuilds`)
  - ✅ Vercel 배포 파이프라인 구성

---

## Phase 1: Pi Network 인증 + 결제 ✅ (완료)

> **목표**: Pi Browser 자동 인증, 수동 로그인, Pi Coin 결제 U2A 구현

### TASK-002: Pi 계정 인증 ✅ 완료

- ✅ `types/pi-network.d.ts` — `window.Pi`, `PiUserDTO`, `PaymentDTO` 전역 타입
- ✅ `src/types/pi-session.ts` — `PiSessionUser` 공유 타입
- ✅ `src/app/api/auth/pi/route.ts` — GET(세션복원) / POST(HMAC 서명 쿠키) / DELETE(로그아웃)
- ✅ `src/components/pi-auth-provider.tsx` — React Context + 인증 로직
- ✅ `src/components/pi-login-button.tsx` — 헤더용 버튼
- ✅ `src/components/pi-user-card.tsx` — 사용자 정보 카드
- ✅ HMAC-SHA256 서명 세션 쿠키 (`httpOnly`, `sameSite: strict`, `tokenValidUntil` 기반 maxAge)
- ✅ `src/app/api/auth/dev/route.ts` — 개발 mock 로그인 (prod: 404)

### TASK-003: Pi Coin 결제 (U2A) ✅ 완료

- ✅ `src/app/api/payments/approve/route.ts` — Phase 1 서버 승인
- ✅ `src/app/api/payments/complete/route.ts` — Phase 3 서버 완료
- ✅ `src/components/pi-pay-button.tsx` — 수량 입력 + 결제 버튼
- ✅ `src/components/pi-product-card.tsx` — 상품 결제 카드
- ✅ 미완료 결제 자동 복구 핸들러 (`onIncompletePayment`)

---

## Phase 2: Google 계정 로그인 + Pi·Google 계정 연동 ✅ (완료)

> **목표**: Google OAuth 로그인, Pi+Google 계정 6자리 코드 기반 크로스 브라우저 연동

### TASK-004: Supabase DB 설계 + NextAuth.js 연동 ✅ 완료

- ✅ Supabase PostgreSQL `users` 테이블 설계 (pi_uid, google_id, google_email, role, display_name)
- ✅ `src/auth.ts` — NextAuth.js v5 설정 (Google Provider + Supabase 연동)
- ✅ `src/app/api/auth/[...nextauth]/route.ts` — NextAuth 핸들러
- ✅ `src/types/next-auth.d.ts` — NextAuth 타입 확장 (sub, id 포함)
- ✅ `src/lib/supabase-admin.ts` — Supabase admin 클라이언트 (lazy init, 빌드 오류 방지)
- ✅ `src/lib/users.ts` — users 테이블 CRUD 헬퍼
- ✅ `src/lib/auth-check.ts` — Pi + Google 세션 통합 확인 (server-only)

### TASK-005: Google 로그인 UI ✅ 완료

- ✅ `src/components/google-login-button.tsx` — Google 로그인 버튼
- ✅ `src/components/google-user-card.tsx` — Google 사용자 정보 카드
- ✅ 일반 브라우저에서만 표시 (`!isInPiBrowser` 조건)
- ✅ Pi Browser에서 Google 관련 UI 완전 숨김

### TASK-006: Pi Browser 감지 안정화 ✅ 완료

UA 패턴 기반 감지 → `Pi.authenticate()` 성공 여부 기반으로 전환

- ✅ `detectPiBrowser()` 함수 완전 제거
- ✅ `Pi.authenticate()` + `Promise.race()` 5초 타임아웃 패턴 적용
  - Pi Browser: `authenticate()` 성공 → `isInPiBrowser = true`
  - 일반 브라우저: 5초 타임아웃 → `isInPiBrowser = false`
  - 에러: `isInPiBrowser = false` (타임아웃 메시지는 에러 표시 안 함)
- ✅ Pi SDK를 항상 전역 로드 (`strategy='beforeInteractive'`) → `window.Pi` 체크로 분기
- ✅ `piAccessToken` 상태 추가 (Pi Browser WebView 쿠키 미전송 시 헤더 fallback용)

### TASK-007: Pi + Google 계정 연동 ✅ 완료

Pi Browser WebView는 `target='_blank'`가 WebView 내에서 열려 Google 로그인 불가
→ URL 클립보드 복사 방식으로 일반 브라우저에 URL 전달

- ✅ `src/app/api/auth/link-start/route.ts` — Pi 세션으로 6자리 코드 생성 (10분 유효)
- ✅ `src/app/api/auth/link-complete/route.ts` — Google 세션으로 코드 검증 + DB 연동
- ✅ `src/app/api/auth/link-status/route.ts` — 연동 상태 조회
  - `google_id` 형식 불일치 대비 `google_email` fallback 조회 구현
  - 경로 1: Google 세션 → google_id → google_email fallback
  - 경로 2: pi_session 쿠키
  - 경로 3: `X-Pi-Token` 헤더 → Pi Network API 직접 검증
- ✅ `src/app/link/page.tsx` — 코드 생성(Pi Browser) / 코드 입력(일반 브라우저) 자동 분기
  - URL `?code=XXXXXX` 파라미터로 코드 자동 채우기
- ✅ `src/app/link/complete/page.tsx` — 연동 완료 처리
- ✅ `src/components/account-link-card.tsx` — 연동 상태 카드
  - "연동하러가기 → (URL 복사)" 버튼 (Pi Browser에서 일반 브라우저로 URL 전달)
  - 연동 완료 시 카드 상단에 초록색 완료 표시

### TASK-008: 브라우저별 UI 정리 ✅ 완료

- ✅ Pi Browser: Pi 카드 + Pi 로그인 버튼 + Pi 결제 섹션만 표시
- ✅ 일반 브라우저: Google 카드 + Google 로그인 버튼만 표시
- ✅ 감지 중: 스피너 표시 (Pi·Google 섹션 모두 숨김)
- ✅ 계정 연동 카드: 항상 표시 (양 환경 공통)
- ✅ `src/components/pi-login-button.tsx`: 일반 브라우저에서 `null` 반환

---

## Phase 3: 관리자 기능 ✅ (완료)

> **목표**: ADMIN/MASTER 역할 전용 관리자 대시보드, 사용자 관리

### TASK-009: 관리자 기반 구조 ✅ 완료

- ✅ `src/app/(admin)/layout.tsx` — route group 레이아웃 + ADMIN/MASTER 접근 제어
  - `getSessionUser()` + `isAdmin()` 체크, 미인가 시 `/?error=unauthorized` 리다이렉트
- ✅ `src/components/admin/admin-sidebar.tsx` — 5개 메뉴 네비게이션 (대시보드/사용자관리/결제내역/계정연동현황/게시판관리)
- ✅ `src/app/(admin)/admin/page.tsx` — `/admin` 대시보드
  - 전체/Pi전용/Google전용/연동완료 통계 카드 4종
- ✅ `src/app/(admin)/admin/users/page.tsx` — `/admin/users` 사용자 관리
  - 전체 사용자 목록 테이블 (Pi계정, Google계정, 역할, 가입일)
  - 역할 변경 버튼 (ADMIN/MASTER/MANAGER/USER)
- ✅ `src/app/api/admin/users/route.ts` — GET 전체 사용자
- ✅ `src/app/api/admin/users/[id]/route.ts` — PATCH 역할 변경
- ✅ `/admin` 404 오류 수정 — route group 내 `admin/` 서브디렉토리 구조로 이동

### TASK-010: 결제 내역 관리 ✅ 완료

- ✅ `payments` 테이블 마이그레이션 — `user_id` FK: `auth.users` → `public.users`, 인덱스 3개 추가
- ✅ `src/app/api/payments/approve/route.ts` — Pi API 승인 후 DB upsert (status=approved)
  - `PaymentDTO.user_uid` → `users.pi_uid` 조회로 세션 없이 사용자 식별
- ✅ `src/app/api/payments/complete/route.ts` — Pi API 완료 후 DB UPDATE (txid, status=completed)
- ✅ `src/app/api/admin/payments/route.ts` — GET 결제 목록 (users JOIN)
- ✅ `src/app/(admin)/admin/payments/page.tsx` — 상태 필터 5종, π 합계 표시

### TASK-011: 계정 연동 현황 ✅ 완료

- ✅ `src/app/api/admin/links/route.ts` — GET 연동 현황
- ✅ `src/app/(admin)/admin/links/page.tsx` — 통계 카드(클릭 필터), 연동완료/Pi전용/Google전용 분류

---

## Phase 4: 통합 게시판 ✅ (완료)

> **목표**: 공지/자료실/자유/Q&A 4종 게시판

### TASK-020: DB 스키마 + 기반 구조 ✅ 완료 (기존 DB 활용)

**기존 테이블 현황** (데이터 있음 — 신규 생성 불필요)
```
brd_ctgr  4행  — NOTICE(MASTER), ARCHIVE(MANAGER), FREE(USER), QNA(USER)
brd_post  33행 — del_yn 논리삭제, pin_yn 핀고정, answ_yn QNA답변여부
brd_cmnt  2행  — acpt_yn 채택여부, del_yn 논리삭제
brd_attch 8행  — fl_nm/fl_pth/fl_url/fl_sz/fl_tp, del_yn 논리삭제
```

**설계 핵심 사항**
- `rgst_usr_id` (uuid): `public.users.id` 참조 (FK 없음 — app 레벨 관리)
- `regr_id` / `modr_id`: `varchar(20)` — `user.display_name.slice(0,20)` 사용 (UUID 불가)
- `ctgr_cd` → `brd_ctgr.ctgr_cd` FK 존재
- `cmnt_yn='Y'`: FREE, QNA만 댓글 허용 / `attch_yn='Y'`: 전 카테고리 첨부 허용
- `wr_min_role_cd`: 카테고리별 최소 작성 역할 (MASTER/MANAGER/USER)

### TASK-021: 게시글 CRUD API ✅ 완료

- ✅ `src/lib/board.ts` — `CategoryRow`, `PostRow`, `hasMinRole()`, `getCategory()`
- ✅ `GET /api/board/[category]` — 목록 (페이지네이션, 검색, 핀 우선 정렬)
  - PostgREST `.or()` 인젝션 방지: `,()* 제거 + %_\ 이스케이프`
- ✅ `GET /api/board/[category]/[postId]` — 상세 + 조회수 비동기 increment + 댓글 + 첨부파일
- ✅ `POST /api/board/[category]` — 게시글 작성 (최소 역할 체크)
- ✅ `PATCH /api/board/[category]/[postId]` — 수정 (본인 또는 ADMIN/MASTER)
- ✅ `DELETE /api/board/[category]/[postId]` — 논리삭제 (본인 또는 ADMIN/MASTER)

### TASK-022: 댓글 + QNA 채택 API ✅ 완료

- ✅ `POST /api/board/[category]/[postId]/comments` — 댓글 작성 (cmnt_yn='Y' 체크)
- ✅ `DELETE /api/board/[category]/[postId]/comments/[cmntId]` — 논리삭제
- ✅ `POST /api/board/[category]/[postId]/accept` — QNA 채택 (질문 작성자 전용)
  - `{cmnt_id: null}` 전달 시 채택 취소, Promise.all로 이전 채택 초기화 + 신규 채택 병렬 처리

### TASK-023: 첨부파일 API (Supabase Storage) ✅ 완료

- ✅ `POST /api/board/[category]/[postId]/attachments` — 다중 파일 업로드
  - `attch_yn='Y'` 체크, 최대 5개, 파일당 20MB 제한
  - Storage `board-attachments` 버킷, `{postId}/{uuid}.{ext}` 경로
  - DB INSERT 실패 시 Storage 파일 롤백 (고아 파일 방지)
- ✅ `DELETE /api/board/[category]/[postId]/attachments/[attchId]` — DB 논리삭제 + Storage 물리삭제

### TASK-024: 게시판 UI ✅ 완료

- ✅ `/board` — 카테고리 인덱스 페이지
- ✅ `/board/[category]` — 게시글 목록 (URL searchParams 기반 검색/페이지네이션, 공지/채택 배지)
- ✅ `/board/[category]/write` — 게시글 작성
- ✅ `/board/[category]/[postId]` — 상세 (서버 컴포넌트) + 낙관적 업데이트 댓글/첨부 섹션 (클라이언트)
- ✅ `/board/[category]/[postId]/edit` — 수정 (서버에서 기존 데이터 pre-fill)
- ✅ 헤더에 '게시판' 링크 추가

### TASK-025: 관리자 게시판 관리 ✅ 완료

- ✅ `GET /api/admin/board` — 전 카테고리 게시글 조회 (카테고리/페이지 필터)
- ✅ `PATCH /api/admin/board/[postId]` — 공지 pin_yn 토글 (서버 응답값으로 상태 동기화)
- ✅ `DELETE /api/admin/board/[postId]` — 강제 논리삭제 (ADMIN/MASTER 전용)
- ✅ `/admin/board` — 게시판 관리 UI (카테고리 필터 chip, 핀 토글, 삭제 버튼)

---

## Phase 5: 데이터 표준 시스템 ⏳ (미시작)

> **목표**: 표준단어·도메인·용어 CRUD, DDL Export, 승인 워크플로우

- [ ] **TASK-030**: 표준단어 관리 (STD_DIC)
- [ ] **TASK-031**: 표준도메인 관리 (STD_DOM)
- [ ] **TASK-032**: 표준용어 관리 (DA_TERM) + 물리명 자동 생성
- [ ] **TASK-033**: DDL Export (PostgreSQL/MySQL)
- [ ] **TASK-034**: Audit Trail (변경 이력)
- [ ] **TASK-035**: 승인 워크플로우

---

## Phase 6: 다국어 처리 ⏳ (미시작)

> **목표**: next-intl v4 기반 다국어 지원 (ko / en / zh / ja)

- [ ] **TASK-040**: next-intl 설치 + 라우팅 재구성 (`[locale]` 디렉토리)
- [ ] **TASK-041**: 번역 파일 + UI 적용
- [ ] **TASK-042**: 국가/언어 DB (Supabase `i18n_*` 테이블)
- [ ] **TASK-043**: AI 자동 번역

---

## 마일스톤 요약

| 마일스톤 | Phase | 완료일 | 주요 산출물 | 상태 |
|---------|-------|-------|-----------|------|
| M0: 스타터킷 | Phase 0 | 2026-06-05 | Next.js 15 + Tailwind v4 + shadcn/ui | ✅ 완료 |
| M1: Pi 인증 | Phase 1 | 2026-06-05 | Pi SDK 인증, HMAC 세션 | ✅ 완료 |
| M2: Pi 결제 | Phase 1 | 2026-06-05 | U2A 결제 3단계 흐름 | ✅ 완료 |
| M3: Google 로그인 | Phase 2 | 2026-06-05 | NextAuth.js + Supabase | ✅ 완료 |
| M4: 계정 연동 | Phase 2 | 2026-06-05 | 6자리 코드 크로스 브라우저 연동 | ✅ 완료 |
| M5: Pi Browser 감지 안정화 | Phase 2 | 2026-06-05 | authenticate() 기반 감지 | ✅ 완료 |
| M6: 관리자 대시보드 + 사용자 관리 | Phase 3 | 2026-06-05 | /admin, /admin/users, RBAC | ✅ 완료 |
| M7: 관리자 결제·연동 현황 | Phase 3 | 2026-06-05 | /admin/payments, /admin/links | ✅ 완료 |
| M8: 통합 게시판 | Phase 4 | 2026-06-05 | 4종 게시판 CRUD + 관리자 관리 | ✅ 완료 |
| M9: 데이터 표준 | Phase 5 | — | 표준단어·도메인·용어 | ⏳ |
| M10: 다국어 | Phase 6 | — | next-intl, ko/en/zh/ja | ⏳ |

---

## 알려진 이슈 및 결정 사항

| 항목 | 결정 내용 | 이유 |
|---|---|---|
| Pi Browser 감지 | `Pi.authenticate()` 성공/실패 기준 | UA 패턴은 신뢰도 낮음, 실제 SDK 동작으로 판단 |
| 연동 URL 전달 | 클립보드 복사 | Pi Browser WebView에서 `target='_blank'` = WebView 내 열림 (외부 브라우저 강제 불가) |
| google_id 불일치 | `google_email` fallback 조회 | NextAuth가 UUID 형식, Google OAuth sub는 숫자 형식 불일치 |
| Admin 라우팅 | `(admin)/admin/page.tsx` 구조 | Route group은 URL 세그먼트 없음, `admin/` 서브디렉토리 필요 |
| Supabase admin 초기화 | lazy init 패턴 | 빌드 시점 SERVICE_ROLE_KEY 미설정으로 빌드 실패 방지 |

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|---------|-------|
| v1.0 | 2026-06-05 | 초안 작성 — Pi Network 플랫폼 기준으로 전면 재작성. Phase 0~2 완료, Phase 3 진행 중 반영 | anakin |
| v1.1 | 2026-06-05 | Phase 3 완료(관리자 결제·연동현황), Phase 4 완료(통합 게시판 TASK-021~025), 보안 수정(PostgREST ilike 인젝션) | anakin |
