# 멀티테넌트 환경설정 안내서 (ENV_GUIDE)

> 환경변수를 **어디서 구하고, 어디에 넣고, 시스템끼리 같아야 하는지**를 한곳에 모은 정본이다. 2026-10-24 마스터 요청으로 만들었다.
> 환경변수에 대해 궁금하면 이 문서를 먼저 본다. 여기 없는 내용은 확인한 뒤 **이 문서에 추가**한다(5절 질의 이력).
> 값 자체는 이 문서에 적지 않는다. 실제 값은 루트 `.env.multi`에 모여 있다. 이 파일은 비밀값이 들어 있어 git에서 제외된다(`.gitignore`의 `.env*`).

## 1. 파일 지도 — 무엇이 어디에 있나

| 파일 | 내용 | git |
|---|---|---|
| `.env.multi` (루트) | 세 시스템의 값을 한 파일에 모은 참조용 파일. 앱은 이 파일을 읽지 않는다 | 제외 |
| `.env.local` (각 앱 폴더) | 로컬 개발·스테이징에서 실제로 쓰는 값. 앱 폴더는 cafe.pi = 루트, 나머지 = `sitemap/<도메인>/` | 제외 |
| `.env.example` (각 앱 폴더) | 키 이름과 설명만 들어 있는 템플릿 | **커밋** |
| `.env.vercel-prod` (신규 앱 폴더) | 생성기가 만든 운영 Vercel 등록용 값. 등록한 뒤에도 보관한다 | 제외 |
| `src/env.ts` (각 앱) | 빌드할 때 검사하는 키 목록. 키를 추가하면 `.env.example`과 함께 고친다 | 커밋 |
| **Vercel 프로젝트 env** | **운영 값의 정본**. 로컬 파일과 값이 다를 수 있다 | — |

**명령**

```bash
node scripts/tenant-env.mjs multi                    # 모든 앱 .env.local → .env.multi 다시 만들기
node scripts/tenant-env.mjs new yea.pi --port 3005   # 신규 테넌트 설정 한 세트 만들기(4절)
```

## 2. 시스템별 개요

| 시스템 | 앱 폴더 | 운영 URL | Vercel 프로젝트(운영 브랜치) | 로컬 |
|---|---|---|---|---|
| cafe.pi | 루트 | https://cafepi.vercel.app | cafe (`production`) · 스테이징 loginpi (`master`, https://loginpi.vercel.app) | :3000 |
| sitemap.pi | `sitemap/sitemap.pi` | [확인중] | sitemaps (`prod/sitemap`) · 스테이징 https://sitemapst.vercel.app | :3001 |
| schema.pi | `sitemap/schema.pi` | https://schem.vercel.app | schema (`prod/schema`) | :3002 |
| seminar.pi | `sitemap/seminar.pi` | 없음(미배포) | 없음 — 예정 `prod/seminar` | :3003 |

**같아야 하는 값과 달라야 하는 값** (2026-10-24 실측)

| 구분 | 키 |
|---|---|
| **세 시스템이 같은 값** | `MON_INGEST_KEY`(보내는 쪽과 받는 쪽이 같은 값으로 비교), `MON_INGEST_URL`(= schema.pi 운영 `/api/mon/ingest`), `ADMIN_PI_USERNAMES` |
| 공유해도 되는 값 | `ANTHROPIC_API_KEY`·`GEMINI_API_KEY`·`GITHUB_TOKEN`(계정 단위 키) |
| **시스템마다 달라야 하는 값** | `PI_API_KEY`·`PI_WALLET_*`·`NEXT_PUBLIC_PI_APP_DOMAIN`(Pi 포털 앱마다 발급), `GOOGLE_CLIENT_ID`·`SECRET`(앱마다 OAuth 클라이언트), `AUTH_SECRET`·`PI_SESSION_SECRET`·`CRON_SECRET`(세션 위조를 막으려고 앱마다, 환경마다 따로) |
| 비운영 DB 공유 | sitemap.pi·schema.pi·신규 앱의 dev·stg는 Supabase 프로젝트 **pi-nonprod** 하나를 같이 쓰고 `SUPABASE_SCHEMA`(`<앱>_dev`·`<앱>_stg`)로 나눈다. 운영은 앱마다 Supabase 프로젝트가 따로 있다 |

## 3. 키별 구하는 곳

### 3.1 직접 만드는 비밀키 — 포털 없이 명령 한 줄

`AUTH_SECRET` · `PI_SESSION_SECRET` · `CRON_SECRET` · `MON_INGEST_KEY`(처음 한 번만 만들고 세 시스템에 같은 값) · `SITEMAP_VERIFY_SECRET` · `MEDIA_TOKEN_SECRET`(seminar.pi — 앱과 Galápagos 엔진에 같은 값)

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

생성기(`tenant-env.mjs new`)는 이 값들을 자동으로 만든다. **로컬과 운영은 서로 다른 값**을 쓴다.

### 3.2 Pi Developer Portal — Pi 인증·결제

- **여는 곳**: Pi Browser 앱 → 주소창에 `develop.pi` → **Develop** → 내 앱 선택. 테스트넷 앱과 메인넷 앱은 따로 있어서 값도 각각 다르다.

| 키 | 포털 위치 |
|---|---|
| `PI_API_KEY` | 앱 화면 → **API Key** → Generate(한 번만 표시되니 바로 복사) |
| `PI_WALLET_ADDRESS` · `PI_WALLET_PRIVATE_SEED` | 앱 화면 → **App Wallet**(지갑을 연결하거나 만들 때 받는 주소와 시드, A2U 지급용) |
| `NEXT_PUBLIC_PI_APP_DOMAIN` | 앱 화면 맨 위 **Open app** 주소(예: `https://schem9973.pinet.com/`) |
| `PI_DOMAIN_VALIDATION_KEY` | 앱 체크리스트 → **도메인 검증(Verify domain)** 단계에 나오는 키(앱의 `/validation-key.txt`로 서빙) |
| `NEXT_PUBLIC_PI_OAUTH_CLIENT_ID` | 앱 화면 → **Pi Sign-In** → Client ID. 콜백 `<앱URL>/auth/pi/callback`을 정확히 같게 등록한다(선택 — 없으면 SDK 로그인만 쓴다) |
| `NEXT_PUBLIC_PI_SANDBOX` | 포털 값이 아니다. 테스트넷·스테이징·로컬 = `true`, 메인넷 운영 = `false` |

### 3.3 Google Cloud Console — Google 로그인

- **여는 곳**: https://console.cloud.google.com/apis/credentials → 상단에서 프로젝트 선택
- `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET` 발급 순서:
  1. 처음 쓰는 프로젝트면 **OAuth 동의 화면**(Google 인증 플랫폼 → 브랜딩·대상)을 먼저 설정한다(앱 이름·지원 이메일·외부 사용자).
  2. **+ 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**, 애플리케이션 유형 **웹 애플리케이션**.
  3. **승인된 JavaScript 원본**: `http://localhost:<포트>`(운영은 운영 도메인을 추가).
  4. **승인된 리디렉션 URI**: `<앱URL>/api/auth/callback/google`(로컬 예 `http://localhost:3003/api/auth/callback/google`).
  5. **만들기** → 팝업의 **클라이언트 ID**·**클라이언트 보안 비밀번호**를 복사한다(보안 비밀번호는 나중에 다시 볼 수 없을 수 있으니 바로 `.env.local`에).
  - 앱마다 클라이언트를 따로 만든다(2절 — 시스템마다 달라야 하는 값).
- `NEXT_PUBLIC_GOOGLE_LOGIN=1`이면 Google 로그인 버튼이 보인다.

### 3.3.1 설정값·로그인 후 얻는 값

| 키 | 정하는 법 |
|---|---|
| `NEXT_PUBLIC_APP_URL` | 로컬 `http://localhost:<포트>`, 운영은 운영 도메인 |
| `NEXT_PUBLIC_PI_SANDBOX` | testnet·스테이징·로컬 `true`, 메인넷 운영 `false` |
| `APP_TIER` | `dev`·`staging`·`prod`(비우면 `VERCEL_ENV`로 판정) |
| `STAGING_DB_TARGET` | 스테이징에서 운영 DB를 읽기 전용으로 볼 때만 `prod-ro` |
| `ADMIN_PI_UIDS` | 관리자가 해당 앱(메인넷)에 Pi 로그인한 뒤 Supabase Table Editor → `sys_user`의 `pi_uid`. 앱·네트워크마다 값이 다르다 |

### 3.4 Supabase — DB

- **여는 곳**: https://supabase.com/dashboard → 프로젝트 선택
  - 운영 = 앱 전용 프로젝트
  - 비운영 = pi-nonprod 프로젝트

| 키 | 대시보드 위치 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_URL` · `STAGING_SUPABASE_URL` · `DEV_SUPABASE_URL` | **Project Settings → Data API → Project URL** |
| `SUPABASE_SERVICE_ROLE_KEY` · `SUPABASE_SECRET_KEY` · `STAGING_/DEV_SUPABASE_SERVICE_ROLE_KEY` | **Project Settings → API Keys** → secret 키(또는 Legacy API keys 탭의 `service_role`) — 서버 전용이라 화면 코드에 넣으면 안 된다 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` · `SUPABASE_PUBLISHABLE_KEY` | 같은 화면 → publishable |
| `<APP>_DEV/STG/PROD_DATABASE_URL` · `SCHEMA_DATABASE_URL` | 상단 **Connect → Session pooler(5432)** 접속 문자열. 마이그레이션 스크립트 전용이라 **Vercel에 등록하지 않는다** |
| `SUPABASE_SCHEMA` | 비운영만 `<앱>_dev`·`<앱>_stg`. **Project Settings → Data API → Exposed schemas**에 등록해야 한다. 운영은 비운다 |
| `PROD_RO_SUPABASE_URL`·`PROD_RO_SUPABASE_KEY` | 운영 프로젝트 주소 + **읽기 전용 권한 키**(전권 secret 금지, 발급 방식 [확인중 : 마스터]). `STAGING_DB_TARGET=prod-ro` 일 때만 쓴다(`packages/pi-db/src/db-env.ts`) |

### 3.5 Vercel — 운영 값을 넣는 곳

- https://vercel.com/dashboard → 프로젝트(cafe·sitemaps·schema·loginpi) → **Settings → Environment Variables**
  - 환경을 **Production**으로 지정해 등록한 뒤 **재배포**해야 반영된다.
- ⚠ 스테이징 loginpi도 `VERCEL_ENV=production`이다. `MON_INGEST_*`는 **운영 프로젝트(cafe·sitemaps·schema)에만** 등록한다.
- `VERCEL_API_TOKEN`: https://vercel.com/account/tokens

### 3.6 그 밖의 외부 서비스 (앱 전용)

| 키 | 구하는 곳 |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `GITHUB_TOKEN` · `GITHUB_DEPLOY_TOKEN` | https://github.com/settings/tokens (repo 범위) |
| `TELEGRAM_BOT_TOKEN` · `TELEGRAM_BOT_USERNAME` | Telegram 앱 → `@BotFather` → `/newbot`. `TELEGRAM_WEBHOOK_SECRET`은 3.1처럼 직접 만든다 |
| `RESEND_API_KEY` · `RESEND_FROM_EMAIL` | https://resend.com/api-keys (발신 도메인 인증 필요) |
| `GOOGLE_MAPS_API_KEY` · `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | https://console.cloud.google.com/google/maps-apis/credentials (공개 키는 HTTP 리퍼러로 제한한다) |

## 4. 신규 테넌트 추가 체크리스트

0. 전체 단계 정본 = `sitemap/multitenant_create_TODO-List.md`(아래는 env 관련 요약)
1. `node scripts/tenant-env.mjs new <도메인>.pi --port <빈 포트>` — env 3종 + docs(PRD·ROADMAP·TROUBLESHOOT) 골격 + CLAUDE.md + `.claude/settings.json` + sites.json BUILDING
   - `sitemap/<도메인>.pi/`에 `.env.example`·`.env.local`·`.env.vercel-prod`를 만든다.
   - 비밀키는 새로 만들고, 공유 값(비운영 DB·관리자·모니터링 키)은 기존 앱에서 복사한다.
   - `.env.multi`도 다시 만든다. 이미 있는 파일은 덮어쓰지 않는다.
2. 출력된 **직접 발급 필수 키**를 3절 위치에서 발급받아 `.env.local`에 채운다(Pi 포털 앱 만들기 → Google OAuth 클라이언트 → 비운영 DB 접속 문자열).
3. 비운영 스키마 `<앱>_dev`·`<앱>_stg`를 Supabase Exposed schemas에 등록하고 `node scripts/db-migrate.mjs --app <앱> --tier dev`를 실행한다.
4. 운영 준비: 메인넷 Pi 앱과 운영 Supabase 프로젝트를 만든 뒤 값을 `.env.vercel-prod`에 채운다 → Vercel 새 프로젝트의 Production env에 등록하고 운영 브랜치를 지정한다.
5. `sitemap/sites.json`에 사이트를 등록하고, 모니터링을 붙이려면 `packages/pi-mon` 머리 주석의 4단계(schema.pi `sys_cd` 추가 포함)를 따른다.
6. 첫 운영 배포 전에 `docs/BUILD_DEFECTS.md` 1절 '신규 시스템 체크리스트'를 통과해야 한다.
7. `node scripts/tenant-env.mjs multi`를 실행하고, 이 문서 2절 표에 시스템 행을 추가한다.

## 5. 질의 이력 — 이미 답한 질문

| 날짜 | 질문 | 답(위치) |
|---|---|---|
| 2026-10-24 | `MON_INGEST_KEY`가 뭔가, 값이 뭔가 | 모니터링 수집용 공유 비밀키다. 직접 만들고 세 시스템에 같은 값을 쓴다 → 2절 표, 3.1. 값은 `.env.multi` |
| 2026-10-24 | 모니터링 수집이 실제로 되나 | 운영에서 cafe.pi·sitemap.pi 요청이 schema.pi에 쌓이는 것을 확인했다. 운영 프로젝트에만 등록한다 → 3.5 |
| 2026-10-24 | 멀티테넌트 핵심 환경설정 정리 | `.env.multi`(값), 이 문서(구하는 곳) |
| 2026-10-24 | 키와 값을 어디서 구하나 | 3절 |
| 2026-10-24 | 테넌트를 추가하면 설정 파일을 한 세트로 | 4절, `scripts/tenant-env.mjs new` |
| 2026-10-24 | 새 테넌트를 이름만 말하면 첫 할 일 정리 | `sitemap/multitenant_create_TODO-List.md` + 생성기(4절) |
| 2026-10-25 | seminar.pi `.env.local` 을 언제 채우나 | 파일 자체에 STEP 0~6 단계별 주석(✅ 설정됨 · ⬜ 비어 있음) — 신규 테넌트 생성기(`tenant-env.mjs new`)도 같은 STEP 구조로 생성(2026-10-25) |
| 2026-10-25 | `GOOGLE_CLIENT_ID` 등 모든 환경값을 어느 사이트·메뉴에서 얻나 | 3절(상세) + 각 앱 `.env.local` 상단 '환경값을 얻는 곳' 블록(생성기 자동 포함, 기존 파일은 `node scripts/tenant-env.mjs header --port <포트> --name <이름>` 출력을 붙임) |
| 2026-10-25 | seminar.pi `MEDIA_TOKEN_SECRET` 은 어디서 구하나 | 사이트 없음 — 직접 만드는 입장권 서명 키(3.1). **앱과 엔진이 같은 값**: 로컬 = `.env.local`, 운영 = `.env.vercel-prod` 값을 Vercel(Production)과 엔진 PC `C:galapagosun-engine.cmd` 에 넣는다(`media/docs/HOME_NODE_GUIDE.md`) |
| 이전 | `CRON_SECRET`이 뭔가 | Vercel 크론이 `Authorization: Bearer` 헤더로 보내는 비밀값이다. 직접 만들고 앱마다 따로 쓴다 → 3.1 |
