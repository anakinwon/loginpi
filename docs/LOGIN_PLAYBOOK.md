# LOGIN PLAYBOOK — .pi 사이트 로그인 처리 표준 (모든 사이트 공통, 착수 첫날에 읽는다)

> 작성 2026-10-11 · 적용 : cafe.pi(원형)·sitemap.pi(1호, 구현 완료)·이후 17개 사이트
> 상위 : `ROADMAP_MULTISITE.md` §4 L3(Playbook) · 규칙 정본 : 루트 `CLAUDE.md` 인증 절 · `PRD_28_PI_MULTISITE.md` §1.1
> **교훈(2026-10-11 마스터)** : "프로젝트 시작의 기본은 로그인 처리다." 1호에서 로그인 결정에 하루를 썼다. 이 문서는 그 하루를 **30분**으로 줄이기 위한 것이다.

## 0. 30초 결정 트리 — 새 사이트는 여기서 시작

```
Q1. 사용자가 Pi Browser 에서 들어오는가?            → 항상 예. ① Pi SDK 로그인은 모든 사이트 필수(핵심가치 1)
Q2. 일반 브라우저(PC·일반 모바일)도 지원하는가?       → 예면 ② Pi Sign-In(OAuth) 추가. Portal 에 Client ID 1개 + Redirect URI 등록이 전부
Q3. 기존 Pi 사용자를 **Pi Browser 없이**(PC Google 계정으로) 로그인시킬 것인가? → 예면 ③ Google + Pi 계정 연동. ⚠ Pi 계정 없는 사용자는 어떤 경로로도 가입 불가(R6)
Q4. 결제가 있는가?                                     → Pi Browser 에서만. 로그인 경로와 무관하게 Pi SDK 결제 (Google 세션은 결제 불가)
```

| 경로 | 어디서 | 사용자 식별 | 사이트당 설정 | 코드 |
|---|---|---|---|---|
| ① Pi SDK | Pi Browser | `pi_username`(불변 키) + 앱별 `pi_uid` | Developer Portal 앱 2개(testnet·mainnet) | `@pi/auth` 호출 배선 2파일(`api/auth/pi/route.ts`·`lib/auth.ts`, ≈60줄) — 로직 0줄 |
| ② Pi Sign-In(OAuth) | 일반 브라우저 | 같음(`/v2/me` 검증 → 같은 `/api/auth/pi`) | Portal → Pi Sign-In → Client ID + Redirect URI | 1호 코드 복사(M1 승격 후 0줄) |
| ③ Google + 연동 | 일반 브라우저 | Google sub ↔ `sys_user` 매핑(`sys_usr_auth_lnk`) | Google Cloud OAuth 클라이언트 + `AUTH_SECRET` + DDL 003 | 1호 코드 복사(M1 승격 후 0줄). **마스터 예외 승인 2026-10-11**(PRD_28 §1.1-2 "Pi 외 로그인 금지"의 예외, sitemap.pi 적용, 근거 `sql/003` 헤더 DA-APPROVED). PRD_28 §1.1-2 개정 필요 [TBD], 등재 심사 A-4 리스크는 pi-mainnet-listing-auditor 재점검 대상 |

세 경로 모두 **서버 세션은 하나** : `getSessionUser()` 가 Pi 쿠키 → `X-Pi-Token` 헤더 → Google(NextAuth) 순으로 사용자를 돌려준다. API 는 어느 경로로 로그인했는지 모른다(알 필요도 없다).

## 1. 절대 규칙 7개 (위반 = 장애, 전부 실사고에서 나옴)

| # | 규칙 | 이유·사고 |
|---|---|---|
| R1 | Pi Browser 는 `Set-Cookie` 를 저장하지 않는다 → 인증 API 는 **쿠키 OR `X-Pi-Token` 헤더** 둘 다 받고, 클라이언트는 `fetch` 대신 **`piFetch`**(예외 : 세션 발급 전 호출·공개 API 는 `fetch` 허용, 주석으로 명시) | "PC 정상·Pi Browser 만 401" = `fetch('/api/` 잔존(cafe 63건 사고) |
| R2 | `getSessionUser()` 가 null 일 때 **서버 `redirect` 금지** → 클라이언트 게이트(`LoginGate`) 렌더 | Pi Browser 무한 루프 |
| R3 | **UA(`navigator.userAgent`)로 Pi Browser 를 판정·사전 차단하지 않는다**. 신뢰 신호는 `window.Pi.authenticate()` 성공뿐 | 실기기 UA 가 패턴과 달라 전체 로그인 붕괴(8bf8752) |
| R4 | 사람의 불변 키는 **`pi_username`**. `pi_uid` 는 (앱 × 네트워크) scoped — 영구 식별자·사이트 간 대조 금지 | sandbox 플립·앱 교체 시 uid 전원 재발급(2026-07-02) |
| R5 | 토큰은 서버가 **`/v2/me` 로 재검증**한 뒤에만 세션 발급. 클라이언트가 보낸 username·uid 를 믿지 않는다 | 토큰 위조·계정 탈취 |
| R6 | Google 만으로 **신규 계정을 만들지 않는다**. 반드시 Pi 계정(Pi Browser 로그인)에 연동 | Pi 외 로그인 레드라인(A-4) 최소화, 유령 계정 방지 |
| R7 | 인증 변경은 **Pi Browser 실기기 검증 전엔 완료가 아니다**(팀장 판정 최대 CONDITIONAL) | 데스크톱에서 재현 불가한 WebView 차이 |

## 2. 사이트 1개 로그인 세팅 — 순서·예산 (목표 30분 + 실기기 10분)

| 순서 | 할 일 | 어디서 | 예산 | 산출값 → 저장처 |
|---|---|---|---|---|
| 1 | Developer Portal 앱 등록 **2개**(testnet·mainnet). 앱 URL = 접속 도메인(스테이징은 Vercel 도메인 — 등록 가능 여부 [확인중 : Pi Developer Portal]) | Pi Browser → `develop.pi` | 10분 | API Key → `PI_API_KEY`(결제용) / 도메인 검증 키 → `PI_DOMAIN_VALIDATION_KEY` |
| 2 | (경로 ②) 앱 → **Pi Sign-In** → oAuth Client ID 복사, Redirect URI 등록 : `http://localhost:<port>/auth/pi/callback`, `https://<도메인>/auth/pi/callback`. ⚠ 호스트는 **앱 도메인 + 루프백만**(스테이징 Vercel 도메인 등록 불가 — 루트 CLAUDE.md) → 경로 ② 는 운영·localhost 한정 | 같은 화면 | 3분 | `NEXT_PUBLIC_PI_OAUTH_CLIENT_ID` |
| 3 | (경로 ③) Google Cloud Console → OAuth 클라이언트(웹) → 리디렉션 URI `https://<도메인>/api/auth/callback/google`·`http://localhost:<port>/api/auth/callback/google` | console.cloud.google.com | 5분 | `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET` + `AUTH_SECRET`(랜덤 48바이트) + `NEXT_PUBLIC_GOOGLE_LOGIN=1` |
| 4 | 세션 서명 키 생성(환경별 다른 값) | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` | 1분 | `PI_SESSION_SECRET` |
| 5 | 관리자 지정 — 운영자 Pi 사용자명(+ 첫 로그인 후 이 앱 기준 uid) | `.env.local`·Vercel env | 2분 | `ADMIN_PI_USERNAMES`, `ADMIN_PI_UIDS`(운영 필수) |
| 5-1 | **DB 자격증명 + 노출** — tier 와 접두 일치(`APP_TIER=dev` ↔ `DEV_SUPABASE_URL`·`DEV_SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SCHEMA=<site>_dev`), Supabase → Settings → Data API → **Exposed schemas** 에 비운영 스키마 추가(누락 = `PGRST106` 503) | Supabase 대시보드·`.env.local` | 5분 | `*_SUPABASE_*`·`SUPABASE_SCHEMA` |
| 6 | (경로 ③) DDL 적용 — **모노레포 루트**(`$WORKSPACE_ROOT/loginpi`)에서 `node scripts/db-migrate.mjs --app <site> --tier dev`(비운영 다른 tier 는 `--db-url`). 선행 `000_baseline`→001→002 적용 필수(`fn_grant_svc_only` 의존). `sys_usr_auth_lnk`·`sys_auth_lnk_cd`(sitemap `sql/003` 복사) | 루트 | 2분 | `schema_migrations` 에 003 |
| 6-1 | **메시지 키 복사** — `messages/{ko,en}.json` 의 `auth`(11)·`link`(15)·`piOAuth`(5) 블록(없으면 next-intl MISSING_MESSAGE 로 게이트 전체 실패) → `pnpm validate:locales` | 사이트 `messages/` | 1분 | 번역 31키 |
| 7 | 로컬 기동 → §5 실패 신호 사전으로 1차 점검 | `pnpm dev` | 5분 | — |
| 8 | **Pi Browser 실기기** : 로그인 → 재로그인 → 관리자 메뉴 노출 → (경로 ③) 연동 코드 발급 → PC Google 로그인 → 코드 입력 → PC 에서 같은 계정 확인 | 실기기 + PC | 10분 | HANDOFF/ROADMAP 에 "실기기 검증 ✅ 날짜" |

> 1~3 은 사람만 할 수 있다(자동화 불가). 4~7 은 M1 `new-site.mjs` 가 생성·검사한다(ROADMAP_MULTISITE §4 L1). 예산(분)은 **목표치**이며 1호 실측은 아니다.

## 3. 구성 요소 — 어디에 무엇이 있나 (sitemap.pi 기준, M1 에서 `@pi/auth` 로 승격 예정)

### 3-1. 서버

| 역할 | 파일 | 요점 |
|---|---|---|
| Pi 세션 발급 | `@pi/auth` `route.ts` → 사이트 `src/app/api/auth/pi/route.ts` | `accessToken` → `/v2/me` → `upsertPiUser` → HMAC 토큰을 **쿠키 + JSON `token`** 둘 다 반환 |
| 통합 세션 조회 | `src/lib/auth.ts` `getSessionUser(req?)` | Pi(쿠키→헤더) 우선, 없으면 `auth()`(NextAuth) → `session.user.id` 로 `sys_user` 조회. **null 이면 redirect 금지** |
| Pi 전용 조회 | 같은 파일 `getPiSessionUser` | "Pi Browser 로그인 자체가 조건"인 API(연동 코드 발급)에서 사용 |
| Google 설정 | `src/auth.ts` | NextAuth v5 beta.31, `trustHost: true`, jwt 전략. `jwt` 콜백이 Google sub → `sys_usr_auth_lnk` → `userId`. 미연동이면 `userId=null`(계정 생성 없음) |
| NextAuth 핸들러 | `src/app/api/auth/[...nextauth]/route.ts` | env 3종 없으면 404(세션 폴링 500 방지) |
| 현재 사용자 | `GET /api/auth/me` | 통합 사용자 또는 `{user:null}`(200) — 클라이언트 게이트가 Google 경로에서 사용 |
| 연동 코드 발급 | `POST /api/auth/link-start` | **Pi 세션 필수**. 6자리·10분·사용자당 활성 1개 |
| 연동 완료 | `POST /api/auth/link-complete {code}` | **Google 세션(미연동) 필수**. 코드 검증 → `sys_usr_auth_lnk` 생성 → 코드 사용 처리 |
| 역할 게이트 | `src/lib/api.ts` `requireUser`·`requireAdmin` | `getSessionUser` 한 번 — 경로 무관 |

### 3-2. 클라이언트

| 역할 | 파일 | 요점 |
|---|---|---|
| Pi 세션 컨텍스트 | `@pi/auth/client` `PiAuthProvider`·`usePiAuth` | SDK authenticate → `/api/auth/pi` → `localStorage('pi_token')` |
| Google 세션 | `next-auth/react` `SessionProvider`(layout) | 미설정 환경은 404 → `status:'unauthenticated'` |
| **통합 훅** | `src/components/google-auth.tsx` `useAppUser()` | `{ user, source:'pi'|'google', isLoading, googleUnlinked, refreshGoogle }` — 게이트·헤더·관리 메뉴는 전부 이 훅만 본다 |
| Pi 로그인 핸들러 | `src/components/login-gate.tsx` `usePiLogin()` | SDK `signIn()` 3초 race → 실패 시 `startPiOAuth()`(Client ID 있을 때). **UA 분기 없음** |
| 게이트 | 같은 파일 `LoginGate` | user → children / Google 미연동 → `LinkCodeForm` / 없음 → Pi 버튼 + Google 버튼 |
| OAuth 콜백 | `src/app/[locale]/auth/pi/callback/page.tsx` | 프래그먼트 토큰 → `/api/auth/pi` POST. state 는 성공 시만 소거, 모듈 변수 1회 가드 |
| 연동 UI | `google-auth.tsx` `PiLinkCodeIssuer`·`LinkCodeForm`, `link-panel.tsx`, `/link` 페이지 | 세션 종류별 자동 분기 |
| 헤더 | `auth-status.tsx` | 통합 사용자명 / "Pi 계정 연동 필요" / 로그인 버튼 2종 |
| 메시지 키 | `messages/ko.json`·`en.json` `auth`·`link`·`piOAuth`·`apiErrors.{AUTH_GOOGLE_REQUIRED,LINK_*}` | 컴포넌트와 **한 세트** — 파일만 복사하면 MISSING_MESSAGE |

### 3-3. DB (DA 표준, `sql/003_sitemap_auth_link.sql`)

| 테이블 | 역할 | 핵심 제약 |
|---|---|---|
| `sys_user`(baseline) | 사람 1행 — `pi_usr_nm` 불변 키, `pi_uid` 앱별 | 활성 `pi_usr_nm` UNIQUE |
| `sys_usr_auth_lnk` | 외부인증 ↔ 사용자 (`prvd_cd='GOOGLE'`, `prvd_sub_txt`=sub) | (prvd, sub) 활성 UNIQUE — 타인 계정에 같은 Google 불가 / (usr, prvd) 활성 UNIQUE |
| `sys_auth_lnk_cd` | 연동 코드 (발급자 `usr_id`, `exp_dtm`, `use_dtm`) | 미사용 활성 코드 값 UNIQUE, `^[0-9]{6}$` |

이메일은 **매칭 키가 아니다**(참고 저장만). cafe.pi 가 이메일 매칭을 쓰다 겪은 오염·탈취 방어 코드(`src/auth.ts` 의 `claimable` 필터, 주석 "🔒 계정 탈취 방어")를 처음부터 피한다.

## 4. 환경변수 한 장

| 변수 | 경로 | 필수 | 비고 |
|---|---|---|---|
| `PI_SESSION_SECRET` | ① | ✅ | 32자 이상, 환경별 다른 값 |
| `NEXT_PUBLIC_APP_URL` | 공통 | ✅ | Origin 검사(`withAuthGuard`) |
| `NEXT_PUBLIC_PI_SANDBOX` | ① | 스테이징 `true` | localhost 는 자동 sandbox |
| `PI_API_KEY` | 결제 | Phase 2 | 로그인엔 불필요 |
| `ADMIN_PI_USERNAMES` / `ADMIN_PI_UIDS` | ① | 운영 시 둘 다 | uid 없이 username 만 있으면 운영 빌드 실패(설계) |
| `NEXT_PUBLIC_PI_OAUTH_CLIENT_ID` | ② | 선택 | 없으면 버튼이 SDK 만 시도 |
| `AUTH_SECRET`·`GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET` | ③ | 셋 다 또는 전부 없음 | 일부만 있으면 빌드 env 검증 실패(설계). 운영에 `AUTH_URL` 두지 말 것(host 자동 감지) |
| `NEXT_PUBLIC_GOOGLE_LOGIN` | ③ | `1` | 클라이언트 버튼 노출 |
| `APP_TIER`·`DEV_SUPABASE_URL`·`DEV_SUPABASE_SERVICE_ROLE_KEY`(또는 `STAGING_*`)·`SUPABASE_SCHEMA` | 세션 조회 전제 | 비운영 필수 | 운영 폴백 없음 — 미설정은 전 API 503 `DB_UNAVAILABLE` |

## 5. 실패 신호 사전 — 증상에서 조치로 (5열)

| 증상(그대로 복사해 검색) | 어디서 | 원인 | 조치 | 출처 |
|---|---|---|---|---|
| PC 정상, **Pi Browser 만 401** | 특정 API | `fetch('/api/` 잔존 — 쿠키 없는 WebView 는 헤더가 없으면 무인증 | `grep -rn "fetch('/api/" src` → `piFetch` 교체 | cafe 0d7aa24b |
| 로그인 후 같은 페이지로 **무한 리다이렉트** | Pi Browser | 서버 컴포넌트가 `getSessionUser()` null 에 `redirect()` | 클라이언트 게이트로 교체 | R2 |
| 실기기에서 "Pi로 로그인" 눌러도 아무 일 없음 | Pi Browser | UA 로 사전 차단 / `window.Pi` 없음(SDK 스크립트 미로드) | UA 분기 제거, `PiSdkScript` 가 body 안에 있는지 | 8bf8752 |
| `403 AUTH_PI_ACCOUNT_CONFLICT` | `/api/auth/pi` | 다른 Pi 앱 토큰(uid 다름)의 같은 username, 또는 sandbox 플립 | 이 앱의 Portal 앱으로 로그인했는지 확인. 정당하면 DB `pi_uid` 수동 갱신(HANDOFF) | R4 |
| `503 DB_UNAVAILABLE`, 로그 `[db] PGRST106` | 모든 DB API | Supabase Data API **Exposed schemas** 에 비운영 스키마 미등록 | 대시보드 → Settings → Data API → `sitemap_dev`,`sitemap_stg` 추가 | 2026-10-11 |
| `503 DB_UNAVAILABLE`, 로그에 `[db]` 줄 없음 | 비운영 | tier 자격증명 누락(`APP_TIER=dev` 인데 `DEV_SUPABASE_*` 없음 — 운영 폴백 없음) | tier 와 `*_SUPABASE_*` 접두 일치, 키 이름 오타(`TAGING_`) | 2026-10-11 |
| OAuth 뒤 "로그인 요청을 확인할 수 없습니다"(stateMismatch) | 콜백 | state 10분 만료 / 다른 탭·브라우저에서 콜백 도착 / 성공 전 state 소거 | 같은 브라우저에서 재시도. 코드가 `peek` 후 성공 시만 `clear` 인지 | cafe 2026-07-08 |
| Pi 인가 페이지에서 `redirect_uri mismatch` | accounts.pinet.com | Portal 등록 URI 와 글자 단위 불일치(포트·locale 접두·슬래시) | 등록값 = `origin + /auth/pi/callback`(locale 접두 없음) | 2026-10-11 |
| Pi Browser 안에서 OAuth 버튼 → 안내만 뜨고 막힘 | Pi Browser | Pi 인가 페이지는 Pi Browser 내 미지원 | 버튼은 SDK 선시도 → 실패 시만 OAuth(`usePiLogin`) — 순서 확인 | cafe |
| Google 로그인됐는데 보호 API 401, 헤더엔 "Pi 계정 연동 필요" 링크 | 일반 브라우저 | 세션 `user.id=''`(미연동) — 설계상 정상 | `/link` 에서 연동 코드 입력 | R6 |
| Google 버튼 눌러도 반응 없음 / `/api/auth/session` 404 | 일반 브라우저 | env 3종 중 하나 없음 → 핸들러가 404 | `AUTH_SECRET`·`GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET` 셋 다 + 재시작 | 설계 |
| 운영에서 헤더는 로그인인데 본문·API 는 비로그인("헤더 O·본문 X") | Vercel | `auth()` 가 `X-Forwarded-Host` 불신 / `AUTH_URL` 이 실제 도메인과 다름 | `trustHost: true` 확인, 운영 `AUTH_URL` 제거 | cafe auth.ts |
| `400 LINK_CODE_INVALID` | link-complete | 10분 만료 / 재발급으로 이전 코드 폐기 / 오타 | Pi Browser 에서 재발급 후 즉시 입력 | 설계 |
| `409 LINK_ALREADY_LINKED` | link-complete | 이 Google 이 이미 다른 사용자에 연동, 또는 이 사용자가 이미 Google 연동 | 의도된 차단. 본인 확인 후 DB 에서 기존 연동 `del_yn='Y'` | 설계 |
| 빌드 실패 `ADMIN_PI_UIDS 도 필수` | 운영 빌드 | 운영 tier 에서 username 만 설정 | 첫 로그인 후 `sys_user.pi_uid` 확인해 등록 | KISA 2026-10-09 |
| 빌드 실패 `Google 로그인은 … 세 값을 함께` | 빌드 | env 일부만 설정 | 셋 다 넣거나 셋 다 비움 | 설계 |
| `tsc` : `token.googleSub` 가 `{}` | 개발 | `next-auth/jwt` 가 `@auth/core/jwt` 재수출이라 pnpm 격리에서 모듈 보강 미적용 | 콜백 안에서 로컬 타입(`LinkJwt`)으로 좁힘 | 2026-10-11 |

## 6. 완료 체크리스트 (실기기 — 이걸 다 통과해야 "로그인 됨")

- [ ] Pi Browser : 첫 로그인(가입) → 앱 재시작 후 재로그인(localStorage 토큰) → 헤더 계정명
- [ ] Pi Browser : 관리자 계정 → `role=ADMIN` 승격 → 관리 메뉴 노출 → 관리자 API 200
- [ ] Pi Browser : 로그아웃/만료 후 보호 페이지 → 게이트 렌더(리다이렉트 없음)
- [ ] 일반 브라우저(②) : "Pi로 로그인" → 3초 후 Pi QR 페이지 → 폰 스캔 → Allow → 콜백 → 원래 페이지 복귀·계정명
- [ ] 일반 브라우저(③) : Google 로그인 → "Pi 계정 연동 필요" → Pi Browser 코드 발급 → 입력 → 같은 계정명 → 보호 API 200
- [ ] 일반 브라우저(③) : Google 로그아웃 → 다시 Google 로그인 → 코드 없이 바로 연동 계정
- [ ] 공개 API 응답에 비공개 필드 없음, **인증 필요 API 의** `fetch('/api/` 0건(허용 예외 3종 — 세션 발급 전 OAuth 콜백·Google 전용 `/api/auth/me` 조회·비인증 `/api/stat` 전송 — 은 주석으로 근거 표기), `redirect(` on null user 0건
- [ ] 결과를 사이트 ROADMAP/HANDOFF 에 날짜와 함께 기록

## 7. 자주 하는 질문

- **Google 로그인 사용자는 결제할 수 있나?** 아니오. 결제는 Pi SDK(Pi Browser)만. Google 세션은 조회·등록 등 일반 기능용.
- **cafe.pi 의 Client ID 를 다른 사이트에 쓰면?** Redirect URI 호스트가 달라 Pi 가 거부. 사이트마다 자기 앱의 Client ID.
- **왜 이메일로 매칭하지 않나?** 이메일은 바뀌고, 검증 안 된 이메일은 탈취 통로. sub 가 Google 의 불변 식별자.
- **허브 SSO 로 사이트별 설정을 없앨 수 없나?** PRD_28 §1.1-1·§7 과 충돌. Section 4 해석 회신 후 재검토(ROADMAP_MULTISITE M5).
- **sitemap.pi 코드를 그대로 복사해도 되나?** M1 전까지는 예(§3 파일 목록). M1 이후엔 `@pi/auth` import 로 대체되므로 복사본을 남기지 말 것.

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-11 | 최초 작성 — 결정 트리, 절대 규칙 7, 세팅 순서·예산, 구성 요소(서버·클라이언트·DB), env 표, 실패 신호 사전 17항목, 완료 체크리스트, FAQ. sitemap.pi 로그인 통합(Pi SDK + Pi OAuth + Google 연동) 구현과 동시 작성 |
