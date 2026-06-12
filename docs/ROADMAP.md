# Pi Network 기반 풀스택 앱 플랫폼 — 개발 로드맵

Pi Browser + 일반 브라우저를 모두 지원하는 Next.js 16 기반 Pi Network 앱 플랫폼

> **기준일**: 2026-06-12
> **현재 버전**: Phase 7·8·9·10·11 완료 (PiCafé MVP · Pi 수익화 · 생태계 확장 · 사용자 프로필 · 통계 대시보드) · Phase 12 PiTranslate™ MVP 완료 (TASK-090~097 ✅ · 098~099 대기) · **Phase 13 MyPiShop(MPS) 준비중 (TASK-100~113)** · **Phase 14 PiVoice™ 음성통화 설계 완료 (TASK-120~123, `docs/PRD_9_VOICE_CHAT.md`)** · **Phase 15 LBS P1 주변탐색 완료 (TASK-130~133·135·136·137·138·139 ✅)**
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

## Phase 7: PiCafé MVP ✅ (완료)

> **목표**: 테마 기반 1:1·그룹 카페 + Supabase Realtime + Pi 결제 연동 + 구독 시스템
> **상세 스펙**: `docs/PRD_4_CHAT.md` (v1.6)

### TASK-050: DB 마이그레이션 (`msg_*` 13개 테이블) ✅ 완료

- ✅ `sql/012_msg_tables.sql` 작성 — DA 표준 시스템 컬럼 4개 전 테이블 필수
- ✅ `msg_theme` — 테마 마스터 (`theme_tp_cd`: BASIC/PREMIUM)
- ✅ `msg_subscr_plan` — 구독 플랜 정의 (`mth_cnt` DA 표준 컬럼명)
- ✅ `msg_stkr_pack` / `msg_stkr` — 스티커 팩·개별 항목
- ✅ `msg_theme_stkr` — 테마 기본 스티커팩 매핑
- ✅ `msg_room` — 카페 (`room_tp_cd`: D/G/E, `entry_fee_pi`, `is_public_yn`)
- ✅ `msg_room_mbr` — 카페 멤버 (`mbr_role_cd`: OWNER/ADMIN/MEMBER/GUEST)
- ✅ `msg_msg` — 메시지 (`msg_tp_cd`: TEXT/IMAGE/FILE/VOICE/STICKER/TIP_NOTI/SYSTEM)
- ✅ `msg_msg_reac` — 메시지 이모지 반응
- ✅ `msg_attch` — 카페 첨부파일
- ✅ `msg_subscr` — 사용자 구독 현황
- ✅ `msg_usr_stkr` — 사용자 보유 스티커팩
- ✅ `msg_tip` — Pi Tip 내역 (`tip_cont` DA 표준 컬럼명)
- ✅ Realtime RLS 정책: `msg_msg` 카페 멤버만 구독 가능 (service_role bypass 유지)

### TASK-051: 테마 마스터 데이터 세팅 ✅ 완료

- ✅ `sql/013_msg_seed.sql` — 20개 테마 INSERT (BASIC 6개 + PREMIUM 14개)
- ✅ 테마별 기본 스티커팩 3종(이모지팩·일러스트팩·인사/응원팩) × 20개 = 60개 `msg_stkr_pack` INSERT
- ✅ `msg_theme_stkr` 60개 매핑 (DO 블록 + RETURNING으로 원자적 처리)
- ✅ `msg_subscr_plan` 5개 INSERT: FREE / PREMIUM_MONTHLY·ANNUAL / BUSINESS_MONTHLY·ANNUAL
- 🔜 `/api/admin/chat/themes` — 관리자 테마 CRUD API (TASK-052 이후 별도 구현)

### TASK-052: 1:1 카페 API + Supabase Realtime ✅ 완료

- ✅ `src/lib/chat.ts` — MsgRoom·MsgMsg·MsgRoomMbr 타입 + CRUD 헬퍼
- ✅ `src/lib/supabase-client.ts` — 클라이언트 Realtime용 Supabase 인스턴스 (publishable key)
- ✅ `GET /api/chat/rooms` — 내 카페 목록, `POST` — 1:1 Direct Room 생성
- ✅ `GET /api/chat/rooms/[roomId]` — 상세 + 멤버 목록 + 내 역할
- ✅ `GET /api/chat/rooms/[roomId]/messages` — cursor 페이지네이션 (scroll-up 무한로드)
- ✅ `POST /api/chat/rooms/[roomId]/messages` — 메시지 전송 + rate limiting (1초 5건)
- ✅ `POST /api/chat/rooms/[roomId]/join` — 공개 그룹방 입장 (정원 확인)
- ✅ `src/hooks/use-chat-room.ts` — `postgres_changes` + `presence` 구독 훅, 중복 방지 + scroll-up prepend
- ✅ `src/components/chat/chat-message-list.tsx` — 실시간 렌더링, scroll-up 무한로드, 시스템 메시지 분기
- ✅ `src/components/chat/chat-input.tsx` — Enter 전송, Shift+Enter 줄바꿈, 높이 자동조절, rate limit 복원
- 🔜 E2E 암호화 — Pi 지갑 키 기반 (Phase 8 이후 적용)

### TASK-053: 그룹 카페 생성 (테마 선택 UX + Pi 결제) ✅ 완료

```
카페 생성 UX:
Step 1: 테마 선택 (BASIC 자유 / PREMIUM 🔒 → 단건 0.2 Pi 또는 구독)
Step 2: 카페 이름·설명 (테마 이모지 자동 제안)
Step 3: 공개/비공개 + 정원 설정 (10/30/50/100명)
Step 4: Pi 결제 (BASIC 0.1 π / PREMIUM 0.3 π)
```

- ✅ `src/app/api/chat/themes/route.ts` — GET 테마 목록 (msg_theme 조회)
- ✅ `src/components/chat/inline-purchase-prompt.tsx` — 인라인 구매 트리거 공통 컴포넌트
- ✅ `src/components/chat/theme-selector.tsx` — 테마 선택 그리드 (BASIC 자유 / PREMIUM 🔒 InlinePurchasePrompt)
- ✅ `src/components/chat/group-room-creator.tsx` — 4단계 마법사 Dialog (테마→이름→설정→Pi결제)
- ✅ `src/components/chat/chat-room-panel.tsx` — ChatMessageList + ChatInput 래퍼 (Realtime 단일 구독)
- ✅ `/api/payments/complete` — `CHAT_ROOM_CREATE` 분기 추가 (결제완료 시 msg_room + msg_room_mbr 원자 생성)
- ✅ `src/app/[locale]/chat/page.tsx` — 카페 홈 (내 카페 + 공개방 탐색 + GroupRoomCreator)
- ✅ `src/app/[locale]/chat/[roomId]/page.tsx` — 카페 (초기 50건 서버 프리페치 + Realtime)
- ✅ Header에 '카페' 링크 추가

### TASK-055: Pi Browser 쿠키 비의존 인증 (X-Pi-Token) ✅ 완료 (2026-06-08)

> **핵심 가치 직결** — Pi Browser WebView는 모든 방식(form POST·fetch·redirect·HTML)의
> `Set-Cookie`를 저장하지 않아, 쿠키 기반 페이지 보호로는 카페·관리자 접속 시
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

## Phase 8: PiCafé 수익화 기능 ✅ (완료, 2026-06-11)

> **목표**: Pi Tip·스티커 마켓·AI 봇·이벤트방·인라인 구매 트리거 8종 구현
> **빌드 검증**: `pnpm tsc --noEmit` 통과 · `pnpm lint` 0 errors · `pnpm build` 성공

### TASK-060: Pi Tip (인라인 결제 + TIP_NOTI 메시지) ✅ 완료

- ✅ `src/components/chat/pi-tip-button.tsx` — 카페창 내 Tip 버튼 (Pi SDK U2A 결제 연동)
- ✅ `POST /api/tips/route.ts` — Tip 기록 (metadata.type=`PI_TIP`, 금액 서버 재검증)
- ✅ Pi Tip 수신 시 `TIP_NOTI` 타입 메시지 자동 발송 → 수신자 실시간 알림
- ✅ 트리거 2 구현: TIP_NOTI "나도 팁 보내기" → Free 사용자 단건/구독 업셀 선택
- ✅ 차트 테마 레이블 한국어화 + Tip 결제 완료 처리 (Pi payments/complete 분기)

### TASK-061: 스티커 마켓 (테마별 팩 + 인라인 업셀) ✅ 완료

- ✅ `src/components/chat/sticker-picker.tsx` — 스티커 선택 UI (기본 3개 팩 + 하단 업셀 배너)
- ✅ `GET /api/stickers/packs` — 테마별 스티커 팩 마켓 (msg_sticker_pack 조회)
- ✅ `POST /api/stickers/packs` — 스티커 팩 구매 (metadata.type=`STICKER_PACK`, Pi U2A)
- ✅ `chat-input.tsx` 스티커 전송 통합 (STICKER 타입 메시지)
- ✅ 트리거 1 구현: 스티커 메뉴 하단 업셀 배너 (미구매 팩 자동 하이라이트)

### TASK-062: 인라인 구매 트리거 8종 구현 ✅ 완료

| 트리거 | 발동 조건 | 구현 상태 |
|---|---|---|
| 1 스티커 업셀 | 스티커 메뉴 열 때 | ✅ `sticker-picker.tsx` 하단 배너 |
| 2 Tip 수신→보내기 | TIP_NOTI "보내기" 클릭 | ✅ `inline-purchase-prompt.tsx` |
| 3 AI 한도 초과 | AI 사용 한도 도달 | ✅ `chat-input.tsx` AI 응답 실패 시 |
| 4 메시지 만료 경고 | 7일 내 만료 메시지 존재 | ✅ 카페 입장 시 상단 배너 |
| 5 정원 초과 | 멤버 수 = max_mbr_cnt | ✅ 방장 대상 알림 팝업 |
| 6 프리미엄 테마 잠금 | PREMIUM 테마 클릭 | ✅ `theme-selector.tsx` 잠금 팝업 |
| 7 배지 강화 | 테마 배지 수여 시 | ✅ Trigger 7 테마 활동 배지 시스템 (`50d12d2`) |
| 8 이벤트방 알림 | 팔로우 테마 이벤트 개설 | ✅ 카페 홈 배너 (`8448284`) |

### TASK-063: 이벤트 카페 (유료 입장 + 방장 수익 분배) ✅ 완료

- ✅ `room_tp_cd='E'` 이벤트방 생성 — `entry_fee_pi`, `entry_expire_dtm` 설정
- ✅ 입장 시 Pi 결제 (metadata.type=`EVENT_ROOM_JOIN`)
- ✅ `msg_room_mbr(GUEST, expire_dtm=이벤트종료)` — 임시 멤버십
- ✅ 방장 Pi 수익 분배 로직 (플랫폼 수수료 0% 초기 3년 정책)
- ✅ 카페 만들기 다이얼로그에 "이벤트방" 탭 추가 (`c532607`)
- ✅ 트리거 8 구현: 테마 팔로우 사용자 이벤트 알림

### TASK-064: AI 카페 비서 (`@ai` 멘션 + 테마별 프롬프트) ✅ 완료

- ✅ `src/lib/chat-ai-prompts.ts` — 테마별 Claude 시스템 프롬프트 매핑
  - 골프방: 골프 코치 · 먹방방: 칼로리·영양 전문가 · 여행방: 여행 플래너·번역
- ✅ 메시지 내 `@ai` 멘션 파싱 → Anthropic API 호출 → `AI_REPLY` 타입 메시지 발송
- ✅ AI 사용 한도 체크 (Free: 불가/0.05 Pi · Premium: 10회/월 · Business: 무제한)
- ✅ 트리거 3 구현: AI 한도 초과 인라인 구매 프롬프트

### TASK-065: 파일·이미지·음성 메시지 (Supabase Storage) ✅ 완료

- ✅ `msg_attch` 테이블 활용 — `IMAGE`/`FILE`/`VOICE` 타입 메시지
- ✅ 파일 업로드: MIME 화이트리스트, 크기 강제 (Premium: 100MB/월, Business: 1GB/월)
- ✅ 음성 메시지 녹음: Free 30초 / Premium 1분 / Business 5분
- ✅ Supabase Storage `chat-attachments` 버킷 연동

---

## Phase 9: PiCafé 생태계 확장 ✅ (완료, 2026-06-11)

> **목표**: 마켓플레이스·Webhook·분석 대시보드·커스텀 스티커로 Pi 커뮤니티 생태계 구축
> **DB**: `sql/022_chat_ecosystem.sql` — 신규 5개 테이블 + RPC 3종 + msg_msg CHECK 확장 (Supabase 적용 완료)
> **빌드 검증**: `pnpm tsc --noEmit` 통과 · `pnpm lint` 0 errors · `pnpm build` 성공 (신규 라우트 12종 확인)
> ⚠️ **버그 수정 포함**: `msg_msg` CHECK 제약에 `AI_REPLY` 누락 — TASK-064 AI 응답 INSERT가 조용히 실패하던 잠재 버그를 022 마이그레이션에서 해소

### TASK-070: 카페 마켓플레이스 (테마별 공개방 디렉토리) ✅ 완료

- ✅ `GET /api/chat/marketplace?theme=` — 공개 그룹·이벤트방 디렉토리 (테마 필터)
- ✅ `fn_chat_marketplace` RPC — 인기 랭킹 (점수 = 멤버수×2 + 주간 메시지×0.5 + 주간 Tip×10)
- ✅ `msg_theme_follow` 테이블 + `POST/DELETE /api/chat/themes/[themeCd]/follow` (UPSERT 재팔로우 안전)
- ✅ `chat-marketplace.tsx` — 테마 필터 칩 + 🥇🥈🥉 랭킹 + 팔로우 토글 (낙관적 업데이트), 카페 홈 통합

### TASK-071: Pi Bet 투표 ✅ 완료

- ✅ `msg_bet` / `msg_bet_optn` / `msg_bet_entry` 테이블 (UNIQUE(bet_id, usr_id) — 1인 1회)
- ✅ `GET/POST /api/chat/rooms/[roomId]/bets` — 목록(옵션·참가 현황·내 참가) + 생성(방장 전용, 옵션 2~10개)
- ✅ `POST .../bets/[betId]/entries` — 참가 준비 (서버가 금액 결정, /api/tips 패턴)
- ✅ `payments/complete` PI_BET 분기 — 금액 서버 재검증 + OPEN 상태 확인 + entry INSERT + BET_NOTI
- ✅ `POST .../bets/[betId]/settle` — 생성자 정산: 풀 균등 분배(소수 4자리 절사), 조건부 UPDATE로 동시 정산 race 방지
- ✅ `msg_tp_cd='BET_NOTI'` 추가 (CHECK 확장 + 중앙 정렬 알림 렌더)
- ✅ `pi-bet-panel.tsx` — 카페 헤더 🎲 버튼 → 생성·참가(Pi U2A)·정산 패널
- ℹ️ 승자 Pi 분배는 `payout_pi` 장부 기록 — 실송금(A2U)은 Pi SDK 지원 시 후속 (PiRC2 구독과 동일 전략)

### TASK-072: 카페 봇·Webhook 연동 (Business 전용) ✅ 완료

- ✅ `msg_webhook` 테이블 (api_key UNIQUE, bot_nm, webhook_url nullable)
- ✅ `GET/POST/DELETE /api/chat/rooms/[roomId]/webhooks` — 방장+BUSINESS 게이트, 방당 5개 제한, api_key 등록 시 1회만 전체 노출
- ✅ SSRF 이중 방어 — `validateWebhookUrl()`: https 강제 + DNS 해석 후 loopback·사설(10/8, 172.16/12, 192.168/16)·link-local(169.254 메타데이터)·IPv6 내부 대역 차단, 등록·발송 양 시점 재검증(DNS rebinding 대비) + `redirect: 'manual'`(302 우회 차단)
- ✅ 신규 메시지 Webhook push — `chat-webhook.ts`, messages POST `after()` 백그라운드 (5초 타임아웃, 개별 실패 격리)
- ✅ `POST /api/chat/bot/messages` — `Authorization: Bot <api_key>` 인증 봇 전송 (분당 30건 rate limit)
- ✅ `GET /api/admin/chat/webhooks` — 어드민 전체 현황 (api_key 마스킹)

### TASK-073: 분석 대시보드 (Business 전용) ✅ 완료

- ✅ `fn_room_analytics` RPC — 일별 메시지·활성 사용자·Tip 수익·신규 멤버 (generate_series 빈 날짜 0 채움)
- ✅ `fn_room_mau` RPC — 기간 고유 발신자 (일별 합산 아닌 중복 제거)
- ✅ `GET /api/chat/rooms/[roomId]/analytics?days=7|30|90` — 방장+BUSINESS 게이트
- ✅ `src/app/[locale]/chat/[roomId]/analytics/page.tsx` + `room-analytics.tsx` — 요약 카드 4종 + plotly 차트 2종 (기존 plotly-plot ssr:false 래퍼 재사용), 카페 헤더 📊 진입
- ✅ redirect 없는 클라이언트 위임 (Pi Browser 무한 루프 방지 패턴 준수)

### TASK-074: 커스텀 스티커 제작 (Business 전용) ✅ 완료

- ✅ `POST /api/stickers/custom` — multipart 이미지 1~10장 (png/jpg/gif/webp 2MB, SVG 제외 — XSS), BUSINESS 게이트, 사용자당 팩 10개 제한
- ✅ `msg_stkr_pack.ownr_usr_id`(제작자) + `mkt_yn`(마켓 판매 여부) 컬럼 추가
- ✅ 노출 규칙: 플랫폼 기본팩 + 마켓 판매팩(mkt_yn='Y') + 내 팩만 — `/api/stickers/packs` 필터 확장
- ✅ 제작자 자동 보유(msg_usr_stkr) — 마켓 판매 시 구매자는 기존 STICKER_PACK 결제 흐름 재사용
- ✅ `custom-sticker-creator.tsx` — 스티커 피커 🎨 버튼 → 제작 다이얼로그 (미리보기·판매 옵션)
- ℹ️ PRD의 제작비 0.5 Pi는 **Business 플랜 포함**으로 처리 (BUSINESS 전용 기능 — 별도 결제 흐름 생략)

---

## Phase 10: 사용자 프로필 관리 (마이페이지) ✅ 완료 (2026-06-09)

> **목표**: 개인정보 수정 · 결제 내역 · 구독 현황 — Pi Browser 실기기 동작 보장 최우선
> **상세 스펙**: `docs/PRD_5_USERS.md` | **담당 에이전트**: `.claude/agents/user-profile-manager.md`
> **빌드 검증**: `pnpm tsc --noEmit` 통과 · `pnpm lint` 0 errors · `pnpm build` 성공

### TASK-056: DB 마이그레이션 — sys_user 프로필 컬럼 추가 ✅

- ✅ `sql/014_user_profile_columns.sql` 작성
- ✅ `real_nm TEXT`, `nick_nm TEXT`, `phone_no TEXT`, `addr TEXT`, `addr_dtl TEXT` 컬럼 추가
- ✅ DA 표준 준수 (시스템 컬럼 4개 기존 보유, 논리삭제 del_yn='Y' 정책 유지)
- ✅ Supabase 적용 완료 확인

### TASK-057: API — GET /api/profile ✅

- ✅ `src/app/api/profile/route.ts` (GET) 구현
- ✅ `getSessionUser()` — 쿠키/X-Pi-Token 이중 인증 자동 지원
- ✅ sys_user 조회 → UserRow(프로필 확장 포함) 반환
- ✅ `src/lib/users.ts` — `UserRow` 타입 확장 (5개 컬럼 추가)

### TASK-058: API — PATCH /api/profile ✅

- ✅ `src/app/api/profile/route.ts` (PATCH) 구현
- ✅ Zod v4 스키마 검증 (real_nm, nick_nm, phone_no, addr, addr_dtl, display_name)
- ✅ `src/lib/users.ts` — `updateUserProfile()` 함수 추가
- ✅ `modr_id`, `mod_dtm` 자동 갱신 (DA 표준)

### TASK-059: API — GET /api/profile/payments ✅

- ✅ `src/app/api/profile/payments/route.ts` (GET) 구현
- ✅ pi_pymnt 테이블 — user_id 기준 최신순 20건 조회
- ✅ status·amount·memo·reg_dtm 포함 응답

### TASK-060: 컴포넌트 — ProfileTabs + ClientProfileGate ✅

- ✅ `src/app/[locale]/profile/page.tsx` — Server Component
  - `getSessionUser()` null 시 `<ClientProfileGate />` 반환 (**redirect 절대 금지**)
- ✅ `src/app/[locale]/profile/_components/client-profile-gate.tsx` — Pi Browser 게이트
  - localStorage `pi_token` → `piFetch('/api/profile')` → 프로필 로드
  - 실패(401) → "로그인이 필요합니다" 표시
- ✅ `src/app/[locale]/profile/_components/profile-tabs.tsx` — 탭 전환 UI

### TASK-061: 컴포넌트 — ProfileForm · PaymentHistory · SubscriptionStatus ✅

- ✅ `src/app/[locale]/profile/_components/profile-form.tsx`
  - `piFetch()` PATCH 호출 — X-Pi-Token 헤더 자동 첨부
  - FormData 기반 6개 필드 + 저장 피드백 메시지
- ✅ `src/app/[locale]/profile/_components/payment-history.tsx`
  - `piFetch('/api/profile/payments')` + 빈 상태 UI
- ✅ `src/app/[locale]/profile/_components/subscription-status.tsx`
  - 기존 `/api/subscriptions/check` + `/api/subscriptions` DELETE 재사용
  - PLAN_CAPS 기반 플랜 배지(FREE/PREMIUM/BUSINESS) 표시

### TASK-062: 번역 + 3단계 검증 ✅

- ✅ `messages/ko.json` — `profile` 네임스페이스 추가
- ✅ 빌드 검증: `pnpm tsc --noEmit` 통과 · `pnpm lint` 0 errors · `pnpm build` 성공
  - `ƒ /[locale]/profile`, `ƒ /api/profile`, `ƒ /api/profile/payments` 라우트 확인
- ⏳ 2단계: Playwright — X-Pi-Token 헤더 시뮬레이션 인증 경로 검증 (Pi Browser 배포 후 권장)
- ⏳ 3단계: Pi Browser 실기기 — ClientProfileGate 동작 + 편집 저장 + 결제/구독 탭 전환

---

## Phase 11: 어드민 통계 대시보드 ✅ (완료)

> **목표**: DAU/WAU/MAU 사용자 활동 추이 + 테마(카테고리)별 매출 시각화
> **상세 스펙**: `docs/PRD_6_CHART.md` | **담당 에이전트**: `.claude/agents/chart/dashboard-stats-builder.md`
> **핵심 결정**: ① 차트 = **react-plotly.js**(순수 JS, `ssr:false` dynamic) ② 활동집계 = **신규 활동 로그**(하루 1행 UPSERT) ③ 집계방식 = **중간집계(Rollup) 테이블 사전 집계 → 대시보드 직접 조회**

### TASK-080: 활동 로그 마이그레이션 (`sql/015`) ✅

- ✅ `sql/015_user_activity_log.sql` — `sys_user_actvty_log` (`UNIQUE(usr_id, actvty_dt)` 하루 1행)
- ✅ `fn_record_activity(usr_id, type)` — `ON CONFLICT DO UPDATE` UPSERT RPC
- ✅ DA 표준: 시스템 컬럼 4개 + `del_yn`, `-- DA-APPROVED:` 주석

### TASK-081: 활동 계측 (원천 적재 시작) ✅

- ✅ `src/lib/activity-log.ts` — `recordActivity()` fire-and-forget 헬퍼
- ✅ `/api/auth/pi` GET(세션 복원) · POST(로그인) 양쪽 계측 삽입
- ⚠️ **소급 불가** — 배포 즉시 데이터 축적 시작

### TASK-082: 중간집계 테이블 + 집계 RPC (`sql/016`) ✅

- ✅ `stat_actvty_dly` — 일별 DAU/WAU/MAU 사전 집계
- ✅ `stat_revenue_dly` — 일별 × 테마별 매출 (PK `stat_dt, theme_cd`)
- ✅ `fn_build_daily_stats(p_dt date)` — **멱등** 집계(백필·보정 안전). 매출 4경로 UNION(방·팁·스티커·구독 `SUBSCR`)

### TASK-083: 집계 배치 + 백필 ✅

- ✅ `POST /api/admin/stats/aggregate` — `CRON_SECRET` Bearer 보호 + 어드민 세션 이중 인증, `fn_build_daily_stats` 호출
- ✅ `vercel.json` Vercel Cron 등록 — `0 0 * * *` (Hobby: 매일 UTC 자정), 전일분 자동 집계
- ✅ 백필 모드 지원 — `{ backfill: true }` 요청 시 `sys_user_actvty_log` 최초일 ~ 어제 자동 루프
- ✅ 실데이터 확인: `stat_actvty_dly` 5일치 (2026-06-05~09), `stat_revenue_dly` 4일치 (2026-06-06~09) 적재 완료

### TASK-084: 통계 API ✅

- ✅ `src/types/stats.ts` — `ActivityStatsResponse` / `RevenueStatsResponse`
- ✅ `GET /api/admin/stats/activity?period=` — rollup SELECT + Top-3 활성 사용자 (COALESCE nick_nm/pi_username/google_email)
- ✅ `GET /api/admin/stats/revenue?period=` — rollup SELECT (테마 라벨·이모지 `msg_theme` 조인) + Top-3 매출 테마 + Top-3 최고 지출 사용자
- ✅ `sql/017_stats_ranking_rpcs.sql` — `fn_top_active_users` / `fn_top_revenue_themes` / `fn_top_spenders` RPC 3종 (Supabase 배포 완료)
- ✅ `getSessionUser()` + `isAdmin()` 인증

### TASK-085: 차트 라이브러리 + 컴포넌트 3종 ✅

- ✅ `react-plotly.js` + `plotly.js-basic-dist-min` 설치 (경량 번들)
- ✅ `src/components/charts/plotly-plot.tsx` — `dynamic ssr:false` 래퍼 (`window/document` 접근 차단)
- ✅ `src/components/charts/dau-wau-mau-chart.tsx` — MAU→WAU→DAU 렌더 순서 + `legendrank` 범례 분리
- ✅ `src/components/charts/revenue-donut-chart.tsx` — 테마별 매출 비중 도넛 차트
- ✅ `src/components/charts/revenue-timeline-chart.tsx` — 테마별 누적 바 차트

### TASK-086: 대시보드 페이지 + 메뉴 ✅

- ✅ `StatsCard`(스켈레톤 로딩) · `StatsDateFilter`(7/30/90/365) · `StatsDashboard`(병렬 fetch)
- ✅ 그래프 아래 **Top-3 활성 사용자 목록** (activity_days 내림차순)
- ✅ 그래프 아래 **Top-3 테마별 매출 순위 목록** + Top-3 지출 사용자
- ✅ `src/app/[locale]/(admin)/admin/stats/page.tsx`
- ✅ 어드민 사이드바에 "통계" 메뉴 추가 (ko.json + en.json)

### TASK-087: 검증 ✅

- ✅ `pnpm tsc --noEmit` 통과 (0 errors) — plotly.d.ts 선언으로 암묵적 any 해결
- ✅ `npx next build` 통과 — Plotly `dynamic ssr:false` 빌드 정상
- ✅ `fn_build_daily_stats` 멱등성 확인 — `stat_actvty_dly` 5일치, `stat_revenue_dly` 4일치 실데이터 Supabase 적재 완료
- ⏳ Pi Browser 어드민 piFetch 인증 (PC 브라우저 권장 안내 — 실기기 검증 후 최종 완료)

### Phase 11 후속 고도화 ✅ 완료 (2026-06-11)

#### 버그픽스 4건 (`6170b4d`) ✅

- ✅ `activity-log.ts` lazy thenable 버그 수정 — `recordActivity()` Promise 미await으로 집계 누락 방지
- ✅ Vercel Cron GET 핸들러 추가 — `vercel.json` Cron은 GET 요청 발송, 기존 POST 전용 핸들러 누락 수정
- ✅ WAU/MAU 슬라이딩 윈도우 쿼리 수정 — `stat_actvty_dly` 기준 7일/30일 범위 off-by-one 해소
- ✅ 오늘 온디맨드 집계 — 당일 데이터는 rollup 테이블 없어 직접 집계 fallback 추가

#### 활성 사용자 Top 3 가중치 점수제 개편 (`bf29103`) ✅

- ✅ 단순 활동일수 → 종합 가중치 점수제로 전환
  - 점수 = 활동일수 × 0.2 + 콘텐츠활동수 × 0.3 + 결제건수 × 0.5
  - 결제 활성 사용자를 상위로 부상시켜 수익화 기여도 반영
- ✅ `fn_top_active_users` RPC 수정 — Supabase 재배포 완료

---

## Phase 12: PiTranslate™ 글로벌 동시통역 ✅ MVP 완료 (2026-06-10 — TASK-090~097 · 098~099 대기)

> **목표**: 카페에서 어떤 언어로 보내도, 각 사용자의 선택 언어로 실시간 자동 번역 — 언어 장벽 제로
> **상세 스펙**: `docs/PRD_4_CHAT.md` (v1.6, Section 1-4) | **담당 에이전트**: 전용 에이전트 없음
> **핵심 결정**: ① 번역 엔진 = **Gemini 2.0 Flash**(주력) + **Claude Haiku**(fallback) 하이브리드 (비용 ~76% 절감) ② 캐시 = `msg_trans` 테이블 `UNIQUE(msg_id, locale_cd)` ③ 동시성 = in-memory pending map ④ 실시간 = Supabase Realtime broadcast `msg_trans` 이벤트
> **빌드 검증**: `pnpm tsc --noEmit` 통과 · `pnpm lint` 0 errors · `pnpm build` 성공 (`/api/.../translate` 라우트 확인)

### TASK-090: DB 마이그레이션 + 환경변수 ✅ 완료

- ✅ `sql/020_msg_trans.sql` — `msg_trans` 번역 캐시 테이블 신설 (**018·019 선점으로 020으로 번호 조정**)
  - PK `trans_id UUID`, UNIQUE `(msg_id, locale_cd)`, `trans_cont TEXT NOT NULL`, `model_ver`(모델 추적)
  - 시스템 컬럼 4개 + `del_yn`/`del_dtm` DA 표준 준수 (`-- DA-APPROVED:` 주석)
- ✅ `msg_msg.src_lang_cd VARCHAR(20)` 컬럼 추가 (원본 언어 코드 — Gemini Flash 감지)
- ✅ `sys_user.display_locale_cd VARCHAR(20)` 컬럼 추가 (서버 번역 큐 대상 — TASK-096 선반영)
- ✅ Supabase 적용 완료 (`apply_migration` — 테이블·컬럼 3종 검증 확인)
- ✅ `GEMINI_API_KEY` — `src/env.ts` Phase 6에서 기등록 확인

### TASK-091: Gemini Flash 번역 라이브러리 ✅ 완료

- ✅ `src/lib/chat-translate.ts` — `translateMessage(text, targetLocale)`
  - **Gemini 2.5 Flash** REST API (SDK 불필요 — admin i18n translate 라우트와 동일 패턴): 번역 + 언어감지 단일 호출, `responseMimeType: application/json` + temperature 0
  - ⚠️ PRD의 `gemini-2.0-flash`는 2026-06-10 기준 **단종**(generateContent 404) — `gemini-2.5-flash`로 전환 (실호출 검증 완료)
  - 10초 타임아웃(`AbortSignal.timeout`) · 실패 시 Claude Haiku fallback 자동 전환 (`ANTHROPIC_API_KEY` 재사용)
  - 반환: `{ translated, srcLangCd, modelVer }` · `LOCALE_CD_RE` 화이트리스트 + `baseLang()` 헬퍼 export

### TASK-092: 동시성 dedup 처리 ✅ 완료

- ✅ `src/lib/chat-translate-dedup.ts` — in-memory pending map
  - key: `${msgId}:${localeCd}`, value: `Promise<TranslationOutcome>`
  - 동일 (msgId, locale) 동시 요청 시 API 1회만 호출, 나머지는 첫 Promise await
  - 서버 재시작·멀티 인스턴스는 DB 캐시 + UPSERT(`onConflict: msg_id,locale_cd`)로 보완
  - broadcast를 dedup job 내부에 배치 — fresh 번역 1회에만 발송 (대기자 N명이어도 중복 발송 없음)

### TASK-093: 번역 API 라우트 ✅ 완료

- ✅ `POST /api/chat/rooms/[roomId]/messages/[msgId]/translate`
  - Body: `{ locale_cd: string }` (`LOCALE_CD_RE` 검증)
  - 인증: `getSessionUser()` + `getRoomMember()` 방 참가 확인 (`piFetch` 쿠키/헤더 이중 지원)
  - 흐름: `msg_trans` DB 캐시 조회 → 캐시 히트 즉시 반환 → pending map → Gemini Flash → DB UPSERT → Realtime broadcast
  - `src_lang_cd`가 대상 locale과 같으면 번역 생략 (`same_lang: true` 반환)

### TASK-094: 메시지 전송 시 번역 큐 연동 ✅ 완료

- ✅ `POST /api/chat/rooms/[roomId]/messages` 확장
  - 저장 + broadcast 후 **Next.js 16 `after()`** 로 백그라운드 번역 큐 실행 (서버리스 freeze에도 완료 보장 — `void`보다 안전)
  - `getDistinctRoomLocales(roomId)` — `msg_room_mbr` ⨝ `sys_user.display_locale_cd` 방 참가자 locale 목록
  - `src_lang_cd` 첫 감지 시 `msg_msg` 조건부 UPDATE(`.is('src_lang_cd', null)` — race 안전)
  - 감지된 원본 언어와 같은 locale은 건너뜀
- ✅ `GET .../messages?locale=` — `msg_trans` 캐시된 번역 `trans_cont` pre-populate (scroll-up·초기 로드)

### TASK-095: 클라이언트 broadcast 구독 확장 ✅ 완료

- ✅ `src/hooks/use-chat-room.ts` — `msg_trans` broadcast 이벤트 구독 (`locale_cd === userLocale`일 때만 적용)
- ✅ `applyTranslation(msgId, transCont)` — 메시지 번역 텍스트 교체 함수
- ✅ `ChatMessage` 타입에 `trans_cont?` · `src_lang_cd?` 추가
- ✅ 수신 메시지 자동 번역 요청(`requestTranslation`) — `display_locale_cd` 미설정 사용자도 URL locale 기준 번역 수신 (서버 dedup으로 중복 호출 차단, `requestedTransRef`로 클라이언트 중복 POST 방지)
- ✅ `chat-room-panel.tsx` — `useLocale()`(next-intl)로 표시 언어 전달
- ✅ `client-chat-room.tsx` · `chat/[roomId]/page.tsx` — 초기 50건에 캐시 번역 병합

> **P0 완료 = MVP**: TASK-090 → 091 → 092 → 093 → 094 → 095 ✅ — PiTranslate™ 기본 동작

### TASK-096: 사용자 표시 언어 설정 UI ✅ 완료

- ✅ 프로필 페이지 (`/profile`) — "표시 언어 (카페 자동 번역)" 드롭다운 추가 (`routing.locales` 203개 단일 소스, `Intl.DisplayNames` 한국어 라벨 자동 파생)
- ✅ `sys_user.display_locale_cd` 컬럼 (sql/020) + `UserRow`/`updateUserProfile` 타입 확장
- ✅ `PATCH /api/profile` — Zod `display_locale_cd` regex 검증 (locale 코드 인젝션 방지)
- ℹ️ `use-user-locale.ts` 별도 훅은 생략 — 카페 표시 언어는 next-intl URL locale을 직접 사용 (이 앱은 203개 locale 라우팅을 이미 보유, localStorage 캐시 불필요)

### TASK-097: 원문 보기 토글 UI ✅ 완료

- ✅ `src/components/chat/translated-message.tsx` — 번역/원문 전환 컴포넌트 (`[원문 보기]` ↔ `[번역 보기]`)
- ✅ `chat-message-list.tsx` MessageBubble — `trans_cont`가 원문과 다를 때만 번역 표시 + 토글 (동일하면 원문 그대로)

### 추가 고도화: 방별 번역 언어 콤보 + 카페 레이아웃 고정 ✅ 완료 (2026-06-10)

> 카페 헤더 제목 옆 언어 콤보에서 선택한 언어로 **그 방의 모든 메시지를 강제 번역** — 방마다 독립 적용

- ✅ `src/components/chat/chat-locale-select.tsx` — 제목 옆 콤보 (🌐 자동 + 203개 locale)
- ✅ `src/lib/locale-options.ts` — locale 드롭다운 옵션 단일 소스 (profile-form 중복 제거)
- ✅ 방별 독립 저장 — `localStorage['chat_view_locale:{roomId}']` (다른 방에 영향 없음, 재입장 시 복원)
- ✅ `POST /api/chat/rooms/[roomId]/translate-batch` — 일괄 번역 (캐시 일괄 조회 → 미스만 최신순 순차 번역, 50건 제한, 개별 실패 스킵)
- ✅ `use-chat-room.ts` `forceTranslate` 모드 — 로드된 전체 메시지(본인 과거 메시지 포함)·scroll-up·신규 수신을 단일 effect로 일괄 번역, 언어 변경 시 기존 번역 wipe 후 재번역. fresh 번역은 broadcast로 점진 도착(진행형 UX)
- ✅ 헤더를 `ChatRoomPanel`로 통합 (page.tsx·client-chat-room 중복 제거) — **제목 섹션·입력 섹션 고정(`shrink-0`), 본문만 스크롤(`min-h-0 overflow-y-auto`)**
- ✅ 방금 보낸 내 메시지는 번역 제외(`requestedTransRef` 선등록 — DB 저장 전 404 race 방지)

### TASK-098: 어드민 번역 통계 ✅ (2026-06-12)

- ✅ 어드민 통계 대시보드에 "번역 (PiTranslate™)" 섹션 추가 (`translate-stats-section.tsx` — LazySection 지연 로드)
- ✅ 일별 번역 건수 · 캐시 히트율 · 예상 비용 (Gemini 토큰 추정: 1 token ≈ 4 chars) · 모델별 분포 · 피드백 합계
- ✅ `msg_trans.hit_cnt` 캐시 히트 카운터 + `fn_msg_trans_hit`(원자적 증가) + `fn_translate_stats` RPC (sql/034, Supabase 적용 완료)
- ✅ `GET /api/admin/stats/translate?period=7|30|90|365` (admin 전용)

### TASK-099: 번역 품질 피드백 ✅ (2026-06-12)

- ✅ 메시지별 번역 👍/👎 피드백 UI (`translated-message.tsx` — 원문 토글 옆, 선택 상태 하이라이트)
- ✅ `msg_trans.feedback_yn CHAR(1)` 컬럼 추가 (sql/034 — 향후 fine-tune 데이터)
- ✅ `POST /api/chat/rooms/[roomId]/messages/[msgId]/translate/feedback` (멤버 검증 + locale 화이트리스트)

---

## Phase 13: MyPiShop(MPS) 🚧 (Phase 1 MVP 1차 구현 — 2026-06-11)

> **목표**: Pi Coin 전용 P2P 직거래 마켓플레이스 — 에스크로 기반 안전 거래, 재고 관리, 매장 등록
> **상세 스펙**: `docs/PRD_8_MPS.md` (v1.1) | **담당 에이전트**: `.claude/agents/commerce/mps-prd-architect.md`
> **핵심 결정**: ① 에스크로 = **PiRC2 U2A 가상 에스크로** (운영자 Pi 계정 중간 보관, `metadata.type='MPS_ESCROW'`) ② 재고 = `stock_qty = reg_qty - ordered_qty` CHECK 제약 + 원자적 차감 ③ DB = `mps_` 접두사 6개 테이블 ④ 3단계 마일스톤 (Phase 1 MVP → Phase 2 확장 → Phase 3 PiRC3 마이그레이션)

### TASK-100: DB 마이그레이션 `sql/029_mps.sql` ✅ (2026-06-11)

> 파일 번호 확정 (2026-06-11): 025~028 병렬 점유(last_login·revenue·kakao·voice) → MPS는 029. 6개 테이블 + `fn_mps_order_create`/`fn_mps_order_cancel` RPC, Supabase 적용 완료

> `mps_` 접두사 신규 주제영역 — DA 표준 시스템 컬럼 4개 + `del_yn` 논리삭제 전 테이블 적용 (`-- DA-APPROVED:` 주석 필수)

- 🔜 `mps_ctgr` — 카테고리 (계층형, `parent_ctgr_id`, `depth_no`)
- 🔜 `mps_shop` — 매장 (`shop_type_cd`: ONLINE/OFFLINE/BOTH, `lat`/`lng NUMERIC(9,6)`, `place_id TEXT NULL` ← Google Maps Phase 3 확장 포인트)
- 🔜 `mps_item` — 상품 (`reg_qty`, `ordered_qty`, `stock_qty` + `CHECK(stock_qty = reg_qty - ordered_qty)` DB 불변 조건)
  - `item_cnd_cd`: NEW/USED/HANDMADE | `item_st_cd`: DRAFT/OPEN/CLOSED/SOLD
  - `reg_qty = 9999` 센티널: 무제한 재고 → 자동 SOLD 전환 억제 (음료·피자 등)
- 🔜 `mps_item_img` — 상품 이미지 (`sort_ord`, `thumbnail_yn`)
- 🔜 `mps_order` — 주문 (`order_st_cd`: PENDING/ESCROW/TRADING/SELLER_DONE/DONE/CANCELLED, `escrow_txid`, `release_txid`, `fee_pi`, `fee_payer_id`)
- 🔜 `mps_txn_hist` — 거래내역 (`txn_type_cd`: ESCROW_IN/RELEASE_OUT/REFUND/FEE)

### TASK-101: lib 헬퍼 3종 ✅ (2026-06-11)

- 🔜 `src/lib/mps-item.ts` — 상품 CRUD, 재고 원자적 차감 (`UPDATE ... WHERE stock_qty > 0 RETURNING`)
- 🔜 `src/lib/mps-order.ts` — 주문 생성·상태 전이·에스크로 흐름
- 🔜 `src/lib/mps-shop.ts` — 매장 CRUD

### TASK-102: 상품 API (FR-01·FR-02·FR-04) ✅ (2026-06-11 — 이미지 업로드 엔드포인트만 후속)

- 🔜 `GET /api/store/items` — 목록 조회 (카테고리·상태·키워드 필터, 커서 페이지네이션)
- 🔜 `POST /api/store/items` — 상품 등록 (판매자 인증, Zod 검증)
- 🔜 `GET /api/store/items/[itemId]` — 상세 조회 (이미지 포함)
- 🔜 `PATCH /api/store/items/[itemId]` — 수정 (소유자 확인)
- 🔜 `DELETE /api/store/items/[itemId]` — 논리삭제 (`del_yn='Y'`, 물리 DELETE 금지)
- 🔜 `POST /api/store/items/[itemId]/images` — 이미지 업로드 (Supabase Storage)

### TASK-103: 재고 관리 (FR-07) ✅ (2026-06-11 — RPC 단일 트랜잭션 + 9999 센티널 + CHECK 이중 안전장치)

> **핵심 불변 조건**: `stock_qty = reg_qty - ordered_qty` — CHECK 제약 + 원자적 UPDATE

- 🔜 원자적 재고 차감: `UPDATE mps_item SET ordered_qty = ordered_qty + 1, stock_qty = stock_qty - 1 WHERE item_id = $1 AND stock_qty > 0 RETURNING item_id`
  - 반환 없으면 → 재고 부족 409 응답 (race condition 안전)
- 🔜 `reg_qty = 9999` 센티널 처리 — `stock_qty < 10` 임박 경고만, SOLD 자동전환 생략
- 🔜 주문 취소 시 재고 복원: `ordered_qty - 1, stock_qty + 1`

### TASK-104: 주문 + 에스크로 API (FR-08·FR-09·FR-11·FR-13) ✅ (2026-06-11 — 에스크로 완료는 별도 endpoint 대신 기존 `/api/payments/complete`의 `MPS_ESCROW` 분기로 통합, 양방향 확인 confirm/release + 취소 cancel 포함)

> **에스크로 흐름**: 구매자 Pi 송금 → 운영자 계정 보관 → 거래 완료 후 판매자 송금

- 🔜 `POST /api/store/orders` — 주문 생성 (재고 원자적 차감 + PENDING 상태)
- 🔜 `POST /api/store/orders/[orderId]/escrow` — Pi U2A 에스크로 완료 처리 (`metadata.type='MPS_ESCROW'`, PENDING → ESCROW)
- 🔜 `POST /api/store/orders/[orderId]/confirm` — 판매자 거래 완료 선언 (ESCROW → SELLER_DONE)
- 🔜 `POST /api/store/orders/[orderId]/release` — 구매자 최종 확인 (SELLER_DONE → DONE) + 판매자 Pi 송금 (`metadata.type='MPS_RELEASE'`)
- 🔜 `GET /api/store/orders` — 내 주문 목록 (판매자/구매자 분리 조회)
- 🔜 `GET /api/store/orders/[orderId]` — 주문 상세

### TASK-105: 상품 목록·상세 UI (SCR-01·SCR-02) ✅ (2026-06-11)

- 🔜 `src/app/[locale]/store/page.tsx` — 상품 목록 (카테고리 필터, 검색바, 무한 스크롤)
- 🔜 `src/app/[locale]/store/[itemId]/page.tsx` — 상품 상세 (이미지 갤러리, 구매 버튼, 재고 표시)
- 🔜 `ClientStoreGate` — `getSessionUser()` null 시 클라이언트 게이트 (`redirect` 금지 — Pi Browser 무한 루프 방지)
- 🔜 `piFetch` 의무 — 모든 API 호출에 `X-Pi-Token` 헤더 자동 첨부

### TASK-106: 내 상품 관리 UI (SCR-03·SCR-04) ✅ (2026-06-11 — 등록 폼 완료, 수정 폼·이미지 업로드 후속)

- 🔜 `src/app/[locale]/store/my/items/page.tsx` — 내 상품 목록 (상태별 탭: DRAFT/OPEN/CLOSED/SOLD)
- 🔜 `src/app/[locale]/store/my/items/new/page.tsx` — 상품 등록/수정 폼 (이미지 업로드 포함)

### TASK-107: 주문 관리 UI (SCR-05·SCR-06) ✅ (2026-06-11)

- 🔜 `src/app/[locale]/store/my/sales/page.tsx` — 판매 주문 관리 (거래 완료 선언 버튼)
- 🔜 `src/app/[locale]/store/my/orders/page.tsx` — 구매 주문 관리 (최종 확인 버튼)

> **P0 완료 = Phase 1 MVP**: TASK-100 → 101 → 102 → 103 → 104 → 105 → 106 → 107

---

### Phase 2 — 확장

### TASK-108: 카테고리 시스템 (FR-03) 🔜

- 🔜 `GET /api/store/categories` — 계층형 카테고리 트리 조회
- 🔜 어드민 카테고리 CRUD (`/admin/store/categories`)

### TASK-109: 매장 관리 (FR-06·SCR-08) 🔜

- 🔜 `GET /api/store/shops` — 내 매장 목록
- 🔜 `POST /api/store/shops` — 매장 등록 (`place_id`·`lat`·`lng` 저장 준비)
- 🔜 `PATCH /api/store/shops/[shopId]` — 매장 수정
- 🔜 `DELETE /api/store/shops/[shopId]` — 논리삭제
- 🔜 `src/app/[locale]/store/my/shops/page.tsx` — 매장 관리 UI (SCR-08)

### TASK-110: 양방향 주문 취소 (FR-10) 🔜

- 🔜 `POST /api/store/orders/[orderId]/cancel` — 취소 요청 (취소 요청자 수수료 부담)
- 🔜 에스크로 환불 흐름 (`metadata.type='MPS_CANCEL_REFUND'`)
- 🔜 ESCROW 상태에서만 취소 허용 (SELLER_DONE 이후는 불가)

### TASK-111: 거래 내역 (FR-12·SCR-07) 🔜

- 🔜 `GET /api/store/txns` — 내 거래내역 조회 (`mps_txn_hist`)
- 🔜 `src/app/[locale]/store/my/history/page.tsx` — 거래 내역 UI (SCR-07)

---

### Phase 3 — 고도화

### TASK-112: PiRC3 실 에스크로 마이그레이션 🔜

- 🔜 PiRC2 U2A 가상 에스크로 → PiRC3 스마트 컨트랙트 실 에스크로로 전환
- 🔜 `mps_order.escrow_txid` → PiRC3 Contract transaction hash로 교체
- 🔜 `subscribe()` 방식의 Pi Wallet 서명 기반 에스크로 잠금

### TASK-113: Google Maps 연동 🔜

- 🔜 `mps_shop.place_id` + `lat`/`lng` → Google Maps Place API 자동완성
- 🔜 매장 주소 입력 시 지도 핀 표시 + 좌표 자동 저장

---

## Phase 14: PiVoice™ — WebRTC 실시간 음성 통화 🔜 (설계 완료, 구현 대기)

> **목표**: 카페 멤버 간 브라우저 기반 1:1 음성 통화 — 추가 인프라 0(시그널링 재사용), 서버 미디어 비용 0(P2P 직결)
> **상세 스펙**: `docs/PRD_9_VOICE_CHAT.md` (v1.0) | **담당 에이전트**: `.claude/agents/chat/voice-chat-architect.md`
> **확정 결정 (2026-06-11)**: ① MVP = **1:1 음성만** ② TURN = **관리형 서비스로 시작**(Metered 등, 검증 후 자체 coturn 전환) ③ 수익화 = **베타 완전 무료**(결제 설계만) ④ 토폴로지 = P2P 메시(최대 4인, 초과 시 LiveKit 오디오 SFU)
> **핵심 재사용**: `broadcastToRoom`(시그널링) · `getSupabaseClient`+presence(수신) · `piFetch`/`getSessionUser`(인증) · `ClientChatRoom` 게이트 패턴 · `getRoomMember`(권한) · DA DDL 표준

### TASK-120: 데이터 모델 `sql/026_voice_call.sql` 🔜

> 파일 번호 확정 (2026-06-11): 024는 `sys_batch_log`, 025는 MPS(TASK-100) 예약 → PiVoice는 026

- 🔜 `msg_call_log` — 통화 이력 (`caller_usr_id`/`callee_usr_id`, `call_st_cd` RINGING/CONNECTED/ENDED/DECLINED/MISSED, `relay_yn`, `duration_sec`, `end_rsn_cd`)
- 🔜 `msg_call_quality_stat` — 품질 메트릭 (`rtt_ms`, `packet_loss_pct`, `jitter_ms`, UNIQUE(call_id, usr_id))
- 🔜 DA 표준 (시스템 컬럼 4개 + del_yn/del_dtm + TIMESTAMPTZ + `-- DA-APPROVED:` 주석), `da-ddl-guard` 통과

### TASK-121: TURN 자격증명 발급 API 🔜

- 🔜 `POST /api/voice/turn-credentials` — Pi 토큰 검증 → 관리형 TURN 임시 자격증명(TTL 1h) 반환, 클라이언트 하드코딩 금지
- 🔜 `src/env.ts` + `.env.example` — `TURN_HOST`/`TURN_SECRET`/`TURN_CREDENTIAL_TTL` server 변수 추가
- 🔜 TURN over TLS 443 경로 포함(제한망 대비)

### TASK-122: 시그널링 + 통화 API 🔜

- 🔜 `POST /api/chat/rooms/[roomId]/call` — 통화 시작 (`getRoomMember` 권한 + `msg_call_log` INSERT(RINGING) + `call_invite` broadcast)
- 🔜 `POST .../call/[callId]/signal` — offer/answer/candidate/hangup 중계 (서버 발신으로 신원 보증)
- 🔜 `POST .../call/[callId]/end` — 종료 + `duration_sec`·`end_rsn_cd` 기록 + 품질 stat 적재
- 🔜 신규 broadcast 이벤트: `call_invite`/`webrtc_offer`/`webrtc_answer`/`webrtc_candidate`/`call_hangup` (채널 `room:${roomId}` 재사용)

### TASK-123: WebRTC 훅 + UI 🔜

- 🔜 `src/hooks/use-webrtc-call.ts` — RTCPeerConnection 관리, 상태 머신(ringing 30초 타임아웃 → connected → ended), ICE restart(Wi-Fi↔LTE), `getUserMedia` 제약(echoCancellation/noiseSuppression/autoGainControl), `pc.getStats()` 품질 수집
- 🔜 `src/app/[locale]/chat/[roomId]/call/page.tsx` — redirect 금지 → `ClientVoiceCall` 위임
- 🔜 `client-voice-call.tsx`(Pi Browser 게이트) + `voice-call-panel.tsx`(발신/수신 벨·통화 화면) + 카페 헤더 📞 버튼

### 단계별 Go/No-Go

- 🔜 **S0 스파이크**: Pi Browser 실기기 마이크 권한 + `getUserMedia` 동작 확인 (iOS WKWebView 지원 여부 = 전체 go/no-go 핵심)
- 🔜 **S1 1:1 MVP**: TASK-120~123 (동일/상이 네트워크 통화 연결·종료·품질 로깅)
- 🔜 **S2 품질 검증**: TURN 경유율·packet loss 데이터로 자체 coturn 전환 판단
- 🔜 **S3 확장**: (데이터 기반) 4인 메시 또는 LiveKit SFU / 결제 게이팅(`VOICE_CALL_CREDIT` + `voiceDailyFreeMinutes`) 활성화

---

## Phase 15: LBS 위치기반서비스 🚧 (P0 MVP 구현 완료)

> **목표**: 동의 기반 위치 수집 + 주변 탐색 + MPS 직거래 거리 표시로 거래 성사율 향상
> **상세 스펙**: `docs/PRD_10_GPS.md` (v1.2) | **담당 에이전트**: `.claude/agents/gps/lbs-consulting-architect.md`
> **핵심 결정**: ① 동의 게이트 = `lbs_consent_yn` 컬럼 기반 이중 제어(UI + API 403) ② 거리 계산 = Haversine SQL(PostGIS 불필요) ③ mps_shop.lat/lng 재활용(이중 저장 금지) ④ 법적 근거 = `docs/law/agreement/위치기반서비스이용약관...kor.md`

### TASK-130: DB 마이그레이션 `sql/033_lbs.sql` ✅

- ✅ `sys_user_consent` — 동의 이력 (`consent_tp_cd`: 'LBS'/'MKT'/'PUSH', 6개월 보관 의무, client_ip/user_agent 감사 로그)
- ✅ `usr_loc_hist` — 위치 수집 이력 (`loc_tp_cd`: '01'가입/'02'로그인/'03'매장/'04'상품, `lat DECIMAL(10,8)`, `lng DECIMAL(11,8)`, `ref_id`)
- ✅ `sys_user` 컬럼 추가: `lbs_consent_yn CHAR(1) DEFAULT 'N'`, `lbs_consent_dtm TIMESTAMPTZ`, `lbs_consent_ver TEXT`
- ✅ `fn_haversine_km(lat1, lng1, lat2, lng2)` DB 함수 — Haversine 거리 계산 (PostGIS 불필요)
- ✅ DA 표준: 시스템 컬럼 4개 + del_yn/del_dtm + `-- DA-APPROVED:` 주석
- ✅ `src/lib/users.ts` `UserRow` 타입에 lbs_* 컬럼 추가

### TASK-131: 환경변수 + Google Maps API 설정 ✅

- ✅ `src/env.ts` + `.env.example` — `GOOGLE_MAPS_API_KEY`(서버 전용), `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`(지도 뷰 클라이언트)
- ✅ Geocoding/Reverse Geocoding/Places API — 서버 API Route에서만 호출 (클라이언트 직접 호출 금지)

### TASK-132: 동의 API (`/api/location/consent` GET/POST/DELETE) ✅

- ✅ GET — 현재 동의 상태 조회 (`sys_user.lbs_consent_yn`)
- ✅ POST — 동의 등록: `sys_user.lbs_consent_yn='Y'` + `sys_user_consent` INSERT (client_ip/user_agent 감사 로그)
- ✅ DELETE — 동의 철회: `lbs_consent_yn='N'` + `usr_loc_hist.del_yn='Y'` 즉시 파기 (Rule LBS-03, 위치정보법 제5조)

### TASK-133: 위치 저장 API (`POST /api/location/save`) ✅

- ✅ 미동의 시 403 즉시 반환 (Rule LBS-02 서버 재검증)
- ✅ WGS84 좌표 범위 검증 (lat -90~90, lng -180~180)
- ✅ loc_tp_cd 분기: '01'(가입) / '02'(로그인) / '03'(매장) / '04'(상품거래)
- ✅ `piFetch()` 사용 — X-Pi-Token 헤더 이중 경로 지원

### TASK-134: Google Maps 서버 프록시 API ✅

- ✅ `src/lib/google-maps.ts` — `geocodeAddress()`·`reverseGeocode()` (Geocoding API 단일 호출 양방향), `import 'server-only'` 키 보호
- ✅ `POST /api/location/geocode` — 주소 → 좌표 (로그인 필수·동의 불필요, 유료 API 남용 방지)
- ✅ `POST /api/location/reverse-geocode` — 좌표 → 주소 + 한국 행정구역(시도/시군구/동) 파싱
- ✅ 한국 주소 type 우선순위 fallback (administrative_area_level_1/2 → locality → sublocality_*)
- ✅ Next.js fetch 캐시 1일(`revalidate: 86400`) — 동일 좌표/주소 반복 변환 비용 절감
- ✅ status별 처리: OK·ZERO_RESULTS(404)·그 외(REQUEST_DENIED 등 502, error_message 서버 로그)

### TASK-135: 주변 탐색 API (`/api/location/nearby/*`) ✅

- ✅ `GET /api/location/nearby/rooms?lat=&lng=&radius=` — 주변 채팅방 (Haversine + `usr_loc_hist` 채팅방 위치)
- ✅ `GET /api/location/nearby/shops?lat=&lng=&radius=` — 주변 MPS 매장 (`mps_shop.lat/lng` 활용)
- ✅ `GET /api/location/history` — 내 위치 이력 열람 (위치정보법 제16조 정보주체 열람권, 최근 50건)
- ✅ Rule LBS-01: 미동의 사용자 403 반환

### TASK-136: MPS 상품 목록 거리 표시 (Rule LBS-04) ✅

> **직거래 핵심**: MPS는 배송 없음 → 거리 = 구매 가능성 판단 기준

- ✅ `/api/store/items` 파라미터 확장: `?lat=&lng=&radius=&sort=distance`
- ✅ 상품 위치 소스: `mps_shop.lat/lng` — mps_shop JOIN + JS Haversine 계산 (초기 MVP)
- ✅ 동의 확인: sort=distance 요청 시 서버에서 `lbs_consent_yn='Y'` 재검증 (미동의 시 위치 파라미터 무시)
- ✅ 거리 기준 오름차순 정렬 + 반경(기본 10km) 필터
- ✅ `mps-item.ts` `ItemListFilter`에 `userLat/userLng/radiusKm` 추가
- ✅ `haversineKm()` 유틸 함수 추가 (6371km 지구 반지름)

### TASK-137: 클라이언트 동의 플로우 UI ✅

- ✅ `LbsConsentDialog` — @base-ui/react 기반 동의 다이얼로그 (약관 요약 + 목적 + 전문 링크)
- ✅ `store-item-list.tsx` 미동의 CTA 버튼 — `lbsConsent === 'N'`일 때 `📍 주변순` 클릭 시 다이얼로그 오픈
- ✅ 동의 완료 시 `setLbsConsent('Y')` 업데이트 → GPS 즉시 요청 → `sort='distance'` 자동 전환
- ✅ `lbs-settings.tsx` 마이페이지 위치 서비스 탭 — 동의 상태 카드 + 이력 열람 (LbsConsentDialog 통합)
- ✅ `profile-tabs.tsx` `📍 위치 서비스` 탭 추가

### TASK-138: MPS 상품 카드 거리 UI + 반경 필터 UI ✅

- ✅ `store-item-list.tsx` — LBS 동의 여부 조회 + GPS 위치 수집 + 거리순 정렬 버튼 (동의자만 노출, Rule LBS-01)
- ✅ 상품 카드 우하단 거리 배지 `📍 xxx m / x.x km` (동의자 + distance_km 있는 경우만, Rule LBS-04)
- ✅ `formatDistance(km)`: 1km 미만 → `"xxx m"`, 이상 → `"x.x km"`
- ✅ 거리순 활성화 표시 바 + "해제" 버튼 → sort='latest' 복귀
- ✅ 위치 없는 경우 "주변 10km 내 상품이 없습니다" 메시지

### TASK-139: `touchLastLogin()` 연동 + Pi Browser GPS 검증 ✅

- ✅ `pi-auth-provider.tsx` `signIn()` — 기존 세션 복원·신규 로그인 완료 시 `saveLoginLocation()` side-effect 호출
- ✅ `saveLoginLocation()` — GPS `getCurrentPosition()` → `POST /api/location/save` (`loc_tp_cd='02'`) fire-and-forget
- ✅ 미동의(403) 포함 모든 실패 무시 — 서비스 차단 없음 (Rule LBS-02 서버 재검증)
- 🔜 GPS 실패 시 서비스 차단 없음 → 위치 저장만 스킵, 나머지 기능 정상

> **P0 완료 = LBS MVP**: TASK-130 → 131 → 132 → 133 → 136 → 138 ✅ (동의 게이트 + MPS 거리 표시)
> **P1 완료 (주변 탐색)**: TASK-134 → 135 → 137 → 139 ✅ (Geocoding 프록시 + 주변 탐색 API + 동의 UI + 로그인 위치 저장)
> **P1 확장 완료**: reverse-geocode를 `/api/location/save`에 연결(좌표→행정구역 서버 자동 보강) + 주변 탐색 화면 `/nearby`(매장·채팅방 탭 + 반경 1/5/10km)
> **남은 작업**: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` + Maps JavaScript API(지도 UI)·Places API(매장 검색)는 향후 Phase

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
| M14: PiCafé DB + 테마 마스터 | Phase 7 | 2026-06-08 | msg_* 13개 테이블, 테마 20개, 플랜 5개, 스티커팩 60개 | ✅ 완료 |
| M15: PiCafé MVP | Phase 7 | 2026-06-08 | 그룹 카페 생성 4단계 마법사 (테마 선택 + Pi 결제), 카페 홈, 카페 페이지 | ✅ 완료 |
| M16: Pi 수익화 | Phase 8 | 2026-06-11 | Pi Tip, 스티커 마켓, 인라인 트리거 8종, AI 봇, 이벤트방 | ✅ 완료 |
| M17: 미디어 메시지 | Phase 8 | 2026-06-11 | 파일·이미지·음성 메시지 (Supabase Storage) | ✅ 완료 |
| M18: PiCafé 생태계 | Phase 9 | 2026-06-11 | 마켓플레이스, Pi Bet, Webhook, 분석 대시보드, 커스텀 스티커 (sql/022 + API 12종 + UI 4종) | ✅ 완료 |
| M19: 사용자 프로필 | Phase 10 | 2026-06-09 | 마이페이지 (개인정보·결제내역·구독현황), Pi Browser ClientGate | ✅ 완료 |
| M20: 어드민 통계 대시보드 | Phase 11 | 2026-06-09 | DAU/WAU/MAU·테마별 매출 (react-plotly.js + 중간집계 rollup) | ✅ 완료 |
| M21: PiTranslate™ MVP | Phase 12 | 2026-06-10 | sql/020 + chat-translate.ts + dedup + translate API + broadcast 확장 + 표시언어 설정 + 원문 토글 (TASK-090~097) | ✅ 완료 |
| M22: MyPiShop(MPS) Phase 1 MVP | Phase 13 | — | sql/029_mps.sql (mps_ 6개 테이블) + lib 헬퍼 3종 + 상품·주문·에스크로 API 12종 + 화면 6종 (TASK-100~107) | 🔜 준비중 |
| M23: PiVoice™ 1:1 음성 통화 | Phase 14 | — | sql/024 (msg_call_log·quality_stat) + TURN 발급 + 시그널링/통화 API + use-webrtc-call 훅 + 통화 UI (TASK-120~123) | 🔜 설계 완료 |
| M24: LBS P0+P1 MVP | Phase 15 | 2026-06-12 | sql/033_lbs.sql (sys_user_consent·usr_loc_hist·fn_haversine_km) + 동의 API(GET/POST/DELETE) + 위치저장 API + 주변탐색 API(rooms/shops/history) + MPS 거리 표시 + 동의 다이얼로그 CTA + 로그인 위치 저장 (TASK-130~133·135~139) | ✅ 완료 |

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
| v1.8 | 2026-06-07 | Phase 7~9 PiCafé 로드맵 추가: TASK-050~074 (카페 MVP·수익화·생태계). 마일스톤 M14~M18 추가. PRD.md v4.0 통합 반영. | anakin |
| v1.9 | 2026-06-08 | TASK-050·051 완료 — sql/012_msg_tables.sql (msg_* 13개 테이블, Realtime RLS), sql/013_msg_seed.sql (테마 20개, 구독플랜 5개, 스티커팩 60개). M14 달성. | anakin |
| v2.0 | 2026-06-08 | TASK-052 완료 — 1:1 카페 API (rooms·messages·join), supabase-client.ts, use-chat-room 훅(Realtime+presence), ChatMessageList(scroll-up 무한로드), ChatInput(rate limit 복원). tsc 통과. | anakin |
| v2.1 | 2026-06-08 | TASK-053 완료 — 그룹 카페 생성 4단계 마법사 (ThemeSelector·InlinePurchasePrompt·GroupRoomCreator), payments/complete CHAT_ROOM_CREATE 분기, /chat 홈·/chat/[roomId] 페이지, Header 카페 링크. M15 달성. | anakin |
| v2.2 | 2026-06-08 | PiRC2 Soroban 스마트 컨트랙트 통합 문서화 — CLAUDE.md PiRC2 섹션 추가 (Contract ID·메서드·구독 매트릭스), TASK-054 PiRC2 기반 상세 업데이트, PRD_CHAT.md 구독 API 현행화, pi_pay SKILL.md PiRC2 구독 결제 섹션 추가. | anakin |
| v2.3 | 2026-06-09 | TASK-054 완료 — 구독 시스템(앱 레벨 U2A). chat-auth.ts(PLAN_CAPS 권한 단일 소스), /api/subscriptions(plans·POST결제준비·DELETE취소·check), payments/complete CHAT_SUBSCR 분기(amount 서버 재검증 + msg_subscr UPSERT), subscription-gate.tsx. tsc·lint(0 errors) 통과. M16 구독 기반 완성. | anakin |
| v2.4 | 2026-06-09 | Phase 7 완료 현행화. Phase 10 사용자 프로필 관리(마이페이지) 신규 추가 — TASK-056~062 (sys_user 프로필 컬럼 마이그레이션·GET/PATCH /api/profile·결제내역 API·ProfileTabs·ClientProfileGate·번역+검증). M19 마일스톤 추가. PRD.md v5.0 통합(섹션 12 신설). | anakin |
| v2.5 | 2026-06-09 | Phase 10 완료 — TASK-056~062 전체 구현 완료. DB 마이그레이션(Supabase 적용)·users.ts 타입 확장+updateUserProfile()·GET/PATCH /api/profile·GET /api/profile/payments·page.tsx+5개 컴포넌트·ko.json 번역. pnpm build 성공, /[locale]/profile ∙ /api/profile ∙ /api/profile/payments 라우트 확인. M19 달성. | anakin |
| v2.6 | 2026-06-09 | Phase 11 어드민 통계 대시보드 계획 추가 — TASK-080~087 (`PRD_CHART.md` 수용). react-plotly.js 채택, 활동 로그 `sys_user_actvty_log`(하루 1행 UPSERT) + 계측, 중간집계 rollup `stat_actvty_dly`/`stat_revenue_dly` + `fn_build_daily_stats` 멱등 집계, 일배치/백필/당일보정 하이브리드, 테마별 매출 4경로 UNION. M20 마일스톤 추가. PRD.md v6.0 통합(섹션 13 신설). | anakin |
| v2.7 | 2026-06-09 | Phase 11 완료 현행화 — TASK-083/084/085/087 구현 완료 확인 후 🔜→✅ 업데이트. TASK-083: `POST /api/admin/stats/aggregate` CRON_SECRET+어드민 이중인증·백필 모드(`backfill:true`)·`vercel.json` Cron(`0 0 * * *`) 등록. TASK-084: `fn_top_active_users`/`fn_top_revenue_themes`/`fn_top_spenders` RPC 3종 Supabase 배포. TASK-085: `plotly-plot.tsx`(ssr:false)·`dau-wau-mau-chart`·`revenue-donut-chart`·`revenue-timeline-chart` 4종 구현. 실데이터 적재 확인: `stat_actvty_dly` 5일치(2026-06-05~09)·`stat_revenue_dly` 4일치(2026-06-06~09). M20 완료일 2026-06-09 반영. | anakin |
| v2.8 | 2026-06-10 | Phase 12 PiTranslate™ 글로벌 동시통역 로드맵 추가 — TASK-090~099 (`PRD_4_CHAT.md` v1.6 수용). Gemini 2.0 Flash 주력 + Claude Haiku fallback 하이브리드, `msg_trans` 번역 캐시, in-memory dedup(`chat-translate-dedup.ts`), broadcast 기반 실시간 전달. M21 마일스톤 추가. `PRD_4_CHAT.md` 버전 참조 v1.2→v1.6 업데이트. 기준일 2026-06-10 갱신. `PRD.md` v7.0 통합(섹션 14 신설·섹션 15~18 재번호화). | anakin |
| v3.0 | 2026-06-10 | Phase 12 추가 고도화 — 방별 번역 언어 콤보(`chat-locale-select.tsx`, 방 헤더 제목 옆, localStorage 방별 독립 저장) + `translate-batch` API(캐시 우선 일괄 번역) + `forceTranslate` 모드(전체 메시지 강제 번역·언어 변경 시 재번역) + 카페 레이아웃 고정(헤더·입력창 `shrink-0`, 본문만 `min-h-0` 스크롤) + 헤더 ChatRoomPanel 통합 + `locale-options.ts` 단일 소스. tsc·build 통과. | anakin |
| v2.9 | 2026-06-10 | Phase 12 PiTranslate™ MVP 구현 완료 — TASK-090~097. `sql/020_msg_trans.sql`(018·019 선점으로 번호 조정, Supabase 적용 완료), `chat-translate.ts`(Gemini 2.0 Flash REST + Claude Haiku fallback), `chat-translate-dedup.ts`(pending map + 번역 큐 + broadcast 내장), translate API 라우트, 메시지 POST `after()` 번역 큐 + GET locale pre-populate, `use-chat-room.ts` msg_trans 구독 + 수신 자동 번역 요청, 프로필 표시 언어 드롭다운(203 locale), `translated-message.tsx` 원문 토글. tsc·lint(0 errors)·build 통과. M21 달성. TASK-098(어드민 번역 통계)·099(품질 피드백)는 후속. | anakin |
| v4.0 | 2026-06-10 | Phase 13 MyPiShop(MPS) 로드맵 추가 — TASK-100~113 (`PRD_8_MPS.md` v1.1 수용). PiRC2 U2A 가상 에스크로·`stock_qty` 원자적 차감 불변 조건·`mps_` 6개 테이블(sql/021_mps.sql)·lib 헬퍼 3종·API 12종·화면 6종(SCR-01~06) Phase 1 MVP / TASK-108~111 Phase 2 확장 / TASK-112~113 Phase 3 PiRC3 마이그레이션. M22 마일스톤 추가. 현재 버전 헤더 갱신. | anakin |
| v5.2 | 2026-06-11 | Phase 14 PiVoice™ 음성통화 설계 추가 — `docs/PRD_9_VOICE_CHAT.md` v1.0 수용. WebRTC P2P 1:1 MVP, Supabase Realtime 시그널링 재사용(추가 인프라 0), 관리형 TURN으로 시작, 베타 무료. TASK-120~123(데이터모델·TURN발급·시그널링/통화API·WebRTC훅+UI) + S0~S3 Go/No-Go 로드맵. M23 마일스톤 추가. `voice-chat-architect` 에이전트 기준선 반영. | anakin |
| v5.1 | 2026-06-11 | Phase 9 PiCafé 생태계 완료 — TASK-070~074 전체 구현. `sql/022_chat_ecosystem.sql`(msg_theme_follow·msg_bet·msg_bet_optn·msg_bet_entry·msg_webhook + fn_chat_marketplace·fn_room_analytics·fn_room_mau RPC). 마켓플레이스(테마 필터+가중 랭킹+팔로우), Pi Bet(생성·U2A 참가·균등 분배 정산·BET_NOTI), Webhook·봇(API Key 인증·메시지 push·어드민 현황), 분석 대시보드(일별 통계+MAU+plotly), 커스텀 스티커(ownr_usr_id·mkt_yn·노출 규칙). **msg_msg CHECK AI_REPLY 누락 버그 수정**. M18 달성. tsc·lint(0 errors)·build 통과. | anakin |
| v5.0 | 2026-06-11 | Phase 8 수익화 전체 완료 현행화 — TASK-060~065 전체 🔜→✅. Pi Tip(`/api/tips` + `pi-tip-button.tsx`), 스티커 마켓(`sticker-picker.tsx` + `/api/stickers/packs`), 인라인 트리거 8종(Trigger 1~8 전체 구현 — 배지 시스템·이벤트방 알림 포함), 이벤트 카페(이벤트방 탭 다이얼로그 + `room_tp_cd='E'` API), AI 어시스턴트(`@ai` 멘션→Anthropic API→`AI_REPLY`), 파일·이미지·음성 메시지(Supabase Storage + IMAGE/VOICE/FILE 타입). Phase 11 후속 고도화 섹션 추가 — DAU/WAU/MAU 통계 버그 4건(activity-log lazy thenable·Vercel Cron GET·슬라이딩 윈도우·오늘 온디맨드), Top3 가중치 점수제(활동일수×0.2 + 콘텐츠×0.3 + 결제×0.5). M16·M17 ✅ 완료 처리. 기준일·버전 헤더 갱신. | anakin |
| v5.3 | 2026-06-11 | 마이그레이션 번호 충돌 정리 — TASK-100 MPS `sql/021_mps.sql`→`sql/029_mps.sql`(021은 msg_usr_badge 점유), TASK-120 PiVoice `sql/024_voice_call.sql`→`sql/026_voice_call.sql`(024는 sys_batch_log 점유). M22 마일스톤 파일명 동기화, `PRD_9_VOICE_CHAT.md` 파일명 참조 갱신, `PRD_8_MPS.md` 헤더 버전 v1.0→v1.1 불일치 해소. 어드민 배치 실행 이력(`sys_batch_log` + `/api/admin/batch/logs` + 이력 테이블 UI)·결제 내역 테마 컬럼(통계와 동일 분류 규칙) 추가 반영. | anakin |
| v5.5 | 2026-06-12 | Phase 15 LBS 위치기반서비스 로드맵 추가 — `docs/PRD_10_GPS.md` v1.2 수용. 동의 게이트 Rule LBS-01~04(UI·API·철회·MPS 거리), `sql/030_lbs.sql`(sys_user_consent·usr_loc_hist·sys_user 컬럼 3개), Google Maps API 서버 프록시, Haversine SQL 거리 계산, `/api/store/items` 거리 파라미터 확장(Rule LBS-04). TASK-130~139. M24 마일스톤 추가. 헤더 현재 버전 갱신. `PRD.md` v9.0 통합(섹션 16 신설). | anakin |
| v5.6 | 2026-06-12 | **Phase 15 LBS P0 MVP 구현** — TASK-130~133·136·138 완료. `sql/033_lbs.sql`(sys_user_consent·usr_loc_hist·fn_haversine_km·sys_user 컬럼 3개·DA-APPROVED), `src/env.ts`·`.env.example`(GOOGLE_MAPS_API_KEY·NEXT_PUBLIC_GOOGLE_MAPS_API_KEY), `/api/location/consent`(GET/POST/DELETE — 동의 등록·철회·즉시파기 Rule LBS-03), `/api/location/save`(동의 서버 재검증 Rule LBS-02), `mps-item.ts` haversineKm() + sort=distance 확장, `store-item-list.tsx` GPS 위치 수집 + 📍 거리 배지(Rule LBS-04). tsc(0 errors) 통과. | anakin |
| v5.7 | 2026-06-12 | **Phase 15 LBS P1 주변탐색 완료** — TASK-135·137·139 완료. `/api/location/nearby/rooms`(방 생성자 최근 위치 기반 Haversine)·`/api/location/nearby/shops`(mps_shop.lat/lng 활용)·`/api/location/history`(열람권 50건), `lbs-consent-dialog.tsx`(동의 다이얼로그·약관 요약+전문링크), `store-item-list.tsx` `LbsConsentDialog` 통합(미동의 CTA 버튼 → 동의 후 GPS 즉시 요청), `lbs-settings.tsx`+`profile-tabs.tsx`(마이페이지 위치 서비스 탭), `pi-auth-provider.tsx` `saveLoginLocation()` side-effect(로그인 완료 시 `loc_tp_cd='02'` fire-and-forget). M24 ✅ 달성. tsc(0 errors) 통과. | anakin |
| v5.8 | 2026-06-12 | **Phase 15 TASK-134 Google Maps 서버 프록시 완료** — `src/lib/google-maps.ts`(`geocodeAddress()`·`reverseGeocode()` — Geocoding API 단일 호출 양방향, `import 'server-only'` 키 보호, 한국 행정구역 type 우선순위 fallback 파서, fetch 캐시 1일), `POST /api/location/geocode`(주소→좌표)·`POST /api/location/reverse-geocode`(좌표→주소+시도/시군구/동) — 로그인 필수·동의 불필요·유료 API 남용 방지, status별 처리(OK/ZERO_RESULTS 404/REQUEST_DENIED 등 502). `GOOGLE_MAPS_API_KEY` `.env.local` 기존 배치 확인(AIzaSy 39자). tsc·lint(0 errors) 통과. M24 P1 전체(TASK-134~139) 완료. | anakin |
| v5.9 | 2026-06-12 | **Phase 15 LBS P1 확장 — 행정구역 자동 보강 + 주변 탐색 화면** — `reverseGeocode()`를 `/api/location/save`에 연결(클라이언트가 행정구역 미전송 시 서버가 좌표→시도/시군구/동 자동 채움, best-effort·실패 시 좌표만 저장). `reverseGeocode` 좌표 4자리 반올림으로 fetch 캐시 적중률↑(비용 절감). `nearby-explorer.tsx`(동의 게이트+GPS 수집+반경 1/5/10km+매장/채팅방 탭, 거리순) + `/[locale]/nearby/page.tsx`(클라이언트 게이트, redirect 금지) + 스토어 헤더 `📍 주변` 진입점. tsc(0 errors)·lint(신규 경고는 set-state-in-effect 보류 카테고리). | anakin |
| v5.4 | 2026-06-11 | **Phase 13 MyPiShop(MPS) Phase 1 MVP 1차 구현** — TASK-100~107 🔜→✅. `sql/029_mps.sql`(mps_ 6개 테이블 + fn_mps_order_create/fn_mps_order_cancel 원자적 재고 RPC, Supabase 적용), lib 3종(mps-item·mps-order·mps-shop), 상품 API(/api/store/items CRUD + 검색·필터·정렬), 주문 API(생성·취소·confirm·release + 당사자 403), 에스크로는 기존 `/api/payments/complete`에 `MPS_ESCROW` 분기 통합(PENDING→ESCROW + ESCROW_IN 이력 + 금액 서버 재검증), UI 6페이지(/store 목록·상세·my/items·new·sales·orders — usePiAuth 클라이언트 게이트, redirect 금지), store 번역 ko/en. tsc·lint(0 errors) 통과. **후속**: 이미지 업로드(Storage)·상품 수정 폼·SELLER_DONE 자동 DONE cron·실 Pi 정산(A2U)·Pi Browser 실기기 결제 검증. | anakin |
