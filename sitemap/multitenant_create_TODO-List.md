# 멀티테넌트(PDB) 생성 TODO 목록

> 새 `.pi` 사이트(PDB)를 만들 때 모든 테넌트가 따르는 공통 단계의 정본이다(2026-10-24 마스터 지시).
> 마스터가 **사이트 이름만 말하면** 아소카가 아래 명령으로 시작하고, 이 목록 순서대로 진행한다.
>
> ```bash
> node scripts/tenant-env.mjs new <도메인>.pi --port <빈 포트>
> ```
>
> - 위 명령이 만드는 것:
>   - `sitemap/<도메인>.pi/` 폴더
>   - env 3종(`.env.example`·`.env.local`·`.env.vercel-prod`)
>   - `docs/PRD.md`·`ROADMAP.md`·`TROUBLESHOOT.md` 골격
>   - `CLAUDE.md`·`.claude/settings.json`
>   - `sitemap/sites.json` 갱신(appSts PLANNED → BUILDING), `.env.multi` 재생성
> - 이미 있는 파일은 덮어쓰지 않는다.
>
> **용어**: CDB = 공용 패키지 `packages/pi-*`와 운영 절차, PDB = 사이트별 앱·DB·배포·Pi 앱([PRD_28](../docs/PRD_28_PI_MULTISITE.md) §2). 사이트끼리 데이터를 공유하지 않는다.
>
> **담당**: 서비스 = 아소카(직접 수행), 고객 = 마스터(결정·외부 계정 작업). 서비스가 만든 결함은 고객 결재로 넘기지 않는다(R-P0).

## 0. 결정 — 고객

| # | 할 일 | 근거 |
|---|---|---|
| 0-1 | 웨이브 게이트 확인. 앞 웨이브 회고 전에 착수하면 예외 사유를 `docs/ROADMAP_MULTISITE.md`에 한 줄 남긴다 | ROADMAP_MULTISITE 게이트 표 |
| 0-2 | 로그인 방식: Pi 전용(기본) 또는 Pi + Google 연동(예외). 예외면 PRD_28 §1.1-2와 `docs/LOGIN_PLAYBOOK.md`에 사이트를 추가한다 | PRD_28 §1.1-2 |
| 0-3 | 레드라인 플래그(⏸·△)가 있으면 Pi 앱 생성·제출을 보류한다 | PRD_28 §1.1-8, `sites.json` hold |
| 0-4 | 로컬 포트를 정한다. 사용 중: 3000 cafe · 3001 sitemap · 3002 schema · 3003 seminar | ENV_GUIDE 2절 |

## 1. 생성기 실행 — 서비스

- [ ] `node scripts/tenant-env.mjs new <도메인>.pi --port <포트>`
- [ ] 출력의 **직접 발급 필수 키**를 TODO 6단계로 넘긴다
- [ ] 아래 진행 현황 표에 행을 추가한다

## 2. 문서 — 서비스 작성, 고객 확정

- [ ] `docs/PRD.md`를 v1.0으로 확정한다. 근거는 PRD_27 사이트 표(수익 R1~R3)와 PRD_28 §8이고, `[TBD]` 항목은 마스터 질문으로 정리한다
- [ ] `docs/ROADMAP.md` Phase 0 체크
- [ ] 문서 검수(anakin_phase-review: 브랜드 표기·추측 금지) → 팀장 승인 → 커밋

## 3. 앱 골격 — 서비스 (PRD 확정 후)

sitemap.pi를 기준으로 복제한다. 앱 코드 `_template`은 선제 작성 금지(PRD_28 §2)이므로 아래 지점을 직접 옮긴다. schema.pi는 독립 구조라 기준으로 삼지 않는다.

| 지점 | 내용 |
|---|---|
| `package.json` | 이름 `@site/<이름>`, `dev`·`start`에 `-p <포트>`, 의존성 `@pi/auth`·`@pi/db`·`@pi/guard`·`@pi/mon`(`workspace:*`) + cafe.pi와 같은 버전(next·react·next-intl·next-auth·zod) |
| `next.config.ts` | `import './src/env'`, next-intl 플러그인, `turbopack.root`·`outputFileTracingRoot = ../..`, `validation-key.txt` 포함 |
| `src/env.ts` | t3-env. `.env.example`과 같은 키 |
| `src/app/[locale]/layout.tsx` | PiSdkScript · NextIntlClientProvider · PiAuthRoot · MonRum |
| `src/app/api/auth/pi/route.ts` | `createPiAuthRoute(...)`(@pi/auth) — 로직 복제 금지 |
| `src/app/validation-key.txt/route.ts` | env `PI_DOMAIN_VALIDATION_KEY` 우선 |
| `src/proxy.ts` | @pi/guard + next-intl matcher |
| `src/i18n/*` · `messages/{ko,en}.json` | ko·en 2개만(cafe.pi 189 locale 복사 금지) |
| Google 연동(0-2 예외일 때만) | `src/auth.ts`·`api/auth/[...nextauth]`·연동 DDL(sitemap.pi `sql/003` 기준) |
| `vercel.json` | `regions: ["icn1"]`(크론이 있을 때만 crons) |

- [ ] 루트에서 `pnpm install`(워크스페이스 glob `sitemap/*`가 자동 포함)
- [ ] 앱 폴더에서 `pnpm build` 통과

## 4. 환경변수 — 서비스·고객

- [ ] 키별 구하는 곳: [ENV_GUIDE](../docs/ENV_GUIDE.md) 3절
- [ ] 직접 만드는 비밀키는 생성기가 이미 넣었다(로컬과 운영은 다른 값)
- [ ] `MON_INGEST_KEY`는 세 시스템과 같은 값이고 운영 Vercel에만 등록한다

## 5. DB — 서비스·고객

- [ ] (고객) pi-nonprod Supabase → Data API → Exposed schemas에 `<이름>_dev`·`<이름>_stg`를 등록하고 GRANT를 준다
- [ ] (고객) 접속 문자열을 `.env.local`의 `<이름대문자>_DEV_DATABASE_URL`·`_STG_`에 넣는다(Connect → Session pooler)
- [ ] (서비스) `sitemap/<도메인>/sql/001_<이름>_*.sql` 작성. DA 표준을 따르고 `DA-APPROVED` 헤더를 붙인다(da-ddl-guard 자동 검사)
- [ ] (서비스) `node scripts/db-migrate.mjs --app <이름> --tier dev`, 이어서 `stg`
- [ ] (고객) 운영 직전에 사이트 전용 Supabase 프로젝트를 만든다. 운영 스키마는 `public`이다

## 6. 외부 포털 — 고객

- [ ] Pi Developer Portal(Pi Browser → `develop.pi`) **testnet 앱** 등록 → API Key · App Wallet · Open app 도메인 · 도메인 검증 키(ENV_GUIDE 3.2)
- [ ] (선택) Pi Sign-In Client ID, 콜백 `<앱URL>/auth/pi/callback`
- [ ] (0-2 예외일 때) Google OAuth 클라이언트, 리디렉션 `<앱URL>/api/auth/callback/google`(ENV_GUIDE 3.3)
- [ ] 메인넷 앱은 운영 도메인이 확정된 뒤에 등록한다

## 7. 모니터링 — 서비스 (앱 골격 후)

- [ ] `packages/pi-mon/src/index.ts` `SYSTEMS`에 `<이름대문자>: '<도메인>'`을 추가한다
- [ ] schema.pi 새 SQL(`sitemap/schema.pi/sql/0NN_*.sql`): `mon_app_hist`·`mon_app_evt_hist`의 `sys_cd` CHECK를 다시 만든다. 이미 적용된 075는 수정 금지
- [ ] 앱에 `src/app/api/mon/app/route.ts`(`monForward(req, '<코드>')`)와 `src/components/mon-rum.tsx`를 만들고, layout에 `<MonRum/>`을 넣는다
- [ ] schema.pi 주석의 시스템 목록 갱신(`api/mon/ingest/route.ts`, `env.ts`)

## 8. Vercel·배포 — 고객 생성, 서비스 배포

- [ ] (고객) 새 프로젝트: Root Directory `sitemap/<도메인>`, Production Branch `prod/<이름>`
- [ ] (고객) env 등록: `.env.vercel-prod`의 값을 Production에, 스테이징 값을 Preview에 넣는다. `*_DATABASE_URL`은 등록하지 않는다
- [ ] (서비스) 운영 승격 `node scripts/promote-to-prod.mjs --app <이름> --yes`(첫 실행에서 `prod/<이름>` 브랜치 생성). 승격은 마스터 지시 후에만 한다
- [ ] (서비스) GitHub commit status에서 `Vercel – <프로젝트>: success`를 개별로 확인한다

## 9. 검증·원장 — 서비스

- [ ] `pnpm build` 통과(라우트 변경 커밋 전 최소 관문)
- [ ] `node .claude/hooks/build-defect-guard.mjs --scan sitemap/<도메인>/src`가 0건이거나 사유를 기록한다
- [ ] 서브에이전트 P1~P6 점검 1회 → `docs/BUILD_DEFECTS.md` 2절에 사이트 절을 추가한다(1절 체크리스트)
- [ ] **Pi Browser 실기기**에서 로그인·결제를 확인한다. 확인 전에는 완료가 아니다
- [ ] 운영 첫 주 모니터링 기록을 원장에 남긴다

## 10. 등재 — 고객 제출, 서비스 점검

- [ ] pi-mainnet-listing-auditor A-1~A-7 점검(Google 연동 예외 사이트는 A-4를 다시 점검)
- [ ] 순차 제출(PRD_28 §1.1-7): 앞 사이트 결과를 확인한 뒤 제출
- [ ] `sites.json` appSts를 `LIVE`로 바꾸고 `url`을 넣는다

## 진행 현황

| 사이트 | 웨이브 | 로그인 | 포트 | 현재 단계 | 비고 |
|---|---|---|---|---|---|
| sitemap.pi | W1 | Pi + Google(예외 2026-10-11) | 3001 | 운영 승격 진행 | 1호 — 앱 골격 기준 |
| schema.pi | W4 | Pi + Google | 3002 | 운영 중(https://schem.vercel.app) | 독립 구조 — 골격 기준 아님 |
| seminar.pi | W3(선착수 예외 2026-10-24) | Pi + Google(예외 2026-10-24) | 3003 | 1 완료 · 2 진행 | PRD v0.1 `[TBD : 마스터]` 확정 대기 |

## 확인된 정합성 메모 (아직 고치지 않음)

- `sitemap/sites.json`의 schema.pi `appSts`가 `PLANNED`로 되어 있다. 실제로는 운영 중이므로 `LIVE`로 정정해야 한다.
- schema.pi `.env.example` 머리글에 "sitemap.pi"가 남아 있고, `.claude/settings.json`이 0바이트라 작업 이력에서 구분되지 않는다.
- schema.pi도 Google 로그인을 쓰지만(`sitemap/schema.pi/src/auth.ts`) PRD_28 §1.1-2·LOGIN_PLAYBOOK 예외 목록에는 sitemap.pi·seminar.pi만 있다. 예외 등재 여부는 [확인중 : 마스터]다.
- da-ddl-guard R9(pk_/x_ 이름 검사)는 schema.pi에만 적용된다. 신규 사이트로 넓힐지는 마스터 확인 대기다.
