# PRD: Pi Network 기반 풀스택 앱 플랫폼

> **버전**: v1.0
> **작성일**: 2026-06-05
> **작성자**: anakin
> **배포 URL**: https://loginpi.vercel.app
> **저장소**: https://github.com/anakinwon/loginpi

---

## 1. 프로젝트 개요

Pi Network 생태계 위에서 동작하는 풀스택 웹 앱 플랫폼.
Pi 계정 인증·결제를 핵심으로, Google 소셜 로그인·관리자 시스템·게시판·다국어까지 단계적으로 확장한다.

| 항목 | 내용 |
|---|---|
| 프레임워크 | Next.js 15 App Router |
| 배포 | Vercel (프로덕션: loginpi.vercel.app) |
| 인증 1 | Pi Network (Pi SDK 2.0) |
| 인증 2 | Google OAuth (예정) |
| 결제 | Pi Coin (U2A) |
| 대상 환경 | Pi Browser + 일반 브라우저 |

---

## 2. 기술 스택

| 레이어 | 기술 | 버전 | 상태 |
|---|---|---|---|
| Framework | Next.js App Router | 15.5.18 | ✅ 현행 |
| UI Runtime | React | 19.1.0 | ✅ 현행 |
| Language | TypeScript | 5.x strict | ✅ 현행 |
| Styling | Tailwind CSS | v4 (CSS-first) | ✅ 현행 |
| UI Components | shadcn/ui (base-nova / @base-ui/react) | latest | ✅ 현행 |
| 환경변수 검증 | t3-env + Zod | latest | ✅ 현행 |
| 세션 쿠키 보안 | HMAC-SHA256 (Node.js crypto) | — | ✅ 구현 완료 |
| Pi 인증 | Pi SDK 2.0 | 2.0 | ✅ 구현 완료 |
| Pi 결제 | Pi Payments API | v2 | ✅ 구현 완료 |
| Google 인증 | Google OAuth / NextAuth.js | 예정 | ⏳ 미구현 |
| DB (예정) | Supabase PostgreSQL | — | ⏳ 미구현 |
| 다국어 | next-intl | 예정 | ⏳ 미구현 |

---

## 3. 전체 기능 현황

| # | 기능 | 상태 | Phase |
|---|---|---|---|
| 1 | 스타터킷 현행화 (Next.js 15 + Tailwind v4 + shadcn/ui base-nova) | 🔄 진행 중 | Phase 0 |
| 2 | Pi 계정 로그인 | ✅ **완료** | Phase 1 |
| 3 | Pi Coin 결제 | ✅ **완료** | Phase 1 |
| 4 | Google 계정 로그인 | ⏳ 미완성 | Phase 2 |
| 5 | Pi + Google 계정 통합 | ⏳ 미완성 | Phase 2 |
| 6 | 관리자 기능 | ⏳ 미완성 | Phase 3 |
| 7 | 통합 게시판 | ⏳ 미완성 | Phase 4 |
| 8 | 데이터 표준 시스템 | ⏳ 미완성 | Phase 5 |
| 9 | 다국어 처리 | ⏳ 미완성 | Phase 6 |

---

## 4. Phase 0 — 스타터킷 현행화 🔄 (진행 중)

### 목표
최신 Next.js 15 생태계 기반의 재사용 가능한 스타터킷 구축.

### 완료된 항목
- [x] Next.js 15 App Router + React 19 + TypeScript strict
- [x] Tailwind CSS v4 (CSS-first, `tailwind.config` 없음)
- [x] shadcn/ui base-nova (`@base-ui/react` 기반, `asChild` 없음)
- [x] next-themes 다크모드 연동 (`@custom-variant dark`)
- [x] t3-env + Zod 빌드 시점 환경변수 검증
- [x] pnpm 11 빌드 스크립트 허용 (`pnpm-workspace.yaml allowBuilds`)
- [x] Vercel 배포 파이프라인

### 참고사항
- `asChild` prop 미지원 → `className={cn(buttonVariants({...}))}` 패턴 사용
- Tailwind v4 테마는 `globals.css` `@theme inline {}` 블록으로 관리
- `src/app/globals.css`의 `@custom-variant dark (&:where(.dark, .dark *))` 한 줄이 다크모드 핵심

---

## 5. Phase 1 — Pi Network 인증 + 결제 ✅ (완료)

### 5-1. Pi 계정 로그인

**구현된 파일**
```
types/pi-network.d.ts            # window.Pi 전역 타입 + PaymentDTO
src/types/pi-session.ts          # PiSessionUser 공유 타입
src/app/api/auth/pi/route.ts     # GET(세션복원) POST(검증) DELETE(로그아웃)
src/app/api/auth/dev/route.ts    # 개발 환경 mock 로그인 (prod: 404)
src/components/pi-auth-provider.tsx  # React Context + 자동/수동 인증
src/components/pi-login-button.tsx   # 헤더용 간결 버튼
src/components/pi-user-card.tsx      # 전체 사용자 정보 카드
```

**핵심 동작**
- Pi Browser UA 감지(`/PiBrowser/i`) 시 `signIn()` 즉시 호출
- `Pi.init({ sandbox: detectSandbox() })` — localhost 자동 sandbox 적용
- `Pi.authenticate(['username', 'wallet_address', 'payments'], incompleteHandler)`
- 세션 쿠키: HMAC-SHA256 서명, `httpOnly`, `tokenValidUntil` 기반 maxAge
- 페이지 새로고침 시 `GET /api/auth/pi` 쿠키 복원

**제공하는 사용자 정보**
| 필드 | 출처 | 비고 |
|---|---|---|
| uid | /v2/me | 앱별 고유 식별자 |
| username | /v2/me | 'username' scope |
| walletAddress | Pi.authenticate 결과 | 'wallet_address' scope |
| scopesGranted | /v2/me credentials | 부여된 scope 배열 |
| tokenValidUntil | /v2/me credentials | 토큰 만료 ISO 8601 |

**환경변수**
```env
PI_SESSION_SECRET=<32자 이상 랜덤>
NEXT_PUBLIC_PI_SANDBOX=false   # localhost는 자동 true
```

### 5-2. Pi Coin 결제

**구현된 파일**
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

> 스킬 문서: `.claude/skills/pi_auth/SKILL.md`, `.claude/skills/pi_pay/SKILL.md`

---

## 6. Phase 2 — Google 계정 로그인 + Pi·Google 통합 ⏳

### 6-1. Google 계정 로그인

**요구사항**
- Google OAuth 2.0으로 로그인
- 로그인 성공 시 세션 쿠키 발급 (Pi 세션과 동일한 HMAC 방식)
- `PiAuthProvider`와 통합하거나 별도 `AuthProvider`로 분리
- 헤더의 `PiLoginButton` 옆에 Google 로그인 버튼 추가

**구현 방식 후보**
| 방식 | 장점 | 단점 |
|---|---|---|
| NextAuth.js (Auth.js) | 검증된 라이브러리, 세션 관리 내장 | 기존 Pi 세션과 충돌 가능 |
| 자체 구현 (Google OAuth) | 기존 HMAC 세션과 일관성 | 구현 복잡도 높음 |
| Supabase Auth | DB 연동 시 자연스러운 통합 | Supabase 도입 필요 |

**추천**: Supabase Auth 도입 (Phase 3 DB 연동 전제)

**필요 환경변수**
```env
GOOGLE_CLIENT_ID=<Google Cloud Console 발급>
GOOGLE_CLIENT_SECRET=<Google Cloud Console 발급>
```

### 6-2. Pi + Google 계정 통합

**요구사항**
- 동일 사용자가 Pi와 Google 두 방식으로 모두 로그인 가능
- 두 계정을 하나의 사용자 프로필로 연결 (계정 연동)
- 연동 방법: Pi 로그인 상태에서 Google 연동 버튼 클릭 (또는 반대)
- 미연동 상태에서는 각각 독립적으로 동작

**사용자 테이블 설계 (예시)**
```
users
├── id (UUID, PK)
├── pi_uid (string, unique, nullable)      ← Pi 계정
├── pi_username (string, nullable)
├── pi_wallet_address (string, nullable)
├── google_id (string, unique, nullable)   ← Google 계정
├── google_email (string, nullable)
├── display_name (string)
├── created_at, updated_at
```

**연동 흐름**
```
[Pi 로그인 완료] → [설정 > 계정 연동] → [Google 로그인]
→ Google UID + Pi UID를 users 테이블에서 같은 행으로 병합
→ 이후 어느 방법으로 로그인해도 동일 세션 발급
```

---

## 7. Phase 3 — 관리자 기능 ⏳

### 참고
이전 프로젝트(`docs/ROADMAP.md` Phase 0~2 v2)의 관리자 Back Office 구현을 참고한다.

### 요구사항

**관리자 대시보드** (`/admin`)
- 관리자 전용 레이아웃 + 접근 제어 (ADMIN/MASTER 역할만 진입)
- 통계 카드: 사용자 수, 결제 건수, 게시글 수

**사용자 관리** (`/admin/users`)
- 가입 사용자 목록 조회 (Pi UID, Google email, 역할, 가입일)
- 역할 부여/변경 (ADMIN > MASTER > MANAGER > USER)
- 사용자 활성/비활성화

**결제 내역 관리** (`/admin/payments`)
- 전체 결제 내역 조회 (paymentId, txid, 금액, 상태, 사용자)
- 결제 상태 필터 (completed, pending, cancelled)

**RBAC 구조**
```
ADMIN   — 전체 관리 권한
MASTER  — 사용자 관리, 게시판 관리
MANAGER — 게시글 승인/삭제
USER    — 일반 사용자
```

**DB**: Supabase PostgreSQL (Phase 2 연동 시 함께 구현)

---

## 8. Phase 4 — 통합 게시판 ⏳

### 참고
이전 프로젝트(`docs/ROADMAP.md` Phase 2~3 v3, TASK-024~031)의 게시판 구현을 참고한다.

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

## 9. Phase 5 — 데이터 표준 시스템 ⏳

### 참고
이전 프로젝트(`docs/ROADMAP.md` Phase 1-Legacy ~ Phase 1 v2, TASK-002~012)의 표준 관리 구현을 참고한다.

### 요구사항
- **표준단어** (STD_DIC): 논리명·물리명·약어·도메인 연결 CRUD
- **표준도메인** (STD_DOM): 데이터타입·길이·소수점 CRUD
- **표준용어** (DA_TERM): 단어 조합으로 물리명 자동 생성
- 중복 체크 API (`/api/check-dup`)
- 검색 (초성 검색, 영문 약어 역방향)
- DDL Export (표준용어 → PostgreSQL/MySQL DDL 스크립트)
- Audit Trail (변경 이력 추적)
- 승인 워크플로우 (MASTER 결재)

**DB**: SQLite (로컬 메타) + Supabase PostgreSQL (클라우드 동기화)

---

## 10. Phase 6 — 다국어 처리 ⏳

### 참고
이전 프로젝트(`docs/ROADMAP.md` Phase 1~4 v4, TASK-032~044)의 다국어 구현을 참고한다.

### 요구사항
- **지원 언어**: 최소 한국어(ko) · 영어(en) · 중국어(zh) · 일본어(ja)
- **라이브러리**: `next-intl` v4
- **라우팅**: `[locale]` 디렉토리 (`/ko/`, `/en/` — as-needed prefix)
- **번역 파일**: `messages/{locale}.json`
- **DB 번역 관리**: Supabase `i18n_msg` 테이블 (관리자 화면에서 편집)
- **AI 자동 번역**: Google Translate API 연동 (1클릭 미번역 키 자동 채움)
- **국가 선택**: 콤보박스 (국기 SVG + 실시간 검색)

**i18n DB 테이블** (Supabase)
```
i18n_lang_mst   — 지원 언어 목록
i18n_ns_mst     — 번역 네임스페이스
i18n_msg        — 번역 키/값 (ns_cd, msg_key, lang_cd)
i18n_cntry_mst  — 국가 목록 (187개국)
```

---

## 11. 환경변수 전체 목록

| 변수명 | Phase | 용도 | 필수 |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | 0 | 앱 URL | ✅ |
| `PI_SESSION_SECRET` | 1 | HMAC 세션 서명 (32자+) | ✅ |
| `NEXT_PUBLIC_PI_SANDBOX` | 1 | Pi 샌드박스 모드 | 선택 |
| `PI_API_KEY` | 1 | Pi 결제 API 키 | ✅ (결제 시) |
| `GOOGLE_CLIENT_ID` | 2 | Google OAuth | Phase 2 |
| `GOOGLE_CLIENT_SECRET` | 2 | Google OAuth | Phase 2 |
| `NEXT_PUBLIC_SUPABASE_URL` | 3 | Supabase URL | Phase 3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 3 | Supabase Anon Key | Phase 3 |
| `SUPABASE_SERVICE_ROLE_KEY` | 3 | Supabase Service Role (서버 전용) | Phase 3 |

---

## 12. 로드맵 타임라인

```
Phase 0  ── 스타터킷 현행화 ──────────── 🔄 진행 중
Phase 1  ── Pi 인증 + Pi 결제 ─────────── ✅ 완료
Phase 2  ── Google 로그인 + 통합 ─────────────────── ⏳
Phase 3  ── 관리자 기능 ────────────────────────────────── ⏳
Phase 4  ── 통합 게시판 ──────────────────────────────────────── ⏳
Phase 5  ── 데이터 표준 시스템 ──────────────────────────────────────── ⏳
Phase 6  ── 다국어 처리 ─────────────────────────────────────────────────── ⏳
```

---

## 13. 참고 문서

| 문서 | 위치 | 내용 |
|---|---|---|
| Pi 인증 스킬 | `.claude/skills/pi_auth/SKILL.md` | Pi 인증 구현 전체 가이드 |
| Pi 결제 스킬 | `.claude/skills/pi_pay/SKILL.md` | Pi 결제 구현 전체 가이드 |
| 이전 프로젝트 로드맵 | `docs/ROADMAP.md` | Phase 3~6 구현 참고 (표준시스템·게시판·다국어) |
| 다국어 PRD | `docs/PRD_MUL_LAN.md` | 다국어 상세 요구사항 |
| 보안 PRD | `docs/PRD_SECURITY.md` | OWASP 기반 보안 점검 항목 |

---

## 14. 변경 이력

| 버전 | 날짜 | 내용 | 작성자 |
|---|---|---|---|
| v1.0 | 2026-06-05 | 초안 작성 — Pi Network 플랫폼 기준 전면 재작성 | anakin |
