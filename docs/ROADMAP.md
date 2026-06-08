# Pi Network 기반 풀스택 앱 플랫폼 — 개발 로드맵

Pi Browser + 일반 브라우저를 모두 지원하는 Next.js 16 기반 Pi Network 앱 플랫폼

> **기준일**: 2026-06-07
> **현재 버전**: Phase 6 완료 · Phase 7~9 설계 완료 (구현 대기)
> **배포 URL**: https://loginpi.vercel.app
> **기술 스택**: Next.js 16 App Router · React 19 · TypeScript 6 · Tailwind CSS v4 · NextAuth.js · Supabase PostgreSQL

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
일반 브라우저 → Google 로그인 → "연동 완료" → sys_user 테이블 합쳐짐
```

**핵심 설계 원칙**:
- `sys_user` 테이블 단일화 — Pi row를 원본으로, Google 필드를 덧씌움
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

> **목표**: 최신 Next.js 16 생태계 기반의 재사용 가능한 스타터킷 구축

- **TASK-001: Next.js 16 + Tailwind v4 + shadcn/ui base-nova 환경 셋업** ✅
  - ✅ Next.js 16 App Router + React 19 + TypeScript 6 strict mode
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

- ✅ Supabase PostgreSQL `sys_user` 테이블 설계 (pi_uid, google_id, google_email, role, display_name) — 초기 `users`에서 Migration 003으로 리네이밍
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

## Phase 5: 데이터 표준 시스템 ✅ (완료 — 6/6)

> **목표**: 표준단어·도메인·용어 CRUD, DDL Export, DA 품질 표준화, 승인 워크플로우

### DA 품질 점검 표준화 ✅ 완료 (비정기 작업 — 2026-06-06)

한국 DA 표준에 따른 전체 Supabase 스키마 정비. 19개 위반 항목 해소. API Route 26개 코드 현행화.

- ✅ Migration 003: `users`→`sys_user`, `payments`→`pi_pymnt`, `link_codes`→`auth_link_cd` 리네이밍
- ✅ Migration 004: `std_dic_sync`→`std_dic`, `std_dom_sync`→`std_dom` 리네이밍
- ✅ Migration 005: `created_at/updated_at` → `reg_dtm/mod_dtm` 통일, 트리거 함수명 표준화
- ✅ Migration 006: `std_*` 테이블 `regr_id`, `modr_id`, `del_yn` 추가
- ✅ Migration 007: `reg_usr_id`→`regr_id`, `mod_usr_id`→`modr_id` 복합어 표준(REGR/MODR) 적용
- ✅ Migration 008: 전 테이블 시스템 컬럼 4개 `NOT NULL DEFAULT` 강제화 (33개 테이블)
- ✅ `docs/da/reports/2026-06-06_품질검토수행완료보고서.md` 신규 작성 (2026-06-08 ReORG에서 이동)
- ✅ `docs/da/데이터표준규칙.md` 표준 규칙 문서화 (2026-06-08 정본 승격 — 구 .claude/skills 경로에서 이동)
- ✅ 명명규칙 점검 가이드 — `docs/da/품질점검기준서.md`로 통합 (구 da-qa-naming-auditor.md 병합)

### TASK-030: 표준단어 관리 ✅ 완료

- ✅ `std_dic` 테이블 (Migration 004에서 리네이밍)
- ✅ `GET/POST /api/admin/std/words` — 검색·등록
- ✅ `PATCH/DELETE /api/admin/std/words/[id]` — 수정·논리삭제 (`del_yn='Y'`)
- ✅ `/admin/std/words` UI — 검색, 등록 모달, 수정/삭제

### TASK-031: 표준도메인 관리 ✅ 완료

- ✅ `std_dom` 테이블 (Migration 004에서 리네이밍)
- ✅ `GET/POST /api/admin/std/domains` — 구분 필터(코드/식별자/일반), 등록
- ✅ `PATCH/DELETE /api/admin/std/domains/[id]` — 수정·논리삭제
- ✅ `/admin/std/domains` UI — 도메인 구분 필터칩, 데이터타입/길이 표시

### TASK-032: 표준용어 관리 ✅ 완료

- ✅ `std_term` 테이블 신규 생성 + `std_dic` 복합어 41건 이관
- ✅ `GET/POST /api/admin/std/terms` — 검색·등록
- ✅ `PATCH/DELETE /api/admin/std/terms/[id]` — 수정·논리삭제
- ✅ `/admin/std/terms` UI — 표준단어+도메인 선택으로 물리명 자동 생성 (실시간 미리보기)
- ✅ 표준단어 구분(복합어) 필드 제거 — `dic_gbn_cd` 단일화

### TASK-033: DDL Export ✅ 완료

- ✅ `/admin/std/ddl` UI — 표준용어 검색으로 컬럼 선택 → `CREATE TABLE` DDL 자동 생성
- ✅ 도메인 약어(`nm/cd/id/dt/dtm` 등)로 SQL 타입 자동 추론
- ✅ PostgreSQL / MySQL 탭 전환 (`TIMESTAMP·NUMERIC·COMMENT ON` vs `DATETIME·DECIMAL`)
- ✅ 컬럼 PK·NOT NULL 체크, 순서 변경(↑↓), 타입 직접 수정
- ✅ DDL 복사 버튼 + `.sql` 파일 다운로드

### TASK-034: Audit Trail (변경 이력) ✅ 완료

- ✅ Migration 009: `std_audit_log` 테이블 + 공통 트리거 함수 `fn_std_audit_log()`
  - `tgt_tbl/tgt_id/action_cd/old_val(JSONB)/new_val(JSONB)/chgr_id/chg_dtm`
  - AFTER INSERT OR UPDATE OR DELETE 트리거 — `std_dic`, `std_dom`, `std_term` 각각 적용
  - JSONB key 추출(`dic_id/dom_id/term_id` COALESCE)로 단일 함수가 3개 테이블 처리
- ✅ `GET /api/admin/std/audit` — tbl/from/to/page 필터, 50건 페이지네이션
- ✅ `/admin/std/audit` UI — 테이블·날짜 필터, 행 클릭으로 old_val/new_val JSON 펼침

### TASK-035: 승인 워크플로우 ✅ 완료

- ✅ Migration 010: `approval_queue.apv_id` DEFAULT 추가, `apv_status` CHECK 제약, `std_dom.apv_status` 컬럼 추가
- ✅ `GET /api/admin/std/approvals` — 상태·엔터티 유형 필터, 30건 페이지네이션
- ✅ `POST /api/admin/std/approvals` — 승인 요청 생성 (entity_type/entity_id/req_data)
- ✅ `PATCH /api/admin/std/approvals/[apvId]` — 승인(approve)/반려(reject), MASTER 전용
  - 승인 시 `std_dic/dom/term.apv_status='APPROVED'` 동기화
  - 반려 시 사유 필수 입력, `apv_status='REJECTED'` 동기화
- ✅ `/admin/std/approvals` UI — 상태 필터칩, 인라인 반려 사유 입력, 요청 데이터 펼침

---

## Phase 6: 다국어 처리 ✅ (완료 — 7/7)

> **목표**: next-intl v4 기반 다국어 지원 (ko / en / zh / ja / hi / vi / af / fil / th / id / ms / es / fr / de / it / ru / pt / ar)

- ✅ **TASK-040**: next-intl v4 설치 + `[locale]` App Router 라우팅 재구성, `middleware.ts` 인터셉터, `i18n/routing.ts` 설정
- ✅ **TASK-041**: 번역 파일 + UI 적용 — ko.json 409키 정의, `useTranslations()` / `getTranslations()` 전 페이지·컴포넌트 적용, 3단계 fallback (locale → en → ko), `readFile()` 로 모듈캐시 우회
- ✅ **TASK-042**: 국가/언어 DB — `i18n_locale` / `i18n_message` Supabase 테이블, DB→JSON 동기화 API (`/api/admin/i18n/sync`), 관리자 번역 현황 대시보드 (`/admin/i18n`)
- ✅ **TASK-043**: AI 자동 번역 — Gemini 2.5 Flash 무료 API, 배치 50건 + 4.5초 rate-limit 대기, 배치별 즉시 upsert (부분실패 보존), 영어 차용어 역번역 프롬프트 규칙, 18개 언어 지원
- ✅ **TASK-044**: 다국어 안정성 강화 + 보안 패치 (2026-06-07)

**TASK-044 상세** (재발 방지 + 보안 개선):
- ✅ `src/lib/locale-currency.ts` — LOCALE_CURRENCY 단일 소스 (3개 파일 중복 제거)
- ✅ `src/lib/locale-country.ts` — LOCALE_COUNTRY + `getAlpha2()` + `ACTIVE_COUNTRY_CODES` 단일 소스
- ✅ `src/i18n/routing.ts` — 203개 국가 코드 선점 등록 (기존 20개 → 203개, 재배포 없이 신규 locale 활성화 가능)
- ✅ `src/app/api/admin/i18n/locale/route.ts` — `addLocaleToRouting()` 추가 (로컬 개발 시 routing.ts 자동 수정, Vercel 프로덕션은 read-only라 무시)
- ✅ `src/app/api/admin/i18n/locale/route.ts` — `LOCALE_CD_RE = /^[a-z]{2,3}(-[A-Z]{2,3})?$/` 검증 추가 (코드 인젝션 방지 HIGH 취약점 해소)
- ✅ `src/app/api/admin/i18n/translate/route.ts` — `Intl.DisplayNames` 도입으로 정적 언어명 맵 제거 (새 locale 추가 시 수정 불필요)
- ✅ `messages/il.json` — 히브리어(이스라엘) 번역 파일 생성

**버그 수정 이력** (근본 원인 → 해결책):
| 버그 | 원인 | 해결 |
|---|---|---|
| USD/AUD Pi 시세 동일 | `pi-price-chip.tsx`의 로컬 LOCALE_CURRENCY에 `au` 누락 | locale-currency.ts 단일 소스 |
| 이스라엘 ⚠ 라우팅 미등록 | routing.ts에 `il` 미등록, 3개 파일에 중복된 맵 | 203개 선점 등록 + 단일 소스 |
| 이스라엘 번역 "지원하지 않는 언어입니다" | translate API의 정적 LOCALE_NAMES에 `il` 누락 | Intl.DisplayNames 도입 |
| 에티오피아 ⚠ 라우팅 미등록 | 동일한 근본 원인 | 203개 선점 등록으로 구조적 해결 |

**핵심 설계 결정**:
- next-intl v4의 `getTranslations()` (서버) / `useTranslations()` (클라이언트) 분리
- `ko.json`이 source of truth — DB 통계도 ko.json 파일 기준 키 수 계산
- `readFile()` 사용 (동적 `import()` 는 Node 모듈캐시로 동기화 결과 미반영)
- 3단계 fallback: 미번역 콘텐츠는 영어 → 한국어 순으로 표시 (키명 노출 방지)
- Gemini 무료 15 RPM 제한 대응: 배치 50개 + 4.5초 sleep 패턴
- `routing.ts`는 컴파일 타임 정적 — Vercel 소스 파일은 런타임 수정 불가 (read-only)

---

## Phase 7: PiChat MVP 🔜 (준비중)

> **목표**: 테마 기반 1:1·그룹 채팅 + Supabase Realtime + Pi 결제 연동 + 구독 시스템
> **상세 스펙**: `docs/PRD_CHAT.md` (v1.2)

### TASK-050: DB 마이그레이션 (`msg_*` 13개 테이블) ✅ 완료

- ✅ `sql/012_msg_tables.sql` 작성 — DA 표준 시스템 컬럼 4개 전 테이블 필수
- ✅ `msg_theme` — 테마 마스터 (`theme_tp_cd`: BASIC/PREMIUM)
- ✅ `msg_subscr_plan` — 구독 플랜 정의 (`mth_cnt` DA 표준 컬럼명)
- ✅ `msg_stkr_pack` / `msg_stkr` — 스티커 팩·개별 항목
- ✅ `msg_theme_stkr` — 테마 기본 스티커팩 매핑
- ✅ `msg_room` — 채팅방 (`room_tp_cd`: D/G/E, `entry_fee_pi`, `is_public_yn`)
- ✅ `msg_room_mbr` — 채팅방 멤버 (`mbr_role_cd`: OWNER/ADMIN/MEMBER/GUEST)
- ✅ `msg_msg` — 메시지 (`msg_tp_cd`: TEXT/IMAGE/FILE/VOICE/STICKER/TIP_NOTI/SYSTEM)
- ✅ `msg_msg_reac` — 메시지 이모지 반응
- ✅ `msg_attch` — 채팅 첨부파일
- ✅ `msg_subscr` — 사용자 구독 현황
- ✅ `msg_usr_stkr` — 사용자 보유 스티커팩
- ✅ `msg_tip` — Pi Tip 내역 (`tip_cont` DA 표준 컬럼명)
- ✅ Realtime RLS 정책: `msg_msg` 채팅방 멤버만 구독 가능 (service_role bypass 유지)

### TASK-051: 테마 마스터 데이터 세팅 ✅ 완료

- ✅ `sql/013_msg_seed.sql` — 20개 테마 INSERT (BASIC 6개 + PREMIUM 14개)
- ✅ 테마별 기본 스티커팩 3종(이모지팩·일러스트팩·인사/응원팩) × 20개 = 60개 `msg_stkr_pack` INSERT
- ✅ `msg_theme_stkr` 60개 매핑 (DO 블록 + RETURNING으로 원자적 처리)
- ✅ `msg_subscr_plan` 5개 INSERT: FREE / PREMIUM_MONTHLY·ANNUAL / BUSINESS_MONTHLY·ANNUAL
- 🔜 `/api/admin/chat/themes` — 관리자 테마 CRUD API (TASK-052 이후 별도 구현)

### TASK-052: 1:1 채팅 API + Supabase Realtime ✅ 완료

- ✅ `src/lib/chat.ts` — MsgRoom·MsgMsg·MsgRoomMbr 타입 + CRUD 헬퍼
- ✅ `src/lib/supabase-client.ts` — 클라이언트 Realtime용 Supabase 인스턴스 (publishable key)
- ✅ `GET /api/chat/rooms` — 내 채팅방 목록, `POST` — 1:1 Direct Room 생성
- ✅ `GET /api/chat/rooms/[roomId]` — 상세 + 멤버 목록 + 내 역할
- ✅ `GET /api/chat/rooms/[roomId]/messages` — cursor 페이지네이션 (scroll-up 무한로드)
- ✅ `POST /api/chat/rooms/[roomId]/messages` — 메시지 전송 + rate limiting (1초 5건)
- ✅ `POST /api/chat/rooms/[roomId]/join` — 공개 그룹방 입장 (정원 확인)
- ✅ `src/hooks/use-chat-room.ts` — `postgres_changes` + `presence` 구독 훅, 중복 방지 + scroll-up prepend
- ✅ `src/components/chat/chat-message-list.tsx` — 실시간 렌더링, scroll-up 무한로드, 시스템 메시지 분기
- ✅ `src/components/chat/chat-input.tsx` — Enter 전송, Shift+Enter 줄바꿈, 높이 자동조절, rate limit 복원
- 🔜 E2E 암호화 — Pi 지갑 키 기반 (Phase 8 이후 적용)

### TASK-053: 그룹 채팅방 생성 (테마 선택 UX + Pi 결제) ✅ 완료

```
채팅방 생성 UX:
Step 1: 테마 선택 (BASIC 자유 / PREMIUM 🔒 → 단건 0.2 Pi 또는 구독)
Step 2: 채팅방 이름·설명 (테마 이모지 자동 제안)
Step 3: 공개/비공개 + 정원 설정 (10/30/50/100명)
Step 4: Pi 결제 (BASIC 0.1 π / PREMIUM 0.3 π)
```

- ✅ `src/app/api/chat/themes/route.ts` — GET 테마 목록 (msg_theme 조회)
- ✅ `src/components/chat/inline-purchase-prompt.tsx` — 인라인 구매 트리거 공통 컴포넌트
- ✅ `src/components/chat/theme-selector.tsx` — 테마 선택 그리드 (BASIC 자유 / PREMIUM 🔒 InlinePurchasePrompt)
- ✅ `src/components/chat/group-room-creator.tsx` — 4단계 마법사 Dialog (테마→이름→설정→Pi결제)
- ✅ `src/components/chat/chat-room-panel.tsx` — ChatMessageList + ChatInput 래퍼 (Realtime 단일 구독)
- ✅ `/api/payments/complete` — `CHAT_ROOM_CREATE` 분기 추가 (결제완료 시 msg_room + msg_room_mbr 원자 생성)
- ✅ `src/app/[locale]/chat/page.tsx` — 채팅 홈 (내 채팅방 + 공개방 탐색 + GroupRoomCreator)
- ✅ `src/app/[locale]/chat/[roomId]/page.tsx` — 채팅방 (초기 50건 서버 프리페치 + Realtime)
- ✅ Header에 '채팅' 링크 추가

### TASK-055: Pi Browser 쿠키 비의존 인증 (X-Pi-Token) ✅ 완료 (2026-06-08)

> **핵심 가치 직결** — Pi Browser WebView는 모든 방식(form POST·fetch·redirect·HTML)의
> `Set-Cookie`를 저장하지 않아, 쿠키 기반 페이지 보호로는 채팅·관리자 접속 시
> 무한 리다이렉트 루프가 발생했다(로그인 자체 불가). CLAUDE.md "인증 + 세션 구조"의
> 쿠키↔X-Pi-Token 이중 경로 + 클라이언트 게이트 패턴으로 근본 해결.

#### 구현 파일

- ✅ `src/lib/pi-fetch.ts` — `piFetch`(X-Pi-Token 헤더 자동 첨부) + 토큰 localStorage 저장/조회
- ✅ `src/lib/auth-check.ts` — `getSessionUser()` 쿠키 OR X-Pi-Token 헤더 + `tokenValidUntil` 만료 검증
- ✅ `src/app/api/auth/pi/route.ts` — POST 응답에 세션 `token` 이중 반환
- ✅ `src/components/pi-auth-provider.tsx` — 로그인 흐름 fetch POST + setPiToken 통일, 보호 페이지 router.push
- ✅ `chat-list-view` · `client-chat-list` · `client-chat-room` — 클라이언트 게이트
- ✅ `chat/page.tsx` · `chat/[roomId]/page.tsx` — 쿠키 미인식 시 클라이언트 게이트 폴백
- ✅ `use-chat-room.ts` · `chat-message-list.tsx` — 메시지 송신/로드 `piFetch` 전환
- ✅ `client-admin-gate.tsx` + admin layout — 무한 루프 차단 안내

#### 후속 과제

- 🔜 admin 12개 페이지 클라이언트 데이터 로드 전환 (현재는 PC 브라우저 권장 안내)
- 🔜 dead route 정리: `pi-code` · `pi-callback` · `pi-redirect` (쿠키 흐름 제거로 미사용)

### TASK-054: 구독 시스템 (플랜 + Pi 결제 + PiRC2 Soroban) ✅ 완료 (2026-06-09)

> **PiRC2 컨트랙트** (Pi Testnet): `CCUF75B6W3HRJTJD6O7OXNI72HGJ7DERZ5MUNOMFMSK23ME5GUIKPFYV`
> 공식 문서: https://github.com/PiNetwork/PiRC (PiRC2 디렉토리, 9개 섹션)
> CLAUDE.md의 "PiRC2 스마트 컨트랙트" 섹션 참고

#### 구현 파일

- ✅ `src/lib/chat-auth.ts` — `getChatPlan()`·`canCreateRoom()`·`canSendTip()`·`getAiQuota()` (server-only). 등급별 한도를 `PLAN_CAPS` 단일 매트릭스로 관리(무제한 = `-1` 센티넬)
- ✅ `GET /api/subscriptions/plans` — 플랜 목록 + 현재 사용자 등급
- ✅ `POST /api/subscriptions` — 구독 결제 준비. 서버가 `price_pi`로 amount를 권위 있게 확정해 `createPayment` 파라미터 반환(metadata.type=`CHAT_SUBSCR`)
- ✅ `DELETE /api/subscriptions` — 구독 취소. `auto_renew_yn='N'`만 해제하고 `expire_dtm`까지 이용 유지(만료 시 `getChatPlan`이 자동 FREE 강등). 즉시 논리삭제는 환불정책+PiRC2 `cancel()` 연동 시로 보류
- ✅ `GET /api/subscriptions/check` — 기능별 권한 매트릭스 `{ tier, canTip, canUsePremiumTheme, canCreateEventRoom, canCreateRoomFree, aiQuota... }`
- ✅ `/api/payments/complete` — `CHAT_SUBSCR` 분기 추가. 결제 amount ≥ `price_pi` 서버 재검증 후 `mth_cnt` 기반 만료일 계산 + `msg_subscr` UPSERT(`usr_id` UNIQUE)
- ✅ `src/components/chat/subscription-gate.tsx` — 유료 기능 접근 게이트(piFetch 권한확인 → 잠금 시 InlinePurchasePrompt 구독 결제)

#### PiRC2 통합 전략

**단기 (TASK-054)**: 기존 U2A 결제 흐름 유지 — Pi SDK `createPayment()` → `/payments/complete`에서 `msg_subscr` UPSERT. PiRC2 컨트랙트 없이 앱 레벨 구독 관리.

**중기 (Pi SDK Soroban 지원 시)**: `subscribe()` 직접 통합 (구독자 Pi Wallet 서명). `process()` cron job은 판매자 서버 키로 즉시 실행 가능.

```
플랜 ID          가격      기간    PiRC2 price (units)
PREMIUM_MONTHLY  1 Pi/월  30일    10_000_000
PREMIUM_ANNUAL   10 Pi/년 365일   100_000_000
BUSINESS_MONTHLY 5 Pi/월  30일    50_000_000
BUSINESS_ANNUAL  50 Pi/년 365일   500_000_000
```

#### `msg_subscr` 테이블 분기 처리 (`payments/complete/route.ts`)

```typescript
if (meta?.type === 'CHAT_SUBSCR') {
  const planDays = meta.plan_cd === 'PREMIUM_ANNUAL' ? 365
    : meta.plan_cd === 'BUSINESS_ANNUAL' ? 365 : 30
  const expireDtm = new Date(Date.now() + planDays * 86400_000)
  await db.from('msg_subscr').upsert({
    usr_id: owner.id,
    plan_cd: String(meta.plan_cd),
    pymnt_id: paymentId,
    start_dtm: new Date().toISOString(),
    expire_dtm: expireDtm.toISOString(),
    auto_renew_yn: 'Y',
    regr_id: slug, modr_id: slug,
  }, { onConflict: 'usr_id' })
}
```

---

## Phase 8: PiChat 수익화 기능 🔜 (준비중)

> **목표**: Pi Tip·스티커 마켓·AI 봇·이벤트방·인라인 구매 트리거 8종 구현

### TASK-060: Pi Tip (인라인 결제 + TIP_NOTI 메시지) 🔜

- 🔜 `src/components/chat/pi-tip-button.tsx` — 채팅창 내 Tip 버튼
- 🔜 `POST /api/tips` — Tip 기록 (metadata.type=`PI_TIP`, 금액 서버 재검증)
- 🔜 Pi Tip 수신 시 `TIP_NOTI` 타입 메시지 자동 발송
- 🔜 트리거 2 구현: TIP_NOTI → "나도 팁 보내기" → Free 사용자 단건/구독 선택

### TASK-061: 스티커 마켓 (테마별 팩 + 인라인 업셀) 🔜

- 🔜 `src/components/chat/sticker-picker.tsx` — 스티커 선택 UI (기본 3개 + 하단 업셀)
- 🔜 `GET /api/stickers/packs` — 테마별 스티커 팩 마켓
- 🔜 `POST /api/stickers/packs` — 스티커 팩 구매 (metadata.type=`STICKER_PACK`)
- 🔜 트리거 1 구현: 스티커 메뉴 하단 업셀 배너

### TASK-062: 인라인 구매 트리거 8종 구현 🔜

| 트리거 | 발동 조건 | 구현 내용 |
|---|---|---|
| 1 스티커 업셀 | 스티커 메뉴 열 때 | `sticker-picker.tsx` 하단 배너 |
| 2 Tip 수신→보내기 | TIP_NOTI "보내기" 클릭 | `inline-purchase-prompt.tsx` |
| 3 AI 한도 초과 | AI 사용 한도 도달 | `chat-input.tsx` AI 응답 실패 시 |
| 4 메시지 만료 경고 | 7일 내 만료 메시지 존재 | 채팅방 입장 시 상단 배너 |
| 5 정원 초과 | 멤버 수 = max_mbr_cnt | 방장 대상 알림 팝업 |
| 6 프리미엄 테마 잠금 | PREMIUM 테마 클릭 | `theme-selector.tsx` 잠금 팝업 |
| 7 배지 강화 | 테마 배지 수여 시 | 프로필 화면 팝업 |
| 8 이벤트방 알림 | 팔로우 테마 이벤트 개설 | 푸시 알림 + 채팅 홈 배너 |

### TASK-063: 이벤트 채팅방 (유료 입장 + 방장 수익 분배) 🔜

- 🔜 `room_tp_cd='E'` 이벤트방 생성 — `entry_fee_pi`, `entry_expire_dtm` 설정
- 🔜 입장 시 Pi 결제 (metadata.type=`EVENT_ROOM_JOIN`)
- 🔜 `msg_room_mbr(GUEST, expire_dtm=이벤트종료)` — 임시 멤버십
- 🔜 방장 Pi 수익 분배 로직 (플랫폼 수수료 0% 초기 3년 정책)
- 🔜 트리거 8 구현: 테마 팔로우 사용자 이벤트 알림

### TASK-064: AI 채팅 비서 (`@ai` 멘션 + 테마별 프롬프트) 🔜

- 🔜 `src/lib/chat-ai-prompts.ts` — 테마별 Claude 시스템 프롬프트 매핑
  - 골프방: 골프 코치 · 먹방방: 칼로리·영양 전문가 · 여행방: 여행 플래너·번역
- 🔜 메시지 내 `@ai` 멘션 파싱 → Anthropic API 호출 → `SYSTEM` 타입 메시지 발송
- 🔜 AI 사용 한도 체크 (Free: 불가/0.05 Pi · Premium: 10회/월 · Business: 무제한)
- 🔜 트리거 3 구현: AI 한도 초과 인라인 구매

### TASK-065: 파일·이미지·음성 메시지 (Supabase Storage) 🔜

- 🔜 `msg_attch` 테이블 활용 — `IMAGE`/`FILE`/`VOICE` 타입 메시지
- 🔜 파일 업로드: MIME 화이트리스트, 크기 강제 (Premium: 100MB/월, Business: 1GB/월)
- 🔜 음성 메시지 녹음: Free 30초 / Premium 1분 / Business 5분
- 🔜 Supabase Storage `chat-attachments` 버킷

---

## Phase 9: PiChat 생태계 확장 🔜 (준비중)

> **목표**: 마켓플레이스·Webhook·분석 대시보드·커스텀 스티커로 Pi 커뮤니티 생태계 구축

### TASK-070: 채팅 마켓플레이스 (테마별 공개방 디렉토리) 🔜

- 🔜 `src/app/[locale]/chat/page.tsx` — 테마별 공개방 탐색 (테마 필터 칩)
- 🔜 인기 채팅방 랭킹 (멤버 수, 최근 메시지, Pi Tip 수령량 기준)
- 🔜 테마 팔로우 — 신규 이벤트방 알림 구독

### TASK-071: Pi Bet 투표 🔜

- 🔜 채팅방 내 베팅 이벤트 생성 (방장 권한)
- 🔜 참가자 Pi 베팅 → 결과 확정 시 승리자 Pi 분배
- 🔜 베팅 메시지 타입 추가 (`msg_tp_cd='BET_NOTI'`)

### TASK-072: 채팅 봇·Webhook 연동 (Business 전용) 🔜

- 🔜 Webhook URL 등록 → 채팅방 신규 메시지 Push 알림
- 🔜 봇 메시지 전송 API (API Key 기반)
- 🔜 `src/app/api/admin/chat/webhooks/route.ts`

### TASK-073: 분석 대시보드 (Business 전용) 🔜

- 🔜 채팅방별 MAU, 메시지 수, Pi 수익, 멤버 증감 통계
- 🔜 `src/app/[locale]/chat/[roomId]/analytics/page.tsx`

### TASK-074: 커스텀 스티커 제작 (Business 전용) 🔜

- 🔜 이미지 업로드 → 스티커팩 생성 (팩당 10개, 0.5 Pi)
- 🔜 내 채팅방 전용 스티커 + 마켓플레이스 판매 옵션

---

## 마일스톤 요약

| 마일스톤 | Phase | 완료일 | 주요 산출물 | 상태 |
|---------|-------|-------|-----------|------|
| M0: 스타터킷 | Phase 0 | 2026-06-05 | Next.js 16 + Tailwind v4 + shadcn/ui | ✅ 완료 |
| M1: Pi 인증 | Phase 1 | 2026-06-05 | Pi SDK 인증, HMAC 세션 | ✅ 완료 |
| M2: Pi 결제 | Phase 1 | 2026-06-05 | U2A 결제 3단계 흐름 | ✅ 완료 |
| M3: Google 로그인 | Phase 2 | 2026-06-05 | NextAuth.js + Supabase | ✅ 완료 |
| M4: 계정 연동 | Phase 2 | 2026-06-05 | 6자리 코드 크로스 브라우저 연동 | ✅ 완료 |
| M5: Pi Browser 감지 안정화 | Phase 2 | 2026-06-05 | authenticate() 기반 감지 | ✅ 완료 |
| M6: 관리자 대시보드 + 사용자 관리 | Phase 3 | 2026-06-05 | /admin, /admin/users, RBAC | ✅ 완료 |
| M7: 관리자 결제·연동 현황 | Phase 3 | 2026-06-05 | /admin/payments, /admin/links | ✅ 완료 |
| M8: 통합 게시판 | Phase 4 | 2026-06-05 | 4종 게시판 CRUD + 관리자 관리 | ✅ 완료 |
| M8.5: DA 품질 표준화 | Phase 5 | 2026-06-06 | Migration 003~008, 19개 위반 해소 | ✅ 완료 |
| M9: 데이터 표준 CRUD | Phase 5 | 2026-06-06 | 표준단어·도메인·용어·DDL Export | ✅ 완료 |
| M10: Audit Trail + 승인 워크플로우 | Phase 5 | 2026-06-06 | 변경 이력 추적, 승인 프로세스 | ✅ 완료 |
| M11: 다국어 | Phase 6 | 2026-06-07 | next-intl v4, 18개 언어, Gemini 자동번역, 3단계 fallback | ✅ 완료 |
| M12: 다국어 안정성 | Phase 6 | 2026-06-07 | 단일 소스 분리, 203개 locale 선점, 코드 인젝션 보안 패치 | ✅ 완료 |
| M13: Next.js 16 + TypeScript 6 | 기술 업그레이드 | 2026-06-07 | Next.js 16.2.7, TypeScript 6.0.3, eslint-config-next@16, FlatCompat 제거 | ✅ 완료 |
| M14: PiChat DB + 테마 마스터 | Phase 7 | 2026-06-08 | msg_* 13개 테이블, 테마 20개, 플랜 5개, 스티커팩 60개 | ✅ 완료 |
| M15: PiChat MVP | Phase 7 | 2026-06-08 | 그룹 채팅방 생성 4단계 마법사 (테마 선택 + Pi 결제), 채팅 홈, 채팅방 페이지 | ✅ 완료 |
| M16: Pi 수익화 | Phase 8 | — | Pi Tip, 스티커 마켓, 인라인 트리거 8종, AI 봇, 이벤트방 | 🔜 준비중 |
| M17: 미디어 메시지 | Phase 8 | — | 파일·이미지·음성 메시지 (Supabase Storage) | 🔜 준비중 |
| M18: PiChat 생태계 | Phase 9 | — | 마켓플레이스, Pi Bet, Webhook, 분석 대시보드, 커스텀 스티커 | 🔜 준비중 |

---

## 기술 업그레이드 모니터링

> `docs/UPGRADE_STRATEGY.md` 참조. 아래 항목은 외부 조건 해소 시 즉시 진행.

| 항목 | 현재 | 대기 조건 |
|---|---|---|
| **next-auth v5 stable** | beta.31 유지 | npm `latest` 태그가 5.x가 되면 `pnpm add next-auth@^5` |
| **ESLint 10** | 9.39.4 유지 | `eslint-plugin-react/import/jsx-a11y`가 ESLint 10 peerDep 추가 시 |
| **middleware.ts → proxy.ts** | middleware.ts 유지 | next-intl이 Next.js 16 proxy (nodejs runtime) 지원 시 |
| **react-hooks/set-state-in-effect** | warn 20개 | 별도 리팩토링 이슈 — useEffect 내 setLoading 패턴 정리 |

---

## 알려진 이슈 및 결정 사항

| 항목 | 결정 내용 | 이유 |
|---|---|---|
| Pi Browser 감지 | `Pi.authenticate()` 성공/실패 기준 | UA 패턴은 신뢰도 낮음, 실제 SDK 동작으로 판단 |
| 연동 URL 전달 | 클립보드 복사 | Pi Browser WebView에서 `target='_blank'` = WebView 내 열림 (외부 브라우저 강제 불가) |
| google_id 불일치 | `google_email` fallback 조회 | NextAuth가 UUID 형식, Google OAuth sub는 숫자 형식 불일치 |
| Admin 라우팅 | `(admin)/admin/page.tsx` 구조 | Route group은 URL 세그먼트 없음, `admin/` 서브디렉토리 필요 |
| Supabase admin 초기화 | lazy init 패턴 | 빌드 시점 SERVICE_ROLE_KEY 미설정으로 빌드 실패 방지 |
| DB 테이블 리네이밍 | `users→sys_user`, `payments→pi_pymnt`, `link_codes→auth_link_cd` 완료 | 한국 DA 도메인 접두사 표준 — Migration 003~008 (2026-06-06) |
| 시스템 컬럼 규칙 | `regr_id/reg_dtm/modr_id/mod_dtm` 4개 `NOT NULL DEFAULT` 전 테이블 강제화 | DA 표준: 복합어 REGR(등록자)/MODR(변경자), `CURRENT_TIMESTAMP` 표준 표기 |
| routing.ts locale 등록 | 203개 국가 코드 선점 등록 | next-intl `defineRouting()`은 빌드 타임 정적 — Vercel 런타임 수정 불가 |
| locale 단일 소스 | `src/lib/locale-currency.ts`, `src/lib/locale-country.ts` | 3+ 파일에 중복된 맵이 sync 버그 반복 유발 |
| locale_cd 보안 검증 | `LOCALE_CD_RE = /^[a-z]{2,3}(-[A-Z]{2,3})?$/` | routing.ts 파일 쓰기 전 화이트리스트 필터 (코드 인젝션 HIGH 취약점) |

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|---------|-------|
| v1.0 | 2026-06-05 | 초안 작성 — Pi Network 플랫폼 기준으로 전면 재작성. Phase 0~2 완료, Phase 3 진행 중 반영 | anakin |
| v1.1 | 2026-06-05 | Phase 3 완료(관리자 결제·연동현황), Phase 4 완료(통합 게시판 TASK-021~025), 보안 수정(PostgREST ilike 인젝션) | anakin |
| v1.2 | 2026-06-06 | Phase 5 TASK-030~033 완료 반영 (표준단어·도메인·용어·DDL Export), M9 달성 | anakin |
| v1.3 | 2026-06-06 | DA 품질점검 표준화 완료 — Migration 003~008 (19개 위반 해소), 전 테이블 시스템 컬럼 강제화, `users→sys_user` 등 리네이밍 이력 반영 | anakin |
| v1.4 | 2026-06-06 | Phase 5 완료 — TASK-034 Audit Trail (Migration 009 + std_audit_log 트리거), TASK-035 승인 워크플로우 (Migration 010 + approval_queue 활용) | anakin |
| v1.5 | 2026-06-07 | Phase 6 완료 — next-intl v4 다국어, Gemini 2.5 Flash 자동번역, 18개 언어 지원, 3단계 fallback, Supabase 1000행 제한 해소, 모듈캐시 우회(readFile) | anakin |
| v1.6 | 2026-06-07 | TASK-044: 다국어 안정성 강화 — locale 단일 소스(locale-currency/country.ts), routing.ts 203개 선점 등록, Intl.DisplayNames 도입, 코드 인젝션 보안 패치(LOCALE_CD_RE) | anakin |
| v1.7 | 2026-06-07 | 기술 업그레이드: Next.js 16→16.2.7, TypeScript 5→6.0.3, eslint-config-next@16, FlatCompat 제거. 기술 업그레이드 모니터링 섹션 추가. | anakin |
| v1.8 | 2026-06-07 | Phase 7~9 PiChat 로드맵 추가: TASK-050~074 (채팅 MVP·수익화·생태계). 마일스톤 M14~M18 추가. PRD.md v4.0 통합 반영. | anakin |
| v1.9 | 2026-06-08 | TASK-050·051 완료 — sql/012_msg_tables.sql (msg_* 13개 테이블, Realtime RLS), sql/013_msg_seed.sql (테마 20개, 구독플랜 5개, 스티커팩 60개). M14 달성. | anakin |
| v2.0 | 2026-06-08 | TASK-052 완료 — 1:1 채팅 API (rooms·messages·join), supabase-client.ts, use-chat-room 훅(Realtime+presence), ChatMessageList(scroll-up 무한로드), ChatInput(rate limit 복원). tsc 통과. | anakin |
| v2.1 | 2026-06-08 | TASK-053 완료 — 그룹 채팅방 생성 4단계 마법사 (ThemeSelector·InlinePurchasePrompt·GroupRoomCreator), payments/complete CHAT_ROOM_CREATE 분기, /chat 홈·/chat/[roomId] 페이지, Header 채팅 링크. M15 달성. | anakin |
| v2.2 | 2026-06-08 | PiRC2 Soroban 스마트 컨트랙트 통합 문서화 — CLAUDE.md PiRC2 섹션 추가 (Contract ID·메서드·구독 매트릭스), TASK-054 PiRC2 기반 상세 업데이트, PRD_CHAT.md 구독 API 현행화, pi_pay SKILL.md PiRC2 구독 결제 섹션 추가. | anakin |
| v2.3 | 2026-06-09 | TASK-054 완료 — 구독 시스템(앱 레벨 U2A). chat-auth.ts(PLAN_CAPS 권한 단일 소스), /api/subscriptions(plans·POST결제준비·DELETE취소·check), payments/complete CHAT_SUBSCR 분기(amount 서버 재검증 + msg_subscr UPSERT), subscription-gate.tsx. tsc·lint(0 errors) 통과. M16 구독 기반 완성. | anakin |
