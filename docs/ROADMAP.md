# 표준데이터 관리 프로그램 개발 로드맵

쇼핑몰 DB 물리설계 표준을 단일 UI에서 관리하고 RBAC로 접근을 제어하는 DA 내부 관리 도구

> **기준일**: 2026-06-03 (최종 업데이트: 2026-06-03)
> **현재 버전**: v5.0 — 보안 취약점 100% 해소 · 논리삭제 전환 · 표준용어 통일(dts→dtm) 완료
> **기술 스택**: Next.js 16.2.6 (App Router) · React 19.2 · TypeScript · Tailwind CSS v4 · SQLite(better-sqlite3) · Supabase PostgreSQL

---

## 개요

**표준데이터 관리 프로그램**은 DA(Data Architect) 담당자와 쇼핑몰 데이터 관리 팀을 위한 표준 거버넌스 도구로 다음 기능을 제공합니다:

- **표준 사전 관리**: 표준단어(STD_DIC) · 도메인(STD_DOM) · 용어(DA_TERM)를 단일 UI에서 조회·등록·수정
- **RBAC 권한 제어**: 5계층 역할(ADMIN > MASTER > MANAGER > SUBMANAGER > USER)별 편집 권한 제어
- **표준 오염 방지**: 중복 단어 실시간 체크 API로 일관된 물리명 규칙 유지
- **이중 DB 운용**: 로컬 SQLite(메타 편집) + Supabase PostgreSQL(인증·권한)으로 오프라인 편집 지원

---

## 개발 워크플로우

1. **작업 계획**
   - 기존 코드베이스를 학습하고 현재 상태를 파악
   - 새로운 작업을 포함하도록 `ROADMAP.md` 업데이트
   - 우선순위 작업은 마지막 완료된 작업 다음에 삽입

2. **작업 생성**
   - `/tasks` 디렉토리에 새 작업 파일 생성 (명명 형식: `XXX-description.md`)
   - 고수준 명세서, 관련 파일, 수락 기준, 구현 단계 포함
   - **API/비즈니스 로직 작업 시 "## 테스트 계획" 섹션 필수 포함** (Playwright MCP 테스트 시나리오 작성)
   - 직전 완료 작업을 예시로 참조, 초기 상태 샘플은 `000-sample.md` 참조

3. **작업 구현** (구현-테스트 사이클 필수)
   - **구현 → 테스트 설계 → 테스트 실행 → 검증** 사이클 준수
   - Playwright MCP 테스트 시나리오 작성 (정상/에러/엣지 케이스)
   - 모든 테스트 통과 확인 후 다음 단계 진행 (테스트 없이 진행 불가)
   - 각 구현-테스트 사이클 완료 후 중단하고 추가 지시 대기

4. **로드맵 업데이트**
   - 로드맵에서 완료된 작업을 ✅로 표시

---

## 개발 단계

### Phase 0: 프로젝트 부트스트랩 ✅ (완료: 2026-04, M0)

- **TASK-001: Next.js 16 + SQLite 환경 셋업** ✅ - 완료
  - ✅ Next.js 16.2.6 App Router 프로젝트 초기화 (Turbopack 기본)
  - ✅ Tailwind CSS v4 + shadcn/ui(radix-ui) 디자인 시스템 구성
  - ✅ better-sqlite3 메타DB 연결 및 WAL 모드 설정
  - ✅ Supabase PostgreSQL 클라이언트 연동 (인증·권한 테이블)
  - ✅ TypeScript strict mode 및 경로 별칭(`@/*`) 설정

---

### Phase 1-Legacy: 표준 CRUD 구현 ✅ (완료: 2026-05, M1)

- **TASK-002: 애플리케이션 골격 및 탭 라우팅** ✅ - 완료
  - ✅ `StandardsPage` 탭 UI 골격 구현 (`'use client'` + `useState`)
  - ✅ 표준단어/도메인/용어/권한 4탭 구조 구성
  - ✅ 공통 레이아웃 및 네비게이션

- **TASK-003: 표준단어 관리 (WordTab)** ✅ - 완료
  - ✅ STD_DIC CRUD — 영문약어·논리명·물리명·도메인 연결
  - ✅ 논리명/물리명 검색
  - ✅ 엔터티 분류(`ENT_CLSS_YN`) / 속성 분류(`ATTR_CLSS_YN`) 구분 설정
  - ✅ 관련: `components/standards/WordTab.tsx`, `app/api/std-dic/route.ts`

- **TASK-004: 표준도메인 관리 (DomainTab)** ✅ - 완료
  - ✅ STD_DOM CRUD — 도메인 유형·데이터타입(VARCHAR/NUMBER/DATE)·길이·소수점
  - ✅ 도메인명 기준 검색
  - ✅ 단어 등록 화면에서 도메인 연결 선택
  - ✅ 관련: `components/standards/DomainTab.tsx`, `app/api/std-dom/route.ts`

- **TASK-005: 표준용어 관리 (TermTab)** ✅ - 완료
  - ✅ DA_TERM CRUD — 단어 조합으로 용어 자동 생성
  - ✅ 논리명/물리명 검색
  - ✅ 복수 단어 순서 지정 조합 등록(`STORED_TERM_COMP_IDS`)
  - ✅ 물리명 풀네임(`DIC_PHY_FLL_NM`) 자동 생성
  - ✅ 관련: `components/standards/TermTab.tsx`

- **TASK-006: 중복 체크 API 및 이중 DB 연동** ✅ - 완료
  - ✅ 단어/도메인 등록 전 중복 여부 실시간 검증 (`/api/check-dup`)
  - ✅ SQLite(로컬 메타) + Supabase PostgreSQL(클라우드) 이중 운용

---

### Phase 2-Legacy: RBAC 시스템 ✅ (완료: 2026-05, M2)

- **TASK-007: RBAC 권한 관리 (AuthTab)** ✅ - 완료
  - ✅ 역할 5계층 정의 — ADMIN > MASTER > MANAGER > SUBMANAGER > USER
  - ✅ 역할-권한 매트릭스 시각화 (행=역할, 열=기능)
  - ✅ 사용자 역할 부여/변경
  - ✅ 그룹 생성·구성원 등록, SubManager 권한 위임
  - ✅ 관련: `components/auth/AuthTab.tsx`, `components/auth/RoleMatrix.tsx`

---

### Phase 3-Legacy: 보안 1차 강화 ✅ (완료: 2026-05, M3)

- **TASK-008: 보안 취약점 1차 수정** ✅ - 완료
  - ✅ SQL Injection 방어 — 허용목록(allowlist) 기반 필드 검증
  - ✅ API 인증·인가 취약점 수정 (CRITICAL x4, HIGH x1)
  - ✅ 인증 없는 API 접근 차단 (부분)
  - ✅ OWASP Top 10 주요 취약점 1차 검토 완료
  - ⚠️ **보안 2차 점검**: `docs/PRD_SECURITY.md` 25개 추가 항목 도출 (M-S1~S3 조치 예정)

---

## 🚀 v2 개발 계획

### Phase 0 (v2): 인증 시스템 구축 ✅ (완료: 2026-05-31, M4)

> **목표**: Supabase Auth 기반 회원가입·로그인·구글 소셜 로그인·관리자 Back Office 구축

- **TASK-017: 회원가입 (이메일/비밀번호)** ✅ - 완료
  - ✅ Supabase Auth `signUp()` 연동 회원가입 폼
  - ✅ 이메일 인증 메일 발송 및 확인 처리
  - ✅ 가입 완료 후 RBAC 기본 역할(USER) 자동 부여 (`user_info` 테이블)
  - ✅ 유효성 검증: 이메일 형식, 비밀번호 8자 이상
  - ✅ 관련: `app/(auth)/signup/page.tsx`, `components/auth/SignupForm.tsx`

- **TASK-018: 로그인 처리 (이메일/비밀번호)** ✅ - 완료
  - ✅ Supabase Auth `signInWithPassword()` 연동 로그인 폼
  - ✅ `@supabase/ssr` 기반 쿠키 세션 관리 (`proxy.ts` 세션 갱신)
  - ✅ 보호된 라우트 설정: 미인증 접근 시 `/login` 리다이렉트
  - ✅ 로그아웃 처리: `supabase.auth.signOut()`
  - ✅ 관련: `app/(auth)/login/page.tsx`, `components/auth/LoginForm.tsx`, `proxy.ts`

- **TASK-019: 구글 소셜 로그인 (Google OAuth)** ✅ - 코드 완료 (수동 설정 필요)
  - ✅ `signInWithOAuth({ provider: 'google' })` 연동 UI 구현
  - ✅ OAuth 콜백 라우트: `app/auth/callback/route.ts`
  - ✅ 최초 로그인 시 USER 역할 자동 부여
  - ⚙️ **수동 설정 필요**: Google Cloud Console OAuth 2.0 클라이언트 등록 + Supabase Provider 활성화

- **TASK-020: 관리자 Back Office 구축** ✅ - 완료
  - ✅ 관리자 전용 레이아웃 (`app/admin/(protected)/layout.tsx`)
  - ✅ Supabase `profiles.main_role` 기반 역할 접근 제어 (admin/master만 진입)
  - ✅ 관리자 대시보드: SQLite·Supabase 통계 카드
  - ✅ 표준관리시스템 관리자 화면 포함 (`/admin/standards`)
  - ✅ 사용자 역할 관리 — profiles 기반 5역할 그루핑 + 역할 변경
  - ✅ 그룹 관리 — 5개 시스템 그룹 코드화(G_SUPER~G_USER) + profiles 연동
  - ✅ 관련: `app/admin/`, `components/auth/UserRoleTab.tsx`, `components/auth/GroupTab.tsx`

---

### Phase 1 (v2): 핵심 기능 고도화 🔄 (진행 중, M5)

> **예상 기간**: 2026-06 ~ 2026-07
> **목표**: Audit Trail · DDL Export · 검색 고도화 · MVP 잔여 항목 완성

- **TASK-009: Audit Trail (변경 이력 추적)** ✅ - 완료 (2026-06-01)
  - ✅ `STD_AUDIT_LOG` 테이블 자동 생성 (`lib/audit.ts`)
  - ✅ `writeAudit()` — STD_DIC/STD_DOM 전 CRUD에 훅 삽입
  - ✅ `getChangedBy()` async 개선 — Bearer 토큰에서 실제 이메일 추출
  - ✅ 변경 이력 조회 API (`GET /api/audit`) — `requireAuth(['ADMIN','MASTER','MANAGER'])`
  - ✅ `AuditPanel.tsx` — 개별 항목 변경 이력 diff 뷰 (Bearer 토큰 포함 fetch)
  - ✅ `AuditLogViewer.tsx` — 관리자 전체 이력 뷰 (엔터티·행위 필터, 200건)
  - ✅ 관리자 라우트: `/admin/audit` + 네비게이션·대시보드 등록

- **TASK-010: DDL Export (DDL 스크립트 다운로드)** ✅ - 완료
  - ✅ 표준용어 선택 후 PostgreSQL/MySQL DDL 스크립트 생성
  - ✅ 용어 → 컬럼 매핑 로직 (`lib/ddl-generator.ts`)
  - ✅ DDL 생성 API (`POST /api/ddl/export`) — DBMS 방언 분기
  - ✅ DDL 미리보기 모달 + 클립보드 복사 + 파일 다운로드
  - ✅ 도메인 미연결 용어 422 검증
  - ✅ 관련: `components/standards/DdlExportDialog.tsx`, `app/api/ddl/export/route.ts`

- **TASK-011: 표준 검색 고도화** ✅ - 완료
  - ✅ 초성 검색 (한글 자모 분해, `lib/korean-utils.ts`)
  - ✅ 영문 약어 역방향 검색 (약어 → 논리명 매칭)
  - ✅ 통합 검색 API (`GET /api/search?q=&mode=`)
  - ✅ 글로벌 검색 UI — 헤더 드롭다운, 300ms 디바운싱, 탭 이동 연동
  - ✅ 관련: `components/standards/GlobalSearch.tsx`

- **TASK-012: MVP 잔여 항목 완성** ✅ - 완료
  - ✅ 단어 삭제 시 참조 용어 목록 경고 (409 차단)
  - ✅ 도메인별 표준단어 연결 현황 집계 (`GET /api/stats/domain-words`)
  - ✅ 용어 역추적 API — 단어 → 사용 용어 목록 (`GET /api/stats/word-terms/[id]`)

---

### Phase 2 (v2): 동기화·워크플로우·UX ✅ (완료: 2026-05-31, M6)

- **TASK-013: Supabase 동기화 배치** ✅ - 완료
  - ✅ SQLite STD_DIC / STD_DOM → Supabase `std_dic_sync` / `std_dom_sync` upsert
  - ✅ 50건 청크 단위 배치 처리 + 재시도 없이 오류 카운팅
  - ✅ 동기화 API: `POST /api/sync`, `GET /api/sync` (이력 조회)
  - ✅ `sync_log` 테이블로 동기화 이력 자동 기록
  - ✅ 관리자 동기화 페이지: `/admin/sync` (실행 버튼 + 이력 테이블)
  - ✅ 관련: `lib/sync.ts`, `app/api/sync/route.ts`, `app/admin/(protected)/sync/page.tsx`

- **TASK-014: 승인 워크플로우** ✅ - 완료
  - ✅ Supabase `approval_queue` 테이블 (PENDING→APPROVED/REJECTED 상태 모델)
  - ✅ 승인 요청 API: `POST /api/approval`
  - ✅ 승인/반려 API: `PUT /api/approval/[id]` (action: APPROVE/REJECT + 사유)
  - ✅ 관리자 승인 페이지: `/admin/approval` (상태 필터 + 결재 UI)
  - ✅ 관련: `app/api/approval/route.ts`, `app/api/approval/[id]/route.ts`, `app/admin/(protected)/approval/page.tsx`

- **TASK-015: 반응형 UI 최적화** ✅ - 완료
  - ✅ WordTab / DomainTab / TermTab 테이블: `overflow-x-auto` + `min-w-[680px]`
  - ✅ StandardsPage 탭 버튼: `px-3 sm:px-6`, `text-xs sm:text-sm`
  - ✅ 헤더 DB정보 텍스트: `hidden lg:block`
  - ✅ AuthTab 서브탭: `px-2 sm:px-4`, `text-[11px] sm:text-xs`

- **TASK-016: v2 통합 테스트** ✅ - 완료 (구조 완성)
  - ✅ `playwright.config.ts` — baseURL, 타임아웃, 스크린샷 설정
  - ✅ `tests/e2e/auth.spec.ts` — 인증 흐름 E2E (로그인/회원가입/리다이렉트)
  - ✅ `tests/e2e/standards.spec.ts` — 표준 CRUD E2E
  - ✅ `tests/e2e/admin.spec.ts` — 관리자 역할 접근 제어
  - ✅ `tests/e2e/search.spec.ts` — 초성/약어 검색

---

---

## 🚀 v3 개발 계획

### Phase 1 (v3): 기반 강화 ✅ (완료: 2026-06-01, M7)

> **목표**: 공통코드 관리 · Audit Trail · 개인 프로필 구현

- **TASK-021: 공통코드 관리 (DA §40 표준코드)** ✅ - 완료
  - ✅ SQLite `STD_CODE_GRP` / `STD_CODE` 테이블 생성 (DA 물리DB 표준: 시스템컬럼 4종 포함)
  - ✅ 서버 기동 시 자동 마이그레이션 + 초기 시드 데이터 7개 그룹 26개 코드값 (`lib/db.ts`)
  - ✅ 코드 그룹 CRUD API (`GET/POST/PUT /api/codes`)
  - ✅ 코드값 CRUD API + 논리 삭제 (`GET/POST/PUT/DELETE /api/codes/[grpId]`)
  - ✅ 공통코드 관리 UI (`components/admin/CodesPage.tsx`) — 좌측 그룹 목록 + 우측 코드값 테이블
  - ✅ 관리자 라우트: `/admin/codes`
  - ✅ 관리자 네비게이션 + 대시보드 빠른 이동 등록
  - 초기 코드 그룹: `ROLE_CD`, `DATA_TYPE_CD`, `DOM_TYPE_CD`, `DIC_GBN_CD`, `APV_STATUS_CD`, `AUDIT_ACT_CD`, `GRP_CD`

- **TASK-022: 개인 프로필 / 설정** ✅ - 완료 (2026-06-01)
  - ✅ 프로필 조회/수정 API (`GET/PATCH /api/profile`) — Bearer 토큰 기반 인증
  - ✅ 개인 프로필 페이지 (`/profile`) — 이름·사용자명·연락처·자기소개 수정
  - ✅ 비밀번호 변경 (`supabase.auth.updateUser`) — 클라이언트 사이드 처리
  - ✅ 역할 정보 읽기 전용 표시 (관리자만 변경 가능)
  - ✅ 헤더 개선: 이메일 → 이름+역할 표시 + 프로필 아바타 링크

- **TASK-023: Audit Trail 구현** ✅ - 완료 (TASK-009와 통합 완료)

---

### Phase 2 (v3): 통합게시판 ✅ (완료: 2026-06-01, M8)

> **목표**: 팀 내 커뮤니케이션·자료공유용 통합게시판 (공지/자료실/자유/Q&A)
> **DA 표준**: brd_ctgr·brd_post·brd_cmnt·brd_attch 4테이블 (시스템컬럼·여부컬럼·소문자 준수)

- **TASK-024: DB 스키마 + 기반 구조 + 빈 페이지 스캐폴딩** ✅ - 완료 (2026-06-01)
  - ✅ STD_DOM 5종 + STD_DIC 17종 메타DB 등록 (DA 워크플로우 5단계 완료)
  - ✅ Supabase 4테이블 마이그레이션 + mod_dtm 트리거 + increment_vw_cnt RPC
  - ✅ 카테고리 시드 (NOTICE·ARCHIVE·FREE·QNA)
  - ✅ `lib/auth-guard.ts` — AuthResult에 user_id 추가
  - ✅ `lib/board.ts` 신규 — CATEGORY_NAME·BOARD_WRITE_ROLES·canWrite·isOwnerOrAdmin
  - ✅ `app/board/` 12개 파일 스캐폴딩 (layout·redirect·not-found·[category]·[id]·edit·new)
  - ✅ DA QA 감리 통과 (시스템컬럼·여부컬럼·소문자·트리거·RLS 전원 확인)
  - See: `/tasks/024-board-scaffold.md`

- **TASK-025: 게시판 전체 UI (더미 데이터)** ✅ - 완료 (2026-06-01)
  - ✅ `BoardList.tsx` — 목록 테이블, 📌 고정글, 답변상태 뱃지, 댓글수
  - ✅ `Pagination.tsx` — 페이지 이동 버튼
  - ✅ `PostDetail.tsx` — 본문(`pre whitespace-pre-wrap`), 첨부다운로드, 수정/삭제
  - ✅ `PostForm.tsx` — 등록/수정 모드 분기, 글자수, AttachmentUploader 포함
  - ✅ `CommentSection.tsx` — 댓글목록·작성폼·QNA 채택버튼
  - ✅ `AttachmentUploader.tsx` — 드래그앤드롭, 20MB/5개 제한
  - ✅ page.tsx 4종에 컴포넌트 연결 완료
  - See: `/tasks/025-board-ui.md`

- **TASK-026: 게시글 CRUD API** ✅ - 완료 (2026-06-01)
  - ✅ `GET /api/board/categories` — 카테고리 4건
  - ✅ `GET /api/board/[category]/posts` — 페이지네이션(`.range()`+`count:'exact'`), 검색
  - ✅ `POST /api/board/[category]/posts` — canWrite() 권한 검증, 403 차단
  - ✅ `GET /api/board/[category]/posts/[id]` — 조회수 RPC + is_owner 반환
  - ✅ `PUT /api/board/[category]/posts/[id]` — isOwnerOrAdmin() 소유권 검증
  - ✅ `DELETE /api/board/[category]/posts/[id]` — Storage 명시 삭제 + CASCADE
  - ✅ PostgREST Filter Injection 보안 패치 (`sanitizeSearch()`)
  - See: `/tasks/026-posts-api.md`

- **TASK-027: 댓글 + QNA 채택 API** ✅ - 완료 (2026-06-01)
  - ✅ `GET/POST /api/board/[category]/posts/[id]/comments` — cmnt_yn='Y' 게시판만 허용
  - ✅ `DELETE /api/board/[category]/posts/[id]/comments/[cmntId]` — 소유권 검증
  - ✅ `POST /api/board/[category]/posts/[id]/accept` — 순차 2쿼리 (CTE 가시성 이슈 해결)
  - ✅ 채택 권한: 글 작성자만 가능 (관리자 포함 불가 — 질문자 의도 존중)
  - See: `/tasks/027-comments-api.md`

- **TASK-028: 첨부파일 API** ✅ - 완료 (2026-06-01)
  - ✅ `GET /api/board/[category]/posts/[id]/attachments`
  - ✅ `POST /api/board/[category]/posts/[id]/attachments` — multipart FormData, 20MB/5개 서버 검증
  - ✅ `DELETE /api/board/[category]/posts/[id]/attachments/[attId]` — Storage 먼저 삭제 후 DB
  - ✅ `board-attachments` Storage 버킷 생성 (public, 20MB, 14개 MIME)
  - ✅ DB 실패 시 Storage 자동 롤백
  - See: `/tasks/028-attachments-api.md`

- **TASK-029: UI-API 연동** ✅ - 완료 (2026-06-01)
  - ✅ `BoardList` — Bearer fetch + 검색(sanitizeSearch) + 페이지네이션 + 스켈레톤 로딩
  - ✅ `PostDetail` — API `is_owner` 반환값으로 수정/삭제 버튼 제어
  - ✅ `PostForm` — POST·PUT + 첨부파일 순차 multipart 업로드, 수정 모드 초기값 API 로드
  - ✅ `CommentSection` — GET·POST·DELETE comments + POST accept 연동
  - ✅ 인증 우선순위 버그 수정: Bearer 토큰 > admin 쿠키 순서 변경 (`lib/auth-guard.ts`)
  - See: `/tasks/029-ui-api-connect.md`

- **TASK-030: 관리자 게시판 + 진입점** ✅ - 완료 (2026-06-01)
  - ✅ `components/admin/BoardAdmin.tsx` — 좌측 카테고리 + 우측 게시글 목록
  - ✅ 관리자 강제 삭제 + 📌 핀 토글 (선택적 필드 업데이트 — 본문 보존)
  - ✅ `app/admin/(protected)/board/page.tsx` + NAV_LINKS 추가
  - ✅ `StandardsPage` 헤더 게시판 링크 추가
  - ✅ PUT API 선택적 업데이트 (`'key' in body` 패턴)
  - See: `/tasks/030-board-admin.md`

- **TASK-031: 통합 테스트 (E2E)** ✅ - 완료 (2026-06-01)
  - ✅ `tests/e2e/board-flow.spec.ts` — 15건 (4 passed · 11 skipped/환경변수 대기)
  - ✅ Layer 1: 미인증 API 4건 즉시 실행 (401·307 확인)
  - ✅ Layer 2: MASTER CRUD·USER 권한 차단·Q&A 채택·관리자 강제 삭제 (환경변수 설정 시 활성화)
  - ✅ `playwright.config.ts` — port 3001 + `reuseExistingServer: true`
  - See: `/tasks/031-integration-test.md`

---

### Phase 3 (v3): 게시판 UX 전면 개선 ✅ (완료: 2026-06-02, M8.5)

> **목표**: 통합게시판 라우팅 재구성 · UX 개선 · 권한 제어 강화

- **게시판 라우팅 재구성** ✅ - 완료
  - ✅ `app/board/` → `app/(board)/` Route Group 이동 (URL: `/board/notice` → `/notice`)
  - ✅ 표준데이터 관리 프로그램 → `/admin` Back Office 전용 전환
  - ✅ 루트 `/` → `/notice` redirect (`app/page.tsx`)
  - ✅ 기존 `/notice`, `/login`, `/admin` URL 무중단 유지

- **헤더 & 사용자 UX** ✅ - 완료
  - ✅ 게시판 타이틀 "통합게시판" → "대시보드"
  - ✅ 모든 화면 우측 상단: 👤 사용자명(프로필 링크) + 로그아웃 버튼
  - ✅ Board 헤더: 관리자 링크 권한 제어 (admin/master만 표시)
  - ✅ Admin 헤더: 사용자명 + `/profile` 링크 + 로그아웃 동적 적용
  - ✅ 로그아웃: `window.location.href` full reload (세션 쿠키 즉시 반영)

- **반응형 페이지네이션** ✅ - 완료
  - ✅ API `pageSize` query param 지원 (5~50 동적)
  - ✅ `ResizeObserver` — 테이블 실제 높이 측정으로 정확한 pageSize 계산
  - ✅ Pagination `…` 축약 처리 (페이지 수 많을 때)
  - ✅ 페이지네이션 항상 최하단 고정 (flex shrink-0)
  - ✅ 컬럼 비율 `table-fixed` 60:20:20 적용, 헤더 `whitespace-nowrap`
  - ✅ 글쓰기·수정 페이지 `overflow-y-auto` 스크롤 허용

- **첨부파일 개선** ✅ - 완료
  - ✅ 업로드 `fetch()` 응답 체크 — 실패 시 `alert()` 알림 (기존 오류 무시 버그 수정)
  - ✅ 파일 크기 초과 시 인라인 에러 표시 + 등록 버튼 비활성화
  - ✅ Supabase Storage `board-attachments` MIME 타입 확장 (`application/sql` 등)

- **게시판 권한 제어** ✅ - 완료
  - ✅ `canWrite` 동적 판단 — `profiles.main_role` → 카테고리별 권한 매핑
  - ✅ NOTICE: MASTER·ADMIN만 글쓰기 버튼 표시 / FREE·QNA: USER 이상 전원
  - ✅ 수정·삭제: `post.is_owner` 기반 (본인 글만 표시) — 기존 유지

---

## 🚀 v4 개발 계획

### Phase 1 (v4): i18n 기반 구축 ✅ (완료: 2026-06-02, M9)

> **목표**: next-intl 설치 · 라우팅 재구성 · proxy.ts 인증+i18n 체이닝  
> **PRD**: `docs/PRD_MUL_LAN.md`  
> **지원 언어**: 11개 `ko · en · zh · ja · hi · vi · id · ms · en-ZA · fil · th`  
> **기본 locale**: `ko` (기존 URL `/notice`, `/admin` 무중단 유지)

- **TASK-032: 스킬 파일 생성** ✅ - 완료 (2026-06-02)
  - ✅ `.claude/skills/multi-lang/SKILL.md` — Claude 다국어 처리 가이드
  - ✅ `lang_cd/lang_map.json` — 11개국 country_cd↔locale 매핑
  - ✅ `lang_cd/supported_locales.json` — 지원 locale SSoT (런타임용)
  - 참조: `lang_cd/references/currency_countries.csv` (187개국 원본)

- **TASK-033: next-intl 설치 & 설정 파일** ✅ - 완료 (2026-06-02)
  - ✅ `npm install next-intl@^4.13.0` 설치
  - ✅ `lib/i18n/locales.ts` — LOCALES 상수, Locale 타입, DEFAULT_LOCALE
  - ✅ `i18n/routing.ts` — `defineRouting(11 locales, ko, as-needed prefix)`
  - ✅ `i18n/request.ts` — `getRequestConfig` (파일 기반, TASK-036 이후 DB 전환)
  - ✅ `i18n/navigation.ts` — `createNavigation` (locale-aware Link·useRouter·redirect)
  - ✅ `next.config.ts` — `createNextIntlPlugin('./i18n/request.ts')` 적용
  - ✅ `global.d.ts` — `AppConfig` 타입 등록 (번역 키 누락 컴파일 에러 유도)
  - ✅ `messages/ko.json` — 7개 섹션 초기 번역 키 (~45건)
  - ✅ `messages/{en,zh,ja,hi,vi,id,ms,en-ZA,fil,th}.json` — 10개 파일 생성 (ko 값 초기화)
  - ✅ `npm run build` 통과 — 오류·경고 없음

- **TASK-034: 디렉터리 이동 & 레이아웃 동적화** ✅ - 완료 (2026-06-02)
  - ✅ `app/*` → `app/[locale]/*` 이동 29개 파일 (git rename, 히스토리 보존)
  - ✅ `app/[locale]/layout.tsx` 신규 — `generateStaticParams()` 11개, `hasLocale()` 검증
  - ✅ `app/[locale]/LocaleHtmlUpdater.tsx` — useEffect로 html.lang + fontClass 동적 갱신
  - ✅ `lib/fonts.ts` 신규 — 9개 Noto 서브셋, `getActiveFontClass(locale)`
    - ko→Noto_Sans_KR / zh→SC / ja→JP / th→Thai / hi→Devanagari / 나머지→latin
  - ✅ `globals.css` — `.font-kr` 등 font utility 6종 추가
  - ✅ 루트 `app/layout.tsx` → `suppressHydrationWarning` html/body 포함 (Next 16 요구)
  - 🔧 **버그 수정**: Next.js 16 root layout `<html>/<body>` 필수 오류 (`return children` 패턴 불가)

- **TASK-035: proxy.ts 인증 + i18n 미들웨어 체이닝** ✅ - 완료 (2026-06-02)
  - ✅ `createMiddleware(routing)` 선언, `export async function proxy` named export 유지
  - ✅ `extractLocale()` 헬퍼 — `{cleanPath, localePrefix}` 분리, 9케이스 단위 검증
  - ✅ Supabase `setAll`에서 response 재생성 제거 → intl locale 쿠키 유실 방지
  - ✅ 인증 리다이렉트 localePrefix 보존 (`/en/admin` 미인증 → `/en/login`)
  - ✅ matcher: `api·_next·favicon` 포함 정규식 통합
  - 🔧 **버그 수정 3건**:
    - `/admin/login` PUBLIC_PATHS 추가 → 로그아웃 무한 리다이렉트 해소
    - `/api/admin/logout` redirect → JSON 반환 (fetch redirect 부작용 제거)
    - `app/page.tsx` 추가 → 루트 `/` 404 해소 (`as-needed` localePrefix 대응)
    - `LoginForm` `router.refresh()+push()` → `window.location.href` 전환 (무한 렌더링 해소)

---

### Phase 2 (v4): 국가 DB + 번역 관리 ⏳ (구현 대기, M10)

> **목표**: 187개국 데이터 DB화 · 국가 선택 콤보박스 · 번역 관리 화면  
> **DA 표준**: `i18n_*` 4개 테이블 모두 v2 시스템 컬럼 (`regr_id→reg_dtm→modr_id→mod_dtm`)

- **TASK-036: Supabase i18n DB 마이그레이션** ✅ - 완료 (2026-06-02)
  - ✅ **DA 표준 v2** 시스템 컬럼 `regr_id→reg_dtm→modr_id→mod_dtm` 4개 테이블 전부 적용
  - ✅ `create_i18n_tables` — 4개 테이블 + 트리거 6개 + 인덱스 4개 (단일 마이그레이션)
    - `i18n_lang_mst`: PK(lang_cd), CHECK(use_yn·dir_cd)
    - `i18n_ns_mst`: PK(ns_cd)
    - `i18n_msg`: PK(uuid), UNIQUE(ns_cd,msg_key,lang_cd), FK×2
    - `i18n_cntry_mst`: PK(country_cd), FK(locale_cd→i18n_lang_mst ON DELETE SET NULL)
  - ✅ `seed_i18n_lang_mst` — 11개 언어 (ko·en·zh·ja·hi·vi·id·ms·en-ZA·fil·th)
  - ✅ `seed_i18n_ns_mst` — 7개 네임스페이스 (common·auth·board·admin·profile·validation·languageSwitcher)
  - ✅ `seed_i18n_cntry_mst` — CSV 187개국 (Node.js 전처리: Regional Indicator 이모지 제거, locale_cd 매핑)
  - ✅ `seed_i18n_msg_ko` — `messages/ko.json` → DB 75건 로드 (점 표기 평탄화)
  - ✅ `rls_i18n_tables` — RLS 활성화: SELECT(authenticated), ALL(service_role)
  - ✅ DA 감리: 4개 테이블 시스템 컬럼 순서·NOT NULL·DEFAULT 전수 확인

- **TASK-037: 번역 파일 & 한글 키 치환** ✅ - 완료 (2026-06-02)
  - ✅ `next/link` → `@/i18n/navigation` Link 치환 (8개 파일)
  - ✅ `lib/board.ts` `CATEGORY_NAME` 제거 → `t('board.categories.*')` 전환
  - ✅ 서버 컴포넌트 `getTranslations` + `setRequestLocale`, 클라이언트 `useTranslations`
  - ✅ `VALID_CATEGORIES` `as const` → `string[]` (API 타입 호환)

- **TASK-038: 국가 선택 콤보박스** ✅ - 완료 (2026-06-02)
  - ✅ `components/i18n/CountrySelector.tsx` — Board·Admin 헤더 공통
  - ✅ `GET /api/i18n/countries` — 187개국 조회, `is_active` 필드, 5분 캐싱
  - ✅ 우선 11개국 + 구분선 + 나머지 176개국, 실시간 검색
  - ✅ 비활성 국가 회색 처리 (grayscale + 미지원 뱃지)
  - 🔧 **국기 SVG화**: `flag-icons` 도입 (Windows 이모지 미표시 문제 해결)
    - `components/i18n/CountryFlag.tsx` — SVG 국기 컴포넌트 (size·grayscale)

- **TASK-039: 다국어 관리 화면** ✅ - 완료 (2026-06-02)
  - ✅ Admin `🌐 다국어관리` 메뉴 + 라우트 4개 (대시보드·언어·매트릭스·동기화)
  - ✅ API: `stats`·`langs`·`langs/[cd]`·`messages`·`messages/[id]`·`sync`·`translate`
  - ✅ 번역 매트릭스 인라인 편집 + 미번역 ❌ 하이라이트
  - ✅ `revalidateTag('i18n','max')` 캐시 무효화
  - 🔒 **보안**: sync route Path Traversal 수정 (BCP-47 정규식 + 경로 경계 검사)

- **TASK-040: AI 자동 번역 시스템** ✅ - 완료 (2026-06-02)
  - ✅ `POST /api/i18n/translate` — 🔄 버튼 1클릭 = AI번역 + DB저장 + JSON동기화
  - ✅ 번역 엔진: Google Translate (`@vitalets/google-translate-api`, 무료·키 불필요)
    - Anthropic Claude → 크레딧 부족으로 교체
  - ✅ `{placeholder}` 토큰 보존 (PLHDR 치환 후 복원)
  - ✅ 429 Too Many Requests 대응: 지수 백오프(2→4→8→16초) + 섹션 간 쿨다운
  - ✅ **미번역 키만 선택적 번역** (이미 완료 키 Set 제외 → 76% 시간 절감)
  - ✅ en fallback deep merge (`i18n/request.ts`) — 미번역 시 영어 표시

- **TASK-041: 언어 관리 화면 확장** ✅ - 완료 (2026-06-02)
  - ✅ `i18n_cntry_mst` 187개국 전체 표시 (전체/활성/추가가능 탭 필터)
  - ✅ `COUNTRY_TO_LANG` 매핑 — locale_cd NULL 국가도 언어 추론 (es·ar·fr·de 등)
  - ✅ 미등록 언어 "+ 언어 추가" → `i18n_lang_mst` insert + 즉시 활성화
  - ✅ 등록 언어 use_yn 토글 (활성/비활성)

### 번역 진행 현황 (2026-06-02 기준)
| 완료율 | 언어 |
|---|---|
| ✅ 100% | ko · en · zh · ja |
| 🔶 77% | hi · vi · id · en-ZA · fil · th (admin.dashboard 22건 미번역) |
| 🔶 64% | ms |
| ⬜ 0% | de (독일어 — 언어 추가 테스트) |

---

## 📋 v4 마무리 일정 (M11) ✅ (완료: 2026-06-03)

> **목표**: 번역 100% 달성 · 환율 연동 · 다국어 E2E 검증

- **TASK-042: 전체 언어 번역 100% 완성** ✅ - 완료 (2026-06-02)
  - ✅ de(독일어)·sq(알바니아어)·ps(파슈토어) 추가 등록 및 번역 완료
  - ✅ `messages/de.json` DB 기준 98건 동기화 완료 (독일어 번역)
  - ✅ auth·표준 컴포넌트 다국어 키 전 언어 확장
  - ✅ 다국어 관리 대시보드 🔄 버튼(Google Translate) 기반 미번역 키 자동 채움 완료

- **TASK-043: 환율 실시간 표시** ✅ - 완료 (2026-06-02)
  - ✅ `open.er-api.com` 무료 API 연동
  - ✅ 콤보박스 통화코드 옆 실시간 환율 표시
  - ✅ 환율 기준 통화를 현재 선택 locale로 동적 변경

- **TASK-044: 다국어 E2E 테스트** ✅ - 완료 (2026-06-03)
  - ✅ `tests/e2e/i18n.spec.ts` — 77개 테스트 (Layer 0~2) Chromium 전체 통과
  - ✅ Layer 1-A: URL prefix 라우팅 (11개 언어 · ko as-needed 검증)
  - ✅ Layer 1-B: `html[lang]` 속성 9개 언어 검증
  - ✅ Layer 1-C: 미인증 `/admin` → `/login` locale prefix 보존 리다이렉트
  - ✅ Layer 1-D: 로그인 페이지 번역 텍스트 + MISSING_MESSAGE 없음
  - ✅ Layer 2: 게시판·admin/standards MISSING_MESSAGE 없음 (10개 언어)
  - ✅ CountrySelector locale 전환 (US→en, ES→es, KR→ko as-needed, AU→en)
  - ✅ 한국어·영어·중국어·일본어 텍스트 UI 표시 확인

---

## 🚀 v4 Phase 4 — UI/UX 표준화 · Audit 고도화 · 승인 워크플로우 완성

### Phase 4 (v4): UI/UX 표준화 · Audit 고도화 · 승인 워크플로우 완성 ✅ (완료: 2026-06-02, M12)

> **목표**: shadcn/ui Alert 표준화 · DB 타입 표준화(TIMESTAMPTZ) · 사용자 관리 개선 · Audit Trail 고도화 · 승인 후 원본 자동 반영 완성

- **TASK-045: UI Alert 컴포넌트 표준화** ✅ - 완료 (2026-06-02)
  - ✅ `components/ui/alert.tsx` — shadcn/ui New York 프리셋 기반 Alert 기본 컴포넌트
  - ✅ `components/custom-alert.tsx` — 5가지 variant(default·info·success·warning·destructive) + dismissible + 확인/취소 버튼 지원
  - ✅ `PostDetail.tsx` — 게시글 삭제 `confirm()` → destructive CustomAlert 레이어 팝업 전환
  - ✅ `BoardAdmin.tsx` — 삭제 confirm() → destructive, 삭제 완료 toast → success CustomAlert 레이어 팝업 전환
  - ✅ `app/[locale]/alert-demo/page.tsx` — 5가지 variant 데모 페이지 (next-intl 라우팅 내부)
  - ✅ `.gitignore` — Claude Code 자동 생성 agent-memory/agents 경로 제외 추가

- **TASK-046: DB 데이터 타입 표준화 (TIMESTAMP → TIMESTAMPTZ)** ✅ - 완료 (2026-06-02)
  - ✅ `lib/ddl-generator.ts` — `PG_TYPE['0020']` TIMESTAMP → TIMESTAMPTZ
  - ✅ `lib/da-types.ts` — DATA_TYPE_OPTIONS·DATA_TYPE_LABEL '0020' 레이블 변경
  - ✅ `lib/db.ts` — DATA_TYPE_CD 코드 시드 TIMESTAMP형 → TIMESTAMPTZ형
  - ✅ `components/standards/WordDialog.tsx` — 물리타입 select 옵션 변경
  - ✅ `docs/da-plan/ddl/01_meta_standard_insert.sql` — 주석 0020=TIMESTAMPTZ

- **TASK-047: 사용자 관리 개선 (GroupTab 마스터 역할 수정)** ✅ - 완료 (2026-06-02)
  - ✅ `GroupTab.tsx` — G_MASTER `profile_role: null` → `'master' as const` (MASTER 그룹 클릭 시 사용자 목록 표시)
  - ✅ 미생성 시스템 그룹도 클릭 가능하도록 가상 Group 객체 패턴 적용
  - ✅ `PROFILE_ROLE_BADGE` master 배지 추가 (보라색 텍스트, 배경 없음)
  - ✅ `movableRoles`에 master 역할 추가
  - ✅ `messages/ko.json·en.json` — `groupTab.role.master`, `groupTab.moveRole.master` 번역 추가

- **TASK-048: Audit Trail 고도화** ✅ - 완료 (2026-06-02)
  - ✅ **Phase 1-1 승인 이력**: `lib/audit.ts` EntityType에 `APPROVAL` 추가, `approval/[id]/route.ts` APPROVE·REJECT 결정 시 before 스냅샷 포함 writeAudit 호출
  - ✅ **Phase 1-2 공통코드 이력**: EntityType에 `SYS_CODE_GRP·SYS_CODE_VAL` 추가, `codes/route.ts` POST·PUT, `codes/[grpId]/route.ts` POST·PUT·DELETE writeAudit 연결
  - ✅ **Phase 2-1 날짜 범위 필터**: `/api/audit` `from·to` 파라미터 추가, 서버 사이드 WHERE CHANGED_AT 범위 필터
  - ✅ **Phase 2-2 페이지네이션**: `/api/audit` `action·q·offset` 파라미터 추가, `X-Total-Count` 헤더 반환, `PAGE_SIZE=50` 클라이언트 페이지네이션, 모든 필터 서버 사이드 전환
  - ✅ **Phase 3-1 CSV 내보내기**: `app/api/audit/export/route.ts` 신규 — 현재 필터 조건 그대로 CSV 다운로드 (BOM 포함, 최대 10,000건), fetch+Blob 다운로드 패턴
  - ✅ **Phase 3-2 이력 보존 정책**: `app/api/audit/cleanup/route.ts` 신규 — ADMIN 전용, N일 이전 이력 물리 삭제, 삭제 건수 반환
  - ✅ `AuditLogViewer.tsx` 전면 개선 — 날짜 범위 입력, 필터 초기화 버튼, 페이지네이션 UI, CSV/정리 버튼

- **TASK-049: 승인 워크플로우 완성** ✅ - 완료 (2026-06-02)
  - ✅ **Phase A-1 표준단어 수정 승인 연동**: `WordDialog.tsx` `isEdit` 분기 — 수정 모드에서 `PUT /api/std-dic` 대신 `POST /api/approval` 호출, amber 안내 배너·버튼 추가
  - ✅ **Phase A-2 표준도메인 수정 승인 연동**: `DomainDialog.tsx` 동일 패턴 적용 (entity_type: STD_DOM)
  - ✅ **Phase B-1 승인 후 원본 반영**: `lib/apply-approval.ts` 신규 — `applyApprovalToDb()` 헬퍼, STD_DIC better-sqlite3 트랜잭션 UPDATE + STD_WORD_COMBI 갱신, STD_DOM UPDATE 적용, before 스냅샷 반환
  - ✅ **Phase B-2 롤백 처리**: `approval/[id]/route.ts` — SQLite 반영 먼저 실행 → 실패 시 500 반환·approval_queue PENDING 유지(재시도 가능) → 성공 시 approval_queue APPROVED 업데이트
  - ✅ 승인 후 STD_DIC/STD_DOM Audit + APPROVAL Audit 이중 기록 (`changedBy: "승인반영(ADMIN)"`)
  - ✅ `approval/page.tsx` — `applied` 플래그 응답 기반 "✅ 승인 완료 — DB 반영됨" 토스트 구분

---

## 🔐 보안 강화 v2 계획

> **참조**: `docs/PRD_SECURITY.md` — 주요정보통신기반시설 기술적 취약점 분석·평가 방법 상세가이드 + OWASP Top 10 기반  
> **점검 결과**: Critical 2건 · High 4건 · Medium 13건 · Low 4건 · Info 2건 (총 25개 항목)

### M-S1: Critical 보안 조치 🔴 (즉시 조치 필요)

- **TASK-050: 관리자 인증 강화 (SEC-001/005)** ✅ - 완료 (2026-06-03)
  - ✅ `app/api/admin/login/route.ts` — Rate Limiting (10회/분 per IP) 적용
  - ✅ `crypto.timingSafeEqual()` 적용으로 타이밍 공격 방어
  - ✅ `.env.local` `ADMIN_PASSWORD`, `ADMIN_SECRET_KEY` 삭제 (계정 비활성화)
  - [ ] CI/CD 기본 패스워드 감지 스크립트 — 재활성화 시 추가

---

### M-S2: High 보안 조치 🔴 (2026-06-06 까지 — 72시간 이내)

- **TASK-051: 인증 없는 API 엔드포인트 차단 (SEC-003)** ✅ - 완료 (2026-06-03)
  - ✅ `app/api/check-dup/route.ts` — `requireAuth(['USER',...])` 추가
  - ✅ `app/api/search/route.ts` — `requireAuth(['USER',...])` 추가
  - ✅ `app/api/ddl/export/route.ts` — `requireAuth(['USER',...])` 추가

- **TASK-052: 보안 HTTP 헤더 설정 (SEC-006)** ✅ - 완료 (2026-06-03)
  - ✅ `next.config.ts` — `securityHeaders` 배열 + `headers()` 함수 추가
  - ✅ 6종 설정: `HSTS`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `CSP`

- **TASK-053: Service Role Key 서버 격리 (SEC-012)** ✅ - 완료 (2026-06-03)
  - ✅ `server-only` 패키지 설치
  - ✅ `lib/supabase.ts` 상단에 `import 'server-only'` 추가

- **TASK-054: API Rate Limiting 구현 (SEC-016)** ✅ - 완료 (2026-06-03)
  - ✅ `lib/rate-limit.ts` 신규 — `checkRateLimit()` + `getClientIp()` 헬퍼
  - ✅ `/api/admin/login` 적용 (10회/분 per IP, `Retry-After` 헤더 반환)

---

### M-S3: Medium 보안 조치 ⚠️ (2026-07-03 까지 — 30일 이내)

- **TASK-055: 쿠키·입력값·파일 보안 강화 (SEC-002/008/010/011)** ✅ - 완료 (2026-06-03)
  - ✅ `lib/admin-auth.ts` Admin 쿠키 `sameSite: 'lax'` → `'strict'`
  - ✅ `app/api/board/[category]/posts/route.ts` 제목 200자·본문 10,000자 길이 검증 추가
  - ✅ `file-type` 패키지 설치 — 첨부파일 Magic Byte 서버 검증 (`dynamic import`)
  - ✅ 첨부파일 경로 UUID 전용 생성 (`${id}/${uuid}.${ext}`)

- **TASK-056: 오류 처리 · 감사 로그 · 캐시 개선 (SEC-007/018/019)** ✅ - 완료 (2026-06-03)
  - ✅ `lib/api-error.ts` 신규 — `handleDbError()` + `noCacheHeaders()` 유틸리티
  - ✅ `lib/audit.ts` — `writeSecurityAudit()` 추가 (SecurityEvent 타입 + admin login 연결)
  - ✅ `app/api/board/[category]/posts/route.ts` — `handleDbError` + `noCacheHeaders` 적용

- **TASK-057: 환경변수 · 외부 API 보안 (SEC-013/017)** ✅ - 완료 (2026-06-03)
  - ✅ `.env` 파일 Slack Webhook URL 예시값으로 교체
  - ✅ `app/api/i18n/translate/route.ts` — `isTranslating` 뮤텍스 + `try-finally` 보장
  - ✅ `revalidateTag` 빈 catch → 로깅 추가 (SEC-023 동시 해결)

- **TASK-058: 보안 취약점 점검 결과 완료 + 잔여 항목 전부 해소** ✅ - 완료 (2026-06-03)
  - ✅ **SEC-020**: `package.json` `overrides: { "postcss": ">=8.5.10" }` — `npm audit 0 vulnerabilities` 달성
  - ✅ **SEC-021**: 번역 SDK 교체 — `@vitalets/google-translate-api`(비공식) → `@google-cloud/translate`(공식) 전환. 배열 기반 배치 번역으로 코드 단순화
  - ✅ **SEC-024**: 관리자 인증 단일화 — `isAdminSession()` 단독 사용 4개 API(`admin/profiles`, `sync`, `approval`, `approval/[id]`) → `requireAuth(req, ['ADMIN'])` 통합. `decided_by: 'ADMIN'` 하드코딩 → `auth.email` 동적화
  - ✅ **보안 취약점 점검 결과 보고서** 작성 완료: `docs/security_checklist_result.md` (25개 항목 조치율 100%)

---

## 🏗️ v5 개발 계획

### Phase 1 (v5): 데이터 품질 강화 ✅ (완료: 2026-06-03, M13)

> **목표**: 물리삭제 → 논리삭제 전환 · 물리DB 설계 가이드 규칙 추가 · 표준용어 일시 접미사 통일

- **TASK-059: 물리삭제 → 논리삭제 전환** ✅ - 완료 (2026-06-03)
  - ✅ **Supabase 마이그레이션** — `brd_post·brd_cmnt·brd_attch` 3개 테이블에 `del_yn varchar(1) NOT NULL DEFAULT 'N'` + `del_dtm timestamptz NULL` 추가. CHECK 제약 + 부분 인덱스 (`WHERE del_yn='N'`) 등록
  - ✅ **SQLite 마이그레이션** — `lib/db.ts` `runLogicalDeleteMigration()` 신규. `STD_DIC·STD_DOM` 2개 테이블에 `DEL_YN·DEL_DTM` 컬럼 추가 (앱 기동 시 자동 적용)
  - ✅ **DELETE → UPDATE 교체** — 6개 API 파일: `posts/[id]`, `comments/[cmntId]`, `attachments/[attId]`(DB 논리삭제·Storage 물리삭제 유지), `std-dic/[id]`, `std-dom/[id]`, `approval/[id]`(`apv_status='CANCELLED'` 상태 전환 + PENDING 사전 검증)
  - ✅ **SELECT 필터** — 9개 파일 전수에 `del_yn='N'` / `DEL_YN='N'` 필터 추가
  - ✅ **DDL 문서** — `docs/da-plan/ddl/06_logical_delete_migration.sql` 마이그레이션 명세 작성
  - ✅ `tsc --noEmit` 타입 오류 0건 확인

- **TASK-060: 물리DB 설계 가이드 업데이트 (체크리스트 E 신설)** ✅ - 완료 (2026-06-03)
  - ✅ `docs/da-plan/notices/물리DB구축_표준준수_전파.md` 4곳 수정
    - **체크리스트 B** — `del_yn DEFAULT 'N'` 전용 예외 명시 및 근거 추가
    - **체크리스트 E 신설** — 논리삭제 컬럼 DDL·위치·DELETE 금지·UPDATE 패턴·SELECT 필터 의무·적용/제외 범위 기술
    - **【추록】 DDL 패턴** — `del_yn·del_dtm` 컬럼 위치(시스템컬럼 바로 위) + 부분 인덱스 반영
    - **【추록2】 신설** — 논리삭제 설계 규칙 전파 공문 (발신·기적용 현황 5건·물리삭제 유지 4건·신규 설계 체크포인트)

- **TASK-061: 표준용어 일시 접미사 통일 (dts → dtm)** ✅ - 완료 (2026-06-03)
  - ✅ **배경** — `reg_dts/mod_dts`(구형) vs `reg_dtm/mod_dtm`(신형) 혼용 불일치 해소. `del_dtm` 기준으로 `dtm`으로 통일
  - ✅ **Supabase DB** — `ALTER TABLE RENAME COLUMN` 8개 테이블 16컬럼 일괄 변경 (`brd_post·brd_cmnt·brd_attch·brd_ctgr·i18n_cntry_mst·i18n_lang_mst·i18n_msg·i18n_ns_mst`)
  - ✅ **트리거** — `fn_update_mod_dts()` 함수 바디 `NEW.mod_dtm`으로 재정의. 8개 트리거 이름 `RENAME TO trg_xxx_mod_dtm`
  - ✅ **API 코드** — 4개 파일 `reg_dts/mod_dts` → `reg_dtm/mod_dtm` 일괄 치환
  - ✅ **TypeScript** — 4개 컴포넌트 인터페이스 필드명 교체
  - ✅ **표준 메타** — `lib/db.ts` 기동 시 `STD_DIC '일시' 약어 DTS → DTM` UPDATE. `01_meta_standard_insert.sql` 수정
  - ✅ **문서** — `02_create_tables_postgresql.sql·06_logical_delete_migration.sql·물리DB구축_표준준수_전파.md·ROADMAP.md·PRD_MUL_LAN.md·erd-shopping.md·fill_domain_phyname.py·fix_register_mall_terms.py·create_excel.py` 9개 파일 전수 교체
  - ✅ `tsc --noEmit` 타입 오류 0건 · `grep reg_dts` 잔존 파일 0건 확인

---

## 향후 계획 (Out of Scope — v6+)

- 외부 ERD 도구 연동 (DBeaver, DataGrip)
- 모바일 반응형 완전 최적화
- 양방향 DB 동기화 (Supabase → SQLite)

---

## 마일스톤 요약

| 마일스톤 | Phase | 완료/예상일 | 주요 산출물 | 상태 |
|---------|-------|-----------|-----------|------|
| M0: 프로젝트 부트스트랩 | Phase 0 | 2026-04 | Next.js 16 + SQLite 셋업 | ✅ 완료 |
| M1: 표준 CRUD 구현 | Phase 1-Legacy | 2026-05 | 표준단어/도메인/용어 3탭 | ✅ 완료 |
| M2: RBAC 시스템 | Phase 2-Legacy | 2026-05 | 역할-권한 매트릭스 | ✅ 완료 |
| M3: 보안 1차 강화 | Phase 3-Legacy | 2026-05 | SQL Injection·필드 검증 취약점 수정 | ✅ 완료 |
| M-S1: 보안 Critical 조치 | 보안 강화 v2 | 2026-06-03 | 관리자 브루트포스 방어·기본 패스워드 교체 (TASK-050) | ✅ 완료 |
| M-S2: 보안 High 조치 | 보안 강화 v2 | 2026-06-03 | API 인증 보완·보안 헤더·Rate Limiting (TASK-051~054) | ✅ 완료 |
| M-S3: 보안 Medium 조치 | 보안 강화 v2 | 2026-06-03 | 쿠키·파일·오류 처리 등 (TASK-055~057) | ✅ 완료 |
| M4: 인증 시스템 + 관리자 | Phase 0 (v2) | 2026-05-31 | 회원가입·로그인·Google OAuth·Back Office | ✅ 완료 |
| M5: 핵심 기능 고도화 | Phase 1 (v2) | 2026-05-31 | DDL Export·검색·MVP잔여·Audit Trail | ✅ 완료 |
| M6: 동기화·승인·반응형 | Phase 2 (v2) | 2026-05-31 | Supabase 동기화·승인 워크플로우·E2E | ✅ 완료 |
| M7: v3 기반 강화 | Phase 1 (v3) | 2026-06-01 | 공통코드·프로필·Audit Trail 통합 | ✅ 완료 |
| M8: 통합게시판 | Phase 2 (v3) | 2026-06-01 | 게시판 8종 CRUD·댓글·첨부·관리자·E2E | ✅ 완료 |
| M8.5: 게시판 UX 개선 | Phase 3 (v3) | 2026-06-02 | 라우팅 재구성·반응형 페이지네이션·첨부파일·권한 제어 | ✅ 완료 |
| M9: i18n 기반 구축 | Phase 1 (v4) | 2026-06-02 | next-intl·라우팅·레이아웃·proxy 체이닝·버그 수정 4건 (TASK-032~035) | ✅ 완료 |
| M10: 국가DB·번역관리 | Phase 2 (v4) | 2026-06-02 | 187개국 DB·콤보박스·번역관리·AI번역·국기SVG (TASK-036~041) | ✅ 완료 |
| M11: 다국어 마무리 | Phase 3 (v4) | 2026-06-03 | 번역 100% 완성·환율 연동·E2E 77개 전체 통과 (TASK-042~044) | ✅ 완료 |
| M12: UI표준화·Audit고도화·승인완성 | Phase 4 (v4) | 2026-06-02 | UI Alert 표준화·TIMESTAMPTZ·GroupTab·Audit 고도화·승인 워크플로우 완성 (TASK-045~049) | ✅ 완료 |
| M-S: 보안 강화 v2 전체 완료 | 보안 강화 v2 | 2026-06-03 | 25개 보안 항목 조치율 100% (TASK-050~058) · `docs/security_checklist_result.md` 공식 제출 보고서 | ✅ 완료 |
| M13: 데이터 아키텍처 고도화 | Phase 1 (v5) | 2026-06-03 | 논리삭제 전환(5테이블) · 설계가이드 체크리스트 E · 표준용어 dts→dtm 통일(8테이블) (TASK-059~061) | ✅ 완료 |

---

## 성공 지표 목표

| 지표 | 현재 (2026-06-01) | 목표 | 측정 방법 |
|------|-----------------|------|---------|
| 등록 표준단어 수 | 53건 (+17 게시판용) | 100건 | STD_DIC 레코드 수 |
| 등록 표준도메인 수 | 17건 (+5 게시판용) | 30건 | STD_DOM 레코드 수 |
| 등록 표준용어 수 | 0건 (DA_TERM 비어있음) | 200건 | DA_TERM 레코드 수 |
| 보안 취약점 (전체 25개) | ✅ 조치율 100% (M-S 전체 완료) | 0건 유지 | `docs/security_checklist_result.md` 공식 보고서 |
| Playwright 테스트 | **i18n 77건 전체 통과** (Chromium) | 전 브라우저 통과 | `npx playwright test` |
| 게시판 API 라우트 | 11개 | — | app/api/board 라우트 수 |
| 지원 언어 수 | **14개** (11+de·sq·ps 추가) | 11개 | i18n_lang_mst use_yn='Y' 수 ✅ |
| 번역 키 수 | **98건** (ko 기준 100%) | ~50건 | i18n_msg DISTINCT(ns_cd,msg_key) 수 ✅ |
| 국가·통화 DB | **187개국** | 187개국 | i18n_cntry_mst 레코드 수 ✅ |
| 번역 100% 완성 언어 | **전체 등록 언어** (ko·en·zh·ja·de·sq·ps 외) | 전 언어 | i18n_msg 언어별 완료율 ✅ |
| Audit Trail 커버리지 | **STD_DIC·STD_DOM·APPROVAL·SYS_CODE_GRP·SYS_CODE_VAL** | 전 엔터티 | lib/audit.ts EntityType 수 ✅ |
| 승인 후 원본 반영 | **자동 반영 + 롤백** | 자동화 | lib/apply-approval.ts 적용 ✅ |

---

## 수동 설정 필요 항목

| 항목 | 내용 | 우선순위 |
|------|------|---------|
| **Google OAuth** | Google Cloud Console → OAuth 2.0 클라이언트 등록 → Supabase Authentication → Google Provider 활성화 | 높음 |
| **이메일 템플릿** | Supabase Dashboard → Authentication → Email Templates → 한국어 커스터마이징 | 중간 |
| **E2E 테스트 환경변수** | `.env.test` — `TEST_MASTER_EMAIL`, `TEST_MASTER_PW`, `TEST_USER_EMAIL`, `TEST_USER_PW` 설정 → Layer 2 E2E 활성화 | 중간 |
| **환율 API 키** (v4 Phase 2) | `exchangerate-api.com` 또는 `open.er-api.com` 무료 API 키 발급 → `.env.local`에 `EXCHANGE_RATE_API_KEY` 등록 | 낮음 |

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|---------|-------|
| v1.0 | 2026-05-31 | PRD 기반 ROADMAP 초안 생성 (MVP 완료 반영, v2 Phase 1~2 수립) | anakin |
| v1.1 | 2026-05-31 | v2 Phase 0 추가 — 회원가입·로그인·구글 OAuth (TASK-017~019) | anakin |
| v2.0 | 2026-05-31 | v2 Phase 0 완료 반영 — TASK-017~020 완료, TASK-010~012 완료, M4 완료 표시 | anakin |
| v3.0 | 2026-06-01 | v3 Phase 2 완료 반영 — 통합게시판 TASK-024~031 전체 완료, M7·M8 추가, 성공 지표 업데이트 | anakin |
| v4.0 | 2026-06-02 | v4 다국어 시스템 계획 수립 — PRD_MUL_LAN.md 작성, TASK-032~039 추가, M9·M10 마일스톤 등록, i18n 스킬파일(TASK-032) 완료 | anakin |
| v4.1 | 2026-06-02 | v3 Phase 3 완료 반영 — 게시판 UX·라우팅·권한제어, v4 Phase 1 완료 반영 — TASK-033~035·버그 4건 수정, M8.5·M9 완료 표시 | anakin |
| v4.2 | 2026-06-02 | TASK-036 완료 반영 — i18n 4테이블·RLS·시드(11언어·7NS·187개국·75번역키), DA 표준 v2 감리 통과 | anakin |
| v4.3 | 2026-06-02 | M10 완료 반영 — TASK-037~041 (키치환·콤보박스·관리화면·AI번역·언어관리), 국기 SVG화(flag-icons), 보안패치, M11 잔여일정(번역100%·환율·E2E) 수립 | anakin |
| v4.4 | 2026-06-02 | TASK-042·043 완료 반영 — 전 언어 번역 100%(de·sq·ps 추가), 환율 실시간 표시(open.er-api.com), M11 🔄 진행 중 전환 (TASK-044 잔여) | anakin |
| v4.5 | 2026-06-02 | Phase 4 신규 — TASK-045~049 (UI Alert 표준화·TIMESTAMPTZ·GroupTab 마스터역할·Audit 고도화·승인 워크플로우 완성), M12 마일스톤 등록, 성공 지표 현행화 | anakin |
| v4.6 | 2026-06-03 | 보안 강화 v2 계획 수립 — PRD_SECURITY.md 25개 항목 기반 TASK-050~057 등록, M-S1/S2/S3 마일스톤 신규 추가, 성공 지표 현행화 | anakin |
| v4.7 | 2026-06-03 | M-S1·M-S2 완료 — TASK-050~054 (server-only·requireAuth 3개·보안헤더 6종·Rate Limiting·timingSafeEqual) 빌드 검증 완료 | anakin |
| v4.8 | 2026-06-03 | M-S3 완료 — TASK-055~057 (SameSite·길이검증·Magic Byte·UUID경로·handleDbError·writeSecurityAudit·번역뮤텍스·Slack URL 마스킹) 빌드 검증 완료 | anakin |
| v4.9 | 2026-06-03 | 보안 강화 v2 전체 완료 — SEC-004(RLS교체)·SEC-009(검색어100자)·SEC-015(Open Redirect강화)·SEC-020(npm audit통과)·SEC-022/023 해소, npm audit high/critical 0건 | anakin |
| v5.0 | 2026-06-03 | M11 완료 — TASK-044 다국어 E2E 77개 전체 통과, ADMIN_SECRET_KEY proxy 버그픽스, groupTab.colUsername 번역 누락 17개 언어 보정(JSON+DB), playwright.config.ts timeout 60s로 증가 | anakin |
| v5.1 | 2026-06-03 | 핫픽스 6건 — groupTab.role.master 번역 누락(17개), state.noTerms 누락(17개), domain.detailTitle 누락(17개), field.logicalNameKey 누락(17개), React key=null 중복(GroupTab), requireAnyAuth 도입·Promise.all 병렬화(성능 개선) | anakin |
| v5.2 | 2026-06-03 | TASK-058 — 보안 취약점 25개 항목 100% 완료. SEC-020(npm overrides 0 vulnerabilities)·SEC-021(공식 번역 SDK 전환)·SEC-024(requireAuth 단일화). `docs/security_checklist_result.md` 공식 제출 보고서 | anakin |
| v5.3 | 2026-06-03 | TASK-059 — 물리삭제→논리삭제 전환 완료. `brd_post·brd_cmnt·brd_attch·STD_DIC·STD_DOM` 5개 테이블 `del_yn/del_dtm` 추가. Supabase 마이그레이션·SQLite 마이그레이션·API 6개 DELETE→UPDATE·SELECT 9개 필터 추가 | anakin |
| v5.4 | 2026-06-03 | TASK-060 — 물리DB 설계가이드 체크리스트 E 신설. `물리DB구축_표준준수_전파.md` 논리삭제 컬럼 규칙·DDL 패턴·추록2 공문 추가. 향후 신규 테이블 설계 표준 확립 | anakin |
| v5.5 | 2026-06-03 | TASK-061 — 표준용어 일시 접미사 `dts→dtm` 통일. Supabase 8테이블 16컬럼 RENAME + 트리거 재정의 + 트리거 이름 변경. API 4파일·컴포넌트 4파일·문서 9파일 전수 교체. `tsc --noEmit` 오류 0건·잔존 파일 0건 | anakin |
