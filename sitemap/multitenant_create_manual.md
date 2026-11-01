<!-- 용도 : 새 멀티테넌트 .pi 사이트(PDB)를 처음부터 운영 Pi Browser 로그인까지 만드는 '어떻게(How-to)' 매뉴얼. -->
<!-- 기준 사례 = dbms.pi 구축(2026-11-01). '무엇을(체크리스트)'은 multitenant_create_TODO-List.md 가 정본이고, 이 문서는 그 순서를 실제로 해 내는 방법·명령·확인법·함정을 적는다. -->

# 멀티테넌트 사이트 생성 매뉴얼 (How-to)

> 예시 값은 다음 사이트 **yea.pi · 포트 3005** 로 적었다. 자기 사이트 이름으로 바꿔 읽는다.
>
> | 표기 | 뜻 | 예 |
> |---|---|---|
> | `<domain>` | 사이트 도메인 | `yea.pi` |
> | `<app>` | 앱 이름(도메인에서 `.pi` 를 뺀 것, Vercel 프로젝트 이름) | `yea` |
> | `<APP>` | 앱 이름 대문자 | `YEA` |
> | `<port>` | 로컬 포트 | `3005` |
> | `<URL>` | Vercel 운영 주소 | dbms 는 `https://dbmspi.vercel.app` |

---

## ★ 반드시 접속해서 값을 만들고 가져오는 외부 사이트 4곳

> **①~④ 는 분류 번호(마스터 지정)이고, 실제 진행 순서는 3절대로 ② Vercel(S6) → ③ Google(S9) → ① Supabase(S10) → ④ Pi(S12)**
> ③·④ 는 ② 에서 정한 운영 주소 `<URL>` 이 있어야 등록할 수 있고, ④ 도메인 검증은 검증 키 파일을 **커밋·배포한 뒤**에 한다. Vercel 은 다른 사이트에서 값을 받을 때마다 환경변수 등록·재배포로 다시 연다.
> 값은 **마스터가 콘솔에서 직접 복사해** `.env.local`·Vercel 에 넣는다. 아래 표의 단계 번호(S6 등)는 3절 절차와 같다.

| # | 사이트 | 접속 링크 | 언제(3절) |
|---|---|---|---|
| 1 | **Database — Supabase** | https://supabase.com/dashboard | S10 · S11 |
| 2 | **WAS — Vercel** | https://vercel.com/dashboard | S6 · S7 · S8 · S13 + 환경변수 등록 S9 · S11 · S12 · S16 |
| 3 | **Google — OAuth** | https://console.cloud.google.com/apis/credentials | S9 (Pi + Google 사이트만) |
| 4 | **Pi — Developer Portal** | Pi Browser 앱 주소창 `develop.pi` → **Develop** (PC 웹으로는 열 수 없다) | S12 · S16 |

> ⚠️ **빌드를 막는 '함께 넣는 키 묶음' 2개** — 하나만 넣으면 `src/env.ts` 가 빌드를 멈춘다(4.1)
> - Google 3키 : `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `AUTH_SECRET`
> - 관리자 2키(운영) : `ADMIN_PI_USERNAMES` · `ADMIN_PI_UIDS`

> 🔒 **보안** — IDE 에서 키가 있는 줄을 **선택한 채로 질문하면 그 값이 대화에 실린다**(2026-11-01 DB 비밀번호·secret key 노출 → 교체). 질문엔 키 이름만 적는다. 값을 바꾸면 **재배포해야 반영**된다(S13 — `NEXT_PUBLIC_*` 는 빌드 때 코드에 박힘).

### ① Database — Supabase · https://supabase.com/dashboard

- **만드는 것** : New project — 이름 `<app>`, 리전 Seoul(ap-northeast-2) 권장 [확인중 : 마스터 — dbms 실제 리전], DB 비밀번호는 비밀번호 관리자에 보관. 스키마는 **전 환경 `public`**(seminar.pi 2026-10-29 결정)

| 콘솔 위치 | 넣는 키 | 넣는 곳 |
|---|---|---|
| Project Settings → **Data API** → Project URL | `NEXT_PUBLIC_SUPABASE_URL` | 로컬 + Vercel |
| Project Settings → **API Keys** → secret(`sb_secret_…`) | `SUPABASE_SERVICE_ROLE_KEY` | 로컬 + Vercel (서버 전용) |
| 상단 **Connect → Session pooler(5432)** — `postgresql://postgres.<ref>:…@aws-N-<리전>.pooler.supabase.com:5432/postgres`(`aws-N` 은 프로젝트마다 다름 — Connect 화면 값을 그대로 복사) | `<APP>_PROD_DATABASE_URL` | **로컬만** — 마이그레이션 전용, **Vercel 금지** |

- **흔한 실수** : REST 주소(`https://<ref>.supabase.co`)를 `*_DATABASE_URL` 에 넣음 → 마이그레이션 불가. `--tier dev|stg` 로 적용 → `<app>_dev` 스키마가 따로 생김(**`--tier prod` 만**)
- **확인** : `node scripts/db-migrate.mjs --app <app> --tier prod --dry-run` → '적용 예정' 목록(5.4)

### ② WAS — Vercel · https://vercel.com/dashboard

- **만드는 것** : Add New → Project → `anakinwon/loginpi` Import → **Root Directory `sitemap/<domain>`** → 생성 후 Settings → **Domains** 에서 운영 주소 확정(dbms = `dbmspi.vercel.app` — 프로젝트 이름과 주소가 다를 수 있다) → 이 값이 `<URL>`
- **꼭 할 설정**
  1. Settings → **Git** : Connected Git Repository 확인 · **Production Branch = `prod/<app>`** · Ignored Build Step 비움
  2. Settings → **Environment Variables** : **Production · Preview 둘 다** 체크
- **첫 배포 최소 집합(S7)** : `PI_SESSION_SECRET`(`.env.vercel-prod` 에서 **이 값만** 복사) · `NEXT_PUBLIC_APP_URL=<URL>`(직접 입력) · `NEXT_PUBLIC_PI_SANDBOX=true`(testnet, 직접 입력) — **`.env.vercel-prod` 통째 붙여넣기 금지**(생성기 파일에 `APP_URL=[확인중]`·`SANDBOX=false`·관리자 1키·Google 1키가 들어 있어 첫 빌드가 실패한다)
- **가져오는 값** : `<URL>` → `NEXT_PUBLIC_APP_URL`, ③ Google 리디렉션 URI, ④ Pi App URL 에 그대로 쓴다
- **흔한 실수** : push 해도 `Vercel – <app>` 상태가 안 찍힘 = Git 미연결(T03) / 환경변수 변경 뒤 빈 커밋 = **Skipped(빌드 안 됨)** → Deployments → ⋯ → **Redeploy**(Build Cache 해제)
- **확인** : 5.1 — 같은 커밋의 `Vercel – <app>` 상태 description 이 'Deployment has completed'

### ③ Google — OAuth · https://console.cloud.google.com/apis/credentials

- **만드는 것** : (처음 쓰는 프로젝트면) OAuth 동의 화면 → **+ 사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 웹 애플리케이션**
- **승인된 리디렉션 URI 2개** : `http://localhost:<port>/api/auth/callback/google` · `<URL>/api/auth/callback/google`

| 콘솔 값 | 넣는 키 | 넣는 곳 |
|---|---|---|
| Client ID | `GOOGLE_CLIENT_ID` | 로컬 + Vercel |
| Client secret | `GOOGLE_CLIENT_SECRET` | 로컬 + Vercel |
| (직접 생성, 4.5) | `AUTH_SECRET` | 로컬 + Vercel — **위 2키와 반드시 함께** |

- 버튼 플래그 `NEXT_PUBLIC_GOOGLE_LOGIN` 은 **넣지 않는다** — 3키가 있으면 `next.config.ts` 가 빌드 때 자동으로 켠다(2026-11-01 da2f9e45)
- **확인** : `<URL>/api/auth/providers` 에 `google` → **일반 브라우저 미로그인 상태**에서 'Google로 로그인' 버튼(Pi Browser 에서 Pi 로그인 상태면 설계상 안 보인다) → 5.3 핸드셰이크

### ④ Pi — Developer Portal · Pi Browser → `develop.pi` → Develop

- **만드는 것** : 새 앱(**Testnet**) → 앱 화면 **App URL = `<URL>`** 저장(바꾸면 도메인 검증 다시)

| 순서 | 포털 위치 | 처리 | 넣는 곳 |
|---|---|---|---|
| 1 | 체크리스트 → **Verify domain** 의 키 | `sitemap/<domain>/validation-key.txt` 로 저장 → 커밋·push·승격 → 운영 `<URL>/validation-key.txt` 내용 일치 확인 → 포털 Verify | 저장소(공개값 — 커밋 OK) |
| 2 | **API Key** → Generate(한 번만 표시, 바로 복사) | `PI_API_KEY` | 로컬 + Vercel |
| 3 | 앱 화면 맨 위 **Open app** 주소(`<앱>.pinet.com`) | `NEXT_PUBLIC_PI_APP_DOMAIN` | 로컬 + Vercel — **없으면 Pi 로그인 403 `cross_origin_auth`** |
| 4 | **Pi Sign-In** → Client ID (선택) | `NEXT_PUBLIC_PI_OAUTH_CLIENT_ID`, 콜백 `<URL>/auth/pi/callback` · `http://localhost:<port>/auth/pi/callback` 정확히 등록(LOGIN_PLAYBOOK) | 로컬 + Vercel |
| 5 | (포털 값 아님) | `NEXT_PUBLIC_PI_SANDBOX=true` (메인넷 운영만 false) | 로컬 + Vercel |
| 6 | 첫 Pi 로그인 뒤 Supabase `sys_user.pi_uid` (S16) | `ADMIN_PI_UIDS` + `ADMIN_PI_USERNAMES` — **둘을 함께** | Vercel |

- `pi_uid` 는 앱 × Testnet/Mainnet 마다 다르다 — 다른 앱 값 재사용 금지
- **확인** : 재배포(Redeploy) → Pi Browser 에서 앱 열기 → 'Pi로 로그인' → 상단에 사용자명 → 홈의 '코드 발급' 버튼(Pi + Google 사이트)

---

## 0. 머리말

### 0.1 누가 무엇을 하나

| 역할 | 하는 일 |
|---|---|
| **마스터(고객)** | 결정(2절), 외부 콘솔 작업(Vercel·Supabase·Pi Developer Portal·Google Cloud Console), Pi Browser 실기기 확인 |
| **아소카(서비스)** | 생성기 실행, 문서·코드·SQL 작성, DA 리뷰 요청, DB 적용, 빌드·검증, 커밋·push·운영 승격, 상태 확인 |

서비스가 만든 결함은 고객 결재로 넘기지 않는다(R-P0, [루트 CLAUDE.md](../CLAUDE.md)).

### 0.2 정본 문서 — 여기서 다시 쓰지 않고 링크한다

| 주제 | 정본 |
|---|---|
| 단계 체크리스트(무엇을) | [multitenant_create_TODO-List.md](multitenant_create_TODO-List.md) |
| 환경변수 키별 구하는 곳·공유 규칙 | [docs/ENV_GUIDE.md](../docs/ENV_GUIDE.md) |
| 로그인(Pi·Google 연동) 구현 | [docs/LOGIN_PLAYBOOK.md](../docs/LOGIN_PLAYBOOK.md) |
| 구축 결함 원장·신규 시스템 체크리스트 | [docs/BUILD_DEFECTS.md](../docs/BUILD_DEFECTS.md) |
| 멀티사이트 상위 플랜(CDB/PDB·웨이브) | [docs/PRD_28_PI_MULTISITE.md](../docs/PRD_28_PI_MULTISITE.md) |
| 웨이브 게이트 | [docs/ROADMAP_MULTISITE.md](../docs/ROADMAP_MULTISITE.md) |
| 선행 교훈(다른 시스템 실수 → 새 앱 규칙) | [dbms.pi/docs/TROUBLESHOOT.md](dbms.pi/docs/TROUBLESHOOT.md) 1절 |

> TODO 의 §0-4(포트)·§3(골격 기준 앱)·§5(DB) 문구는 dbms.pi 진행보다 오래됐다(9절 개선 과제 3). 그 부분은 이 매뉴얼의 dbms 방식대로 하고, TODO 가 갱신되면 TODO 를 따른다.

### 0.3 기준 사례

- **dbms.pi**, 2026-11-01 하루에 착수 → 운영 배포 → Pi Browser 로그인 → Google 로그인·계정 연동까지 진행.
- 운영 주소 `https://dbmspi.vercel.app` · Vercel 프로젝트 `dbms` · 운영 브랜치 `prod/dbms` · 포트 3004.
- 커밋 이력은 8절.

---

## 1. 한눈에 보기

### 1.1 전체 흐름

```
[S0 결정·마스터]
   ↓
[S1 생성기] → [S2 문서] → [S3 골격 복제] → [S4 install·build·tsc·scan] → [S5 커밋·push]
   ↓
[S6 Vercel 프로젝트·Git 연결·마스터] → [S7 환경변수 1차(최소)·마스터] → [S8 운영 브랜치 승격]
   ↓
[S9 Google OAuth·마스터]  (Pi 전용 사이트는 건너뜀)
   ↓
[S10 Supabase 전용 프로젝트 → SQL·DA 리뷰 → db-migrate --tier prod] → [S11 Vercel 에 Supabase 키·마스터]
   ↓
[S12 Pi Portal 앱·검증 키·Pi 키 3종·마스터] → [S13 재배포]
   ↓
[S14 Pi Browser 실기기 로그인] → [S15 Google 로그인·계정 연동(Pi 전용은 건너뜀)] → [S16 관리자 승격]
   ↓
[S17 이후 : 모니터링(TODO 7)·결제(LOGIN_PLAYBOOK·pi-payments)·검증·원장(TODO 9)·등재(TODO 10)]
```

### 1.2 단계별 담당과 dbms 실측 소요

소요는 **dbms.pi 커밋 시각 간격**이다. 고객 대기(콘솔 작업·실기기)를 따로 재지 않았으므로 간격에 섞여 있다. 고객 대기를 뺀 순수 소요는 [TBD : 다음 사이트에서 측정].

| Step | 내용 | 담당 | dbms 커밋 | 커밋 시각 | 간격 |
|---|---|---|---|---|---|
| S0~S2 | 결정 · 생성기 · PRD v0.2 | 마스터 → 서비스 | e8162986 | 11:10 | 시작 시각 미기록 [TBD] |
| S2 | PRD v0.3 · 선행 교훈 | 서비스 | db5d3311 · abf4672b | 11:31 · 11:40 | 30분 |
| S3~S4 | 앱 골격 · build | 서비스 | 0a1c87a0 · 16ca8a66 | 12:18 · 12:19 | 39분 |
| S5~S8 | 커밋·push · Vercel 프로젝트 · Git 연결 · prod 브랜치 | 서비스 + 마스터 | 3535168c | 13:09 | 50분 (마스터 콘솔 작업 포함) |
| S10 | Supabase · DA 리뷰 · 적용 | 마스터 + 서비스 | 8063c0ac | 13:40 | 31분 (프로젝트 생성 포함) |
| S9 · S11 | Google OAuth 확인 · 키 등록 · 기록 | 마스터 + 서비스 | b33c29b1 | 13:56 | 16분 |
| S12 | Pi Portal 검증 키 | 마스터 + 서비스 | ff95fca3 | 14:20 | 24분 |
| S13~S14 | 재배포 · Pi Browser 로그인 | 서비스 + 마스터 | f154d136 | 14:31 | 11분 |
| S15 | Google 버튼·연동 코드 버튼 수정 | 서비스 | da2f9e45 · 9be18ac5 | 14:50 · 14:52 | 21분 |
| S16 | 관리자 승격 | 마스터 + 서비스 | - | - | [확인중 : 진행 여부] |
| **합계** | 착수 커밋 → 마지막 수정 | | | 11:10 → 14:52 | **약 3시간 42분** |

### 1.3 준비물

| 준비물 | 누가 | 쓰는 Step |
|---|---|---|
| GitHub `anakinwon/loginpi` push 권한 | 서비스 | S5 · S8 |
| Vercel 계정(새 프로젝트 생성·환경변수·Git 연결 권한) | 마스터 | S6 · S7 · S8 · S11 · S13 |
| Supabase 계정(새 프로젝트 생성) | 마스터 | S10 · S11 |
| Pi Developer Portal(휴대폰 Pi Browser → `develop.pi`) | 마스터 | S12 |
| Google Cloud Console(OAuth 클라이언트) — Pi + Google 사이트만 | 마스터 | S9 |
| 휴대폰 Pi Browser(실기기 로그인) · PC 일반 브라우저 | 마스터 | S14 · S15 |
| 로컬 : Node 22 · pnpm 11 · git · `openssl`(Git for Windows 포함) | 서비스 | 전 단계 |

---

## 2. 사전 결정 질문 (마스터)

착수 전에 아래를 한 번에 묻고 답을 기록한다.

| # | 질문 | 선택지 | dbms 결정(2026-11-01) | 기록 위치 |
|---|---|---|---|---|
| D1 | 웨이브 게이트를 지키는가, 선착수 예외인가 | 게이트 통과 후 / 예외 | W4 선착수 예외(W3 회고 전) | [docs/ROADMAP_MULTISITE.md](../docs/ROADMAP_MULTISITE.md) 게이트 표 한 줄 + TODO 진행 현황 표 행 |
| D2 | 로그인 방식 | Pi 전용(기본) / Pi + Google 연동(예외) | Pi + Google 연동 예외 — PRD_28 §1.1-2 예외 목록·LOGIN_PLAYBOOK 에는 아직 미등재(둘 다 sitemap.pi·seminar.pi 만, dbms `sql/001` 헤더도 '등재 [확인중]') [확인중 : 마스터] | PRD_28 §1.1-2 · [LOGIN_PLAYBOOK](../docs/LOGIN_PLAYBOOK.md) 사이트 추가 · TODO 진행 현황 |
| D3 | 레드라인 플래그(⏸·△)가 있는가 | 없음 / 있음 → Pi 앱 생성·제출 보류 | 없음 | `sites.json` hold |
| D4 | 로컬 포트 | 빈 포트. 사용 중 3000 cafe · 3001 sitemap · 3002 schema · 3003 seminar · 3004 dbms | 3004 | 생성기 `--port` · TODO 진행 현황 |
| D5 | DB | 사이트 전용 Supabase 프로젝트 1개, 전 환경 `public` 스키마 | 전용 1개 · `public` | 앱 `docs/PRD.md` |
| D6 | 골격 기준 앱 | seminar.pi(가장 최신 : Pi + Google + `@pi/i18n`) | seminar.pi 복제·축소 | 앱 `docs/ROADMAP.md` |
| D7 | 앱 경계·다른 앱과 연결 방식 | 데이터 공유 없음(PDB). 연결이 필요하면 상대 앱 API | 별도 DB + schema.pi 연결 API | 앱 `docs/PRD.md` (dbms 는 `sitemap/schema.pi/docs/MASTER_ROADMAP.md` §3-10 에도) |
| D8 | 1차 범위에서 결제·모니터링을 넣는가 | 넣음 / 나중 | 둘 다 나중 | 앱 `docs/ROADMAP.md` |

- **D5 근거** : seminar.pi 결정 C(2026-10-29) — 비운영 tier 스키마는 API 미노출로 PostgREST 406 이 나고 운영 오염의 원인이 됐다([ENV_GUIDE](../docs/ENV_GUIDE.md) 2절 예외 · 5절 2026-10-29).
- **D5 주의** : 전 환경 `public` 이면 로컬·Preview 가 DB 를 쓸 때 운영 DB 를 직접 건드린다. 위험 수용 여부 [확인중 : 마스터]. 또 dbms `docs/PRD.md` 40·67·69행은 아직 비운영 `dbms_dev`·`dbms_stg` 기준으로 적혀 있어(40행 결정 표 · 67행 8절 데이터 · 69행 [확인중] 점검 문구) 정합화가 필요하다 [확인중 : 마스터].
- **D6 근거** : TODO §3 은 sitemap.pi 를 기준으로 적었지만 `@pi/i18n` 표준 이전 문서다. schema.pi 는 독립 구조라 기준이 아니다.

---

## 3. 단계별 절차

각 Step 은 **목적 / 담당 / 방법 / 완료 확인 / 흔한 실수** 순서다. 흔한 실수의 `T번호`는 6절 트러블슈팅 표 번호다.
명령은 저장소 루트(`$WORKSPACE_ROOT/loginpi`)에서 실행한다고 가정한다.

### S1. 생성기 실행

- **목적** : 앱 폴더와 env 3종·문서 골격·설정을 한 번에 만든다.
- **담당** : 서비스
- **방법**

  ```bash
  node scripts/tenant-env.mjs new yea.pi --port 3005
  ```

  | 만들어지는 것 | 비고 |
  |---|---|
  | `sitemap/yea.pi/.env.example` | 커밋 대상 |
  | `sitemap/yea.pi/.env.local` | 로컬 전용(gitignore, 0600 — Windows 는 권한 무시, gitignore 가 유일한 보호). STEP 0~4 별 ✅/⬜ 정리 |
  | `sitemap/yea.pi/.env.vercel-prod` | Vercel 운영 등록용(gitignore) |
  | `docs/PRD.md` · `docs/ROADMAP.md` · `docs/TROUBLESHOOT.md` | 골격 |
  | `CLAUDE.md` · `.claude/settings.json` | `WORK_HISTORY_PROJECT=yea.pi` |
  | `sitemap/sites.json` | appSts `PLANNED` → `BUILDING` |
  | 루트 `.env.multi` | 재생성 |

  - 비밀키 `PI_SESSION_SECRET`·`AUTH_SECRET`·`CRON_SECRET` 은 생성기가 새로 만들어 넣는다(로컬과 운영은 다른 값).
  - 이미 있는 파일은 덮어쓰지 않고 "건너뜀" 으로 끝난다.
  - 출력 중간의 `직접 발급 필수 N개 : …` 줄을 복사해 S9·S10·S12 할 일로 넘긴다(마지막 줄이 아니다 — 뒤에 '운영·선택 N개'·'→ 구하는 곳'·'다음 할 일' 줄과 `.env.multi` 재생성 출력이 이어진다).
- **완료 확인**

  ```bash
  ls -a sitemap/yea.pi sitemap/yea.pi/docs
  grep -n -A5 '"yea.pi"' sitemap/sites.json     # appSts 가 BUILDING
  git check-ignore -v sitemap/yea.pi/.env.local sitemap/yea.pi/.env.vercel-prod   # 둘 다 무시 대상으로 출력
  ```

  TODO 진행 현황 표에 사이트 행을 추가하고, 이 매뉴얼 D4 사용 중 포트 목록·TODO §0-4 포트 목록에도 `<domain>`·`<port>` 를 추가한다(다음 사이트가 같은 포트를 고르지 않게).
- **흔한 실수**
  - `.env.example` 4행 로컬 URL 안내가 `localhost:3000` 으로 나온다(생성기 결함, 9절 1). `localhost:<port>` 로 고친다(S3-3 ② 명령). `.env.local` 의 `NEXT_PUBLIC_APP_URL` 은 `--port` 대로 정상이다.
  - `.env.local` 에 `APP_TIER=staging`·`SUPABASE_SCHEMA=<app>_stg`(비운영 방식 기본값)가 들어간다. D5 `public` 단일이면 S10-5 에서 정리한다.
  - `sites.json` 에 도메인이 없으면 경고만 하고 넘어간다 → 직접 추가한다.

### S2. 문서 — PRD · ROADMAP · TROUBLESHOOT

- **목적** : 무엇을 만들지(PRD), 언제(ROADMAP), 무엇을 조심할지(TROUBLESHOOT 선행 교훈)를 코드보다 먼저 확정한다.
- **담당** : 서비스 작성 → 마스터 확정
- **방법**
  1. `docs/PRD.md` : D1~D8 결정을 반영한다. 근거는 PRD_27 사이트 표와 [PRD_28](../docs/PRD_28_PI_MULTISITE.md) §8. 모르는 값은 `[TBD]` 로 두고 마스터 질문 목록으로 모은다.
  2. `docs/ROADMAP.md` : Phase 0~N(dbms 는 0~6). 일정은 추정이라고 적고 착수일은 `[TBD : 마스터]`.
  3. `docs/TROUBLESHOOT.md` 1절 **선행 교훈** : [dbms.pi/docs/TROUBLESHOOT.md](dbms.pi/docs/TROUBLESHOOT.md) 1절(L01~L38, 분야 1.1~1.8)을 출발점으로 복사하고 새 앱에 해당하지 않는 항목은 지운다. 2절은 이 앱의 장애 기록용으로 비워 둔다.
  4. 문서 검수(anakin_phase-review : 브랜드 표기·추측 금지) → 팀장(teamanakin-admin) 승인 → 커밋.
- **완료 확인** : PRD 에 D1~D8 이 모두 있다. `[TBD]` 마다 질문 대상이 적혀 있다.
- **흔한 실수** : 다른 앱 문서를 복사하고 이름·포트를 안 바꿈 → `grep -n -i "dbms\|seminar\|3003\|3004" sitemap/yea.pi/docs/*.md` 로 확인.

### S3. 앱 골격 복제

- **목적** : 인증·다국어·가드만 남긴 최소 앱을 만든다(seminar.pi 를 축소한 dbms.pi 골격을 복제).
- **담당** : 서비스
- **방법** : dbms.pi 는 seminar.pi 를 복제·축소한 결과물(messages 제외 파일 419개 → 54개)이고 오늘 고친 3건(regions·Google 플래그 파생·홈 연동 코드 진입로)이 들어 있다. 그래서 **아래 포함 목록 = dbms.pi 파일 목록**이다. 복제 원본을 seminar.pi 대신 dbms.pi 로 바꿀지는 [확인중 : 마스터](9절 2).

  ```bash
  # 생성기가 만든 .env*·docs·CLAUDE.md·.claude 는 건드리지 않는다(-n = 덮어쓰기 금지)
  cd sitemap
  cp -rn dbms.pi/src dbms.pi/messages dbms.pi/sql yea.pi/   # sql 머리 주석(dbms 승인 DA-APPROVED 포함)은 S10-2 에서 재작성
  cp -n dbms.pi/package.json dbms.pi/next.config.ts dbms.pi/tsconfig.json \
        dbms.pi/postcss.config.mjs dbms.pi/vercel.json dbms.pi/i18n.config.json \
        dbms.pi/.gitignore yea.pi/
  # validation-key.txt 는 복사하지 않는다 — 앱마다 Pi Portal 이 따로 준다(S12)
  cd ..
  ```

  > **Pi 전용 분기 (D2 기본값 — Google 예외 승인이 없는 사이트)** : 위 복사본은 dbms(Pi + Google) 골격이라 그대로 두면 Google 흔적이 남는다.
  >
  > 1. `.env.local`·`.env.vercel-prod` 에서 `AUTH_SECRET`·`NEXT_PUBLIC_GOOGLE_LOGIN` 두 줄을 지운다(남기면 로컬 빌드 실패·Google 버튼 노출 — S4).
  > 2. `src/components/home-gate.tsx` 의 코드 발급을 `{googleLoginEnabled && source === 'pi' && <PiLinkCodeIssuer />}` 로 바꾼다(`googleLoginEnabled` 는 `./google-auth` 에서 import). `link-start` 라우트는 Google 활성 여부를 보지 않으므로 그대로 두면 쓸모없는 '코드 발급' 버튼이 생긴다.
  > 3. `src/app/[locale]/layout.tsx` 의 `SessionProvider` 는 매 페이지 `/api/auth/session`(404)을 부른다(기능 영향 없음). 없애려면 `googleLoginEnabled` 일 때만 감싸되 `useAppUser`(`google-auth.tsx`)가 `useSession` 을 무조건 부르므로 그쪽도 함께 고친다. 또는 `link`·`api/auth/[...nextauth]`·`link-start`·`link-complete`·`google-auth`·`src/auth.ts`·`sql/001~003`·`next-auth` 의존성을 통째로 뺀다. 표준으로 어느 쪽을 쓸지는 [확인중 : 마스터].
  > 4. 이후 차이 : S9·S15 건너뜀 · 5.2 `/api/auth/providers` 는 404 가 정상 · S10 dry-run 적용 예정 = `sql/001~003` 을 뺐으면 2개(baseline 2개) · S4 결함 스캔 = link 라우트를 뺐으면 합계 0.

#### 3-1. 포함 목록

| 지점 | 꼭 있어야 하는 내용 |
|---|---|
| `package.json` | 이름 `@site/<app>` · `dev`=`next dev --turbopack -p <port>` · `build`=`pi-i18n validate && next build --turbopack` · `start`=`next start -p <port>` · `i18n:translate·expand·validate·audit` · 의존성 `@pi/auth·db·guard·i18n·warp`(`workspace:*`) + next 16.2.7 · next-auth 5.0.0-beta.31 · next-intl ^4.13.0 · react 19.2.7 · zod ^4.4.3 · @t3-oss/env-nextjs |
| `next.config.ts` | `import './src/env'`(빌드 때 env 검증) · next-intl 플러그인 · `turbopack.root`·`outputFileTracingRoot` = 저장소 루트(`../..`) · `poweredByHeader: false` · `outputFileTracingIncludes`(`/validation-key.txt` → `./validation-key.txt`, `/**/*` → `./messages/*.json`) · `headers()` 보안 헤더 4종 · **`env.NEXT_PUBLIC_GOOGLE_LOGIN` 파생**(직접값 \|\| 서버 3키 모두 있으면 `'1'`) |
| `vercel.json` | `{ "regions": ["icn1"] }` — **seminar 에는 없다.** 빠지면 함수가 미국 리전에서 돌아 쿼리당 약 180ms 가 더 든다 |
| `src/env.ts` | t3-env. 빌드 차단 규칙 3종(4.1) |
| `src/proxy.ts` | `@pi/guard`(공격 도구 UA 차단·rate limit·보안 헤더) + next-intl 미들웨어 |
| `src/app/api/auth/pi/route.ts` | `createPiAuthRoute(...)`(`@pi/auth`) — 로직 복제 금지 |
| `src/app/api/auth/me` · `link-start` · `link-complete` | 통합 사용자 조회(미로그인 200 `{user:null}`) · 6자리 코드 발급(10분) · 코드 입력 연동(실패 5건 초과 429) |
| `src/app/api/auth/[...nextauth]` · `src/auth.ts` · `src/types/next-auth.d.ts` | Google(D2 예외일 때만). Google 미설정이면 404 |
| `src/app/validation-key.txt/route.ts` | 1순위 env `PI_DOMAIN_VALIDATION_KEY`, 2순위 앱 루트 `validation-key.txt` 파일, 둘 다 없으면 404 |
| `src/app/api/exchange-rates` · `i18n/countries` · `i18n/geo` · `pi-price` | `@pi/i18n` 언어 콤보·시세칩용 |
| `src/app/[locale]/layout.tsx` | 다국어 · WarpArrival · Pi SDK · 인증 Provider · 헤더(언어 콤보 + PiPriceChip) · PreferredLocaleScript + geo |
| `src/app/[locale]/page.tsx` + `src/components/home-gate.tsx` | 홈. 미로그인 = LoginGate, **Pi 세션이면 PiLinkCodeIssuer 를 홈에 바로 노출**(T10, Pi 전용은 S3 분기) |
| `src/app/[locale]/link/page.tsx` · `auth/pi/callback/page.tsx` | 계정 연동 화면 · Pi Sign-In 콜백 |
| `src/components/*` | login-gate · google-auth · auth-status · link-panel · site-header · language-switcher · ui.ts |
| `src/lib/*` | auth.ts(`getSessionUser` — Pi 쿠키 OR `X-Pi-Token`, 없으면 Google, **redirect 금지**) · api.ts · client-api.ts · site-url.ts |
| `src/i18n/*` · `i18n.config.json` · `messages/` | locales `"all"`(219), 메시지는 쓰는 네임스페이스만. 새 키는 ko·en 에만 쓰고 나중에 `pnpm i18n:translate` |
| `sql/001~003` | 연동 코드 테이블 3종(S10) |

#### 3-2. 제외 목록

| 제외 | 이유 |
|---|---|
| 결제·요금제 | 1차 범위 밖(D8). 넣을 때 [LOGIN_PLAYBOOK](../docs/LOGIN_PLAYBOOK.md)·`packages/pi-payments` |
| 모니터링(MonRum·`api/mon/app`) | TODO 7단계에서 `pi-mon` SYSTEMS + schema.pi CHECK SQL 과 함께 넣는다 |
| seminar 전용 기능 | `media/`(Go 엔진) · `public/backgrounds` · `public/mediapipe` · `scripts/copy-mediapipe.mjs` · `sql/004~025` · seminar 전용 docs |

#### 3-3. 이름 바꾸기 체크리스트

```bash
cd sitemap/yea.pi
# ① 도메인 문자열 일괄 치환(messages 254개 중 다수 locale 의 link.enterHint 에 앱 도메인이 들어 있다)
sed -i 's/dbms\.pi/yea.pi/g' $(grep -rIl 'dbms\.pi' src messages sql package.json i18n.config.json next.config.ts)
# ② 패키지 이름·포트·SQL 파일명(.env.example 4행 localhost:3000 = 생성기 결함, 9절 1)
sed -i 's#@site/dbms#@site/yea#; s/-p 3004/-p 3005/g' package.json
sed -i 's/localhost:3004/localhost:3005/' src/lib/site-url.ts src/env.ts
sed -i 's/localhost:3000/localhost:3005/' .env.example
for f in sql/*_dbms_*.sql; do mv "$f" "${f/_dbms_/_yea_}"; done
# ③ 남은 흔적을 눈으로 처리(로고 'dbms<span>.pi</span>', 주석, 홈 소개 문구, sql 머리 주석)
grep -rIn -i 'dbms\|seminar' src messages/ko.json messages/en.json sql package.json i18n.config.json next.config.ts
# ④ 포트 — 3005 만 나와야 한다
grep -rIn 'localhost:300[0-9]\|-p 300[0-9]' src package.json .env.example
cd ../..
```

| 확인 | 기대 |
|---|---|
| `package.json` name · `-p` | `@site/yea` · `-p 3005` |
| `src/lib/site-url.ts` LOCAL | `http://localhost:3005` |
| `src/components/site-header.tsx` 로고 | 새 앱 이름 |
| `messages/ko.json`·`en.json` 의 `meta`·`home` | 새 앱 소개(다른 locale 에는 이 네임스페이스가 없다 — ko → en 폴백) |
| `i18n.config.json` glossary | 새 앱 용어 |
| `sql/` 파일명·헤더 | `001_yea_auth_link.sql` 식, 본문(테이블)은 그대로. 머리 주석은 S10-2 에서 재작성 |
| `validation-key.txt` | 없음(S12 에서 새 앱 키로 만든다) |

- **완료 확인** : 위 ③④ grep 결과가 의도한 것만 남는다(④ 는 `3005` 줄만). 남은 구 앱 문구는 next-intl 이 모든 페이지 HTML 에 직렬화하므로 반드시 지운다.
- **흔한 실수** : `vercel.json` 누락(seminar 기준이면 없음) · 홈 연동 코드 진입로 누락(T10) · Google 플래그 파생 블록 누락(T05) · `validation-key.txt` 를 다른 앱 것으로 복사.

### S4. pnpm install · build · tsc · 결함 스캔

- **목적** : 커밋 전 최소 관문. lint 는 타입 에러를 못 잡으므로 `pnpm build` 가 기준이다.
- **담당** : 서비스
- **방법**
  - **먼저** : 빌드 전에 `sitemap/<domain>/.env.local` 의 `AUTH_SECRET=` 값을 비운다. 생성기는 `AUTH_SECRET`·`NEXT_PUBLIC_GOOGLE_LOGIN=1` 은 넣고 `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET` 은 비워 두므로, 그대로면 Google 3키 규칙(4.1)에 걸려 빌드가 반드시 실패한다. S9 에서 Google 2키와 함께 되살린다(값은 4.5 로 새로 만들거나 잘라 둔 값). Pi 전용 사이트는 `AUTH_SECRET`·`NEXT_PUBLIC_GOOGLE_LOGIN` 두 줄을 지운다(S3 Pi 전용 분기).

  ```bash
  pnpm install                                   # 루트에서. 워크스페이스 glob sitemap/* 가 새 앱을 자동 포함
  cd sitemap/yea.pi && pnpm build && pnpm tsc --noEmit && cd ../..
  node .claude/hooks/build-defect-guard.mjs --scan sitemap/yea.pi/src
  cd sitemap/yea.pi && pnpm dev                  # http://localhost:3005 수동 확인 후 Ctrl+C
  ```

- **완료 확인**

  | 명령 | 기대 |
  |---|---|
  | `pnpm build` | `pi-i18n validate` 통과 후 Next 빌드 성공 |
  | `pnpm tsc --noEmit` | 출력 없음 |
  | `build-defect-guard --scan` | `합계 1 {"R-P3":1}` · exit 1 — `link-complete/route.ts` 의 `count:'exact'`(`head:true`, 무차별 대입 실패 건수 판정에 필요한 의도된 사용). 사유를 `docs/ROADMAP.md`·[BUILD_DEFECTS](../docs/BUILD_DEFECTS.md) 사이트 절에 기록. Pi 전용으로 link 라우트를 지웠으면 `합계 0` · exit 0. 그 밖의 경고는 고치거나 사유를 기록 |
  | `pnpm dev` | 홈·`/link` 열림, 언어 콤보 동작, `/api/auth/me` = `{"user":null}` |

- **흔한 실수** : 로컬 첫 빌드가 `Google 로그인은 GOOGLE_CLIENT_ID·GOOGLE_CLIENT_SECRET·AUTH_SECRET 세 값을 함께…` 로 실패 = 생성기가 넣은 `AUTH_SECRET` 단독(위 '먼저' 를 건너뜀, T06). `.env.local` 에 `PI_SESSION_SECRET` 이 없으면 로컬 빌드도 env 검증에서 멈춘다(생성기가 넣으므로 지우지 말 것). `SKIP_ENV_VALIDATION=1` 은 env 없는 CI 에서만, 운영 빌드 금지.

### S5. 커밋 · push

- **목적** : Vercel 이 빌드할 수 있게 master 에 올린다.
- **담당** : 서비스
- **방법** : 성격별로 나눠 커밋한다(문서 / 골격 / SQL). 파일을 지정해 `git add`(전체 추가 금지).

  ```bash
  git status && git diff --stat
  # ① 문서 — D1·D2 기록처 포함(D2 예외면 docs/PRD_28_PI_MULTISITE.md docs/LOGIN_PLAYBOOK.md 도 추가). 빠뜨리면 unstaged 로 남아 git pull --rebase 가 멈춘다
  git add sitemap/yea.pi/docs sitemap/yea.pi/CLAUDE.md sitemap/yea.pi/.claude sitemap/yea.pi/.env.example sitemap/sites.json sitemap/multitenant_create_TODO-List.md docs/ROADMAP_MULTISITE.md
  git commit -m "📝 docs(yea): yea.pi 착수 — tenant-env 골격(포트 3005)·PRD v0.x"
  # ② 골격
  git add sitemap/yea.pi/src sitemap/yea.pi/messages sitemap/yea.pi/package.json sitemap/yea.pi/next.config.ts sitemap/yea.pi/tsconfig.json sitemap/yea.pi/postcss.config.mjs sitemap/yea.pi/vercel.json sitemap/yea.pi/i18n.config.json sitemap/yea.pi/.gitignore pnpm-lock.yaml
  git commit -m "✨ feat(yea): Phase 1 앱 골격 — dbms.pi 골격 복제·축소(seminar.pi 계열 : Pi SDK·Pi Sign-In·Google 연동 코드·@pi/i18n·regions icn1)"
  # ③ SQL — 머리 주석·DA-APPROVED 는 S10 리뷰 후 재작성(Pi 전용으로 sql 을 뺐으면 생략)
  git add sitemap/yea.pi/sql
  git commit -m "🗃️ chore(yea): sql/001~003 연동 테이블 3종 — dbms.pi 복제(머리 주석은 S10 DA 리뷰 후 확정)"
  git pull --rebase && git push origin master
  ```

- **완료 확인** : `git status` 깨끗(`.env.local`·`.env.vercel-prod`·`.env.multi` 는 gitignore 라 안 보인다). `git log origin/master -3` 이 방금 커밋 3개.
- **흔한 실수** : `.env.local`·`.env.vercel-prod`·`.env.multi` 를 스테이징(7절). 커밋 메시지·문서에 비밀값을 적음.

### S6. Vercel 프로젝트 생성 · Git 연결

- **목적** : push 만으로 빌드되는 Vercel 프로젝트를 만든다.
- **담당** : 마스터(서비스는 값 목록을 준비)
- **방법**
  1. Vercel → **Add New… → Project** → Git 저장소 `anakinwon/loginpi` Import.
  2. Project Name = `<app>`(GitHub 상태 이름이 `Vercel – <app>` 이 된다). **Root Directory = `sitemap/<domain>`**. (선택) 첫 빌드 실패(T01)를 피하려면 Deploy 전에 이 Import 화면의 Environment Variables 에 `PI_SESSION_SECRET`(`.env.vercel-prod` 값)·`NEXT_PUBLIC_PI_SANDBOX=true` 를 먼저 넣어도 된다(`NEXT_PUBLIC_APP_URL` 은 optional 이라 나중에 넣어도 빌드 통과). Deploy.
  3. **`<URL>` 확정** : **Settings → Domains** 에서 운영 주소를 `<app>pi.vercel.app`(또는 비어 있는 `*.vercel.app`)으로 추가하고 기본으로 지정한다. 프로젝트 이름이 `<app>` 이어도 `<app>.vercel.app` 이 나온다는 보장이 없다(다른 계정이 쓰면 접미사가 붙은 주소 — dbms 도 프로젝트 `dbms` · 주소 `https://dbmspi.vercel.app`, dbms 가 주소를 정한 방법은 [확인중 : 마스터]). 이 값을 `<URL>` 로 확정해 `.env.vercel-prod` 의 `NEXT_PUBLIC_APP_URL`(생성기 값 `[확인중 : 운영 도메인]`)·`docs/PRD.md`·`docs/ROADMAP.md` 에 적는다. 이후 Google 리디렉션(S9)·Pi Portal App URL(S12)·Pi Sign-In 콜백은 모두 이 값을 쓴다.
  4. **Settings → Git** 에서 확인 : Connected Git Repository 가 `anakinwon/loginpi` · Ignored Build Step 비움 · (S8 뒤) Production Branch.
- **완료 확인** : 서비스가 아무 커밋이나 push 한 뒤 5.1 상태 스크립트에 `Vercel – <app>` 줄이 생긴다. 기존 프로젝트(loginpi·cafe·schema·seminar·sitemaps·dbms … — 사이트가 늘면 함께 늘어남) 줄은 있는데 자기 줄만 없으면 Git 연결 미완이다(T03). 프로젝트 목록은 5.1 의 컨텍스트 목록 명령으로 본다.
- **흔한 실수** : 첫 빌드가 `Invalid environment variables … PI_SESSION_SECRET undefined` 로 실패 — S6-2 에서 미리 넣지 않았다면 정상이다. S7 등록 후 재배포(T01). 프로젝트 생성 때의 첫 빌드나 수동 Redeploy 로 생긴 상태를 "push 로 빌드됨" 으로 착각 → 상태 시각을 push 시각과 비교한다.

### S7. 환경변수 1차 등록 (첫 배포 최소 집합)

- **목적** : 빌드가 통과하고 홈이 뜨는 최소 값만 넣는다. 나머지는 해당 Step 에서 넣는다.
- **담당** : 마스터. `.env.vercel-prod` 에서 복사하는 값은 **`PI_SESSION_SECRET` 하나뿐**이다(편집기로 열어 복사 — 대화에 붙이지 않는다, 7절). `NEXT_PUBLIC_APP_URL` 은 S6 에서 확정한 `<URL>`, `NEXT_PUBLIC_PI_SANDBOX` 는 `true` 를 직접 입력한다(파일의 `false` 는 메인넷용). **파일 통째 붙여넣기(Import .env) 금지.**
- **방법** : Vercel → 프로젝트 → **Settings → Environment Variables**. 환경 체크박스는 **Production 과 Preview 둘 다**(운영 브랜치가 생기기 전 master push 빌드는 Preview 다 — T02).

  | 키 | Production | Preview | 값 |
  |---|---|---|---|
  | `PI_SESSION_SECRET` | ✅ | ✅ | `.env.vercel-prod` 의 운영 값(로컬과 다름) |
  | `NEXT_PUBLIC_APP_URL` | ✅ | ✅ | `<URL>`(Preview 도 같은 값 — `@pi/guard` 는 same-origin 을 먼저 허용) |
  | `NEXT_PUBLIC_PI_SANDBOX` | ✅ | ✅ | testnet 앱 = `true` — 권장(dbms 실제 등록은 S12, `PI_API_KEY`·`NEXT_PUBLIC_PI_APP_DOMAIN` 과 함께) |

  **넣지 않는 것** : `AUTH_SECRET` 단독(Google 3키 중 일부만 있으면 빌드 차단 — S9 에서 셋을 함께) · `ADMIN_PI_USERNAMES`(UIDS 없이 운영에 넣으면 빌드 차단 — S16) · `MON_INGEST_*`(모니터링 연결 전) · `*_DATABASE_URL`(마이그레이션 전용, Vercel 금지).
- **완료 확인** : S8 이후 운영 빌드가 success.
- **흔한 실수** : T01 · T02 · T06 · T07. `.env.vercel-prod` 통째 붙여넣기 — 생성기 파일에는 Vercel 에 그대로 넣으면 안 되는 값이 들어 있다 : `NEXT_PUBLIC_APP_URL=[확인중 : 운영 도메인]`(url 형식 위반 → 빌드 차단, S6-3 에서 `<URL>` 로 고침) · `NEXT_PUBLIC_PI_SANDBOX=false`(testnet 은 `true`) · `NEXT_PUBLIC_GOOGLE_LOGIN=1`(직접값이 우선이라 Google 3키 없이 버튼만 노출) · `AUTH_SECRET` 단독(3키 규칙 차단, T06) · `ADMIN_PI_USERNAMES`(UIDS 없이 빌드 차단, T07) · `MON_INGEST_*`(모니터링 연결 전). 위 표의 키만 복사하고, 나머지는 교정한 뒤 해당 Step 에서 등록한다.

### S8. 운영 브랜치 승격

- **목적** : `prod/<app>` 브랜치를 만들고 Vercel Production 을 거기에 묶는다.
- **담당** : 서비스(마스터 지시 후) + 마스터(Vercel 설정)
- **방법**

  ```bash
  node scripts/promote-to-prod.mjs --app yea          # 미리보기(dry-run)
  node scripts/promote-to-prod.mjs --app yea --yes    # 첫 실행 = origin/master 로 prod/yea 생성(fast-forward 만)
  ```

  1. 마스터 : Vercel **Settings → Git → Production Branch = `prod/<app>`**.
  2. 같은 커밋을 새 브랜치에 올리기만 해서는 새 빌드가 돌지 않는다(T04). 설정 후 **`sitemap/<domain>/` 안의 실제 파일 변경**(예 `docs/ROADMAP.md` 진행 기록 — dbms 3535168c)을 커밋 → push → promote 해서 Production 빌드를 일으킨다. 또는 Vercel → Deployments → 최신 Production → ⋯ → Redeploy(Build Cache 해제). **`--allow-empty` 빈 커밋은 `Skipped - Not affected` 로 끝난다**(T04).

  ```bash
  git add sitemap/yea.pi/docs/ROADMAP.md
  git commit -m "📝 docs(yea): Phase 0 진행 — Vercel 프로젝트·Git 연결·prod/yea 생성 기록"
  git push origin master && node scripts/promote-to-prod.mjs --app yea --yes
  ```

- **완료 확인** : 5.1 스크립트로 그 커밋의 `Vercel – <app>` 가 `success` · `Deployment has completed`(`Skipped - Not affected` 는 빌드 안 됨). **승격 성공 ≠ 빌드 성공**(Vercel 은 빌드 실패 시 이전 배포를 조용히 계속 서빙) — 반드시 개별 상태를 본다(T18). 이어서 5.2 운영 스모크.
- **흔한 실수** : 운영 브랜치가 master 보다 앞서 있으면 스크립트가 거부(exit 1)한다 — 운영 브랜치에 직접 커밋하지 않는다.

### S9. Google OAuth (Pi + Google 사이트만)

- **목적** : 일반 브라우저 Google 로그인을 켠다.
- **담당** : 마스터(콘솔) + 서비스(확인)
- **방법** : 상세 순서는 [ENV_GUIDE](../docs/ENV_GUIDE.md) 3.3.
  1. **프로젝트 선택** : Google Cloud 프로젝트 = [확인중 : 마스터 — dbms 가 쓴 GCP 프로젝트 재사용 여부]. 새 프로젝트면 **OAuth 동의 화면**(Google 인증 플랫폼 → 브랜딩·대상)을 먼저 설정한다(ENV_GUIDE 3.3 의 1번). 대상의 게시 상태가 '테스트' 면 등록한 테스트 사용자만 로그인되고 나머지는 `access_denied` — 운영 전 **대상 → 앱 게시**(또는 테스트 사용자에 마스터 계정 추가).
  2. Google Cloud Console → **APIs & Services → Credentials** → OAuth 클라이언트 ID(웹 애플리케이션). 앱마다 따로 만든다.
  3. 승인된 리디렉션 URI 두 줄 : `http://localhost:<port>/api/auth/callback/google` · `<URL>/api/auth/callback/google`.
  4. 클라이언트 ID·보안 비밀번호를 바로 `.env.local` 에(보안 비밀번호는 다시 못 볼 수 있다). S4 에서 비운 `AUTH_SECRET` 도 이때 되살린다.
  5. Vercel Production·Preview 에 **`GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`·`AUTH_SECRET` 셋을 함께** 등록. `AUTH_SECRET` 값 = `.env.vercel-prod` 의 `AUTH_SECRET`(로컬과 다른 값). `NEXT_PUBLIC_GOOGLE_LOGIN` 은 넣지 않아도 된다(next.config 가 빌드 때 파생). 운영에 `AUTH_URL` 은 두지 않는다.
  6. 재배포(S13).
- **완료 확인**

  | 확인 | 기대 |
  |---|---|
  | `<URL>/api/auth/providers` | `google` 포함 |
  | 5.3 핸드셰이크 스크립트 | `302` · `accounts.google.com` · `redirect_uri` = `<URL>/api/auth/callback/google` |
  | 브라우저에서 Google 버튼 클릭 | 오류 화면이 아니라 Google 계정 입력 화면 → 리디렉션 URI 등록 일치 |

- **흔한 실수** : T05 · T06.

### S10. Supabase 전용 프로젝트 · SQL · DA 리뷰 · 마이그레이션

- **목적** : 사이트 전용 DB 의 `public` 에 baseline + 앱 SQL 을 적용한다.
- **담당** : 마스터(프로젝트·접속 문자열) + 서비스(SQL·리뷰·적용)
- **방법**
  1. **(마스터) 프로젝트 생성** : Supabase → New project(사이트 전용 1개). 리전 = **Northeast Asia (Seoul) `ap-northeast-2` 권장**(`vercel.json` `icn1` 과 같은 지역 — 3-1 의 리전 지연 근거와 같은 이유) [확인중 : 마스터 — dbms 실제 리전]. **Database Password** 는 Generate 후 바로 `.env.local` 메모에 보관하고(S10-5 접속 문자열에 필요), 특수문자(`@` `#` `/` `:`)가 있으면 URL 인코딩한다.
  2. **(서비스) SQL 확인** : S3 에서 복사·이름 변경된 `sql/001_<app>_auth_link.sql`·`002_<app>_auth_lnk_try.sql`·`003_<app>_auth_lnk_try_glob_idx.sql` 을 그대로 쓴다. 본문은 그대로(테이블 `sys_usr_auth_lnk`·`sys_auth_lnk_cd`·실패 이력·인덱스 `x_sys_auth_lnk_try_hist_02`). **1~3행 머리 주석은 새 앱 기준으로 다시 쓴다** — 1행 설명의 dbms 결정 문구, 2행 dbms 승인 `DA-APPROVED`(남의 앱 승인이 남으면 da-ddl-guard 는 통과하지만 이 앱은 리뷰를 안 받은 상태가 된다), 3행 `--app dbms` 를 지우고, `DA-APPROVED` 는 S10-3 리뷰 결과로 S10-4 에서 새로 쓴다.
  3. **(서비스) DA 리뷰** : da-governance-expert 단독 호출(단건 리뷰라 DA팀 미소집). dbms 결과 = 조건부 승인(seminar 와 본문 diff 0, `lnk_cd CHAR(6)` 예외).
  4. **(서비스) 헤더 확정은 적용 전에** : 헤더 블록(1행 설명 줄 다음 = 2행)에 `-- DA-APPROVED: <승인사유> (<YYYY-MM-DD>)`. 적용 기록이 파일 SHA-256 이라 적용 뒤에 고치면 "내용 바뀜" 경고만 남고 재적용되지 않는다. 커밋.
  5. **(마스터) 접속 문자열** : Supabase → 상단 **Connect → Session pooler** 화면의 문자열을 **그대로 복사**한다(호스트 직접 입력 금지 — 프로젝트에 따라 `aws-0-`·`aws-1-` 등으로 다르다. 형태 `postgresql://postgres.<ref>:<비밀번호>@aws-N-<리전>.pooler.supabase.com:5432/postgres`). 넣는 곳은 `.env.local` 의 **`<APP>_PROD_DATABASE_URL`**. REST 주소(`https://…supabase.co`)는 안 된다(T13). `sslmode` 를 붙이지 않는다(스크립트가 TLS 강제).
     같은 때 `.env.local` 을 D5 결정에 맞게 정리한다 — `SUPABASE_SCHEMA`(S1 기본값 `<app>_stg`)는 비운다(`public`). **`APP_TIER`(S1 기본값 staging)도 비운다** — `prod` 로 두면 생성기가 넣은 `ADMIN_PI_USERNAMES` 에 `ADMIN_PI_UIDS` 가 없어 로컬 빌드가 실패한다(꼭 `prod` 를 쓰려면 `ADMIN_PI_USERNAMES` 를 비운다). 로컬에서 DB 를 쓰려면 S11 의 `NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 를 `.env.local` 에도 넣는다(생성기는 'STEP 4 — 로컬은 비워 둠' 으로 비워 두므로 그대로면 로컬 API 503). 이는 운영 DB 직접 사용이라 D5 위험 수용 후에만 [확인중 : 마스터].
  6. **(서비스) 적용**

     ```bash
     node scripts/db-migrate.mjs --app yea --tier prod --dry-run   # 적용 예정(+) 5개 : pi-db/000_baseline.sql · pi-db/010_pi_pymnt.sql · yea.pi/001~003 (Pi 전용으로 sql 을 뺐으면 2개)
     node scripts/db-migrate.mjs --app yea --tier prod             # 실제 적용(파일 단위 트랜잭션, 실패 시 ROLLBACK 후 중단)
     node scripts/db-migrate.mjs --app yea --tier prod             # 재실행 = 변경 없음(전부 적용됨 =)
     ```

- **완료 확인** : 재실행이 '변경 없음'. Supabase Table Editor 에 `schema_migrations`·`sys_user`·연동 테이블이 `public` 에 있다.
- **흔한 실수** : **`--tier dev|stg` 는 `<app>_dev`·`<app>_stg` 스키마를 새로 만든다 — 전용 프로젝트 `public` 에는 `--tier prod` 만**(T12). 다른 앱 템플릿에서 복사한 키 이름(예 `SCHEMA_DATABASE_URL`)에 주소를 넣음(T17).

### S11. Vercel 에 Supabase 키

- **목적** : 앱 런타임이 DB 를 쓰게 한다.
- **담당** : 마스터
- **방법** : Vercel Production·Preview 에

  | 키 | 구하는 곳 |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
  | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → secret 키(`sb_secret_…`) |

  `*_DATABASE_URL` 은 Vercel 에 넣지 않는다. `SUPABASE_SCHEMA` 는 비운다(`public`).
  **Preview 주의(코드 근거 `packages/pi-db/src/db-env.ts`)** : `APP_TIER` 가 비면 Preview 는 `VERCEL_ENV=preview` → staging tier 로 판정되고, `STAGING_*` 자격증명이 없으면 운영으로 폴백하지 않아 DB 호출이 503 이다. Preview 에서 DB 가 필요 없으면 그대로 두고, 필요하면 Preview 에 `APP_TIER=prod`(= 운영 DB 직접 사용)를 넣는다. dbms 의 Preview 설정·채택안은 [확인중 : 마스터].
- **완료 확인** : 재배포(S13) 후 S14 Pi 로그인이 503 없이 성공하고 `sys_user` 에 행이 생긴다.
- **흔한 실수** : T11. service role key 를 `NEXT_PUBLIC_` 이름으로 등록(7절).

### S12. Pi Developer Portal 앱 · 검증 키 · Pi 키

- **목적** : Pi Browser 로그인을 켠다.
- **담당** : 마스터(포털) + 서비스(검증 키 파일·확인)
- **방법** : 포털 위치는 [ENV_GUIDE](../docs/ENV_GUIDE.md) 3.2.
  1. **(마스터)** 휴대폰 Pi Browser → `develop.pi` → **testnet 앱** 등록(메인넷 앱은 운영 도메인 확정 후).
  2. **(마스터)** 앱 화면 → **App URL(호스팅 주소)** 에 `<URL>` 입력·저장([LOGIN_PLAYBOOK](../docs/LOGIN_PLAYBOOK.md) 40행 — App URL 이 없으면 검증 대상 도메인이 없고 Open app(pinet 포워딩)도 앱으로 연결되지 않는다). App URL 을 바꾸면 검증을 다시 한다.
  3. **(마스터)** 그다음 앱 체크리스트 → 도메인 검증(Verify domain) 키를 서비스에 전달(공개값이라 전달 가능).
  4. **(서비스)** 키를 앱 루트 `sitemap/<domain>/validation-key.txt` 로 저장·커밋·push·승격(testnet 키는 공개값, seminar 와 같은 방식). route 가 env `PI_DOMAIN_VALIDATION_KEY` 1순위, 이 파일 2순위로 서빙한다(`outputFileTracingIncludes` 로 번들 포함).

     ```bash
     git add sitemap/yea.pi/validation-key.txt
     git commit -m "🔑 chore(yea): Pi Developer Portal 도메인 검증 키 파일(testnet 앱) — /validation-key.txt 2순위 서빙(공개 검증 키, 비밀 아님)"
     git push origin master && node scripts/promote-to-prod.mjs --app yea --yes
     ```

  5. **(서비스)** 운영 빌드 success 확인 → 5.2 검증 키 비교가 `true` → **(마스터)** 포털에서 Verify.
  6. **(마스터)** Vercel 에 등록 → 재배포(S13).

     | 키 | 구하는 곳 | 값 |
     |---|---|---|
     | `NEXT_PUBLIC_PI_APP_DOMAIN` | 앱 화면 맨 위 **Open app** 주소 | `<app>NNNN.pinet.com` — **없으면 Pi 로그인 POST 403 `cross_origin_auth`** |
     | `NEXT_PUBLIC_PI_SANDBOX` | 포털 값 아님 | testnet = `true`(S7 에서 이미 넣었으면 그대로) |
     | `PI_API_KEY` | 앱 화면 → API Key → Generate(한 번만 표시) | 결제(나중)용이지만 포털에서 받은 김에 등록 |
     | `NEXT_PUBLIC_PI_OAUTH_CLIENT_ID`(선택) | 앱 화면 → Pi Sign-In → Client ID, 콜백 `<URL>/auth/pi/callback` · `http://localhost:<port>/auth/pi/callback` 정확히 등록 | 없으면 SDK 로그인만 |

- **완료 확인** : `<URL>/validation-key.txt` 내용 = 파일 내용(5.2), 포털 도메인 검증 통과.
- **흔한 실수** : T08 · T09. 다른 앱 `validation-key.txt` 를 복사해 둠.

### S13. 재배포

- **목적** : 바꾼 환경변수를 빌드에 반영한다. `NEXT_PUBLIC_*` 는 빌드 때 코드에 박히므로 **환경변수만 바꾸면 새 빌드가 필요**하다.
- **담당** : 마스터 또는 서비스
- **방법(둘 중 하나)**
  - Vercel → Deployments → 최신 Production → **⋯ → Redeploy**, Build Cache 사용 해제.
  - `sitemap/<domain>/` 안의 실제 파일 변경(예 `docs/ROADMAP.md` 진행 기록)을 커밋 → `git push origin master` → `node scripts/promote-to-prod.mjs --app yea --yes`. **`git commit --allow-empty` 는 쓰지 않는다** — Vercel 이 Root Directory 를 건드리지 않은 커밋을 `Skipped - Not affected` 로 건너뛰고 상태는 success 로 찍는다(T04, dbms f154d136 실측).
- **완료 확인** : '환경변수 변경 뒤' 빌드가 success 인지 본다. 같은 커밋에 빌드가 여러 개면 **배포 ID·시각**으로 고른다 — 운영 HTML 의 `data-dpl-id="dpl_…"`(5.2 스모크 출력에 보임)가 Vercel 의 그 배포 ID 와 같아야 한다.
- **흔한 실수** : T14.

### S14. Pi Browser 실기기 로그인

- **목적** : 핵심 가치 1 확인. 인증 변경은 실기기 확인 전에는 완료가 아니다(팀장 승인 최대 CONDITIONAL).
- **담당** : 마스터(실기기) + 서비스(대기·로그 확인)
- **방법** : 휴대폰 Pi Browser → 포털 Open app 주소(`<app>NNNN.pinet.com`) → 자동 인증 → 헤더에 Pi 사용자명.
- **완료 확인** : 헤더 사용자명 표시 · Supabase Table Editor → `sys_user` 에 새 행(`pi_username`·`pi_uid`).
- **흔한 실수** : 403 `cross_origin_auth`(T08) · 503(T11). UA 로 Pi Browser 를 판정해 인증을 미리 막는 코드 추가 금지(루트 CLAUDE.md 철칙 — `window.Pi.authenticate()` 성공만 신뢰).

### S15. Google 로그인 · 계정 연동

- **목적** : 한 사람의 Pi 계정과 Google 계정을 6자리 코드로 잇는다(Pi + Google 사이트만).
- **담당** : 마스터(실기기·PC)
- **방법**
  1. **PC 일반 브라우저, 미로그인 상태**로 `<URL>` → 첫 로드 '확인 중' 최대 약 20초(Pi SDK 자동 인증 시도, T15) → Google 로그인.
  2. 헤더에 **'계정 연동 필요'** 가 뜬다.
  3. 휴대폰 Pi Browser 홈 → **'코드 발급'**(Pi 세션이면 홈에 바로 보임) → 6자리 코드(10분 유효).
  4. PC `/link` 에 6자리 입력 → 연동 완료.
- **완료 확인** : PC 헤더가 연동 완료 상태 · `sys_usr_auth_lnk` 에 행.
- **흔한 실수** : Pi Browser 에서 Pi 로그인된 상태로 Google 버튼을 찾음(설계상 숨김, T05) · 코드 버튼을 못 찾음(T10) · 실패 5건 초과 429(무차별 대입 방어, 시간 지나 재시도).

### S16. 관리자 승격

- **목적** : 마스터 계정을 `sys_user.role=ADMIN` 으로.
- **담당** : 마스터 + 서비스
- **방법**
  1. S14 로그인 뒤 Supabase Table Editor → `sys_user` → 자기 행의 `pi_uid` 확인.
  2. Vercel Production 에 **`ADMIN_PI_USERNAMES`·`ADMIN_PI_UIDS` 를 함께** 등록(사용자명은 세 시스템 같은 값 — 기존 앱 `.env.local` 에서 복사, 생성기가 로컬에는 이미 넣음).
  3. 재배포(S13) → Pi Browser 재로그인.
- **완료 확인** : `sys_user.role` = `ADMIN`. 목록에서 빼도 자동 강등은 없다(DB 수동).
- **흔한 실수** : 사용자명만 넣음 → 빌드 차단(T07). `pi_uid` 는 (포털 앱 × testnet/mainnet) 범위 값이라 메인넷 전환·포털 앱 변경 때 다시 받아 등록한다(영구 식별자는 `pi_username`).

### S17. 이후 — 링크만

| 할 일 | 정본 |
|---|---|
| 모니터링 연결(`pi-mon` SYSTEMS · schema.pi CHECK SQL · MonRum · `MON_INGEST_*`) | TODO 7단계 |
| 결제(U2A) · Pi Browser 실기기 결제 | [LOGIN_PLAYBOOK](../docs/LOGIN_PLAYBOOK.md) · `packages/pi-payments`(TODO 에는 결제 구현 단계가 없다 — 실기기 확인은 TODO §9 검증·원장) |
| 결함 원장 사이트 절 추가 · 1절 체크리스트 통과(첫 운영 배포 전) | [BUILD_DEFECTS](../docs/BUILD_DEFECTS.md) |
| `node scripts/tenant-env.mjs multi` · ENV_GUIDE 2절 표 행 추가 | [ENV_GUIDE](../docs/ENV_GUIDE.md) 4절 |
| 메인넷 앱 · 등재 · `sites.json` appSts `LIVE` | TODO 10단계 |

---

## 4. 환경변수 매트릭스

키별 구하는 곳의 정본은 [ENV_GUIDE](../docs/ENV_GUIDE.md) 3절, 스키마 정본은 앱 `src/env.ts`. 값은 어디에도 적지 않는다.

### 4.1 빌드를 막는 규칙 (`src/env.ts`)

| 규칙 | 걸리면 |
|---|---|
| `PI_SESSION_SECRET` 없음 또는 32자 미만 | 빌드 실패 `Invalid environment variables` |
| `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`·`AUTH_SECRET` 중 일부만 있음(전부 또는 전무) | 빌드 실패 |
| 운영 tier(`APP_TIER=prod`, 또는 `APP_TIER` 없고 `VERCEL_ENV=production`)에서 `ADMIN_PI_USERNAMES` 있고 `ADMIN_PI_UIDS` 없음 | 빌드 실패 |
| 값이 있을 때 형식 : `*_URL`=url · `APP_TIER`=dev\|staging\|prod · `CRON_SECRET`≥16 · `MON_INGEST_KEY`≥32 · `AUTH_SECRET`≥32 · `*_SANDBOX`·`*_FEATURE_PI_PRICE`=true\|false · `NEXT_PUBLIC_GOOGLE_LOGIN`='1' | 빌드 실패 |

빈 문자열 = 미설정. 그 밖의 키는 비면 기능만 꺼진다.

### 4.2 매트릭스

O = 등록, X = 등록 안 함, - = 해당 없음. Vercel 값은 `.env.vercel-prod` 를 통째로 붙이지 않는다 — 그대로 넣으면 안 되는 값이 들어 있다(S7 흔한 실수).

| 키 | 빌드 차단 | 구하는 곳 | 로컬 `.env.local` | Vercel Production | Vercel Preview | 등록 Step |
|---|---|---|---|---|---|---|
| `PI_SESSION_SECRET` | 필수 | 직접 생성(4.5) — 생성기가 넣음 | O(로컬 값) | O(운영 값) | O | S1 → S7 |
| `NEXT_PUBLIC_APP_URL` | - | 로컬 `http://localhost:<port>` / 운영 `<URL>` | O | O | O(`<URL>` 같은 값) | S7 |
| `NEXT_PUBLIC_PI_SANDBOX` | - | testnet·로컬 `true`, 메인넷 운영 `false` | O | O | O | S7 · S12 |
| `GOOGLE_CLIENT_ID` | 3키 묶음 | Google Console Credentials | O | O | O | S9 |
| `GOOGLE_CLIENT_SECRET` | 3키 묶음 | 위와 같음(생성 팝업에서 바로 복사) | O | O | O | S9 |
| `AUTH_SECRET` | 3키 묶음 | 직접 생성 — 생성기가 넣음 | O(S4 에서 비우고 S9 에서 되살림) | O(Google 과 함께) | O(Google 과 함께) | S9 |
| `NEXT_PUBLIC_GOOGLE_LOGIN` | - | 넣지 않아도 됨(next.config 가 3키로 파생, 직접값 우선) | 선택 | X | X | - |
| `NEXT_PUBLIC_SUPABASE_URL` | - | Supabase Project Settings → Data API → Project URL | 로컬에서 DB 를 쓸 때만 S11 값(운영 DB 직접 — D5 위험 수용 후, S10-5) | O | O | S11 |
| `SUPABASE_SERVICE_ROLE_KEY` | - | Supabase Project Settings → API Keys → secret | 위와 같음 | O | O | S11 |
| `SUPABASE_SCHEMA` | - | `public` 단일이면 비움 | 비움 | 비움 | 비움 | S10 |
| `APP_TIER` | - | 비우면 `VERCEL_ENV` 로 판정(production=prod · preview=staging · development=dev · 그 외 prod) | 비움(`prod` 면 `ADMIN_PI_UIDS` 없이 로컬 빌드 실패 — S10-5) | 비움 또는 `prod` | 4.3 | S10 · S11 |
| `<APP>_PROD_DATABASE_URL` | - (env.ts 에 없음) | Supabase Connect → Session pooler(5432) | O(마이그레이션 때만) | **금지** | **금지** | S10 |
| `<APP>_DEV/STG_DATABASE_URL` | - | `public` 단일이면 쓰지 않음 | X | 금지 | 금지 | - |
| `NEXT_PUBLIC_PI_APP_DOMAIN` | - (비면 로그인 403) | 포털 Open app 주소 | testnet 값 | O | O | S12 |
| `PI_API_KEY` | - | 포털 API Key → Generate | 결제 시험 때 | O | 결제 시험 때 | S12 |
| `PI_DOMAIN_VALIDATION_KEY` | - | 포털 Verify domain 키 — 파일 `validation-key.txt` 로 대신 가능 | X | 선택 | 선택 | S12 |
| `NEXT_PUBLIC_PI_OAUTH_CLIENT_ID` | - | 포털 Pi Sign-In → Client ID | 선택 | 선택 | 선택 | S12 |
| `ADMIN_PI_USERNAMES` | UIDS 와 묶음(운영) | 직접 입력, 세 시스템 같은 값 | O | O(S16) | 선택 | S16 |
| `ADMIN_PI_UIDS` | 위와 같음 | 로그인 후 `sys_user.pi_uid` | 선택 | O(S16) | 선택 | S16 |
| `CRON_SECRET` | - (값 있으면 ≥16) | 직접 생성 — 생성기가 넣음 | O | 크론 구현 후 | X | 나중 |
| `MON_INGEST_URL` · `MON_INGEST_KEY` | - | schema.pi 운영 수집 API · 기존 앱 값 복사(새로 만들지 않음) | X | 모니터링 연결 후 | [확인중 : 마스터] | TODO 7 |
| `NEXT_PUBLIC_FEATURE_PI_PRICE` | - | 비움 = 시세칩 표시, `false` = 숨김 | 비움 | 비움 | 비움 | - |
| `DEV_*` · `STAGING_*` · `STAGING_DB_TARGET` · `PROD_RO_*` | - | 비운영 tier 를 쓸 때만 | 4.3 | X | 4.3 | - |
| `VERCEL_ENV` | - | Vercel 자동 주입 | X | 자동 | 자동 | - |
| `SKIP_ENV_VALIDATION` | 검증 생략 | env 없는 CI 만 | 평소 X | **금지** | **금지** | - |

### 4.3 `public` 단일일 때 로컬·Preview 의 tier

`packages/pi-db/src/db-env.ts` 판정 순서 = `APP_TIER` 명시 > `VERCEL_ENV` > 기본 prod. 비운영 tier 는 자기 자격증명이 없으면 운영으로 폴백하지 않고 503.

| 환경 | `APP_TIER` 비움 | `APP_TIER=prod` |
|---|---|---|
| 로컬(`VERCEL_ENV` 없음) | prod → `NEXT_PUBLIC_SUPABASE_URL`(전용 프로젝트, 비어 있으면 503) | 같음. 단 env.ts 운영 tier 규칙이 걸려 `ADMIN_PI_USERNAMES` 만 있으면 빌드 실패 |
| Preview | staging → `STAGING_*` 없으면 DB 503 | 운영 DB 직접 사용 |
| Production | prod | prod |

생성기는 로컬에 `APP_TIER=staging` 을 넣으므로 그대로 두면 로컬은 `STAGING_*`(생성기가 sitemap.pi 에서 복사한 비운영 값)를 쓴다. 이 매뉴얼 권장은 S10-5 의 '비움' 이다. 로컬이 운영 DB 를 쓰는 위험 수용은 D5 와 함께 [확인중 : 마스터].

### 4.4 첫 배포 최소 집합 vs 나중에 등록

| 시점 | 키 |
|---|---|
| **첫 배포(S7)** | `PI_SESSION_SECRET` · `NEXT_PUBLIC_APP_URL` · `NEXT_PUBLIC_PI_SANDBOX`(권장 — dbms 실제 등록은 S12) — Production·Preview 둘 다 |
| S9 | `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `AUTH_SECRET`(셋 함께) |
| S11 | `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY`(+ Preview `APP_TIER` 결정) |
| S12 | `NEXT_PUBLIC_PI_APP_DOMAIN` · `PI_API_KEY` · (S7 에 안 넣었으면) `NEXT_PUBLIC_PI_SANDBOX` · (선택) `NEXT_PUBLIC_PI_OAUTH_CLIENT_ID` · `PI_DOMAIN_VALIDATION_KEY` |
| S16 | `ADMIN_PI_USERNAMES` · `ADMIN_PI_UIDS`(둘 함께) |
| 나중 | `CRON_SECRET`(크론 구현 후) · `MON_INGEST_*`(TODO 7) · 메인넷 값(`NEXT_PUBLIC_PI_SANDBOX=false` 등) |

### 4.5 비밀값 생성 명령

앱마다·환경마다 다른 값을 만든다([ENV_GUIDE](../docs/ENV_GUIDE.md) 2절·3.1). 화면·대화에 남기지 않도록 클립보드로 바로 보낸다.

```powershell
# PowerShell — 클립보드로 바로(PI_SESSION_SECRET·AUTH_SECRET)
openssl rand -base64 32 | Set-Clipboard
# CRON_SECRET
openssl rand -hex 24 | Set-Clipboard
```

```bash
# 어느 셸이든(ENV_GUIDE 3.1 명령) — 출력이 화면에 보이므로 대화 창에 붙이지 않는다
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## 5. 검증 명령 모음 (복사해 쓰기)

아래 5.1~5.3 은 2026-11-01 `dbmspi.vercel.app` 으로 실제 실행해 확인했다. 인라인 `node -e` 는 **작은따옴표·백틱·`$` 없이** 써서 bash·PowerShell 둘 다 그대로 돈다(T16).

### 5.1 GitHub 커밋 상태 — `Vercel – <프로젝트>` 개별 확인 (gh CLI 없음)

자기 프로젝트의 상태 전부(같은 SHA 의 Preview·Production 배포가 각각 따로 나온다) :

```bash
node -e "fetch(process.argv[1]).then(r=>r.json()).then(a=>a.filter(s=>s.context.endsWith(process.argv[2])).forEach(s=>console.log(s.state,s.updated_at,s.description,s.target_url)))" https://api.github.com/repos/anakinwon/loginpi/commits/<sha>/statuses <app>
```

그 커밋에 상태를 찍은 프로젝트 목록(T03 비교용) :

```bash
node -e "fetch(process.argv[1]).then(r=>r.json()).then(a=>console.log([...new Set(a.map(s=>s.context))].join(String.fromCharCode(10))))" https://api.github.com/repos/anakinwon/loginpi/commits/<sha>/statuses
```

- **판정** : `description` 이 `Deployment has completed` 인 줄만 빌드 성공이다. `Skipped - Not affected` 는 state 가 success 라도 **빌드 안 됨**(Root Directory 변경 없는 커밋). Production 여부는 `target_url` 의 배포가 Vercel Deployments 에서 Production 표시인지, 또는 운영 HTML `data-dpl-id` 가 일치하는지(5.2)로 본다 — Production 만 ADMIN 규칙(T07)에 걸려 실패하는 경우를 놓치지 않게.
- **자기 프로젝트 줄만 본다.** 다른 프로젝트(예 staging `loginpi`)의 failure 때문에 종합 state 는 실패로 보일 수 있다. 다른 프로젝트 이름이 `<app>` 으로 끝나면(예 `maps` ↔ `sitemaps`) 줄이 섞이므로 `target_url` 의 `/<app>/` 로 구분한다.
- 자기 줄이 아예 없으면 Git 연결 미완(T03). 줄이 있으면 시각을 push 시각과 비교한다(새 줄이 위에 온다).

### 5.2 운영 스모크

```bash
node -e "Promise.all(process.argv.slice(1).map(u=>fetch(u).then(async r=>console.log(r.status,u,(await r.text()).slice(0,90).replace(/\s+/g,String.fromCharCode(32))))))" <URL>/ <URL>/link <URL>/api/auth/me <URL>/api/auth/providers <URL>/validation-key.txt
```

| 경로 | 기대 |
|---|---|
| `/` · `/link` | 200, `<html data-dpl-id="dpl_…" lang="ko"` (배포 ID 확인용) |
| `/api/auth/me` | 200 `{"user":null}` |
| `/api/auth/providers` | 200, `"google"` 포함(Pi + Google 사이트). Pi 전용은 404 가 정상 |
| `/validation-key.txt` | 200, 키 문자열(S12 전에는 404) |

검증 키가 커밋한 파일과 같은지(`true` 기대) :

```bash
node -e "fetch(process.argv[1]).then(r=>r.text()).then(t=>console.log(t.trim()==require(process.argv[2]).readFileSync(process.argv[3],process.argv[4]).trim()))" <URL>/validation-key.txt fs sitemap/<domain>/validation-key.txt utf8
```

> Git Bash 에서는 `/link` 처럼 `/` 로 시작하는 인자가 Windows 경로로 바뀐다. 그래서 위 명령은 전체 URL 을 인자로 넘긴다.

### 5.3 Google OAuth 핸드셰이크 (csrf → POST signin/google → location 의 redirect_uri)

셸 인라인 금지 — 스크래치패드에 `google-handshake.mjs` 로 저장(Write 도구·편집기)하고 실행한다.

```js
// Google OAuth 핸드셰이크 확인 — node google-handshake.mjs <앱URL>
const base = process.argv[2].replace(/\/$/, '')
const r1 = await fetch(base + '/api/auth/csrf')
const { csrfToken } = await r1.json()
const cookie = r1.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
const r2 = await fetch(base + '/api/auth/signin/google', {
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, origin: base },
  body: new URLSearchParams({ csrfToken, callbackUrl: base + '/' }),
})
const loc = r2.headers.get('location') || ''
console.log('status      ', r2.status)
console.log('host        ', loc ? new URL(loc).host : '(없음)')
console.log('redirect_uri', loc ? new URL(loc).searchParams.get('redirect_uri') : '(없음)')
```

기대(dbms 실행 결과) : `status 302` · `host accounts.google.com` · `redirect_uri <URL>/api/auth/callback/google`. 이 값이 Google Console 승인된 리디렉션 URI 와 글자까지 같아야 한다.

### 5.4 db-migrate 미리보기

```bash
node scripts/db-migrate.mjs --app <app> --tier prod --dry-run
```

- 접속 문자열이 없어도 파일 목록·sha 만 출력하고 exit 0. 있으면 적용 예정(`+`)·적용됨(`=`) 표시, 쓰기 없음.
- 순서 : `packages/pi-db/sql`(000_baseline · 010_pi_pymnt) → `sitemap/<domain>/sql/*.sql`(파일명 정렬).
- 접속 문자열 우선순위 : `--db-url` > `<APP>_<TIER>_DATABASE_URL` > `DATABASE_URL`(앱 `.env.local` 을 먼저 읽음).

### 5.5 결함 스캔 · 빌드

```bash
node .claude/hooks/build-defect-guard.mjs --scan sitemap/<domain>/src   # 합계 1 · exit 1 = link-complete count exact head true(의도, S4). link 라우트를 뺀 Pi 전용은 합계 0 · exit 0
cd sitemap/<domain> && pnpm build && pnpm tsc --noEmit
```

### 5.6 모바일 가로 스크롤 확인

1. PC Chrome → `<URL>` → F12 → 기기 툴바(Ctrl+Shift+M) → 폭 360px.
2. 콘솔에서 넘침 폭 확인(기대 `0`) :

   ```js
   document.documentElement.scrollWidth - document.documentElement.clientWidth
   ```

3. 0 이 아니면 범인 요소 찾기 :

   ```js
   [...document.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
   ```

4. 마지막으로 휴대폰 Pi Browser 실기기에서 홈·`/link` 를 좌우로 밀어 흔들리지 않는지 본다(상단 언어 콤보·시세칩 줄이 흔한 원인).

---

## 6. 트러블슈팅

| # | 증상 | 원인 | 조치 | 오늘(dbms) 사례 |
|---|---|---|---|---|
| T01 | 빌드 실패 `Invalid environment variables` `PI_SESSION_SECRET` undefined | 환경변수 미등록 | S7 최소 집합 등록 → 재배포 | Vercel 첫 빌드 |
| T02 | Production 에 넣었는데 여전히 T01 | 운영 브랜치가 생기기 전 master push 빌드는 **Preview** | Production·Preview 둘 다 등록 | 첫 빌드 직후 |
| T03 | push 해도 빌드 없음 — 기존 프로젝트(loginpi·cafe·schema·seminar·sitemaps·dbms …)는 `Vercel – <이름>` 이 찍히는데 자기만 없음 | 프로젝트 Git 연결 미완 | Settings → Git → Connected Git Repository 연결 · Root Directory 확인 · Ignored Build Step 비움 · Production Branch. 이후 push 로 빌드되는지 5.1 로 확인 | 연결 후 push 만으로 빌드 확인 |
| T04 | 같은 커밋을 새 브랜치에 올렸거나 빈 커밋을 올렸는데 빌드 없음(상태는 success) | Vercel 은 새 커밋에 빌드하되, Root Directory 변경이 없는 커밋은 `Skipped - Not affected` | ① Vercel Redeploy(Build Cache 해제) 또는 ② `sitemap/<domain>/` 안의 실제 파일 변경(예 `docs/ROADMAP.md` 진행 기록) 커밋 → push → promote. `--allow-empty` 는 Skipped 로 끝난다 | `prod/dbms` 첫 생성(3535168c 는 ROADMAP 변경이라 빌드됨) · f154d136 빈 커밋은 2건 모두 Skipped, 실제 빌드는 6·16분 뒤 수동 Redeploy |
| T05 | Google 버튼 없음 | (a) 서버는 Google 활성인데 버튼 플래그 `NEXT_PUBLIC_GOOGLE_LOGIN` 미등록 (b) Pi Browser 에서 Pi 로그인 상태 — 설계상 숨김 | (a) next.config 가 3키로 파생(da2f9e45, seminar·sitemap 동시 수정) (b) 일반 브라우저 미로그인 상태로 확인 | da2f9e45 (schema.pi 2026-10-18 과 같은 원인) |
| T06 | Google 키 일부만 넣었더니 빌드 실패(로컬 첫 빌드 포함) | 3키 전부-또는-전무 규칙. 로컬 첫 빌드 실패 = 생성기가 넣은 `AUTH_SECRET` 단독 | `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`·`AUTH_SECRET` 함께. 로컬은 S4 에서 `AUTH_SECRET` 을 비우고 S9 에서 되살린다 | 등록 순서 주의 |
| T07 | `ADMIN_PI_USERNAMES` 만 넣었더니 빌드 실패 | 운영 tier 에서 UIDS 필수 | 첫 배포엔 둘 다 빼고 S16 에서 함께 | 첫 배포에서 제외 |
| T08 | Pi Browser 로그인 POST 403 `cross_origin_auth` | `NEXT_PUBLIC_PI_APP_DOMAIN` 없음 | Open app 주소 등록 → 재배포 | S12 에서 등록 |
| T09 | `/validation-key.txt` 404 | env·파일 둘 다 없음, 파일이 번들에 안 들어감, 커밋 미배포 | 파일 커밋·승격 → `outputFileTracingIncludes` 확인 → 5.2 비교 | ff95fca3 |
| T10 | Pi Browser 에서 6자리 연동 코드 버튼을 못 찾음 | 발급 UI 가 `/link` 에만 있고 하단 메뉴를 제외해 진입로가 없음 | `home-gate.tsx` — Pi 세션이면 홈에 PiLinkCodeIssuer 노출 | 9be18ac5 |
| T11 | API 503(`DB_UNAVAILABLE`) | Supabase 키 미등록, 또는 Preview·로컬이 비운영 tier 로 판정되고 그 자격증명이 없음 | S11 키 등록 · 4.3 `APP_TIER` 결정 | S11 전 |
| T12 | `db-migrate` 가 `<app>_dev` 스키마를 만듦 | `--tier dev\|stg` 는 `<app>_<tier>` 스키마를 생성 | 전용 프로젝트 `public` 은 `--tier prod` 만. 잘못 만든 스키마 처리는 DA 리뷰 후 [확인중 : 마스터] | 적용 전 확인한 함정 |
| T13 | db-migrate 접속 실패 | REST 주소(`https://…supabase.co`)를 `*_DATABASE_URL` 에 넣음 | Connect → Session pooler `postgresql://…:5432/postgres` | S10 |
| T14 | 환경변수를 바꿨는데 반영 안 됨 | `NEXT_PUBLIC_*` 는 빌드 때 박힘, 재빌드 안 함 / 다른 빌드를 보고 있음 | S13 재배포, 배포 ID·시각(`data-dpl-id`)으로 '변경 뒤 빌드' 확인 | f154d136 |
| T15 | 일반 브라우저 첫 로드 '확인 중' 최대 약 20초 | Pi SDK 자동 인증 시도(설계) | 기다린다. UA 로 Pi 인증을 미리 막아 줄이지 않는다(루트 CLAUDE.md 철칙) | S15 |
| T16 | 스크립트가 엉뚱한 파일을 실행하거나 빈 파일이 생김 | `node -e "…"` 안의 백틱이 셸 명령 치환으로 실행됨 | 문서 편집은 Edit 도구, 스크립트는 스크래치패드 `.mjs`. 인라인은 5절처럼 백틱·작은따옴표·`$` 없이 | cafe `docs/PRD.md` 가 실행돼 빈 파일 3개 |
| T17 | 앱 DB 주소가 다른 이름의 키에 들어가 있음 | 다른 앱 `.env` 템플릿 복사 흔적 | `<APP>_PROD_DATABASE_URL` 로 정리 | `SCHEMA_DATABASE_URL` 이름으로 들어가 있었음 |
| T18 | 승격은 성공했는데 운영이 옛날 화면 | 빌드 실패 시 Vercel 이 이전 배포를 계속 서빙 | 5.1 로 `Vercel – <app>` 의 `success` · `Deployment has completed` 개별 확인 | 매 승격 |
| T19 | 비밀값이 대화에 실림 | IDE 에서 `.env` 줄을 선택한 채 질문 | 7.2 교체 절차 | DB 비밀번호·service role key 교체 |

---

## 7. 보안 수칙

### 7.1 하지 말 것

- **IDE 에서 `.env*` 파일 줄을 선택한 채 질문하지 않는다** — 선택 영역이 그대로 대화에 첨부된다. `.env` 파일은 닫고 질문한다.
- 비밀값을 대화·문서·커밋 메시지·PR 에 적지 않는다. 문서에는 **키 이름과 구하는 곳**만.
- 커밋하는 env 파일은 **`.env.example` 만**이다. `.env.local`·`.env.vercel-prod`·`.env.multi` 는 gitignore — `git check-ignore -v <파일>` 로 확인 후 스테이징.
- `SUPABASE_SERVICE_ROLE_KEY` 는 **서버 전용** : `NEXT_PUBLIC_` 이름 금지, 클라이언트 컴포넌트에서 import 금지, anon 키 사용 금지.
- `*_DATABASE_URL`(DB 비밀번호 포함)은 로컬 마이그레이션에만, Vercel 에 넣지 않는다.

### 7.2 노출됐을 때 교체 절차

| 노출된 값 | 교체 |
|---|---|
| DB 비밀번호(`*_DATABASE_URL`) | Supabase → Database → Reset password → `.env.local` 의 접속 문자열 갱신 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → 새 secret 생성 → `.env.local`·Vercel 교체 → 재배포(S13) → 동작 확인 후 **구 키 폐기** |
| 직접 만든 비밀키(`PI_SESSION_SECRET`·`AUTH_SECRET`·`CRON_SECRET`) | 4.5 로 새로 생성 → `.env.local`·Vercel 교체 → 재배포(기존 세션은 무효화된다) |
| `PI_API_KEY` · `GOOGLE_CLIENT_SECRET` | 각 포털에서 재발급 → 교체 → 재배포 [확인중 : 포털별 재발급 메뉴] |

### 7.3 공개값

- **`validation-key.txt`(도메인 검증 키)** 는 `/validation-key.txt` 로 누구에게나 서빙되는 공개값이라 커밋해도 된다(testnet 앱, seminar·dbms 같은 방식).
- `NEXT_PUBLIC_*` 는 브라우저에 그대로 나가는 값이다. 비밀을 이 이름으로 만들지 않는다.

---

## 8. 기준 사례 이력 — dbms.pi 커밋 (2026-11-01)

| 시각 | 커밋 | 내용 | Step |
|---|---|---|---|
| 11:10 | e8162986 | 착수 — tenant-env 골격(포트 3004)·PRD v0.2(연결 = 별도 DB + schema.pi 연결 API, 로그인 Pi + Google 예외), W4 선착수 예외·TODO 진행 현황 기록 | S0~S2 |
| 11:31 | db5d3311 | 5~7단계(이행·CDC·분석) 요구사항·일정·선행 교훈, PRD v0.3 | S2 |
| 11:40 | abf4672b | F-04 모니터링 이전 영향 범위 실측 | S2 |
| 12:18 | 0a1c87a0 | Phase 1 앱 골격 — seminar.pi 기준 복제·축소(Pi SDK·Pi Sign-In·Google + 6자리 연동 코드, @pi/i18n 219 locale, 워프, @pi/guard, validation-key, regions icn1) | S3~S4 |
| 12:19 | 16ca8a66 | ROADMAP Phase 1 진행 기록(앱 골격 1차·미결 5건) | S3 |
| 13:09 | 3535168c | Phase 0 진행 — Vercel 프로젝트·GitHub 연동·`prod/dbms` 생성 기록 | S5~S8 |
| 13:40 | 8063c0ac | sql/001~003 DA 리뷰 조건부 승인 반영, 헤더 DA-APPROVED | S10 |
| 13:56 | b33c29b1 | Phase 0 진행 — 운영 빌드 success·Google OAuth 핸드셰이크 확인·DB 적용(baseline + sql/001~003) | S9 · S10 |
| 14:20 | ff95fca3 | Pi Portal 도메인 검증 키 파일(testnet) — `/validation-key.txt` 2순위 서빙 | S12 |
| 14:31 | f154d136 | 운영 재빌드 트리거 — Vercel 환경변수(Pi Portal 키) 반영, Pi Browser 실기기 시험용. 빈 커밋이라 `Skipped - Not affected`, 실제 빌드는 14:37·14:47 수동 Redeploy(T04) | S13~S14 |
| 14:50 | da2f9e45 | Google 버튼 미노출 수정 — `NEXT_PUBLIC_GOOGLE_LOGIN` 을 서버 3키에서 빌드 때 파생, seminar·sitemap 같은 블록도(R-P0) | S15 (T05) |
| 14:52 | 9be18ac5 | 연동 코드 발급 버튼 못 찾음 수정 — Pi 세션이면 홈에 PiLinkCodeIssuer 노출 | S15 (T10) |

이전 기준선 : **0a1c87a0 시점의 seminar.pi**(직전 seminar 커밋 04ef6bab, 11-01 09:51)를 복제했다. 5f6dfb3b(10-31 19:33, @pi/i18n 1차) 뒤의 48f62b2a(10-31 20:10, @pi/i18n v0.2.0 언어 콤보·시세칩) · bc88c0f9(11-01 07:35, 모바일 가로 스크롤) · e362bfc4(07:51, IP 국가 언어 자동 선택 — PreferredLocaleScript + geo) · 01369d3f(08:33, 도착 워프 — WarpArrival) · 04ef6bab(09:51, 로고)가 반영된 상태다.

---

## 9. 다음 개선 과제 (자동화 후보)

| # | 과제 | 근거 | 담당 |
|---|---|---|---|
| 1 | 생성기 `.env.example` 로컬 URL 안내 포트 치환 — 템플릿 `sitemap/sitemap.pi/.env.example` 4행 `localhost:3000` 이 `--port` 로 안 바뀜 | `scripts/tenant-env.mjs` 117-122 치환 목록에 없음 | 서비스 |
| 2 | 골격 복제 스크립트화 — 3절 포함 목록 복사 + 3-3 이름·포트 치환 + `validation-key.txt` 제외를 한 명령으로(예 `tenant-env.mjs scaffold`). 복제 원본(seminar.pi / dbms.pi)과 PRD_28 §2 "`_template` 선제 작성 금지"와의 관계 | S3 수작업 | [확인중 : 마스터] |
| 3 | TODO 갱신 — §0-4 포트 3004 추가 · §3 기준 seminar.pi + next.config(Google 파생·headers·messages tracing) + validation-key 파일 2순위 + 홈 연동 코드 진입로 · §4 Google 플래그 파생 한 줄 · §5 전용 프로젝트 `public` = `--tier prod` 분기 + baseline 2개 선적용 · §6 validation-key 파일 커밋 대안 | 이 매뉴얼 S3·S10·S12 | 서비스 |
| 4 | 생성기 DB 방식 옵션 — 지금은 비운영 기본값(`APP_TIER=staging`·`SUPABASE_SCHEMA=<app>_stg`·sitemap.pi 의 `STAGING_*` 복사). `public` 단일 옵션 추가. dbms `.env.local` 은 현재 `APP_TIER=staging`·`SUPABASE_SCHEMA=public`, `NEXT_PUBLIC_GOOGLE_LOGIN` 줄 중복(2026-11-01 비밀 아닌 값만 확인) | 4.3 | [확인중 : 마스터] |
| 5 | `db-migrate.mjs` 안전장치 — 전용 프로젝트 앱에 `--tier dev\|stg` 를 쓰면 경고 또는 `public` 강제 옵션 | T12 | 서비스 |
| 6 | Vercel 환경변수 일괄 등록 방법(대시보드 붙여넣기 / `vercel env add` 등) — 키 수십 개를 손으로 넣는 단계 단축. 단 생성기 `.env.vercel-prod` 는 그대로 붙이면 안 되는 값을 담고 있으므로(S7) 생성기가 붙여넣기용 교정 파일을 내는 방안 포함 | S7·S9·S11·S12 | [확인중 : Vercel 문서·마스터] |
| 7 | 연동 코드 UI(PiLinkCodeIssuer·LinkCodeForm·link-panel·home-gate)를 공용 패키지로 — 앱마다 진입로 누락(T10) 재발 방지 | 9be18ac5 | [확인중 : 마스터] |
| 8 | GitHub 상태 확인(5.1)·운영 스모크(5.2)·핸드셰이크(5.3)를 `scripts/` 정식 스크립트로 | 매 Step 반복 | 서비스 |
| 9 | dbms 문서·주석의 구 비운영 스키마 문구 정합화 — `docs/PRD.md` 40·67·69행, `src/env.ts` 23행 주석, `.env.example` 42·45행 | D5 | [확인중 : 마스터] |
| 10 | Preview `APP_TIER` 표준(503 허용 / `prod`) 결정 후 ENV_GUIDE 5절에 기록 | 4.3 | [확인중 : 마스터] |
| 11 | dbms Google 연동 예외 등재 — PRD_28 §1.1-2 예외 목록·LOGIN_PLAYBOOK ③ 행(지금은 sitemap.pi·seminar.pi 만)에 dbms.pi 추가, `sql/001` 헤더의 '등재 [확인중]' 해소 | D2 | [확인중 : 마스터] |
| 12 | Pi 전용(D2 기본값) 표준 골격 — S3 Pi 전용 분기 중 어느 방식(플래그 게이트 / Google·연동 코드 통째 제거)을 표준으로 할지 | S3 | [확인중 : 마스터] |

---

## 10. 변경 이력

| 날짜 | 버전 | 변경 내용 | 근거 |
|---|---|---|---|
| 2026-11-01 | v1.0 | 최초 작성 — dbms.pi 구축(착수 → 운영 Pi Browser 로그인·Google 연동) 절차·명령·검증·트러블슈팅 19건·개선 과제 10건 | 마스터 지시 "다음 멀티테넌트 사이트 추가 시 참고할 매뉴얼" |
| 2026-11-01 | v1.1 | 검수 결함 반영 — 로컬 첫 빌드 AUTH_SECRET 단독(S4) · `.env.vercel-prod` 통째 붙여넣기 금지(S7) · 빈 커밋 Skipped(S8·S13·T04) · 5.1 판정(description·target_url) · `<URL>` 확정(S6) · Pi 전용 분기(S3) · App URL(S12) · 로컬 APP_TIER(S10-5) · 결함 스캔 기대값 합계 1 · 이름 바꾸기 명령(3-3) · SQL 머리 주석 재작성(S10-2) · S5 커밋 3개 · Google 동의 화면(S9) · Supabase 리전·비밀번호(S10-1) · 기준선 커밋 정정(8절) · 개선 과제 12건 | 검수(통과 12 / 결함 11) + 후속 결함 16건 |
| 2026-11-01 | v1.2 | 맨 앞 '★ 외부 사이트 4곳'(Supabase·Vercel·Google·Pi Portal — 접속 링크·만드는 것·가져오는 값·넣는 곳·흔한 실수·확인, 함께 넣는 키 묶음·보안 경고) 추가 + 팀장 사후 검토 7건(번호 ≠ 진행 순서 명시, Vercel 재방문 단계, 리전 권장 표기, `aws-N` 접속 문자열, Pi 키 넣는 곳 로컬 + Vercel, Pi Sign-In 로컬 콜백) | 마스터 지시 "반드시 접속해야 하는 사이트 4곳 핵심 강조" |
