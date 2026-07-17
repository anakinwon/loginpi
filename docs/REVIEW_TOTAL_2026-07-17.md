# cafe.pi 종합 리뷰 — 9개 영역 총정리

> **작성일**: 2026-07-17 · **작성자**: 아소카 (검토: 아나킨 마스터)
> **기준**: master `b1931bca` · 운영 배포 현행 · ROADMAP v13.5 · PRD v13.5
> **목적**: 오늘까지 개발한 전체 사항을 환경·요구사항·인프라·사고 관점에서 한 문서로 조망한다.
> 각 절의 상세 정본은 절 머리의 문서 포인터를 따른다. 이 문서는 "지도"이며 정본을 대체하지 않는다.

---

## 1. 환경파일 총정리

> 정본: `src/env.ts`(t3-env 스키마, 빌드 시점 검증) + `.env.example` · 신규 env는 **두 파일 동시 수정** 원칙

### 1-1. 서버 env (그룹별)

| 그룹 | 키 | 비고 |
|---|---|---|
| 세션·인증 | `PI_SESSION_SECRET`(32자+ 필수) · `AUTH_SECRET`(32자+ 필수) · `GOOGLE_CLIENT_ID/SECRET` | HMAC Pi 세션 + NextAuth |
| Pi 결제·지갑 | `PI_API_KEY` · `PI_WALLET_PRIVATE_SEED`(A2U 실송금) · `PI_WALLET_AGGRESS`(지갑 주소 선언 — 하드코딩 금지) · `PI_DOMAIN_VALIDATION_KEY`(포털 도메인 검증) | 키·시드는 **네트워크(테스트넷/메인넷) 정합 필수** — 7/11·7/15 사고 |
| DB 3-tier | `SUPABASE_SERVICE_ROLE_KEY`(+URL) · `APP_TIER`(운영 설정 금지) · `STAGING_DB_TARGET`(staging\|prod-ro) · `DEV/STAGING_SUPABASE_*` · `PROD_RO_SUPABASE_*`(읽기 전용) | 라우터 `src/lib/db-env.ts` — 미설정 시 운영 폴백 |
| AI·메일 | `GEMINI_API_KEY`(번역 주력) · `ANTHROPIC_API_KEY`(AI 봇·폴백) · `RESEND_API_KEY/FROM_EMAIL` | Gemini·Anthropic 크레딧 소진 이력 — 429=크레딧 의심 |
| cron | `CRON_SECRET` | **운영 빌드 필수 강제**(미설정=빌드 실패) — cron 조용한 죽음 차단 |
| 텔레그램 | `TELEGRAM_BOT_TOKEN/USERNAME/WEBHOOK_SECRET` · `ADMIN_TELEGRAM_CHAT_ID` | 봇은 **환경별 분리** (§8-4) |
| PyVoice/TURN | `CLOUDFLARE_TURN_TOKEN_ID/API_TOKEN`(최우선) · `TURN_HOST/SECRET/CREDENTIAL_TTL` · `VOICE_*_SLOTS` | Cloudflare 운영 env 설정 잔여(마스터) |
| 지도 | `GOOGLE_MAPS_API_KEY` | 클라이언트용은 별도 NEXT_PUBLIC |
| 운영 도구 | `GITHUB_DEPLOY_TOKEN/REPO` · `VERCEL_STAGING/PROD_DEPLOY_HOOK` · `VERCEL_API_TOKEN/TEAM_ID/*_PROJECT_ID` | /admin/deploy·db-switch — 미설정 시 '미구성' 비활성 |

### 1-2. 클라이언트 env (NEXT_PUBLIC_*)

| 키 | 환경별 값 원칙 |
|---|---|
| `APP_URL` | **도메인별 정합**(딥링크·메타데이터 용도 — 인증은 Host same-origin으로 비종속) |
| `PI_SANDBOX` | 환경 내 고정 철칙 — 플립 시 uid 전원 재발급 사고(7/2) |
| `PI_APP_DOMAIN` | 딥링크 `pi://<host>` — staging=apppilogintestbd3106.pinet.com / 운영=cafepi.vercel.app |
| `PI_OAUTH_CLIENT_ID` | 환경별 필수(미설정=일반 브라우저 Pi 로그인 버튼 미노출) |
| `LISTING_MODE` | **운영만 'true'** — 절제 오버레이 + a2u-probe 게이트 |
| `FEATURE_PI_PRICE` | 시세 칩 — 운영 숨김(레드라인 A-5) |
| `SUPABASE_URL/PUBLISHABLE_KEY` · `GOOGLE_MAPS_API_KEY` | 표준 |

### 1-3. 환경 파일 철칙
- ⛔ `.env.local`·`.env.example`(실값) **절대 커밋 금지** (전 파일 커밋 정책의 유일 예외)
- SERVICE_ROLE_KEY는 반드시 service_role(`sb_secret_`/레거시 eyJ) — publishable이면 sys_user 0행 세션 미인지
- Vercel env는 **타깃(production/preview) 구분** 주의 — loginpi preview 타깃에 SUPABASE env 부재가 승격 preview 빌드 실패로 표면화(7/17, 코드 lazy init으로 근본 해소)

---

## 2. 고객요구사항 총정리 (마스터 확정 비즈니스 요구)

> 정본: `docs/PRD.md` §2 핵심 가치 · GTM 메모리 · 각 결정 메모리

| # | 요구사항 | 상태 |
|---|---|---|
| C-1 | ⭐**Pi Browser에서 Pi 계정 로그인** — 절대 불가침 | ✅ 상시 검증 (UA 사전차단 금지 철칙) |
| C-2 | ⭐**Pi Browser에서 Pi 결제** — 절대 불가침 | ✅ U2A 운영 중 (A2U는 등재 승인 대기) |
| C-3 | 북극성 지표 = **활성 사용자 수** — 모든 판단 기준 "활성 사용자를 올리는가" | 홈 StatsDashboard·모니터링 상시 계측 |
| C-4 | 브랜드: **PyCafé™/PyShop™/PyTranslate™/PyVoice™/PyChat™** (Pi 접두 상표 회피) | ✅ 표시 텍스트 전면 적용 (코드값·memo 원형 유지) |
| C-5 | **거래 통화 라우팅**(제일 중요): 플랫폼↔사용자=Bean / P2P=Pi / O2O=Pi+보상 Bean · 1Pi=100Bean | ✅ 운영은 메인넷 PI모드(플랫폼 거래 Pi 통일) |
| C-6 | **오픈기념 전액 무료 프로모 계속 연장** — 사용자 유입 드라이버 | ✅ OneKey 활성(종료값 12-31, 자동 복귀 게이트 검증) |
| C-7 | 글로벌: **189 locale·66언어 완역** + 한국 한정 개념 번역 대역 | ✅ 운영 |
| C-8 | ⛔실 환경 더미 데이터 절대 금지 — 다중계정=계정 존립 리스크 | 상시 원칙 |
| C-9 | **메인넷 등재 = 최우선** — 승인 시 0순위 런북 | 신청 완결·승인 대기(자동 감지) |
| C-10 | UX 지시: 날짜=현지 시·분·초 / username 마스킹 / 1인1계정 / 존칭 규칙 | ✅ 적용 |
| C-11 | 홈 커스터마이징(7/17): 히어로 이미지+태그라인 "글로벌 Pi 커뮤니티 & Pi 마켓플레이스"·전 카드 접이식 | ✅ 운영 반영 |
| C-12 | 판매·수익화: StarterKit·오픈코어 3계층(금고=PyChat·PyShop 비매) | 문서 확정(PRD_0_INT) |

---

## 3. 기능요구사항 총정리

> 정본: `docs/ROADMAP.md` 진행률 표(Phase 0~29) + 기능별 하위 PRD (`docs/README.md` 인덱스)

### 3-1. 도메인별 완성 현황

| 도메인 | 기능 | 상태 |
|---|---|---|
| 인증 | Pi SDK 자동인증(쿠키+X-Pi-Token 이중) · Google(NextAuth v5) · 계정 연동(OTP) · **Pi Sign-In OAuth**(일반 브라우저 3여정) | ✅ |
| 결제 | Pi U2A(approve/complete·미완결 복구) · A2U(환불 sweep·정산·팁·보상 — 개방 대기) · PiRC2 구독(U2A 대체) | ✅ (A2U는 플랫폼 게이트) |
| PyCafé™ | 테마 카페(일반 8·프리미엄 12) · 실시간 채팅 · PyTranslate™(189 locale 동시통역) · AI 봇 · 스티커·선물·구독 · PyVoice™ N:N 음성 | ✅ (TURN 운영 env 잔여) |
| PyShop™ | P2P·O2O 마켓 · 에스크로 · 카트·자국통화 · 자동정산 · 매장 인증 등록(구글 대조+GPS 100m) · **매장 거리 3층 표시**(7/17) · 스토어프론트 | ✅ |
| LBS | 동의 게이트(철회 즉시 파기) · 주변 탐색(지도·업종 12종) · 거리 표시·정렬 | ✅ |
| Bean 경제 | 충전(1Pi=100Bean) · 지갑·원장 · 요금 단일출처(bean_fee_plan) · 캠페인·REWARD · 이중 요금제(BEAN\|PI 런타임 스위치) | ✅ 운영=PI모드 |
| 참여 | 이벤트 미션(Pi 요원) · 이용후기+보상(보증금 게이트·매장별) · 구매왕/Top | ✅ |
| 알림 | 텔레그램 3계층 Outbox · P2P 채팅 릴레이(미러·인용답장) · 직거래방(12h) · 거래상태 통합알림 | ✅ 실기기 검증 |
| 관리자 | 대시보드 · users/payments/links · 표준(DA) · i18n 관리 · 캠페인 · 배치 로그 · 모니터링(5초) · 분석 4탭+CSV · UI 테마 · deploy/db-switch | ✅ |
| 게시판·문서 | 통합 게시판 4종 · 법무 문서 4종 v1.2 · 기술백서·사용설명서 | ✅ |
| 홈(7/17) | 히어로+태그라인 · 접이식 카드 3종 · 공개/관리자 이원화 대시보드 | ✅ |

### 3-2. 잔여 기능 과제
- PiRC3 실 에스크로(공식 invokeContract 미지원 — 보류) · LBS 지도 확장 · 알림 Phase 2(알림톡·양방향 버튼)
- 프로모 미구현 품목(기간연장·PyShop·노출) · bean_fee_plan DB 이전(보류) · Pi 앱 팩토리(⏸️무기한 홀딩)

---

## 4. 품질요구사항 총정리

> 정본: `docs/da/데이터표준규칙.md` · CLAUDE.md 각 철칙 · 메모리(품질 계열)

| 영역 | 요구사항 (원칙) |
|---|---|
| DA 표준 | 시스템 컬럼 4개 전 테이블 · **논리삭제(del_yn) — 물리 DELETE 금지**(예외: i18n_message만 물리 삭제가 정본) · 도메인 접두사·약어 표준 · `da-ddl-guard` 훅 자동 검사 · CHAR(n) 금지 · 좌표=latd_crd/lngt_crd |
| FK 정책 | 현행 FK 유지(PostgREST 임베디드 조인 의존) — ⛔일괄 제거 금지, 전환은 "조인 대체 → 개별 제거" 순서만 |
| 데이터 무결성 | 돈·장부·ccy **누락 0·원자적 보장(RPC 내장)** · 소급은 소스 실재 건만 · 집계는 **catch-all 필수**(화이트리스트 금지 — sql/183) · "배치 성공≠데이터 정확" |
| i18n 정합 | ko.json=source of truth · 비-ko 정본=i18n_message DB · **수정=json+staging+운영 3중** · `validate-locales` 빌드 게이트 · 죽은 키=물리 삭제(번들 직렬화 노출) · 새 UI 문자열=ko+en 동반 · locale→언어=locale-lang.ts 단일소스 |
| 빌드·배포 게이트 | 커밋 전 최소 관문=`pnpm build`(lint는 타입 못 잡음) · 승격 후 **commit status(cafe) 개별 확인** · 운영 실서빙 실측(HTML 프로브) |
| 코드 표준 | 2칸·세미콜론 없음·작은따옴표 · 새 API 에러=`apiError()`(카탈로그 451키) · 인증 fetch=**piFetch만** · Supabase=**getSupabaseAdmin() lazy init만**(모듈 스코프 createClient 금지 — 7/17 전수 교정) · 실패 경로=반드시 toast(else 없는 `if(res.ok)` 금지) |
| 리뷰 체계 | DA팀 5인 하네스(다단계) · da-governance-expert(단건) · 메인넷 등록팀 하네스 · 전수감사 sql/102~175 PASS |

---

## 5. 보안요구사항 총정리

> 정본: `docs/PRD_2_SECURITY.md`(KISA 21항목 현행화) · vercel.json 보안 헤더

| 영역 | 구현 현황 |
|---|---|
| 세션 | Pi=HMAC-SHA256 서명 토큰(32자+ 시크릿)·만료 검증 · Google=NextAuth v5(trustHost) · 쿠키+헤더 이중 경로 |
| 인증 원칙 | UA 사전차단 절대 금지(유일 신호=authenticate() 성공) · 401="아직 모름"(상태 확정·캐시 파괴 금지) · 사용자 불변키=pi_username(UNIQUE)·google_email 폴백 |
| 권한 | `isAdmin()`/`isMaster()`(타입 술어) 단일 게이트 · 'MASTER' 문자열 단독 비교 금지 · del_yn='Y' 전면 차단 · 본인 비활성 금지 |
| 개인정보 | username 마스킹(비관리자 뷰어 전면) · 뷰어별 응답=공유 CDN 캐시 금지(Vary) · LBS 철회 즉시 파기(위치정보법 §18) · 동의 이력(sys_user_consent — IP·UA 증적) |
| DB | RLS 비활성 정당화=서버 전용 service_role 단일 경로 · anon key 클라이언트 사용 금지 · 검색어 sanitize(pg_trgm .ilike) |
| 비밀 관리 | 시크릿 커밋 금지(.env 예외 정책) · 지갑 시드=마스터 전용·세션/저장소에 남기지 않음 · 임시 스크립트 하드코딩 재발 방지(gitignore+지침) |
| 무단 등록 방지 | 매장 claim: place_id 전체 재입력(복사 차단)+전화 구글 대조+GPS ≤100m 서버 강제+본인 보증 동의 |
| 플랫폼 헤더 | HSTS(2y preload)·nosniff·XSS·Referrer-Policy·Permissions-Policy(camera/mic/geo self) · API=noindex·no-store |
| Webhook | 텔레그램 secret 대조 위조 차단 · CRON_SECRET Bearer |
| 잔여 | Vercel Firewall/BotID 수동 설정 · Supabase statement timeout · 세션 블랙리스트 (PRD_2 추적) |

---

## 6. 성능요구사항 총정리

> 정본: `docs/PRD_18_PERFORM.md` · TROUBLESHOOT §A 성능 리스크 레지스터 · CLAUDE.md 패칭 표준

### 6-1. 3대 프론트 표준 (전 신규 코드 강제)
1. 목록=반응형 **페이지네이션** (행 전량 로드 금지)
2. 이벤트형 조회=**비동기 논블로킹** (렌더 경로 동기 await 금지)
3. 섹션=뷰포트 진입 직전 **lazy fetch** (LazySection/IntersectionObserver)

### 6-2. 구현된 성능 장치
| 장치 | 내용 |
|---|---|
| 함수 리전 | `icn1` 고정 — 미국(iad1)↔서울 DB 왕복 제거로 전 페이지 6~13배 개선(7/10) |
| 검색 | 부분일치=pg_trgm GIN 표준(.ilike 자동 가속)·활성행 부분 인덱스 |
| 캐시 | 공개 집계 API s-maxage/SWR · 뷰어별=private/Vary · 클라이언트 캐시(5~10분) · 저빈도=revalidate 600 |
| 지도 | 마커 클러스터링(100+ 부드럽게) · 위치 캐시(7일)+GPS 병행 보정 |
| 이미지 | WebP 최적화(히어로 3.2MB→395KB)+blur placeholder+priority/lazy 구분 |
| 실시간 | 유령 폴링 누수 수정(disposed 가드) · 채팅 미러 미읽음 게이트 |
| 모니터링 | /admin/monitor 전량 저장·보존 7일 물리정리 cron·5초 폴링(마스터 확정) |

### 6-3. 예측 병목 (리스크 레지스터 요약)
🔴 실시간 채팅(연결 한도×팬아웃) · 🔴 LBS 공간쿼리(PostGIS 필요 시점 도래) · 공통 천장=**service_role 단일 커넥션 풀**(PgBouncer) · 🟠 에스크로 상태 경합·구독 cron 집중 — 대응 방안은 레지스터 정본 참조

---

## 7. 파이네트워크 메인넷 요구사항 총정리

> 정본: `docs/MAINNET_READINESS_CHECKLIST.md` · pi-apps.github.io 공식 3소스 · 메모리(등재 계열)

| 항목 | 상태 |
|---|---|
| **레드라인 4종** (도박·Pi외 통화·Pi외 로그인·브랜딩) | ✅ BLOCK 0 — 베팅 키 4,512행 물리 삭제(sql/182) · Pi 인증 필수(Google=선택 보조) · Py 접두 개명 |
| **체크리스트 19/19 DONE** | ✅ 별도 제출 폼 부재 공식 확인(포털 10/10=신청) → **승인 대기** |
| 도메인 검증 | ✅ env 라우트(`PI_DOMAIN_VALIDATION_KEY`)→포털 Verify 통과 |
| 절제 오버레이 | `LISTING_MODE=true`(운영만)+messages/listing/* **47키**(발행→지급·Bean Token→Bean 포인트·환율→참고 환산·크립토 라운지) — ⚠️자기참조 함정 3회 전례: 순화 후 운영 실측 재스캔 필수 |
| 가치평가(A-5) | 시세·환율 운영 숨김 — 단일소스 `computeShowPiValuation` 3곳 연결 · Bean 임시토큰=보수 순화 완료(기능·mint는 유지) |
| 홈 대시보드 | 공개=활성 지표만 / 매출·분석=ADMIN 조건부(7/17 이원화) — 공개 표면 "매출·시세·투자" 어휘 금지 |
| 법무 | 방침·약관 v1.2 등재 문면 정합(운영 4페이지 금지어 0 실측) |
| **승인 감지 자동화** | cron `a2u-probe`(매일 09:30 KST, 생성→즉시 취소·송금 0) → 마스터 텔레그램 · ✅**알람 전 구간 사전 테스트 완료(7/17)** — Vercel Cron이라 PC 무관 |
| **0순위 런북** (승인 확인 즉시) | ① A2U 개방 검증(환불 1클릭) ② refund-sweep 소급 확인(30일) ③ 정산 백필 ④ 팁·보상 경로 정상화 — ROADMAP 최상단 |
| 결제 스코프 원칙 | 실기기 네트워크=Portal 앱 스코프 · SDK 결제=Pi Browser 전용 · 운영 시드=메인넷 앱 지갑(GA3L…, 7/15 교정) |
| 금지 | 향후 도박·법정화폐 기능 추가 금지 · 신규 "토큰/발행"류 i18n 키=오버레이 동반 |

---

## 8. 인프라요구사항 총정리 (개발·스테이징·운영 WAS & DB)

> 정본: PRD.md §1·§6 · 메모리(인프라 계열) · vercel.json 실측

### 8-1. 배포 토폴로지 (Vercel Pro · Next.js 16 · Node 22)

| 계층 | 프로젝트 | 브랜치 | 도메인 | DB | 특징 |
|---|---|---|---|---|---|
| 개발 | 로컬 pnpm dev | — | localhost:3000 | DEV(스테이징 공유) | Turbopack |
| 스테이징 | **loginpi** | master(자동) | loginpi.vercel.app + apppilogintestbd3106.pinet.com | hpcvltlqq…(RW) 또는 prod-ro 스위치 | 테스트넷 · 절제 OFF |
| 운영 | **cafe(cafepi)** | **production**(승격만) | cafepi.vercel.app | ajdwlcqol…(운영) | 메인넷 PI모드 · LISTING_MODE |

- 승격=`node scripts/promote-to-prod.mjs --yes`(master→production ff-only) · /admin/deploy(isMaster 게이트)
- **배포 검증 철칙**: 빌드 실패 시 구배포 조용히 서빙 → commit status `Vercel – cafe` 개별 success 확인 + 운영 HTML 실측
- ⚠️ loginpi가 production 브랜치 push에 preview 빌드 생성(env 부재) — 코드 lazy init으로 빌드 무해화(7/17), 커밋 상태 판독 시 배포 target 구분

### 8-2. DB (Supabase PostgreSQL ×2)
- 연결=**ap-northeast-2 Session pooler만**(직접 연결 DNS 폐지) · psql=`C:\Program Files\PostgreSQL\17\bin`
- 3-tier 라우터(db-env.ts): VERCEL_ENV 자동 판정+명시 override · staging은 prod-ro 스위치 가능(read-only 자격증명)
- 운영 신설=dev 100% pg_dump 미러(96테이블) — 컷오버 함정: Storage 4버킷 수동 생성 · service_role 키 형식 · 테스트 금전데이터 초기화
- 전량 동기 절차=truncate→data-only 덤프→session_replication_role=replica

### 8-3. Cron 12종 (vercel.json 실측)

| 주기 | 잡 |
|---|---|
| 매분 | chat-noti(채팅 릴레이·webhook 자가치유) |
| 3분/5분/10분 | order-autocomplete / refund-sweep / tip-pi-payout |
| 매시 | event-bean-reward · campaign-grant-all · fbck-pi-payout |
| 일간 | stats/aggregate(00:00 UTC) · event-reeval · bean-balance-check(01:00) · metric-purge(02:30) · **a2u-probe(00:30 UTC=09:30 KST)** |

### 8-4. 부속 인프라
- 텔레그램 봇 환경별 분리: staging=cafe_pi_not_bot / 운영=cafe_pi_areal_bot · webhook 1분 자가치유
- TURN=Cloudflare Realtime(무료 1TB/월) — 운영 env 2개 설정 잔여
- 외부 진입=pi:// 딥링크(host만)·텔레그램 버튼=브리지(/ko/open) 경유
- 다중 세션 협업: 마스터 폴링 통합 · 공유파일(env/ROADMAP/ko.json) 즉시 push+pull · SQL=git 정본

---

## 9. 트러블슈팅 총정리

> 정본: `docs/TROUBLESHOOT.md`(A 성능 레지스터 · A-2 사업 리스크 · B 사고 기록)

### 9-1. 주요 사고 연대기 (재발 방지 원칙 포함)

| 날짜 | 사고 | 근본 원인 → 원칙 |
|---|---|---|
| 06-26 | UA 차단으로 전체 Pi 로그인 붕괴(8bf8752) | UA≠Pi Browser → **인증 신호는 authenticate() 성공만** |
| 06-26 | 헤더-본문 세션 불일치 | /api/auth/pi GET에 getSessionUser 폴백 |
| 07-01 | 운영 일반브라우저 로그인 미인식 3계층(Origin 403→trustHost→orphan userId) | same-origin 게이트 · trustHost:true · **google_email 불변키 폴백** |
| 07-01 | FK 62개 일괄 제거→목록 전면 붕괴(PGRST200) | ⛔FK 일괄 제거 금지 — 조인 대체 후 개별 |
| 07-02 | sandbox 플립→pi_uid 전원 재발급·계정 중복 | uid=(앱×네트워크) scoped → **불변키=pi_username**(UNIQUE·재바인딩) |
| 07-03 | 텔레그램 콜백 유실 | 환경별 봇+webhook cron 자가치유 |
| 07-08 | Pi Sign-In 함정(state 탭 오탐·Pi Browser 내 인가 미지원) | state=localStorage·SDK 선시도 자기교정 |
| 07-09~10 | "영어 안 됨"=하드코딩 837줄 · 국가파생 locale 오역 | 번역키 전수 전환 · locale-lang 단일소스 |
| 07-10 | 함수 리전 iad1→전 페이지 지연 | regions icn1 고정 |
| 07-11 | 운영 결제 전면 타임아웃 | 클라 메인넷↔서버 테스트넷 **키 스코프 불일치** → 완결 결제ID approve 프로브 진단 |
| 07-15 | 자동환불 미실행 | `feature_not_available`=등재 승인 전 A2U 미개방(버그 아님) + 시드 테스트넷 잔존 교정 → 0순위 런북 체계 |
| 07-16 | Vercel 빌드 실패를 "반영됨"으로 오판 · admin 63건 일반 fetch(Pi Browser 401) | commit status 개별 확인·pnpm build 게이트 · piFetch 전수 |
| 07-17 | **"동의하고 시작" 무반응** | 401 레이스를 미동의 확정 오판+캐시 삭제+무피드백 → **200만 정본·실패 toast 의무** |
| 07-17 | **승격 preview 빌드 반복 실패** | 모듈 스코프 createClient 5곳(빌드 시점 env 폭발) → lazy init 전수 |
| 07-17 | **"구매왕 있는데 매출 0"** | sql/043이 026 세분화 유실 회귀+신종 type 누락, 배치 '성공' 은폐 → **집계 catch-all 원칙**(sql/183) |

### 9-2. 사고에서 추출된 4대 패턴 (신규 개발 시 자기 점검)
1. **인증 신호 성급 확정 금지** — UA·401·uid·세션은 "모름"일 수 있다. 성공 신호만 정본, 실패는 판단 보류.
2. **조용한 실패 차단** — 빌드 실패=구배포 서빙 · 배치 성공=0행 가능 · else 없는 res.ok · 비블로킹 insert 사일런트 실패. 모든 실패는 **관측 가능**해야 한다(toast·로그·status 실측).
3. **환경 스코프 정합** — 키·시드·도메인·env 타깃·봇·DB는 전부 (환경×네트워크) 스코프를 가진다. "한 군데만 바꾼" 전환이 사고의 뿌리.
4. **화이트리스트 부패 경계** — 열린 집합(결제 type·locale·기능)을 닫힌 목록으로 다루면 성장이 곧 구멍이다. catch-all+명시 분류 구조로.

---

## 부록: 오늘(2026-07-17) 반영분 스냅샷
알람 전 구간 사전 테스트 ✅ · Map "Pi 매장" 라벨 189 locale · 매장 거리 표시 3층(+PRD_10 v1.3 Rule LBS-05) · 동의 게이트 401 근본수정 · 홈 커스터마이징(히어로·태그라인·전 카드 접이식) · i18n API lazy init 전수 · 매출 집계 catch-all(sql/183) · 문서(ROADMAP v13.5·PRD v13.5·TROUBLESHOOT·메모리) 동기화 — **운영 승격 7회 전부 실측 검증**.
