# 보안 요구사항 사항 (PRD_2_SECURITY)

## 문서 정보

| 항목 | 내용 |
|------|------|
| 작성일 | 2026-06-23 (현행화) |
| 참조 기준 | KISA 「주요정보통신기반시설 기술적 취약점 분석·평가 방법 상세가이드」(2021.03) + 행정안전부 웹 취약점 점검 21개 항목 |
| 프로젝트 | cafe.pi (Pi Network 카페 운영 플랫폼) |
| 기술 스택 | Next.js 16.2.7 + React 19 + TypeScript 6 + Tailwind CSS v4 + Supabase + Pi Network |
| 배포 | Vercel Pro |
| 점검 기준 | KISA 21개 웹 취약점 항목 (OC·SQ·XP·XS·MC·WP·WA·WR·CS·SP·WI·IE·SF·AA·PV·FU/FD·IL/DT·DI·AE·PL·MS) |

---

## 1. 개요 및 범위

### 1.1 시스템 개요

**cafe.pi**는 Pi Network 기반 온라인 카페 운영 플랫폼으로, 다음 핵심 기능을 제공한다:
- **PyChat**: 다국어 실시간 채팅 (WebRTC 음성 통화 지원)
- **PyShop™**: P2P·O2O 마켓플레이스 (Bean Token 기반 거래)
- **Event**: 미션 기반 보상 캠페인 시스템
- **Admin**: 사용자·결제·표준데이터·감사로그 관리

**특수 아키텍처 제약:**
- **Pi Browser는 Set-Cookie를 저장하지 않음** → X-Pi-Token 헤더 + localStorage 이중 경로
- **쿠키 미의존 세션 설계** → `piFetch()` (자동 헤더 첨부)
- **Supabase RLS 비활성화** → 모든 DB 접근은 서버 전용 SERVICE_ROLE_KEY
- **NextAuth v5 beta (Google OAuth)** + Pi 세션 통합
- **클라이언트 게이트 패턴**: `getSessionUser()` null 시 redirect 금지 (Pi Browser 무한 루프 방지)

### 1.2 점검 범위

| 영역 | 범위 |
|------|------|
| 인증·인가 | `src/lib/auth-check.ts`, `src/auth.ts`, `src/app/api/auth/*` |
| 세션 관리 | Pi 세션(HMAC-SHA256), Google OAuth JWT, X-Pi-Token 헤더 |
| 데이터 보호 | Supabase RLS 비활성, 서버 전용 RPC, 암호화 |
| 입력값 검증 | API 파라미터, 파일 업로드, 검색어 |
| 파일 처리 | `/api/store/items/images`, `/api/chat/rooms/*/upload` |
| API 보안 | 40+ REST 엔드포인트, 속도 제한, 캐시 제어 |
| 환경 변수 | t3-env 빌드 시점 검증, 32자 이상 시크릿 |
| 감사 로깅 | Supabase 감사 테이블, 활동 로그 |

---

## 2. KISA 21개 항목 점검 및 대응

> **KISA 기준 구조**: 웹 어플리케이션 영역 17개(입력값 검증 5, 인증/인가/세션 8, 비즈니스 로직 4) + 웹 서버 영역 4개

---

### 2.1 입력값 검증 / 인젝션 (5개 항목)

---

#### OC: 운영체제 명령 실행 (OS Command Injection)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | OC: OS 명령 실행 제어 미흡 |
| **위험도** | High |
| **판정** | ✅ **양호** |
| **근거** | |

**현황:**
- cafe.pi에서는 OS 명령 실행(`exec()`, `spawn()`, `eval()` 등)이 **전무**
- Node.js 파일 I/O는 `fs` 모듈(제한적 경로)로만 사용하며 동적 경로 조립은 검증됨
- 예: 번역 API의 메시지 파일 경로는 `lang_cd` 정규식(`/^[a-z]{2,3}(-[A-Z]{2,3})?$/`)으로 검증

**조치:**
- OS 명령 관련 기능 추가 시 **절대 사용자 입력을 쉘 명령에 직접 삽입 금지**
- 필수 시 `child_process.execFile()` (배열 인자) 또는 `shell: false` 옵션 사용

---

#### SQ: SQL 인젝션

| 항목 | 평가 |
|------|------|
| **KISA 항목** | SQ: SQL 인젝션 방지 |
| **위험도** | Critical |
| **판정** | ✅ **양호** |
| **근거** | |

**현황:**
- Supabase 모든 쿼리는 **PostgREST (자동 파라미터 바인딩)** 사용 — SQL 인젝션 원천 차단
- 동적 필터링 필요 시 `rpc()` 호출 (Supabase 함수는 권한 분리·데이터 검증 내장)
- 예: `db.rpc('fn_bean_subscribe', { /* params */ })`는 DB 함수의 파라미터 검증

**조치:**
- **절대 금지**: 문자열 연결로 SQL 구성 (`const sql = \`SELECT * FROM users WHERE id = \${id}\``)
- **필수**: 모든 쿼리는 PostgREST `.eq()`, `.in()`, `.like()` 등 메서드 또는 `.rpc()` 사용

**코드 예시 — 검색 쿼리(양호):**
```typescript
// ✅ 파라미터 바인딩 — 안전
const { data } = await db
  .from('mps_item')
  .select('id, nm, desc_val')
  .ilike('nm', `%${searchTerm}%`)  // ilike + 와일드카드 자동 이스케이프

// ❌ 문자열 연결 — 위험 (금지)
// const query = `SELECT * FROM mps_item WHERE nm LIKE '%${searchTerm}%'`
```

---

#### XP: XPath 인젝션

| 항목 | 평가 |
|------|------|
| **KISA 항목** | XP: XPath 인젝션 방지 |
| **위험도** | Medium |
| **판정** | ➖ **해당없음** |
| **근거** | |

**현황:**
- cafe.pi에서는 **XPath 쿼리 미사용** (XML/DOM 쿼리는 없음)
- 메시지는 JSON 형식, 검색은 PostgreSQL 기반

**비고:** 향후 XML 처리 기능 추가 시 점검 대상

---

#### XS: 크로스사이트 스크립팅 (XSS)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | XS: XSS 방지 |
| **위험도** | Critical |
| **판정** | ✅ **양호** |
| **근거** | |

**현황:**
- **React/Next.js의 JSX**: 기본적으로 자동 HTML 이스케이프 (문자열 삽입 시)
- **위험 케이스 구분:**
  1. `dangerouslySetInnerHTML`: 관리자 입력(`html_content`)에만 제한적 사용 — 소수 관리자가 통제
  2. Markdown 렌더링(`react-markdown`): 플러그인으로 스크립트 태그 차단(`skipHtml: true`)
  3. iframe 삽입: `sandbox` 속성으로 권한 제한

**조치:**
- 사용자 입력 문자열은 `{변수}`로 삽입 → 자동 이스케이프
- 신뢰할 수 없는 HTML 콘텐츠는 `dangerouslySetInnerHTML` 금지
- 링크/URL: `href` 검증 (프로토콜 화이트리스트: `http://`, `https://`, `/`)

**코드 예시 — XSS 방어(양호):**
```tsx
// ✅ 사용자 입력 자동 이스케이프
<div>{userProvidedText}</div>

// ❌ dangerouslySetInnerHTML 위험 — 관리자만 사용
// <div dangerouslySetInnerHTML={{ __html: userInput }} />

// ✅ Markdown 안전한 사용
import { Markdown } from 'react-markdown'
<Markdown skipHtml>{userMarkdown}</Markdown>
```

---

#### MC: 악성 콘텐츠

| 항목 | 평가 |
|------|------|
| **KISA 항목** | MC: 악성 콘텐츠 탐지 |
| **위험도** | Medium |
| **판정** | ✅ **양호 (Magic Byte 검증 구현 — 2026-07-08 시험 5.4 재점검)** |
| **근거** | 업로드 5개 경로 전부 시그니처 검증 + 화이트리스트 + 크기 제한 + UUID 파일명 |

**현황 (2026-07-08 정정·보강):**
- ⚠️ 정정: 이전 판 문서가 Magic Byte 검증을 "현 상태"로 기술했으나 **실제로는 미구현 상태였음**(문서-코드 불일치). 2026-07-08 시험 5.4 재점검에서 발견 즉시 구현 완료.
- **✅ Magic Byte(시그니처) 검증**: `src/lib/upload-validate.ts` `validateMagicBytes()` 공통 헬퍼 — 클라이언트 `file.type` 위조 시(예: exe에 `Content-Type: image/png`) 실제 선두 바이트 불일치로 415 거부. 업로드 5개 route 전부 적용: `store/items/images`·`chat/rooms/[roomId]/upload`·`board/attachments`·`stickers/custom`·`admin/stickers/[packId]/items`
- MIME 화이트리스트 + 서버 결정 확장자 + UUID 파일명 + 크기 제한(1~20MB): 5/5 route 기존 적용
- SVG는 Stored XSS 위험으로 전 경로 의도적 제외, 비미디어 파일은 `Content-Disposition: attachment` 강제(chat)
- 이미지: Supabase Storage → CDN 배포(스크립트 실행 불가) + `X-Content-Type-Options: nosniff`

**바이러스 스캔 API 평가 결론 (2026-07-08):**
- **ClamAV**: 상주 데몬 필요 → Vercel 서버리스(Fluid Compute)에 부적합, 별도 인프라 비용 발생
- **VirusTotal API**: 사용자 파일을 외부 제3자에 전송(개인정보 우려) + 무료 티어 분당 4건 제한 → 부적합
- **판단**: 화이트리스트+시그니처 검증으로 실행형 위장 파일이 차단되고, 저장소가 실행 경로 없는 CDN이므로 클라우드 백신은 **도입 보류(수용 가능한 잔여 위험)**. 문서형 매크로(doc/docx)는 다운로드 후 사용자 단말 백신 영역 — 대량 문서 공유 기능 확장 시 재평가.

---

### 2.2 인증 / 인가 / 세션 관리 (8개 항목)

---

#### WP: 약한 문자열 강도 (취약한 패스워드)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | WP: 약한 패스워드 정책 |
| **위험도** | High |
| **판정** | ✅ **양호** |
| **근거** | |

**현황:**
- **Pi Network 기반 인증**: 계정·패스워드 미사용 (Pi Wallet 사인 기반)
- **Google OAuth**: Google에서 강제하는 패스워드 정책 (2FA 권장)
- **내부 관리 세션**: 없음 (Google OAuth만 사용)

**조치:**
- Pi Browser 사용자: Pi Wallet의 보안이 기본 (사용자 책임)
- Google 로그인 사용자: Google의 정책 준수 (이 앱에서 별도 정책 불필요)
- 향후 기본 패스워드 기반 인증 추가 시:
  ```typescript
  // 최소 요구사항: 12자 이상, 대문자·숫자·특수문자 혼합
  const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{12,}$/
  if (!passwordRegex.test(password)) {
    return error(400, '패스워드는 12자 이상, 대문자·숫자·특수문자 포함')
  }
  ```

---

#### WA: 불충분한 인증 (Broken Authentication)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | WA: 불충분한 인증 메커니즘 |
| **위험도** | Critical |
| **판정** | ✅ **양호** (이중 검증) |
| **근거** | |

**현황:**
- **Pi 세션 (X-Pi-Token 헤더):**
  - 발급: `/api/auth/pi` POST (HMAC-SHA256 토큰)
  - 저장: `localStorage` (Pi Browser) 또는 쿠키 (일반 브라우저)
  - 검증: `getSessionUser()` → 쿠키 우선, 없으면 X-Pi-Token 헤더, 없으면 Google OAuth
  - 만료: `tokenValidUntil` UNIX 타임스탬프 검증

- **Google OAuth (JWT 세션):**
  - 발급: NextAuth v5 `/api/auth/callback/google`
  - 저장: NextAuth 쿠키 (`authjs.session-token`)
  - 검증: `getSessionUser()` → `auth()` 호출

- **토큰 만료:**
  ```typescript
  // src/lib/auth-check.ts (라인 32-36)
  const notExpired =
    !!piSession &&
    (!piSession.tokenValidUntil ||
      new Date(piSession.tokenValidUntil) > new Date())
  ```

**조치:**
- ✅ 현 상태 양호 — 두 경로 통합 검증 (`getSessionUser()`)
- 향후 주의: Pi 토큰 갱신 로직 추가 시 `tokenValidUntil` 명시 필수

---

#### WR: 취약한 패스워드 복구

| 항목 | 평가 |
|------|------|
| **KISA 항목** | WR: 취약한 패스워드 복구 |
| **위험도** | Medium |
| **판정** | ➖ **해당없음** |
| **근거** | |

**현황:**
- cafe.pi는 **패스워드 기반 인증 미사용** (Pi Network + Google OAuth만 사용)
- 비밀번호 재설정 기능: 없음

**비고:** 향후 기본 인증 추가 시 이메일 검증 링크(일회용, 15분 만료) 필수

---

#### CS: 크로스사이트 리퀘스트 변조 (CSRF)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | CS: CSRF 방지 |
| **위험도** | High |
| **판정** | ✅ **양호** |
| **근거** | |

**현황:**
- **Next.js 자동 CSRF 방어:** `POST`, `PUT`, `DELETE` 요청 시 자동으로 origin 검증
- **SameSite 쿠키:**
  ```typescript
  // Pi 세션 쿠키 (src/lib/pi-session-crypto.ts)
  sameSite: 'strict',  // strict → same-origin 요청만 전송
  ```
  
- **Google OAuth:**
  - NextAuth의 CSRF 토큰 자동 적용 (`_csrf` 파라미터)

**조치:**
- ✅ 현 상태 충분 — Next.js + SameSite='strict'로 기본 방어
- 상태변화 작업(결제, 구독): `POST` 메서드 + X-CSRF-Token 헤더 추가 검토 (선택사항)

---

#### SP: 세션 예측

| 항목 | 평가 |
|------|------|
| **KISA 항목** | SP: 세션 토큰 예측 가능성 |
| **위험도** | High |
| **판정** | ✅ **양호** |
| **근거** | |

**현황:**
- **Pi 토큰:** HMAC-SHA256 + 32자 이상 `PI_SESSION_SECRET` (무작위 문자열)
  ```typescript
  // 발급: src/lib/pi-session-crypto.ts
  const secret = process.env.PI_SESSION_SECRET  // 최소 32자
  const token = sign(payload, secret)  // HMAC-SHA256
  ```

- **Google JWT:** 256-bit 키 기반 RS256 (Google 관리)

- **NextAuth 쿠키:** 128-bit 이상 암호학적 난수

**조치:**
- ✅ 현 상태 양호
- 주의: `PI_SESSION_SECRET` 은 **32자 이상 필수** (t3-env 검증, 라인 7-8)

---

#### WI: 불충분한 인가 (Broken Access Control)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | WI: 불충분한 접근 제어 |
| **위험도** | Critical |
| **판정** | ✅ **양호** (권한 격리 검증) |
| **근거** | |

**현황:**
- **역할 기반 접근 제어 (RBAC):** `sys_user.role` (ADMIN / MASTER / USER)
- **권한 검증:**
  ```typescript
  // src/lib/auth-check.ts (라인 92-94)
  export function isAdmin(user: UserRow | null): boolean {
    return user?.role === 'ADMIN' || user?.role === 'MASTER'
  }
  ```

- **API 권한 매트릭스:**
  - `/admin/*`: ADMIN/MASTER만 접근 (`getSessionUser()` + `isAdmin()` 검증)
  - `/api/chat/rooms/*`: USER 이상 (인증 필수)
  - `/api/store/*`: USER 이상 (인증 필수)

**조치:**
- ✅ 모든 API 엔드포인트에 `getSessionUser()` 호출 필수
- ✅ 관리자 API는 `isAdmin(user)` 추가 검증 필수
- 주의: 클라이언트 게이트 패턴(`if (!user) return <ClientGate />`) 필수 (Pi Browser 무한 루프 방지)

**코드 예시 — 권한 검증(양호):**
```typescript
// app/api/admin/users/route.ts
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  // ... 관리자 기능 수행
}

// Client Component — Pi Browser 대응
export default function AdminUsers() {
  const user = useSessionUser()
  if (!user || !isAdmin(user)) return <NotAuthorized />  // redirect 금지
  return <AdminUsersContent />
}
```

---

#### IE: 불충분한 세션 만료

| 항목 | 평가 |
|------|------|
| **KISA 항목** | IE: 세션 만료 정책 미흡 |
| **위험도** | Medium |
| **판정** | ✅ **양호 (완화 통제 확보 — 2026-07-08 시험 5.4 재점검)** |
| **근거** | 계정 비활성=즉시 토큰 무효화 레버 복원 + 쿠키 7일 상한 |

**현황 (2026-07-08 정정 — 이전 기술의 "30일 하드코딩"은 오기):**
- **Pi 토큰 만료:** `tokenValidUntil` = Pi 플랫폼 `credentials.valid_until.iso8601` 값을 그대로 사용 (`/api/auth/pi` route). 쿠키는 `MAX_COOKIE_AGE_SEC = 7일` 상한. Pi Browser localStorage(`X-Pi-Token`) 경로는 `tokenValidUntil`까지 유효.
- **토큰 무결성:** HMAC-SHA256 서명 + `timingSafeEqual` 상수시간 비교 (서명 위조 방어 양호). payload는 평문 base64url — 민감정보 미포함.
- **세션 폐기:** 로그아웃 시 `clearPiToken()`(localStorage) + `DELETE /api/auth/pi`(쿠키 삭제) + NextAuth `signOut()`.
- **✅ 서버 측 강제 무효화 레버 (2026-07-08 수정)**: `getUserById`·`getUserByPiUid`에 `del_yn='N'` 필터 적용 — **관리자가 계정을 비활성(`del_yn='Y'`) 처리하면 유효 토큰이라도 즉시 인증 차단**. 수정 전에는 이 두 함수에 필터가 없어 비활성 Pi 계정이 tokenValidUntil까지 인증을 통과하는 갭이 있었음(발견 즉시 수정, `src/lib/users.ts`).

**잔여 (수용 가능한 위험):**
- 개별 토큰 단위 블랙리스트(`pi_session_revoked`)는 미도입 — 로그아웃 전 탈취된 토큰은 만료(쿠키 7일/tokenValidUntil)까지 이론상 재사용 가능. 단 ① 토큰 탈취 자체가 선행돼야 하고 ② 계정 단위 차단(del_yn)으로 즉시 대응 가능하므로 Medium 위험 수용. 필요 시 도입 설계는 아래 참고.

**참고 설계 (필요 시):**
```typescript
// 세션 폐기 테이블 (블랙리스트) — token_hash만 저장(토큰 원문 저장 금지)
// CREATE TABLE pi_session_revoked (token_hash TEXT PRIMARY KEY, revoked_at TIMESTAMPTZ)
// 로그아웃 시 sha256(token) INSERT → getSessionUser에서 조회 후 무효 처리
```

---

#### SF: 세션 고정

| 항목 | 평가 |
|------|------|
| **KISA 항목** | SF: 세션 고정 공격 방지 |
| **위험도** | High |
| **판정** | ✅ **양호** |
| **근거** | |

**현황:**
- **Pi 로그인 시 토큰 갱신:**
  ```typescript
  // src/app/api/auth/pi/route.ts
  // 로그인 성공 → 새 토큰 발급 (이전 토큰 폐기)
  const newToken = sign({ userId, ...payload }, secret)
  ```

- **Google OAuth:** NextAuth가 로그인 후 새 세션 쿠키 발급

- **로그아웃:** 모든 토큰 삭제 (`clearPiToken()` + `signOut()`)

**조치:**
- ✅ 현 상태 양호 — 로그인 후 항상 새 토큰 발급

---

### 2.3 비즈니스 로직 / 파일 처리 / 정보 노출 (4개 항목)

---

#### AA: 자동화 공격 (Account Enumeration, Brute Force)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | AA: 자동화 공격 방지 |
| **위험도** | High |
| **판정** | ✅ **양호** (속도 제한 적용) |
| **근거** | |

**현황:**
- **API 속도 제한:** Vercel Edge Middleware (기본 10req/10sec, 커스텀 설정 가능)
- **민감한 엔드포인트:**
  - `/api/auth/pi`: Pi 로그인 (토큰 발급) — IP별 5회/분 제한 권고
  - `/api/payments/approve`: 결제 승인 — rate limit 적용

**조치:**
```typescript
// [권고] 관리자 로그인 속도 제한 (Redis 또는 메모리)
export async function checkRateLimit(ip: string): Promise<boolean> {
  // Upstash Redis + ratelimit npm 패키지 활용
  const { success } = await ratelimit.limit(ip)
  return success
}

// 사용 예시
const ip = getClientIp(request)
if (!(await checkRateLimit(ip))) {
  return NextResponse.json({ error: '요청 제한 초과' }, { status: 429 })
}
```

---

#### PV: 프로세스 검증 누락

| 항목 | 평가 |
|------|------|
| **KISA 항목** | PV: 업무 로직 검증 미흡 |
| **위험도** | Medium |
| **판정** | ✅ **양호** (주요 흐름 검증 적용) |
| **근거** | |

**현황:**
- **결제 프로세스:** `createPayment()` → `approvePayment()` → `completePayment()` (3단계 검증)
  - 각 단계에서 상태 확인 (transition 검증)
  - 금액·통화 일치 확인
  
- **구독 갱신:** `fn_bean_subscribe()` RPC (원자적 처리, 중복 결제 방지)

- **주문 수락:** 판매자만 수락 가능 (상점 소유권 확인)

**조치:**
- ✅ 현 상태 양호
- 향후 추가 프로세스(환불, 정산)는 이중 승인 또는 타임락 검토

---

#### FU: 파일 업로드 (File Upload)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | FU: 파일 업로드 검증 |
| **위험도** | High |
| **판정** | ✅ **양호** (Magic Byte + 격리 저장) |
| **근거** | |

**현황:**
- **이미지 업로드:**
  - 경로: `/api/store/items/images`, `/api/chat/rooms/*/upload`
  - Magic Byte 검증 (MIME 타입 확인)
  - 확장자 화이트리스트: `.png`, `.jpg`, `.webp`
  - 저장: Supabase Storage (임의의 명명, 경로 UUID)
  - 제약: 최대 5MB/파일

```typescript
// src/app/api/store/items/images/route.ts (예시)
const allowedMimes = ['image/png', 'image/jpeg', 'image/webp']
const detected = await fileTypeFromBuffer(buffer)
if (!allowedMimes.includes(detected?.mime ?? '')) {
  return error(400, '지원하지 않는 형식')
}
```

**조치:**
- ✅ 현 상태 양호
- 추가 권고: 바이러스 스캔 (ClamAV 클라우드 API)

---

#### FD: 파일 다운로드 (File Download)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | FD: 파일 다운로드 검증 |
| **위험도** | Medium |
| **판정** | ✅ **양호** (경로 검증 + 권한 확인) |
| **근거** | |

**현황:**
- **파일 다운로드:**
  - 이미지: Supabase Storage 공개 URL (CDN)
  - 첨부파일(게시판): Signed URL (시간 제한, 권한 확인)

- **경로 검증:** `safeLangPath()` 정규식 (`lang_cd` 검증)

**조치:**
- ✅ 현 상태 양호
- 민감한 파일(매출 리포트)은 **반드시 Signed URL** + 권한 확인

---

#### IL: 정보 누출 (Information Disclosure)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | IL: 불필요한 정보 노출 방지 |
| **위험도** | Medium |
| **판정** | 🔍 **추가확인필요** |
| **근거** | |

**현황:**
- **오류 메시지:** Supabase 오류 → 일반화된 메시지로 변환 (상세는 서버 로그만)
- **응답 헤더:** `X-Content-Type-Options: nosniff` 설정 완료
- **GraphQL/API 스키마 노출:** REST API만 사용 (GraphQL 미사용) → 스키마 열거 공격 낮음

**미흡점:**
- 에러 응답에서 DB 테이블명·컬럼명 노출 가능성 (검사 필요)
- 번역 API 응답에서 내부 경로 노출 검토

**조치:**
```typescript
// 오류 메시지 일반화
if (error) {
  console.error('[DB Error]', error.message)  // 서버 로그만
  return NextResponse.json(
    { error: '데이터 처리 중 오류가 발생했습니다' },  // 클라이언트
    { status: 500 }
  )
}
```

---

#### DT: 데이터 평문 전송 (Unencrypted Data Transmission)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | DT: 암호화되지 않은 전송 |
| **위험도** | High |
| **판정** | ✅ **양호** (HTTPS 강제) |
| **근거** | |

**현황:**
- **HTTPS 강제:** Vercel Pro (자동 HSTS 헤더)
  ```
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  ```

- **쿠키 보안:**
  ```typescript
  secure: true,      // HTTPS만
  httpOnly: true,    // 스크립트 접근 불가
  sameSite: 'strict'
  ```

- **토큰 전송:**
  - X-Pi-Token 헤더 (HTTPS만)
  - NextAuth 쿠키 (secure=true)

**조치:**
- ✅ 현 상태 양호
- 개발 환경: `secure: process.env.NODE_ENV === 'production'` 유지

---

### 2.4 웹 서버 설정 (4개 항목)

---

#### DI: 디렉터리 인덱싱 (Directory Indexing)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | DI: 디렉터리 목록 노출 방지 |
| **위험도** | Low |
| **판정** | ✅ **양호** |
| **근거** | |

**현황:**
- **Next.js App Router:** API 라우팅만 허용, 파일 시스템 직접 열거 불가능
- **Static 파일:** `public/` 디렉터리만 제공 (`.next/` 빌드 결과물은 비공개)

**조치:**
- ✅ 현 상태 양호 — Next.js 기본 구조가 안전

---

#### AE: 관리자 페이지 노출 (Admin Interface Exposure)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | AE: 숨겨진 관리자 페이지 노출 |
| **위험도** | Medium |
| **판정** | ✅ **양호** (인증 강제) |
| **근거** | |

**현황:**
- **관리자 페이지:** `/admin/*` (경로 고정)
- **접근 제어:** `getSessionUser()` + `isAdmin()` 필수
- **인증 없을 시:** 클라이언트 게이트 (`<NotAuthorized />`) 또는 redirect

**조치:**
- ✅ 현 상태 양호
- 추가 권고: 관리자 IP 화이트리스트 (Vercel IP Geolocation)

---

#### PL: 위치공개 (Location Disclosure)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | PL: 민감 정보 위치 노출 |
| **위험도** | Low |
| **판정** | ✅ **양호** |
| **근거** | |

**현황:**
- **소스맵:** 프로덕션 빌드에서 제외 (`.next/` 미배포)
- **환경변수:** 클라이언트 변수는 `NEXT_PUBLIC_*` prefix만 (서버 변수 자동 제외)
- **오류 페이지:** 스택 트레이스 미노출 (제네릭 메시지만)

**조치:**
- ✅ 현 상태 양호

---

#### MS: 웹 서비스 메소드 설정 (HTTP Methods)

| 항목 | 평가 |
|------|------|
| **KISA 항목** | MS: 불필요한 HTTP 메서드 활성화 |
| **위험도** | Low |
| **판정** | ✅ **양호** |
| **근거** | |

**현황:**
- **지원 메서드:** GET, POST, PUT, DELETE (필요한 것만)
- **OPTIONS:** Next.js 자동 처리 (CORS preflight)
- **TRACE, CONNECT:** 비활성 (Vercel 기본값)

**조치:**
- ✅ 현 상태 양호
- `next.config.ts`에서 명시적 제약 불필요 (Vercel 사전 설정)

---

## 3. 환경 변수 보안 (t3-env 검증)

### 3.1 서버 전용 비밀 (Server-Only Secrets)

| 변수 | 최소 길이 | 비고 |
|------|---------|------|
| `PI_SESSION_SECRET` | 32자 | Pi 토큰 HMAC 키 |
| `AUTH_SECRET` | 32자 | NextAuth JWT 서명 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase 슈퍼 권한 (클라이언트 금지) |
| `CRON_SECRET` | — | cron 핸들러 인증 (프로덕션 필수) |
| `PI_WALLET_PRIVATE_SEED` | — | Pi A2U 송금용 (선택, 미설정 시 정산 미송금) |
| `TELEGRAM_BOT_TOKEN` | — | Telegram Bot API (선택) |
| `TELEGRAM_WEBHOOK_SECRET` | — | Webhook 검증 (선택) |

### 3.2 빌드 시점 검증

```typescript
// src/env.ts 예시
export const env = createEnv({
  server: {
    PI_SESSION_SECRET: z.string().min(32),  // 32자 미만 시 빌드 실패
    CRON_SECRET: process.env.VERCEL_ENV === 'production'
      ? z.string().min(1)  // 프로덕션만 필수
      : z.string().optional(),
  },
})
```

**조치:**
- ✅ `.env.local` 값 검증 자동화
- ✅ 프로덕션 배포 전 `pnpm build` 필수 (env 체크 통과)

---

## 4. Supabase RLS 비활성화 및 대안

### 4.1 현황: RLS 비활성

**이유:**
- cafe.pi는 **모든 DB 접근을 서버에서만 수행** (클라이언트 직접 쿼리 금지)
- 행 단위 접근 제어(RLS)가 불필요 — **역할 기반 인가(RBAC)가 충분**

### 4.2 대체 보안 모델

| 계층 | 메커니즘 | 책임 |
|------|---------|------|
| **API 계층** | `getSessionUser()` + `isAdmin()` | Next.js (서버) |
| **DB 계층** | PostgREST 파라미터 바인딩 | Supabase |
| **비즈니스 로직** | RPC 함수 + 트리거 | SQL |

**코드 예시:**
```typescript
// API 엔드포인트 (권한 강제)
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  
  // 권한 확인 후만 DB 접근
  const db = getSupabaseAdmin()
  const { data } = await db.from('sys_user').select('*')
  return NextResponse.json(data)
}
```

### 4.3 권고사항

- **클라이언트 직접 쿼리 금지**: 모든 데이터 접근은 API 엔드포인트 경유
- **감시 제도**: 감사 로그로 모든 민감한 API 호출 기록
- **최소 권한 원칙**: 관리자도 필요한 기능만 (분화된 역할 검토)

---

## 5. 데이터베이스 보안 (물리삭제 금지 원칙)

### 5.1 논리삭제 (Soft Delete)

**모든 테이블 필수:**
```sql
ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS
  del_yn CHAR(1) DEFAULT 'N',
  del_dtm TIMESTAMPTZ;

-- 물리 DELETE 대신 UPDATE 사용
UPDATE {table_name} SET del_yn = 'Y', del_dtm = CURRENT_TIMESTAMP WHERE id = $1;

-- 조회 시 삭제 여부 확인
SELECT * FROM {table_name} WHERE del_yn = 'N' AND ...;
```

### 5.2 시스템 감시 컬럼

**전 테이블 필수 (4개):**
```sql
regr_id TEXT NOT NULL DEFAULT 'ADMIN',           -- 등록자
reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 등록 일시
modr_id TEXT NOT NULL DEFAULT 'ADMIN',           -- 변경자
mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP   -- 변경 일시
```

### 5.3 감시 및 감사

- **pg_trgm 인덱스:** 텍스트 검색 가속 (부분 일치)
  ```sql
  CREATE INDEX idx_mps_item_nm_trgm ON mps_item USING gin(nm gin_trgm_ops);
  ```

- **감사 로그 테이블:**
  ```sql
  CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT,
    entity_id TEXT,
    action_type TEXT,
    before_val JSONB,
    after_val JSONB,
    changed_by TEXT,
    changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
  ```

---

## 6. 우선순위별 조치 계획

### 6.1 즉시 조치 필요 (Critical) — 위험도 극대

| ID | 항목 | 상태 | 기한 |
|----|------|------|------|
| SQ | SQL 인젝션 방지 | ✅ 완료 | — |
| XS | XSS 방지 | ✅ 완료 | — |
| WI | 불충분한 인가 | ✅ 완료 | — |

### 6.2 72시간 이내 (High)

| ID | 항목 | 상태 | 기한 |
|----|------|------|------|
| WA | 불충분한 인증 | ✅ 완료 | — |
| CS | CSRF 방지 | ✅ 완료 | — |
| FU | 파일 업로드 | ✅ 완료 | — |
| DT | 데이터 암호화 전송 | ✅ 완료 | — |

### 6.3 30일 이내 (Medium)

| ID | 항목 | 현황 | 조치 |
|----|------|------|------|
| IE | 세션 만료 | 🔍 추가확인 | 세션 블랙리스트 테이블 검토 |
| IL | 정보 누출 | 🔍 추가확인 | 오류 메시지 감시 |
| AA | 자동화 공격 | ✅ 완료 | 민감 엔드포인트 rate limit 확인 |
| MC | 악성 콘텐츠 | 🔍 추가확인 | 바이러스 스캔 API 평가 |

### 6.4 90일 이내 (Low)

| ID | 항목 | 조치 |
|----|------|------|
| OC | OS 명령 실행 | 신기능 추가 시 점검 |
| WP | 약한 패스워드 | 기본 인증 추가 시만 |
| WR | 패스워드 복구 | 기본 인증 추가 시만 |
| SP | 세션 예측 | 현 상태 유지 |
| SF | 세션 고정 | 현 상태 유지 |
| PV | 프로세스 검증 | 신규 비즈니스 로직 추가 시 |

---

## 7. 체크리스트

### 7.1 개발 시 필수 확인

- [ ] 모든 API 엔드포인트에 `getSessionUser()` 호출 있는가?
- [ ] 관리자 기능에 `isAdmin(user)` 검증이 있는가?
- [ ] 사용자 입력은 `{변수}` JSX로 이스케이프되는가?
- [ ] 파일 업로드는 Magic Byte 검증이 있는가?
- [ ] DB 쿼리는 PostgREST 메서드로 파라미터 바인딩되는가?
- [ ] 물리 DELETE가 아닌 논리삭제(`del_yn`)를 사용하는가?

### 7.2 배포 전 체크리스트

- [ ] `pnpm build` 통과 (env 검증)
- [ ] `PI_SESSION_SECRET` 32자 이상, 무작위 문자열인가?
- [ ] `AUTH_SECRET` 32자 이상, 무작위 문자열인가?
- [ ] `SUPABASE_SERVICE_ROLE_KEY`가 환경 변수에만 설정되는가?
- [ ] `npm audit --audit-level=high` 통과하는가?
- [ ] HTTPS (Vercel Pro) 확인
- [ ] `X-Content-Type-Options: nosniff` 헤더 설정 확인

### 7.3 운영 중 정기 점검

- **월 1회:** 의존성 취약점 검사 (`npm audit`)
- **분기 1회:** API 로그 감시 (비정상 접근 패턴)
- **분기 1회:** 세션 토큰 갱신 정책 검토 (만료 조정)
- **반년 1회:** 보안 요구사항 갱신 (KISA 가이드 개정 대응)

---

## 8. 참고 문서

### 한국 공공기관 기준
- 행정안전부 「웹 취약점 점검 항목」 (2020년판)
- KISA 「주요정보통신기반시설 기술적 취약점 분석·평가 방법 상세가이드」 (2021.03)

### 국제 표준
- OWASP Top 10 2021: https://owasp.org/Top10/
- CWE-79 (XSS), CWE-89 (SQLi), CWE-287 (인증 실패): https://cwe.mitre.org/

### 프로젝트 문서
- `CLAUDE.md`: 아키텍처 기본 가이드
- `docs/PRD_1_OVERVIEW.md`: 기능 개요
- `docs/da/데이터표준규칙.md`: DB 명명 규칙

### 외부 자료
- Next.js 16 보안: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
- Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- Pi Network 공식 가이드: https://developers.pi-ecosystem.com/

---

## 9. 부록: cafe.pi 특수 보안 사항

### 9.1 Pi Browser 대응 (쿠키 미저장)

**문제:** Pi Browser는 Set-Cookie를 저장하지 않음

**해결책:**
1. 쿠키 (일반 브라우저) + X-Pi-Token 헤더 (Pi Browser) 이중 경로
2. `piFetch()` 클라이언트 함수로 자동 헤더 첨부
3. `getSessionUser()`이 쿠키 우선, 헤더 폴백 검증

**코드:**
```typescript
// 클라이언트: X-Pi-Token 헤더 자동 첨부
export function piFetch(input: string, init: RequestInit = {}) {
  const token = getPiToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('X-Pi-Token', token)
  return fetch(input, { ...init, headers, credentials: 'include' })
}

// 서버: 헤더 검증
const piToken = headerStore.get('x-pi-token') ?? cookieStore.get('pi_session')?.value
```

### 9.2 클라이언트 게이트 패턴 (Pi Browser 무한 루프 방지)

**문제:** `getSessionUser()` null 시 `redirect()` 호출 → Pi Browser에서 무한 루프

**해결책:** 클라이언트 컴포넌트에서 `<NotAuthorized />` 렌더 (redirect 금지)

**코드:**
```tsx
// ❌ 위험: redirect 호출 금지
if (!user) redirect('/login')

// ✅ 안전: 클라이언트 게이트
if (!user) return <ClientChatRoom roomId={roomId} />
```

### 9.3 NextAuth v5 beta 사용

**주의:**
- JWT 세션 전용 (DB 세션 미지원)
- Google OAuth만 지원 (다른 제공자는 별도 구현)
- 쿠키명: `authjs.session-token` (기본값, 변경 권장 → 난독화)

---

## 10. 버전 이력

| 일시 | 버전 | 변경 사항 |
|------|------|---------|
| 2026-06-23 | 2.0 | **현행화**: Pi Browser + piFetch + getSessionUser() 아키텍처 반영, KISA 21개 항목 완전 재정비 |
| 2026-06-03 | 1.0 | 초판 (구형 아키텍처: proxy.ts 기반) |

---

**문서 최종 검토:** 2026-06-23  
**다음 갱신 예정:** 2026-09-23 (분기 검토)  
**작성자:** Security Auditor (Claude Code)
