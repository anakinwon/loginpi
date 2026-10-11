# ROADMAP: Pi 멀티사이트 플랫폼 — "1호는 비싸게, 2호부터 공짜로"

> 작성 2026-10-11 · 상위 플랜 `PRD_28_PI_MULTISITE.md`(19 = cafe.pi + 신규 18, 1호 sitemap.pi 제외 잔여 **17**) · 1호 `sitemap/sitemap.pi/docs/ROADMAP.md`
> 목적 : sitemap.pi(1호)에서 겪은 어려움을 **남은 17개 사이트에서 반복하지 않게** 만드는 플랫폼 로드맵.
> 사이트 기능 로드맵이 아니라 **사이트를 찍어내는 공장(Site Kit)** 의 로드맵이다. PRD_28 의 원칙(§1.1)·웨이브(§8)·판정(§4·§7)이 정본이며 이 문서는 그 안에서 "어떻게 빨리"만 다룬다.

## 0. 왜 어려웠나 — 1호 진단 (2026-10-09 ~ 10-11, 세션 기록 기준 추정)

| 병목 | 1호에서 벌어진 일 | 구조적 원인 |
|---|---|---|
| **신원(로그인)** | 하루에 3가지 접근(SDK 전용 → Pi OAuth → Google 매핑) 검토. 그중 Google 매핑은 **PRD_28 §1.1-2(신규 사이트 Pi 외 로그인 금지, A-4) 위반**이라 애초에 선택지가 아니었음 | 규칙이 PRD 에 있어도 **착수 시점에 로그인 결정 트리가 없어** 매번 다시 고민. Pi OAuth 는 앱마다 Client ID·콜백 URI 등록이 필요(`pi_uid` 앱별 scoped 라 Portal 앱 등록은 어차피 사이트당 2개) |
| **인프라 숨은 상태** | Supabase Exposed schemas 미등록(`PGRST106`)으로 503 추적 수 시간, env `TAGING_` 오타·tier 불일치, `public` 사본 테이블 정체 불명 | 체크리스트(OPS_SETUP)는 있으나 **사람이 실행**. 실패 신호 → 원인 대응표가 머릿속에만 있음 |
| **복사 이식** | cafe.pi 의 OAuth 콜백·로그인 버튼을 손으로 옮김(`@pi/auth` 에 `startPiOAuth` 헬퍼만 있고 화면·게이트는 없음) | 공용 패키지가 **로직만** 공유하고 **화면·흐름**은 미공유 |
| **문서 드리프트** | ROADMAP 체크 갱신이 커밋·배포보다 이틀 늦음(10-11 일괄 반영), 그동안 HANDOFF 가 실질 진행 문서 | 완료 선언(커밋·배포)과 문서 갱신이 분리 |
| **거버넌스 비용** | DDL 마다 DA 5인 팀, 변경마다 팀장 승인, 보안 리뷰 2회 | 1호엔 적정. **17번 반복하면 낭비** — 반복 패턴을 사전 검증(관문)으로 바꿔 승인 *요청 전* 결함을 걸러야 함(승인 자체는 유지, §4 L4) |

**결론** : 어려움의 대부분은 "사이트 고유 기능"이 아니라 **신원·인프라·이식·문서·승인 준비**라는 공통 비용이었다. 이 다섯 개를 Kit 으로 흡수하면 2호부터는 사이트 고유 기능만 남는다(PRD_28 §1.1-6 "독립 완성도"가 요구하는 바로 그 부분).

## 1. 운영 원칙 (3개)

1. **두 번의 법칙** — 같은 일을 두 번째 하는 순간, 세 번째는 없게 만든다 : 스크립트(`scripts/`)·패키지(`packages/`)·템플릿(`sitemap/_template`, 현재 미생성)·플레이북 중 하나로 흡수. 손으로 세 번 하는 일은 금지.
2. **실패 신호 사전** — 모든 운영 단계는 `명령 → 기대 출력 → 실패 신호 → 원인 → 조치` 5열로 기록. 오늘의 `PGRST106 → Exposed schemas` 가 첫 항목.
3. **파도 회고 게이트** — 사이트 묶음(파도)이 끝날 때마다 "Kit 에 흡수할 것 / 플레이북 갱신" 회고 없이는 다음 파도 착수 금지(task-observer 관찰 로그를 입력으로 쓴다).

## 2. 목표 지표 — 사이트 1개 구축 비용

| 지표 | 1호 추정¹ | 2호 목표 | 5호 이후 목표 |
|---|---|---|---|
| 첫 로그인까지(Pi Browser 실기기) | 3일 | 1일 | **2시간** |
| 사람이 손으로 하는 단계 | 약 40 | 15 | **≤ 8** (Developer Portal 2앱·Client ID·도메인·env 비밀값만) |
| 사이트별 비밀값 | 9 | 5 | **4** (`PI_SESSION_SECRET`·`PI_API_KEY`·DB 키·OAuth Client ID) |
| 복사-붙여넣기 코드(줄) | 약 600 (콜백·게이트·헤더·env) | 100 | **0** — 전부 `@pi/*` import |
| DDL DA 리뷰 | 전체 리뷰 | 델타만 | **`da-ddl-guard` 통과 + `-- DA-APPROVED:` 유지, 표준 `site_*` 패턴은 리뷰 범위 축소** |
| 승인 단계 | 변경마다 팀장 | 파도마다 | **적합성 검사(CI) 통과 후 팀장 승인 1회** |

¹ 1호 값은 `work-history/2026/10/` 세션 기록과 커밋 수로 산출한 **추정**이다. 실측은 M0 종료 시 이 표에 기입한다(이후 파도마다 추가).

## 3. 신원 아키텍처 — 규칙 안에서 가장 싼 길

PRD_28 이 이미 답을 정해 두었다. **각 사이트 = 자기 Pi 앱으로만 인증**(§1.1-1 교차 조회 0, §1.1-2 Pi 외 로그인 금지, §7 "자체 SSO 신설 금지").

```
Pi Browser                                   일반 브라우저
 사이트 N ── window.Pi.authenticate ──▶        사이트 N "Pi로 로그인" 클릭 → SDK 3초 실패
   /api/auth/pi (@pi/auth, 쿠키 + JSON token)    → startPiOAuth(사이트 N 의 Client ID)
                                                → accounts.pinet.com "Sign in with Pi" QR (Pi 소유 화면)
                                                → /auth/pi/callback#access_token  (프래그먼트 = 서버 미전달)
                                                   콜백 페이지가 읽어 /api/auth/pi POST → 쿠키 + JSON token
                                                → LoginGate 로 복귀(null user 시 redirect 금지)
```

- **사이트당 추가 비용 = Developer Portal 에서 Pi Sign-In Client ID 1개 + Redirect URI 등록.** 코드는 0(1호가 오늘 만든 게이트·콜백을 M1 에서 `@pi/auth` 로 승격하면 import 한 줄).
- Redirect URI 호스트 : 루프백(`http://localhost:<port>/auth/pi/callback`)은 등록 가능. **스테이징 호스트(`*.vercel.app`) 등록 가능 여부는 [확인중 : Pi Developer Portal]**(루트 CLAUDE.md "앱 도메인+루프백만 — staging 미지원", PRD_28 §11 #6). 확인 전 즉시 조치는 localhost 등록까지만.
- ⛔ **사이트별 Google 매핑은 만들지 않는다** — §1.1-2 위반(A-4 레드라인). Google 은 cafe.pi 기존 사용자 연동에만 남는다.
- ⏸ **허브 SSO(cafe.pi 가 일반 브라우저 로그인을 대행, 1회용 코드 교환)는 보류 안** — 사이트별 Client ID 등록을 0 으로 줄이지만 §1.1-1(다른 사이트의 `pi_username` 보관 금지)·§7(SSO 신설 금지)·Developer Terms Section 4 와 충돌. **PRD_28 §11 #4(Section 4 해석, legal-compliance-advisor → Pi 서포트) 회신 후에만** 재검토. 그때도 Google 경로는 허브에 싣지 않는다(§1.1-2).

## 4. Site Kit 구성 — 다섯 층

| 층 | 이름 | 내용 | 1호 자산 → 흡수 대상 |
|---|---|---|---|
| L0 | **Identity** | `@pi/auth` : SDK 로그인(현행) + `usePiLogin`(SDK→OAuth)·`LoginGate`·`AuthStatus`·OAuth 콜백 페이지 **컴포넌트** | 현재 `sitemap/sitemap.pi/src/components/login-gate.tsx`·`auth-status.tsx`·`app/[locale]/auth/pi/callback` → 패키지로 승격 |
| L1 | **Provision** | `scripts/new-site.mjs <domain>` : `_template` 복사·패키지명·env.example·routing·CLAUDE.md/PRD/ROADMAP/OPS 골격 생성. `scripts/db-provision.mjs` : 스키마 생성 + **Exposed schemas 등록(Supabase Management API)** + 버킷. Vercel 프로젝트 생성·env 주입은 `vercel` CLI 래퍼 | `db-migrate --app`·`promote-to-prod --app` 은 이미 범용. 오늘의 PGRST106 이 첫 자동화 대상 |
| L2 | **Shared i18n·유틸** | `@pi/i18n`(PRD_28 §4 2차 — auth·piOAuth·apiErrors 공통 메시지 + 사이트 메시지 병합), `LazySection`·`Pagination` 승격. **UI 컴포넌트(btn·card·input)는 추출하지 않는다** — PRD_28 §4 "shadcn/ui 복사 모델이 정석" 판정 유지 | sitemap `messages` 공통 네임스페이스, `components/lazy-section.tsx`·`pagination.tsx` |
| L3 | **Playbook** | `docs/SITE_PLAYBOOK.md`(전체) : 명령·기대 출력·실패 신호·조치 5열, 소요 시간 예산. 로그인 장은 **`docs/LOGIN_PLAYBOOK.md` 로 선반영 완료(2026-10-11)** — 결정 트리·절대 규칙·세팅 순서·실패 신호 17항목. Developer Portal 2앱 등록은 스크린샷 체크리스트(자동화 불가) | OPS_SETUP §1~7 + HANDOFF §4 + 10-11 세션 기록 |
| L4 | **Conformance** | `pnpm site:check` : `fetch('/api/` 잔존(piFetch 강제)·`redirect(` on null user·env 스키마↔`.env.example` 동기·i18n 죽은 키·브랜드 표기·DA 접두사·Pi 외 로그인 어휘. **승인 요청 전 선행 관문**(teamanakin-admin 승인·`-- DA-APPROVED:`·실기기 검증 규칙은 그대로) | 루트 CLAUDE.md 사고 목록 전부 규칙화 |

## 5. 단계 (플랫폼 마일스톤)

| 단계 | 이름 | 산출물 | 완료 기준 | 선행 |
|---|---|---|---|---|
| **M0** | 1호 마감 · 결정 | sitemap.pi Phase 1 실기기 검증, §3 확인(스테이징 호스트 등록 가능 여부·§11 #4 회신 경로), localhost Redirect URI 등록으로 OAuth 로컬 가동 | 실기기 로그인·등록·승인 통과, §2 1호 실측 기입 | — |
| **M1** | Kit v1 — 추출 | L0 컴포넌트 승격, `_template` 실체화, `new-site.mjs`, PLAYBOOK v1(로그인 장은 `LOGIN_PLAYBOOK.md` 기완료) | **2호 사이트 골격을 플레이북만 보고 1일 내 생성·배포·실기기 로그인** (dogfood) | M0 |
| **M2** | Provision 자동화 | `db-provision.mjs`(스키마·Exposed schemas·버킷), Vercel 생성·env 템플릿 주입 래퍼, 실패 신호 사전 20항목 | 3호를 **손 단계 ≤ 15** 로 구축 | M1 |
| **M3** | Payments Kit | `@pi/payments` 레지스트리 + `fee_*` 표준 마이그레이션 템플릿(sitemap Phase 2 가 곧 Kit) | sitemap 결제 1건 + 템플릿으로 다음 사이트 결제 1건 | M1, sitemap Phase 2 착수 조건(PRD §9 #2) |
| **M4** | Fleet Ops | 19 사이트 **배포·빌드 상태 전용** 운영 대시보드(GitHub status 루프, 사용자 데이터 미포함 — §1.1-1 통합 대시보드와 무관), 일괄 승격, 공통 i18n 동기, `site:check` CI | 파도 단위 승격이 명령 1개 | M2 |
| **M5** | (조건부) 허브 SSO | §11 #4 회신이 허용일 때만 — cafe.pi 코드 발급·교환 API, `@pi/auth` `startHubSso` | 사이트측 Client ID 등록 0 | §11 #4 회신, legal·listing-auditor 승인 |

## 6. 전개 — PRD_28 §8 웨이브에 Kit 게이트를 얹는다

웨이브 구성·순서는 **PRD_28 §8 이 정본**(W1 sitemap.pi / W2 yea·barista·bluemountain·gifticon⏸ / W3 seminar·teamkorea·expedition·omok⏸·lan / W4 dbms·schema·webserver·was·fondation△·yoda⏸ / W5 anakin·youngrok). 이 문서는 각 웨이브 착수 전 통과해야 할 Kit 게이트만 정한다.

| 웨이브(PRD_28 §8) | Kit 게이트 | 이 웨이브가 Kit 에 돌려줄 것 |
|---|---|---|
| W1 sitemap.pi | M0·M1 | 비용 실측, L0 컴포넌트, 플레이북 v1 |
| W2 (4, COMMERCE 포함) | M1 완료 + W1 회고 | `new-site.mjs` 구멍, `@pi/mps` 커머스 템플릿 요구 |
| W3 (5) | M2 완료 + W2 회고 | 손 단계 ≤ 8 달성 여부, 화상·게임 등 고유 기능과 템플릿 경계 |
| W4 (6) | M3 완료 + W3 회고 | 결제 템플릿 검증, 규제 플래그(△·⏸) 처리 절차 |
| W5 (2) | M4 완료 + W4 회고 | Fleet 운영 전환 |

웨이브 종료 조건 : ① 전 사이트 실기기 로그인 ② §2 지표 실측 기록 ③ 회고 → Kit/플레이북 반영 커밋. 세 가지 없이 다음 웨이브 금지(원칙 3). 규제 보류(⏸·△) 사이트는 PRD_28 §8 비고를 따른다.

## 7. 지금 당장 (이번 주)

1. **확인 2건 발송** — ① Pi Developer Portal : Redirect URI 에 `*.vercel.app` 스테이징 호스트 등록 가능 여부(§11 #6 과 묶음) ② §11 #4 Section 4 해석(허브 SSO 재검토 전제). 담당 pi-mainnet-listing-auditor·legal-compliance-advisor.
2. **코드 0 조치** — Developer Portal sitemap testnet 앱 → Pi Sign-In → Redirect URI `http://localhost:3001/auth/pi/callback` 등록, Client ID → `sitemap/sitemap.pi/.env.local` `NEXT_PUBLIC_PI_OAUTH_CLIENT_ID`. 오늘 커밋한 OAuth 경로(5987ff20)가 로컬에서 바로 산다.
3. **M0 마감** — sitemap.pi 실기기 검증(HANDOFF §4-2), 자격증명 교체, `public` 사본 방침.
4. **M1 준비(파일 생성은 M0 종료 후)** — PRD_28 §2 "`_template` 은 1호 완성 후 실물에서 추출, 선제 작성 금지"에 따라 이번 주는 **목록만** : 승격 대상(`login-gate.tsx`·`auth-status.tsx`·콜백 페이지) 정리, `_template` 제외 파일 목록, 플레이북 첫 5열 20줄 초안(오늘 겪은 실패 신호부터 — 문서라 선작성 가능).

## 8. 리스크

| 리스크 | 대응 |
|---|---|
| 스테이징 호스트 Redirect URI 등록 불가 | 일반 브라우저 로그인 검증은 localhost + 운영 도메인에서만. 스테이징은 Pi Browser(SDK) 경로로 검증 — 핵심가치 1 은 영향 없음 |
| Kit 추상화가 사이트 고유 요구를 막음 | 템플릿은 **삭제 가능한 골격**, 패키지는 **선택적 import**. 2호에서 못 쓰는 부분은 Kit 결함으로 기록·수정(원칙 3). PRD_28 §1.1-6 "템플릿 그대로 제출 금지"와 양립 |
| 파도 회고가 생략됨 | 회고 산출물(플레이북 diff 커밋)이 다음 웨이브 `new-site.mjs` 실행 조건 — 스크립트가 최신 회고 날짜를 검사 |
| Developer Portal 수작업(사이트당 2앱 + Client ID)은 자동화 불가 | 스크린샷 체크리스트 + 등록값 기록표(`docs/ops/portal-registry.md`), 웨이브 시작 전 일괄 등록 |
| 허브 SSO 를 서두르면 Section 4·A-4 레드라인 | M5 는 §11 #4 회신 전 착수 금지. 그 전까지 "사이트별 Client ID 1개"가 수용 비용 |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-11 | 최초 작성 — 1호 진단, 원칙 3, 지표, 신원 결정(사이트별 Pi OAuth·Google 매핑 폐기·허브 SSO 보류), Site Kit 5층, M0~M5, PRD_28 §8 웨이브 게이트, 이번 주 조치 |
| 2026-10-11 | LOGIN_PLAYBOOK.md 선반영 연결(L3·M1), 신원 §3 에 Google 연동 마스터 예외(2026-10-11) 반영 |
| 2026-10-11 | 팀장 승인(CONDITIONAL) 반영 — M1 을 M0 이후로(§2 _template 선제 작성 금지), Fleet 대시보드 범위 한정, @pi/i18n 차수 병기 |
| 2026-10-11 | 검수 반영 — PRD_28 §1.1-1/§1.1-2/§7 충돌 명시, 허브 SSO 를 조건부 M5 로 격하, 스테이징 호스트 [확인중], 1호 수치 "추정" 표기, 17/18 수치·웨이브 명칭을 PRD_28 §8 로 통일, `@pi/ui` 제외(§4 판정 유지), CI 를 승인 대체가 아닌 선행 관문으로 정정, 프래그먼트 교환 도식 보완 |
