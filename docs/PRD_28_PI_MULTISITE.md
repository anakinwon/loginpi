# PRD_28: Pi 멀티사이트 플랫폼 — 19개 .pi 웹서비스 (오라클 멀티테넌트형)

> 버전 v0.3 · 작성일 2026-10-09 · 상태 Phase 0 진행(§9 상태 열) · 대체 문서 `PRD_27_PI_FACTORY.md` v1.7(동결)
> 근거 : 마스터 지시 2026-10-09 "오라클 멀티테넌트처럼 웹서비스 19개, DB 개별 분리, 프레임워크 구성·배포 대상 별도 구성, 이전 플랜 검토 후 바로 진행"

---

## 1. 결론 요약

| 항목 | 결정 |
|---|---|
| 사이트 수 | **19 = cafe.pi(기존) + 신규 18** (마스터 확정 2026-10-09) |
| 구조 | **CDB = 공용 코드(패키지)·운영 절차 / PDB = 사이트별 앱·DB·배포·Pi 앱** — 데이터·정체성은 CDB에 두지 않음 |
| 저장소 | loginpi 저장소를 pnpm 워크스페이스로 전환. cafe.pi는 **루트 그대로**(이동 0), 신규 사이트는 `sitemap/<도메인>.pi/` |
| 공용 코드 | `packages/pi-*` 워크스페이스 패키지 — 복제 금지 |
| 프레임워크 | 전 앱 cafe.pi와 같은 스택·버전(Next 16 · React 19 · Tailwind v4 · shadcn base-nova · next-intl v4 · zod 4), 버전 단일화는 pnpm catalog [확인중 : pnpm 공식 문서] |
| DB | 운영 = **사이트별 Supabase 프로젝트**, 개발·스테이징 = 공유 프로젝트 1개의 사이트별 스키마 |
| 배포 | 사이트별 Vercel 프로젝트 + 사이트별 운영 브랜치 `prod/<site>` |
| 이전 플랜 | PRD_27 단일 앱 멀티테넌트는 폐기, 포트폴리오·Web3 원칙은 승계, Bean 지갑 전역 공유는 폐기(마스터 확정 2026-10-09) |

### 1.1 등재 가드레일 (Pi 메인넷 심사 — 사이트 공통, 예외 없음)

근거 : pi-mainnet-listing-auditor 점검 2026-10-09, `MAINNET_READINESS_CHECKLIST.md` A-1~A-7

1. **사이트 간 사용자 데이터 교차 조회·전송 0** — 각 사이트는 자기 Pi 앱이 authenticate한 사용자 정보만 저장·조회한다. sitemap.pi를 포함한 어떤 사이트도 다른 사이트 DB의 `pi_username`·uid·access token을 조회·보관하지 않는다(Pi Developer Terms Section 4). 제재 공유·통합 대시보드는 Section 4 공식 해석 전까지 구현 금지
2. **로그인은 Pi 인증만** — 신규 사이트에 Google 등 Pi 외 로그인 금지(A-4). **예외(마스터 2026-10-11)** : sitemap.pi 는 Pi 계정 연동을 전제로 한 Google 로그인 허용 — Google 만으로 신규 계정 생성 금지, 연동 코드는 Pi Browser 로그인 사용자만 발급(`docs/LOGIN_PLAYBOOK.md`, DDL `sitemap/sitemap.pi/sql/003`). A-4 등재 심사 재점검 [TBD : pi-mainnet-listing-auditor]
3. **거래는 Pi만** — Bean·포인트·토큰·법정화폐 결제 어휘·기능 금지, 자국 통화는 참고 환산 표시만(A-5)
4. **교차 프로모션 금지** — 각 사이트 UI에 다른 .pi 사이트 링크·배너·추천 금지, 디렉터리 기능은 sitemap.pi 한 곳에만(A-6)
5. **sitemap.pi 디렉터리 표기** — 자사 사이트도 일반 등재와 같은 기준으로 노출, 유료·자사 홍보 슬롯은 "광고" 라벨로 유기 순위와 분리, 외부 이동은 클릭 + 이동 고지 후에만
6. **독립 완성도** — 사이트마다 고유 기능이 완전히 동작할 때만 제출, 템플릿 그대로·"준비 중" 제출 금지(A-1)
7. **순차 제출** — cafe.pi 승인 → sitemap.pi → 레드라인 플래그 없는 사이트 1개씩, 앞 결과 확인 후 다음 제출
8. **레드라인 플래그 사이트 보류** — §8의 ⏸·△ 사이트는 플래그 해소 전 Pi 앱 생성·제출 보류
9. **사이트별 등재 체크** — 출시 전 pi-mainnet-listing-auditor A-1~A-7 점검 + Pi Browser 실기기 로그인·결제 검증 후에만 제출

## 2. 오라클 대응표

| 오라클 | 이 플랫폼 | 비고 |
|---|---|---|
| CDB$ROOT 공통 오브젝트 | `packages/pi-*`(인증·DB 클라이언트·API 가드·결제 코어) | 공통인 것은 데이터가 아니라 **행동 규칙**(Pi 로그인 이중 경로·redirect 금지·서버 금액 재검증) |
| 공통 사용자(C##) | Pi 계정 — 각 사이트 `sys_user`가 자기 Pi 앱 기준으로 `pi_username`을 보관(사이트 간 대조 금지, §1.1-1) | uid는 Pi 앱별 scoped(루트 CLAUDE.md 사용자 매칭 철칙) |
| PDB | `sitemap/<도메인>.pi` 앱 + 사이트 DB + Vercel 프로젝트 + Pi 앱(testnet·mainnet 각 1) | 서로 데이터 공유 없음 |
| PDB seed | `_template` — 1호(sitemap.pi) 완성 후 실물에서 추출 | 선제 작성 금지 |
| CDB 메타 | `sitemap/sites.json`(사이트 레지스트리 19행) — DB 아님 | sql/173 단일 앱 레지스트리는 용도 소멸 |
| Unplug/Plug | 앱 디렉터리 이동 + 사이트 DB `pg_dump`/restore | PRD_27 §4 졸업 절차 준용 |
| 공통 옵션 | 기능 모듈 패키지(`pi-mps`·`pi-edu`·`pi-a2u`) — 필요한 사이트만 설치 | §4 |

## 3. 저장소 구조

```
loginpi/                       pnpm 워크스페이스, 루트 패키지 = cafe.pi(이동 없음)
├── pnpm-workspace.yaml        packages: ['packages/*', 'sitemap/*', '!sitemap/_template'] + 기존 allowBuilds 유지
├── src/ sql/ messages/ …      cafe.pi 그대로
├── packages/                  CDB : 공용 패키지
│   ├── pi-auth/  pi-db/  pi-guard/  pi-payments/      1차
│   └── pi-mps/  pi-a2u/  pi-edu/  pi-i18n/           2차(수요 시)
├── sitemap/                   PDB : 사이트 앱 자리
│   ├── sites.json             사이트 레지스트리
│   ├── sitemap.pi/            1호(W1)
│   ├── yea.pi/ barista.pi/ …  웨이브 순서대로 생성
│   └── _template/             1호 완성 후 추출(워크스페이스 제외)
└── scripts/
    ├── promote-to-prod.mjs    --app <site> 매개화(기본 cafe = 현행 동작)
    ├── db-migrate.mjs         baseline + 사이트 SQL 적용(Phase 1)
    └── new-site.mjs           _template 복제 + sites.json 등록(Phase 1.5)
```

- 루트 `tsconfig.json`·`eslint.config`·`.prettierignore`에 `packages/**`·`sitemap/**` 제외 필수 — 없으면 cafe `pnpm build`가 하위 앱까지 타입 체크
- 앱 자리는 `sitemap/<도메인>.pi`(마스터 확정 2026-10-09 — 지정 경로 유지, 이동 0)
- cafe.pi를 하위 앱으로 옮기는 전면 모노레포는 **메인넷 등재 승인 후 2단계**(심사 중 모선 이동 위험)
- 루트 패키지의 `workspace:*` 의존 가능 여부 [확인중 : pnpm 공식 문서] — 불가 시 cafe 하위 이동안

## 4. 공용 패키지

| 패키지 | 담는 것 | 출처(cafe.pi) | 차수 |
|---|---|---|---|
| `@pi/auth` | HMAC 세션 토큰, `/api/auth/pi` 라우트 팩토리(쿠키+JSON 토큰 동시 반환), 서버 검증 `getSessionUser`·`isAdmin`·`isMaster`(DB 조회는 주입), 클라이언트 `piFetch`·인증 Provider·OAuth state | `src/lib/pi-session-crypto.ts`·`pi-fetch.ts`·`pi-oauth.ts`·`auth-check.ts`(NextAuth·Google 경로 제외)·`api/auth/pi` | 1차 |
| `@pi/db` | `getSupabaseAdmin`·3-tier `db-env`(+스키마 옵션), `upsertPiUser`(uid→username 재바인딩), baseline DDL(`sys_user`·`pi_pymnt`·시스템 컬럼·`del_yn`·활성 `pi_username` UNIQUE) | `supabase-admin.ts`·`db-env.ts`·`users.ts` Pi 함수 | 1차 |
| `@pi/guard` | `withGuard`·`withAuthGuard`·rate limit·보안 헤더, 계측은 콜백 주입(기본 no-op) | `api-guard.ts`·`ddos-guard`·`api-errors` | 1차 |
| `@pi/payments` | approve/complete 코어 + **`metadata.type` 핸들러 레지스트리**, 클라이언트 결제 버튼 | `payments/approve`·`complete` 코어·`components/pi-pay-button.tsx` | 1차(코어) / 2차(cafe 9종 전환) |
| `@pi/mps` | 상점·상품·주문·에스크로 커머스 모듈 | cafe MPS(`mps_*`) — Bean 의존 제거 후 | 2차(W2 커머스·teamkorea) |
| `@pi/a2u` | A2U 지급·정산 표준 | `pi-a2u`·`tip-pi-reward` | 2차(W2) |
| `@pi/edu` | 강사→강좌→수강권→수료→정산 | 신규 | 2차(W3 lan) |
| `@pi/i18n` | locale 단일 소스·검증 | `locale-*.ts`·`validate-locales` | 2차(다국어 확장 시) |
| 추출 안 함 | shadcn/ui(복사 모델이 정석), Bean·chat·event(cafe 전용) | — | — |

**결제 레지스트리** : 사이트는 자기 결제 유형만 등록 — 미등록 type은 400(조용한 complete 금지), `pi_pymnt` 상태로 멱등(이미 COMPLETED면 핸들러 재실행 없음), 금액은 핸들러가 `fee_plan`으로 서버 재계산.

```ts
createCompleteRoute({ piApiKey, db, handlers: { SITE_MBR, CTGR_SLOT, HOME_SLOT } })
```

## 5. DB 분리

| 방식 | 비용 | 격리 | 코드 영향 | 판정 |
|---|---|---|---|---|
| A. Supabase 프로젝트 per 사이트 | 전량 가동 시 약 $215/월 — Pro $25 + Micro 약 $10 × 20(운영 19 + `pi-nonprod` 1) − 조직 크레딧 $10. cafe 기존 프로젝트는 별도 조직·현행 유지 가정. **출시 순차 생성** | 최고(키·풀러·백업 분리) | 없음(env만 다름) | **운영** |
| B. 자체 Postgres + database per 사이트 | 인스턴스 1대 | 중(WAL 공유 → DB별 독립 복구 불가) | 대(PostgREST·임베디드 조인 재사용 불가) | 배제 |
| C. Supabase 1개 + schema per 사이트 | Pro 1개 | 낮음(키·풀러 공유) | 클라이언트 스키마 옵션 + 노출 스키마 설정·권한 부여 | **개발·스테이징** |

- 확인 완료(supabase.com/pricing·docs, 2026-10-09) : Pro $25, Micro 약 $10/월, 유료 조직 크레딧 $10, 프로젝트마다 compute 과금, 스키마는 Exposed schemas 등록 + GRANT 필요
- 미확인 : 추가 프로젝트 최소 compute 단가·PITR 애드온 단가 [확인중 : supabase.com/pricing]
- PostgreSQL 근거 : 같은 클러스터의 database는 WAL 공유(postgresql.org/docs manage-ag-overview, 2026-10-09)
- tier : 운영 = 사이트 프로젝트 `public` / 스테이징·개발 = `pi-nonprod` 프로젝트 `<site>_stg`·`<site>_dev`
- 마이그레이션 : `packages/pi-db/sql/000_baseline.sql` + `sitemap/<site>/sql/NNN_*.sql`, `scripts/db-migrate.mjs --app --tier`로 적용(`schema_migrations`). DA 훅(`da-ddl-guard`)은 경로 무관 `.sql` 매칭이라 자동 적용
- 운영자 계정 : 사이트별 `sys_user.role='ADMIN'`(env 시드), `isMaster()` 규칙 승계

## 6. 배포

| 항목 | 결정 |
|---|---|
| Vercel 프로젝트 | 사이트당 1개, Root Directory `sitemap/<도메인>.pi`, 변경 없는 앱 자동 빌드 생략 — Pro는 같은 저장소에 프로젝트 150개 연결·프로젝트 기본 과금 없음(vercel.com/docs/limits·monorepos, 2026-10-09 확인) |
| 운영 브랜치 | `prod/<site>` — ff-only 승격(`promote-to-prod.mjs --app`). 단일 `production` 브랜치로 19개를 묶지 않음 |
| 스테이징 | `master` 프리뷰 + 고정 브랜치 도메인(Pi testnet 앱 URL 고정 필요) [확인중 : vercel.com/docs 브랜치 도메인·프리뷰 cron] |
| cafe.pi | 현행 2프로젝트(loginpi/cafepi)·`production` 브랜치 유지, Ignored Build Step에 `sitemap/**` 제외(Phase 2 전까지 `packages/**`도 제외) — Phase 1 적용(§9 0-b 이월 사유) |
| 도메인 | 사이트별 `.pi` → Pi Developer Portal 앱(testnet·mainnet 각 1) + Vercel 커스텀 도메인. 앱당 도메인 1개 여부 [확인중 : Pi Developer Portal] |
| cron | 앱별 `vercel.json`, 템플릿 기본 2개(환불 정리·HELD 만료) |
| env | 사이트 고유(Pi 키·Supabase·세션 시크릿)는 프로젝트 env, 공통(메일·AI 키)은 팀 Shared Env |
| 승격 검증 | GitHub commit status `Vercel – <project>: success` 개별 확인 내장(배포 검증 철칙) |
| 자체 호스팅 | 보류 — Cloudflare(OpenNext)는 Next.js 검증 어댑터 아님, Docker standalone은 19개 운영 부담(nextjs.org/docs deploying·developers.cloudflare.com, 2026-10-09) |

## 7. 이전 플랜 검토

| 대상 | 판정 | 처분 |
|---|---|---|
| PRD_27 §1.1 "멀티테넌트 채택·모노레포 보류" | 역전 — 패키지 공유 + 분리 배포 | "리포 복제×20 금지"는 유지(패키지로 패치 1곳) |
| PRD_27 §2 단일 Supabase·`site_cd` 축·Host 미들웨어·`NEXT_PUBLIC` 런타임화 | 폐기 | sql/173 미적용 상태로 종결, `src/`에 관련 코드 없음 |
| PRD_27 §2.5 포트폴리오·웨이브·Web3 원칙·리스크 플래그 | 승계 | §8 표 |
| §2.6 FR-P1 페르소나·FR-P2 브랜드 분리 | 자동 충족 | 물리 분리로 구현 불필요 |
| §2.6 FR-P2 교차 노출 금지 | **유지(전 사이트 규칙)** | §1.1-4 |
| §2.6 전역 공유 ① 계정 | 유지 | 각 사이트가 Pi 계정으로 인증, 자체 SSO 신설 금지 |
| §2.6 전역 공유 ② Bean 지갑 | **폐기(마스터 확정 2026-10-09)** — DB 분리로 교차 지갑 성립 불가 + 신규 사이트 Bean 어휘 금지(A-5) | 2026-07-09 확정 사항을 대체, Bean은 cafe.pi 내부에만 |
| §2.6 전역 공유 ③ 제재 | 폐기(당분간) | 교차 조회는 §1.1-1 위반 소지, [확인중 : 마스터] |
| §2.6 통합 허브 = sitemap.pi | 축소 — 디렉터리·광고만 | 사이트 간 DB 공유가 없어 허브 기능에는 교차 API가 필요하고, 이는 Developer Terms Section 4 리스크(§11 #4) |
| PRD_27 문서 | 동결 + 대체 배너 | 마스터 승인 기록 보존(개정 시 감사 추적 소실) |
| sitemap.pi 문서 | 복제 → 패키지, PRD_27·sql/173 전제 제거 | 같은 날 반영 |

## 8. 사이트 포트폴리오 (PRD_27 §2.5 승계)

범례 : ⏸ 사이트 앱 Pi 제출 보류 / △ 조건부 승인 (출처 sitemap PRD §2·PRD_27 §2.5 리스크 플래그)

> **마스터 예외(2026-10-09)** : sitemap.pi 디렉터리(메인 버블)에는 ⏸·△ 사이트도 19개 전부 노출한다. §1.1-8(해당 사이트 앱의 Pi 생성·제출 보류)은 그대로 유지. 단 gifticon(상품권)·omok(도박) 광고 노출은 **sitemap.pi 자체 등재 심사 리스크**이므로 sitemap.pi 제출 전 노출 여부를 재결정한다.

| 웨이브 | 사이트 | 프리셋 | 주의 |
|---|---|---|---|
| — | cafe.pi | 모선 | 현행 유지, Phase 2에서 패키지 전환 |
| W1 | sitemap.pi | HUB(디렉터리) | 1호 |
| W2 | yea.pi · barista.pi · bluemountain.pi · gifticon.pi ⏸ | VOTE · COMMERCE | yea 표-돈 분리, gifticon 규제 전 수익화 금지, 커머스는 `@pi/mps` |
| W3 | seminar.pi · teamkorea.pi · expedition.pi · omok.pi ⏸ · lan.pi | COMMUNITY · EDU | seminar 화상 선행, teamkorea 승부 예측 보상 금지·`@pi/mps`, omok 도박 |
| W4 | dbms.pi · schema.pi · webserver.pi · was.pi · fondation.pi △ · yoda.pi ⏸ | EDU · CONTENT | fondation 기부금품법, yoda 상표 |
| W5 | anakin.pi · youngrok.pi | CONTENT | — |

## 9. 로드맵

| Phase | 내용 | 선결 조건 | cafe `src/` 영향 | 상태 |
|---|---|---|---|---|
| **0-a** | 본 문서·PRD_27 대체 배너·sitemap 문서 정합 | — | 없음 | **완료 2026-10-09** |
| **0-b** | 워크스페이스 전환(`pnpm-workspace` packages·루트 tsconfig/eslint/prettier 제외) / `promote-to-prod --app` 매개화 | 마스터 착수 승인 2026-10-09 | 없음(`pnpm install`·`pnpm build` 통과 확인 필수) | **진행 2026-10-09** — cafe Vercel Ignored Build Step은 Phase 1로 이월(비교 기준 오설정 시 cafe 배포 누락 위험, 사이트 코드 생기기 전 불필요) |
| **1 (W1)** | cafe Vercel Ignored Build Step(`VERCEL_GIT_PREVIOUS_SHA` 기준, 미설정 시 빌드) / sitemap.pi MVP를 공용 패키지 위에 구축(패키지 1차 4종은 첫 소비자와 함께 추출 — 소비자 없는 선추출 금지) / Supabase 운영 #1 + `pi-nonprod` / Vercel·`prod/sitemap` / Pi testnet 앱 / `db-migrate.mjs` | Pi 포털 sitemap 앱·도메인 검증, A-6 질의 | 없음 | 대기 |
| **1.5** | `_template` 추출·`new-site.mjs`·`sites.json` | Phase 1 완료 | 없음 | 대기 |
| **2** | cafe.pi가 공용 패키지로 전환(결제 9종 핸들러 등록) → 이후 하위 앱 이동 검토 | **cafe 메인넷 등재 승인** | 대(스테이징 선검증·실기기) | 대기 |
| **3~6** | W2 → W5 순차(사이트당 1~2주), `pi-mps`·`pi-a2u`(W2)·`pi-edu`(W3) 2차 추출, 사이트별 순차 제출(§1.1-7) | 사이트별 Pi 앱×2·법무 플래그 | 없음 | 대기 |

- Phase 2가 W2보다 뒤인 이유 : 신규 사이트는 cafe 전환 없이 출시 가능, cafe 전환은 등재 승인에 종속
- PRD_27 홀딩은 본 지시로 재개된 것으로 해석하되 "모선 복잡도 추가 금지"는 Phase 2 전까지 유지 [확인중 : 마스터]

## 10. 팀 편성

| 역할 | 에이전트 | 시점 |
|---|---|---|
| 팀장·단계 | teamanakin-admin + anakin_phase-* | 매 턴 |
| PRD·로드맵 | prd-roadmap-consultant | Phase 경계 |
| DA | da-governance-expert(단독) → da-team(`db-migrate`·`schema_migrations` 설계 시) | Phase 0~1 |
| 등재 심사 | pi-mainnet-listing-auditor | Phase 0(Section 4·중복 앱 질의), 사이트 출시 전 |
| 법무 | legal-compliance-advisor | Phase 0(Section 4 해석·약관 템플릿) |
| 보안 | kisa-web-security-auditor | 사이트 출시 전 |
| 외부 문서 | document-specialist | Phase 0(§11 확인중 해소) |
| 코드 | executor(패키지 추출·워크스페이스는 opus) | Phase 0-b~1 |

## 11. 확인중

| # | 항목 | 채널 | 영향 |
|---|---|---|---|
| 1 | 루트 패키지의 `workspace:*` 의존·pnpm catalog | pnpm 공식 문서 | 불가 시 cafe 하위 이동안 |
| 2 | Supabase 추가 프로젝트 최소 compute·PITR 단가 | supabase.com/pricing | 월 비용 상한 |
| 3 | Vercel 프리뷰 브랜치 도메인 고정·프리뷰 cron·팀 Shared Env | vercel.com/docs | 스테이징 방식 |
| 4 | 사이트 간 데이터 공유가 필요해질 경우 Developer Terms Section 4 해석 — 그 전까지 교차 조회 0(§1.1-1)으로 진행 | legal-compliance-advisor → Pi 서포트 | 허브·제재 공유 |
| 5 | PRD_27 홀딩 해제 해석·허브 범위·제재 공유 폐기 (Bean 지갑 폐기는 확정 2026-10-09) | 마스터 | §7·§9 |
| 6 | Pi 앱당 도메인 1개·`.pi` 도메인 연결 방식 | Pi Developer Portal | 스테이징 도메인 |
| 7 | 19개 `.pi` 도메인 보유·DNS 현황 | 마스터 / 레지스트라 | 출시 일정 |
| 8 | ~~사이트 앱 위치·사이트 수 해석~~ — 확정 2026-10-09(`sitemap/<도메인>.pi`, cafe 포함 19) | — | 해소 |
| 9 | 동일 운영자 다중 앱 심사 기준(중복 앱) | Pi 서포트 / PCT | 제출 순서·간격 |
| 10 | `.pi` 사이트 간 이동이 A-6 "external"에 해당하는지 | Pi 서포트 / PCT | sitemap.pi 방문 방식 |

## 12. 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v0.1 | 2026-10-09 | 최초 작성 — 오라클 대응 구조, 워크스페이스·공용 패키지 4종, DB 분리(운영 프로젝트·비운영 스키마), 사이트별 배포, PRD_27 검토 판정, 로드맵 |
| v0.2 | 2026-10-09 | 검수 16건·등재 심사 반영 — §1.1 등재 가드레일 9개, Phase 상태 열(이번 턴 = 문서만), 사이트 수 해석, 프레임워크 버전 정책, `auth-check`·`pi-pay-button` 출처, `@pi/mps` 2차, Bean 폐기 마스터 확인, 허브 축소 근거, FR-P2 교차 노출 유지, 비용 20개 재계산·확인 구분, 외부 사실 출처, 범례, `_template` 워크스페이스 제외, cafe Ignored Build Step |
| v0.3 | 2026-10-09 | 마스터 확정 반영(사이트 수 cafe 포함 19·Bean 지갑 폐기·앱 위치) + Phase 0-b 착수(워크스페이스·제외 설정·promote --app), Ignored Build Step은 Phase 1 이월 |
